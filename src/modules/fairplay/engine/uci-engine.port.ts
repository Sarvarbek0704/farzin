/**
 * Fairplay — tahlil engine porti.
 *
 * Adapter STOCKFISH_PATH berilgandagina registratsiya qilinadi (billing
 * Click provider gating pattern'i): binary yo'q → provider qiymati null →
 * engine korrelyatsiya TOZA o'chirilgan, vaqt tahlili ishlayveradi.
 *
 * docs/08-fair-play.md §8.1: engine SERVER tomonda — client WASM'ga
 * ishonib bo'lmaydi va natijasi qayta ishlab chiqarilmaydi.
 */

/** Bitta pozitsiya bahosi — natija qayta ishlab chiqariladigan bo'lishi shart. */
export interface PositionAnalysis {
  /** Engine'ning eng yaxshi yurishi (UCI, masalan "e2e4"). */
  bestMoveUci: string;
  /** Baho centipawn'da, YURISH NAVBATIDAGI tomon nuqtai nazaridan. null = mat bahosi. */
  evalCp: number | null;
  /** Matgacha yurishlar (musbat = navbatdagi tomon mat qiladi). null = cp bahosi. */
  mate: number | null;
  /** Haqiqatda yetilgan chuqurlik. */
  depth: number;
}

export interface AnalysisEngine {
  /** Engine identifikatori ("Stockfish 17" — `id name` qatoridan). */
  readonly name: string;
  /**
   * Bitta pozitsiyani belgilangan chuqurlikda baholash. Pozitsiyalar
   * KETMA-KET tahlil qilinadi (bitta UCI process) — chaqiruvchi parallel
   * chaqirsa ham adapter navbatga tizadi.
   */
  analyzePosition(fen: string, depth: number): Promise<PositionAnalysis>;
  /** Processni tozalab o'chirish — zombie qolmaydi (onModuleDestroy). */
  dispose(): Promise<void>;
}

/** DI token. Qiymat `AnalysisEngine | null` — null = engine mavjud emas. */
export const ANALYSIS_ENGINE = Symbol('ANALYSIS_ENGINE');
