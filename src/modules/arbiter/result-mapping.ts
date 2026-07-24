import type { GameRecord } from '../../core/tiebreak/tiebreak.types';
import type { PairingHistoryEntry, PairingResultValue } from './arbiter.types';

/**
 * Natija → ochko xaritalash — SOF funksiyalar, framework va Prisma yo'q.
 *
 * Bu modulning eng qimmatli qismi: jadval (standings) va tie-break
 * hisoblari shu xaritaga tayanadi, xato jimgina o'tadi va apellyatsiya
 * predmetiga aylanadi. Shuning uchun alohida faylga chiqarilgan va
 * har bir `PairingResult` qiymati ikkala tomon uchun unit-testda
 * qamrab olingan (result-mapping.spec.ts).
 *
 * Xaritalash qoidasi (docs/14-roadmap.md Faza 1, FIDE C.02 bilan mos —
 * core/tiebreak `GameRecord.playedOverBoard` semantikasi):
 *
 *  | Natija            | Oq    | Qora  | Taxtada o'ynaldi? |
 *  |-------------------|-------|-------|-------------------|
 *  | WHITE_WIN         | 1     | 0     | ha                |
 *  | BLACK_WIN         | 0     | 1     | ha                |
 *  | DRAW              | 0.5   | 0.5   | ha                |
 *  | WHITE_WIN_FORFEIT | 1     | 0     | yo'q              |
 *  | BLACK_WIN_FORFEIT | 0     | 1     | yo'q              |
 *  | DOUBLE_FORFEIT    | 0     | 0     | yo'q              |
 *  | BYE_FULL          | 1     | —     | yo'q              |
 *  | BYE_HALF          | 0.5   | —     | yo'q              |
 *  | BYE_ZERO          | 0     | —     | yo'q              |
 *  | UNPLAYED          | —     | —     | (hisobga kirmaydi)|
 *
 * Bye juftligida "oq" — bye olgan o'yinchining o'zi (Pairing jadvalida
 * blackRegistrationId NULL); "qora" tomon mavjud emas → null.
 */

export type Side = 'WHITE' | 'BLACK';

/** Bir tomonning bir juftlikdagi yakuni. */
export interface SideOutcome {
  /** Ochko: g'alaba 1, durang 0.5, mag'lubiyat 0. */
  readonly score: 0 | 0.5 | 1;
  /**
   * Partiya taxtada o'ynalganmi. `false` (bye/forfeit) — tie-break'da
   * virtual opponent qoidasi ishlaydi (docs/05-pairing-engine.md §7.1).
   */
  readonly playedOverBoard: boolean;
}

/**
 * `result` ning `side` tomoni uchun yakuni. `null` — bu tomon uchun
 * hisobga kiradigan partiya yo'q (UNPLAYED yoki bye'ning "qora" tomoni).
 */
export function outcomeFor(result: PairingResultValue, side: Side): SideOutcome | null {
  switch (result) {
    case 'WHITE_WIN':
      return { score: side === 'WHITE' ? 1 : 0, playedOverBoard: true };
    case 'BLACK_WIN':
      return { score: side === 'WHITE' ? 0 : 1, playedOverBoard: true };
    case 'DRAW':
      return { score: 0.5, playedOverBoard: true };
    case 'WHITE_WIN_FORFEIT':
      return { score: side === 'WHITE' ? 1 : 0, playedOverBoard: false };
    case 'BLACK_WIN_FORFEIT':
      return { score: side === 'WHITE' ? 0 : 1, playedOverBoard: false };
    case 'DOUBLE_FORFEIT':
      return { score: 0, playedOverBoard: false };
    case 'BYE_FULL':
      return side === 'WHITE' ? { score: 1, playedOverBoard: false } : null;
    case 'BYE_HALF':
      return side === 'WHITE' ? { score: 0.5, playedOverBoard: false } : null;
    case 'BYE_ZERO':
      return side === 'WHITE' ? { score: 0, playedOverBoard: false } : null;
    case 'UNPLAYED':
      return null;
  }
}

/** O'yinchi juftlikning qaysi tomonida — yoki umuman qatnashmagan (null). */
export function sideOf(entry: PairingHistoryEntry, registrationId: string): Side | null {
  if (entry.whiteRegistrationId === registrationId) {
    return 'WHITE';
  }
  if (entry.blackRegistrationId === registrationId) {
    return 'BLACK';
  }
  return null;
}

/**
 * Bir ishtirokchining jadval uchun yig'ilgan ko'rinishi.
 *
 * `games` — core/tiebreak `PlayerTieBreakInput.games` ga to'g'ridan-to'g'ri
 * kiradigan massiv (TUR TARTIBIDA — virtual opponent formulasi shunga
 * tayanadi, tiebreak.types.ts).
 */
export interface ParticipantScoreView {
  readonly registrationId: string;
  readonly points: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  /** Jadvalga kirgan partiyalar soni (UNPLAYED hisobga kirmaydi). */
  readonly gamesPlayed: number;
  /** Faqat taxtada o'ynalgan partiyalar ranglari, tur tartibida. */
  readonly colorHistory: readonly Side[];
  readonly games: readonly GameRecord[];
}

/**
 * Juftliklar tarixidan har bir ishtirokchining ochko/statistika
 * ko'rinishini quradi. W/D/L ta'rifi: har hisobga kirgan yozuv (bye va
 * forfeit ham) ochkosiga qarab sanaladi — 1 → g'alaba, 0.5 → durang,
 * 0 → mag'lubiyat. Bu Standing.wins/draws/losses uchun yagona, aniq
 * hujjatlangan qoida (Standing — denormalizatsiya, haqiqat manbai
 * Pairing.result — prisma/schema.prisma).
 */
export function buildScoreViews(
  registrationIds: readonly string[],
  history: readonly PairingHistoryEntry[],
): ParticipantScoreView[] {
  const sorted = [...history].sort((a, b) => a.roundNumber - b.roundNumber);

  return registrationIds.map((registrationId) => {
    let points = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    const colorHistory: Side[] = [];
    const games: GameRecord[] = [];

    for (const entry of sorted) {
      const side = sideOf(entry, registrationId);
      if (side === null) {
        continue;
      }
      const outcome = outcomeFor(entry.result, side);
      if (outcome === null) {
        continue; // UNPLAYED — jadvalga kirmaydi
      }

      const opponentId = side === 'WHITE' ? entry.blackRegistrationId : entry.whiteRegistrationId;
      games.push({
        opponentId,
        // GameRecord.color — "o'ynalmagan partiyada null" (tiebreak.types.ts)
        color: outcome.playedOverBoard ? side : null,
        result: outcome.score,
        playedOverBoard: outcome.playedOverBoard,
      });

      points += outcome.score;
      if (outcome.score === 1) {
        wins += 1;
      } else if (outcome.score === 0.5) {
        draws += 1;
      } else {
        losses += 1;
      }
      if (outcome.playedOverBoard) {
        colorHistory.push(side);
      }
    }

    return {
      registrationId,
      points,
      wins,
      draws,
      losses,
      gamesPlayed: games.length,
      colorHistory,
      games,
    };
  });
}
