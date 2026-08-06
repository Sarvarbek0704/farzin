import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import type { AnalysisEngine, PositionAnalysis } from './uci-engine.port';

/**
 * Stockfish UCI adapter — REAL UCI protokoli child process ustida.
 *
 * Protokol oqimi (UCI spetsifikatsiyasi):
 *   spawn → "uci" → ("id name ...", "uciok") → "isready" → "readyok"
 *   → har pozitsiya: "position fen X" → "go depth N"
 *     → "info depth .. score cp|mate .. pv .." qatorlari
 *     → "bestmove e2e4 [ponder ..]"
 *
 * Qarorlar:
 *  - `go depth N` (movetime emas) — DETERMINIZM (docs/08 §10: bir xil
 *    o'yin + bir xil meta → bir xil natija). ms-byudjet (§8.2) apparatga
 *    bog'liq va qayta ishlab chiqarilmaydi.
 *  - Pozitsiyalar KETMA-KET — bitta process, promise-navbat. Parallellik
 *    kerak bo'lsa worker soni oshiriladi (docs/02 §7), process pool emas.
 *  - Har pozitsiyaga timeout: engine osilib qolsa process O'LDIRILADI va
 *    xato qaytadi; keyingi chaqiruv yangi process ochadi. Zombie yo'q.
 *  - dispose(): "quit" + grace + SIGKILL. AnalysisProcessor
 *    onModuleDestroy'da chaqiradi.
 *
 * Parser funksiyalar SOF va alohida eksport qilinadi — unit test real
 * binary'siz ishlaydi (CI'da STOCKFISH_PATH yo'q).
 */

// --- Sof UCI parserlar ---------------------------------------------------------

export interface UciScore {
  unit: 'cp' | 'mate';
  value: number;
}

export interface ParsedInfoLine {
  depth: number | null;
  score: UciScore | null;
  /** PV birinchi yurishi (UCI) — "eng yaxshi" davomning boshi. */
  pvFirstMove: string | null;
}

/**
 * "info depth 12 seldepth 20 score cp 34 nodes 12345 pv e2e4 e7e5 ..."
 * → {depth: 12, score: {unit:'cp', value:34}, pvFirstMove: 'e2e4'}.
 *
 * @returns null — bu score'li info qatori emas (currmove, string va h.k.).
 */
export function parseInfoLine(line: string): ParsedInfoLine | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info') {
    return null;
  }

  let depth: number | null = null;
  let score: UciScore | null = null;
  let pvFirstMove: string | null = null;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === 'depth') {
      const value = Number(tokens[i + 1]);
      if (Number.isInteger(value)) {
        depth = value;
      }
      i += 1;
    } else if (token === 'score') {
      const unit = tokens[i + 1];
      const value = Number(tokens[i + 2]);
      if ((unit === 'cp' || unit === 'mate') && Number.isFinite(value)) {
        score = { unit, value };
      }
      i += 2;
    } else if (token === 'pv') {
      pvFirstMove = tokens[i + 1] ?? null;
      break; // pv — qatorning oxirigacha davom etadi
    }
  }

  if (score === null) {
    return null; // score'siz info (nodes/nps/currmove) biz uchun ma'nosiz
  }
  return { depth, score, pvFirstMove };
}

/** "bestmove e2e4 ponder e7e5" → "e2e4". "bestmove (none)" → null. */
export function parseBestMove(line: string): string | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'bestmove') {
    return null;
  }
  const move = tokens[1];
  if (move === undefined || move === '(none)') {
    return null;
  }
  return move;
}

/** "id name Stockfish 17" → "Stockfish 17". */
export function parseIdName(line: string): string | null {
  const match = /^id\s+name\s+(.+)$/.exec(line.trim());
  return match?.[1]?.trim() ?? null;
}

// --- Adapter ------------------------------------------------------------------

/** Bitta pozitsiya uchun default timeout — depth 12 sekundlar ichida tugaydi. */
const DEFAULT_POSITION_TIMEOUT_MS = 30_000;
const HANDSHAKE_TIMEOUT_MS = 15_000;
const QUIT_GRACE_MS = 2_000;

export class StockfishUciAdapter implements AnalysisEngine {
  name = 'UCI engine';

  private child: ChildProcessWithoutNullStreams | null = null;
  private lineHandler: ((line: string) => void) | null = null;
  private stdoutBuffer = '';
  /** Ketma-ketlik navbati — bir vaqtda bitta pozitsiya. */
  private chain: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly binaryPath: string,
    private readonly positionTimeoutMs: number = DEFAULT_POSITION_TIMEOUT_MS,
  ) {}

  async analyzePosition(fen: string, depth: number): Promise<PositionAnalysis> {
    const next = this.chain.then(async () => await this.analyzeSerialized(fen, depth));
    // Zanjir xatoda uzilmasin — keyingi chaqiruv baribir ishlashi kerak.
    this.chain = next.catch(() => undefined);
    return await next;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const child = this.child;
    this.child = null;
    this.lineHandler = null;
    if (child === null) {
      return;
    }
    try {
      child.stdin.write('quit\n');
    } catch {
      // stdin yopilgan bo'lishi mumkin — baribir kill qilamiz.
    }
    await new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, QUIT_GRACE_MS);
      child.once('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });
    });
  }

  // --- Ichki ------------------------------------------------------------------

  private async analyzeSerialized(fen: string, depth: number): Promise<PositionAnalysis> {
    if (this.disposed) {
      throw new Error('UCI adapter dispose qilingan');
    }
    const child = await this.ensureProcess();

    return await this.withTimeout(
      new Promise<PositionAnalysis>((resolve, reject) => {
        let lastInfo: ParsedInfoLine | null = null;

        this.lineHandler = (line: string): void => {
          const info = parseInfoLine(line);
          if (info !== null) {
            // Eng chuqur (oxirgi) score olinadi — MultiPV ishlatilmaydi
            // (docs/08 §8.2 MultiPV — CASE byudjeti, keyingi bosqich).
            if (
              lastInfo === null ||
              info.depth === null ||
              lastInfo.depth === null ||
              info.depth >= lastInfo.depth
            ) {
              lastInfo = info;
            }
            return;
          }
          const best = line.startsWith('bestmove') ? parseBestMove(line) : null;
          if (line.startsWith('bestmove')) {
            this.lineHandler = null;
            if (best === null) {
              reject(new Error(`Engine yurish qaytarmadi (mat/patt pozitsiya?): ${line}`));
              return;
            }
            const parsed: ParsedInfoLine | null = lastInfo;
            resolve({
              bestMoveUci: best,
              evalCp: parsed?.score?.unit === 'cp' ? parsed.score.value : null,
              mate: parsed?.score?.unit === 'mate' ? parsed.score.value : null,
              depth: parsed?.depth ?? depth,
            });
          }
        };

        child.stdin.write(`position fen ${fen}\n`);
        child.stdin.write(`go depth ${String(depth)}\n`);
      }),
    );
  }

  /** Processni (qayta) ochish + UCI handshake. */
  private async ensureProcess(): Promise<ChildProcessWithoutNullStreams> {
    if (this.child !== null) {
      return this.child;
    }

    const child = spawn(this.binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    this.stdoutBuffer = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      this.stdoutBuffer += chunk;
      let newlineIndex = this.stdoutBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = this.stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, '');
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
        this.lineHandler?.(line);
        newlineIndex = this.stdoutBuffer.indexOf('\n');
      }
    });
    child.on('exit', () => {
      if (this.child === child) {
        this.child = null;
        this.lineHandler = null;
      }
    });
    child.on('error', () => {
      if (this.child === child) {
        this.child = null;
        this.lineHandler = null;
      }
    });

    await this.withTimeout(
      new Promise<void>((resolve, reject) => {
        child.once('error', (e: Error) => {
          reject(new Error(`UCI binary ishga tushmadi (${this.binaryPath}): ${e.message}`));
        });
        this.lineHandler = (line: string): void => {
          const idName = parseIdName(line);
          if (idName !== null) {
            this.name = idName;
            return;
          }
          if (line.trim() === 'uciok') {
            child.stdin.write('isready\n');
            return;
          }
          if (line.trim() === 'readyok') {
            this.lineHandler = null;
            resolve();
          }
        };
        child.stdin.write('uci\n');
      }),
      HANDSHAKE_TIMEOUT_MS,
    );

    return child;
  }

  /** Timeout — muddat o'tsa process O'LDIRILADI (osilgan engine = zombie xavfi). */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number = this.positionTimeoutMs,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            this.killCurrentProcess();
            reject(new Error(`UCI engine ${String(timeoutMs)}ms ichida javob bermadi`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private killCurrentProcess(): void {
    const child = this.child;
    this.child = null;
    this.lineHandler = null;
    if (child !== null) {
      child.kill('SIGKILL');
    }
  }
}
