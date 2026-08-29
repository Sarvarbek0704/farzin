import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Counter, Gauge, Histogram, Meter } from '@opentelemetry/api';

import {
  fairplaySeverity,
  httpMethodLabel,
  httpStatusLabel,
  sanitizeRoute,
  sectionSizeBucket,
  timeCategoryLabel,
  PAIRING_CRITERIA,
  type ActiveTournamentStatusLabel,
  type DisconnectOutcomeLabel,
  type FairplaySignalTypeLabel,
  type GameTypeLabel,
  type PairingAlgorithmLabel,
  type PairingCriterionLabel,
  type PairingFailureReason,
  type PaymentFailureReason,
  type PaymentOperationLabel,
  type PaymentProviderLabel,
  type PlayEnvironmentLabel,
  type TimeCategoryLabel,
  type WsNamespaceLabel,
} from './metrics.labels';
import { METRICS_METER } from './metrics.tokens';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BIZNES METRIKALARI — Farzin'ning yuragi (docs/15-observability.md §3.3)
 *
 *  Bu servis — YAGONA yozuv nuqtasi. Modullar OpenTelemetry API'sini
 *  ko'rmaydi; ular faqat shu fasaddagi tipli metodni chaqiradi. Sabab:
 *
 *   1. KARDINALLIK bir joyda majburlanadi (metrics.labels.ts) — chaqiruvchi
 *      "shu yerda tournament_id qo'shsam bo'lardi" deb ayta olmaydi;
 *   2. Metrika NOMI va yorliqlari hujjatdan bir marta ko'chiriladi;
 *   3. Eksporter almashsa (OTel → prom-client) chaqiruv joylari
 *      O'ZGARMAYDI.
 *
 *  ⚠️  core/ ga BU SERVIS KIRMAYDI. Sof dvigatellar (pairing, Glicko-2,
 *      chess, clock) bog'liqliksiz qoladi (ADR-0001, arch:check
 *      `core-must-stay-pure`). Dvigatel vaqti CHAQIRUV JOYIDA — modul
 *      qatlamida — o'lchanadi.
 *
 *  NO-OP XAVFSIZLIGI: `meter` berilmasa (unit test, metrika o'chirilgan
 *  muhit) barcha metodlar jimgina hech narsa qilmaydi. Instrumentatsiya
 *  HECH QACHON biznes oqimini yiqitmasligi kerak — metrika kuzatadi,
 *  boshqarmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Hujjatdagi bucket chegaralari (docs/15 §3.3) — AYNAN ko'chirilgan. */
const BUCKETS = {
  pairingDuration: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  pairingFloatCount: [0, 1, 2, 3, 5, 8, 13, 21],
  moveProcessing: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  clockDrift: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  ratingRecompute: [1, 5, 15, 30, 60, 300, 900, 1800],
  ratingDeviation: [30, 50, 75, 100, 150, 200, 350],
  paymentDuration: [0.1, 0.5, 1, 2, 5, 10, 30],
  resultEntryLag: [10, 30, 60, 300, 900, 3600],
  fairplayAnalysis: [1, 5, 15, 30, 60, 180, 600],
  httpDuration: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
} as const;

interface Instruments {
  // --- Juftlashtirish ---
  readonly pairingDuration: Histogram;
  readonly pairingFailures: Counter;
  readonly pairingCriteriaViolations: Counter;
  readonly pairingFloatCount: Histogram;
  // --- O'yin ---
  readonly activeGames: Gauge;
  readonly websocketConnections: Gauge;
  readonly moveProcessingDuration: Histogram;
  readonly clockDrift: Histogram;
  readonly gameDisconnects: Counter;
  // --- Reyting ---
  readonly ratingPeriodLag: Gauge;
  readonly ratingRecomputeDuration: Histogram;
  readonly glickoConvergenceFailures: Counter;
  readonly ratingDeviation: Histogram;
  // --- To'lov ---
  readonly paymentAttempts: Counter;
  readonly paymentFailures: Counter;
  readonly paymentDuration: Histogram;
  readonly ledgerImbalance: Gauge;
  // --- Turnir ---
  readonly activeTournaments: Gauge;
  readonly resultEntryLag: Histogram;
  // --- Fair play ---
  readonly fairplayAnalysisDuration: Histogram;
  readonly fairplaySignals: Counter;
  // --- Texnik (RED / USE) ---
  readonly httpRequestDuration: Histogram;
  readonly httpRequests: Counter;
  readonly dbPoolWaiting: Gauge;
}

function createInstruments(meter: Meter): Instruments {
  const histogram = (name: string, description: string, boundaries: readonly number[]): Histogram =>
    meter.createHistogram(name, {
      description,
      advice: { explicitBucketBoundaries: [...boundaries] },
    });

  return {
    // ---------- PAIRING (docs/15 §3.3) ----------
    pairingDuration: histogram(
      'farzin_pairing_duration_seconds',
      'Raund juftlashtirish davomiyligi',
      BUCKETS.pairingDuration,
    ),
    pairingFailures: meter.createCounter('farzin_pairing_failures_total', {
      description: 'Juftlashtirish muvaffaqiyatsizliklari',
    }),
    /**
     * ENG MUHIM METRIKA (docs/15 §3.3). FIDE C.04.3 absolyut kriteriysi
     * buzilishi — jimgina halokat: xato yo'q, hakam turnir oxirida biladi.
     * Nolga teng bo'lmagan HAR QANDAY qiymatda `page` alert
     * (infra/prometheus/farzin-rules.yml).
     */
    pairingCriteriaViolations: meter.createCounter(
      'farzin_pairing_criteria_violations_total',
      { description: "FIDE absolyut kriteriya buzilishi (HECH QACHON > 0 bo'lmasligi kerak)" },
    ),
    pairingFloatCount: histogram(
      'farzin_pairing_float_count',
      'Raunddagi downfloat soni — sifat signali',
      BUCKETS.pairingFloatCount,
    ),

    // ---------- O'YIN ----------
    activeGames: meter.createGauge('farzin_active_games', {
      description: "Hozir davom etayotgan o'yinlar",
    }),
    websocketConnections: meter.createGauge('farzin_websocket_connections', {
      description: 'Faol WebSocket ulanishlari (HPA manbai — docs/11 §4.4)',
    }),
    moveProcessingDuration: histogram(
      'farzin_move_processing_duration_seconds',
      "Yurish qabul qilishdan raqibga yuborishgacha (SLO manbai)",
      BUCKETS.moveProcessing,
    ),
    clockDrift: histogram(
      'farzin_clock_drift_seconds',
      'Taymer drift — server hisobi vs kutilgan',
      BUCKETS.clockDrift,
    ),
    gameDisconnects: meter.createCounter('farzin_game_disconnects_total', {
      description: "O'yin davomida uzilishlar",
    }),

    // ---------- REYTING ----------
    ratingPeriodLag: meter.createGauge('farzin_rating_period_lag_seconds', {
      description: 'Rating period yopilishi kechikishi',
    }),
    ratingRecomputeDuration: histogram(
      'farzin_rating_recompute_duration_seconds',
      'Glicko-2 rating period hisobi davomiyligi',
      BUCKETS.ratingRecompute,
    ),
    glickoConvergenceFailures: meter.createCounter('farzin_glicko_convergence_failures_total', {
      description: 'Glicko-2 sigma iteratsiyasi konvergensiya qilmadi',
    }),
    ratingDeviation: histogram(
      'farzin_rating_deviation',
      "O'yinchilar RD taqsimoti — reyting ishonchliligi sog'ligi",
      BUCKETS.ratingDeviation,
    ),

    // ---------- TO'LOV ----------
    /**
     * QO'SHILGAN metrika: docs/15 §3.3 uni ta'riflamaydi, lekin §6.4
     * `FarzinPaymentFailureRateHigh` alerti maxrajda AYNAN shu nomni
     * ishlatadi. Metrikasiz alert — yozilgan-u ishlamaydigan qoida.
     */
    paymentAttempts: meter.createCounter('farzin_payment_attempts_total', {
      description: "To'lov urinishlari (§6.4 failure-rate alertining maxraji)",
    }),
    paymentFailures: meter.createCounter('farzin_payment_failures_total', {
      description: "To'lov muvaffaqiyatsizliklari",
    }),
    paymentDuration: histogram(
      'farzin_payment_duration_seconds',
      "To'lov provayderiga so'rov davomiyligi",
      BUCKETS.paymentDuration,
    ),
    ledgerImbalance: meter.createGauge('farzin_ledger_imbalance_tiyin', {
      description: "Ledger debet-kredit farqi, tiyinda (0 bo'lishi SHART)",
    }),

    // ---------- TURNIR ----------
    activeTournaments: meter.createGauge('farzin_active_tournaments', {
      description: "Davom etayotgan turnirlar",
    }),
    resultEntryLag: histogram(
      'farzin_result_entry_lag_seconds',
      "O'yin tugashidan natija kiritilgunicha (hakam ish oqimi sog'ligi)",
      BUCKETS.resultEntryLag,
    ),

    // ---------- FAIR PLAY ----------
    fairplayAnalysisDuration: histogram(
      'farzin_fairplay_analysis_duration_seconds',
      "Stockfish bilan bitta o'yin tahlili (xarajat drayveri)",
      BUCKETS.fairplayAnalysis,
    ),
    fairplaySignals: meter.createCounter('farzin_fairplay_signals_total', {
      description: 'Fair-play signallari (EHTIMOLLIK, isbot emas — CANON 7.5)',
    }),

    // ---------- TEXNIK: RED va USE (docs/15 §3.1, §3.2) ----------
    httpRequestDuration: histogram(
      'http_request_duration_seconds',
      "HTTP so'rov davomiyligi",
      BUCKETS.httpDuration,
    ),
    /**
     * QO'SHILGAN metrika: §3.2 faqat histogramni beradi, lekin §6.3
     * SLO/burn-rate qoidalari `http_requests_total` ni talab qiladi.
     */
    httpRequests: meter.createCounter('http_requests_total', {
      description: "HTTP so'rovlar soni (§6.3 availability SLI manbai)",
    }),
    dbPoolWaiting: meter.createGauge('farzin_db_pool_waiting_count', {
      description: "DB pool ulanishini kutayotgan so'rovlar (USE — saturation)",
    }),
  };
}

@Injectable()
export class MetricsService {
  private readonly instruments: Instruments | null;

  constructor(@Optional() @Inject(METRICS_METER) meter?: Meter) {
    this.instruments = meter === undefined ? null : createInstruments(meter);
  }

  /** Metrika yozuvi faolmi (test va diagnostika uchun). */
  get enabled(): boolean {
    return this.instruments !== null;
  }

  /**
   * "Hodisa BO'LMAGANI" ham ma'lumot: OpenTelemetry instrument birinchi
   * yozuvgacha umuman seriya chiqarmaydi, ya'ni dashboard "No data"
   * ko'rsatadi. Nol tolerantlikdagi ikki counter uchun bu qabul qilib
   * bo'lmaydi — TZ Faza 2/3 DoD ularning AYNAN 0 ekanini talab qiladi.
   *
   * Shuning uchun ular ishga tushishda 0 bilan e'lon qilinadi. Bu
   * to'qilgan ma'lumot EMAS: "boshlanganidan beri nol marta" — haqiqat.
   *
   * ⚠️  Gauge'lar (ledger imbalance, period lag) ATAYLAB e'lon
   *     QILINMAYDI: ularning 0 qiymati "tekshirildi va toza" degani,
   *     tekshirilmasidan oldin uni chiqarish — yolg'on tinchlik.
   */
  primeZeroSeries(): void {
    if (this.instruments === null) {
      return;
    }
    for (const criterion of PAIRING_CRITERIA) {
      this.instruments.pairingCriteriaViolations.add(0, { criterion });
    }
    this.instruments.glickoConvergenceFailures.add(0);
  }

  // --- Juftlashtirish (docs/15 §3.3 PAIRING) --------------------------------

  /**
   * @param seconds     dvigatel `pair()` chaqiruvi davomiyligi
   * @param sectionSize seksiyadagi o'yinchi soni — YORLIQ EMAS, u guruhga
   *                    tushiriladi (§3.4). Chaqiruvchi bucket'ni o'zi
   *                    hisoblamaydi: qoida bitta joyda.
   */
  observePairingDuration(
    seconds: number,
    labels: { algorithm: PairingAlgorithmLabel; sectionSize: number },
  ): void {
    this.instruments?.pairingDuration.record(seconds, {
      algorithm: labels.algorithm,
      section_size_bucket: sectionSizeBucket(labels.sectionSize),
    });
  }

  incPairingFailure(labels: {
    algorithm: PairingAlgorithmLabel;
    reason: PairingFailureReason;
  }): void {
    this.instruments?.pairingFailures.add(1, {
      algorithm: labels.algorithm,
      reason: labels.reason,
    });
  }

  /** Nol tolerantlik — buni ko'rgan alert turnirni to'xtatishga chaqiradi. */
  incCriteriaViolation(labels: { criterion: PairingCriterionLabel }): void {
    this.instruments?.pairingCriteriaViolations.add(1, { criterion: labels.criterion });
  }

  observePairingFloatCount(floatCount: number, labels: { sectionSize: number }): void {
    this.instruments?.pairingFloatCount.record(floatCount, {
      section_size_bucket: sectionSizeBucket(labels.sectionSize),
    });
  }

  // --- O'yin (docs/15 §3.3 O'YIN) -------------------------------------------

  setActiveGames(count: number, labels: { type: GameTypeLabel }): void {
    this.instruments?.activeGames.record(count, { type: labels.type });
  }

  setWebsocketConnections(count: number, labels: { namespace: WsNamespaceLabel }): void {
    this.instruments?.websocketConnections.record(count, { namespace: labels.namespace });
  }

  /** SLO #2 manbai (§6.2): p95 < 150 ms. */
  observeMoveProcessing(seconds: number, labels: { gameType: string }): void {
    this.instruments?.moveProcessingDuration.record(seconds, {
      game_type: timeCategoryLabel(labels.gameType),
    });
  }

  observeClockDrift(seconds: number, labels: { gameType: string }): void {
    this.instruments?.clockDrift.record(seconds, {
      game_type: timeCategoryLabel(labels.gameType),
    });
  }

  incGameDisconnect(labels: { gameType: string; outcome: DisconnectOutcomeLabel }): void {
    this.instruments?.gameDisconnects.add(1, {
      game_type: timeCategoryLabel(labels.gameType),
      outcome: labels.outcome,
    });
  }

  // --- Reyting (docs/15 §3.3 REYTING) ---------------------------------------

  setRatingPeriodLag(
    seconds: number,
    labels: { environment: PlayEnvironmentLabel; timeCategory: TimeCategoryLabel },
  ): void {
    this.instruments?.ratingPeriodLag.record(seconds, {
      environment: labels.environment,
      time_category: labels.timeCategory,
    });
  }

  observeRatingRecomputeDuration(seconds: number): void {
    this.instruments?.ratingRecomputeDuration.record(seconds);
  }

  incGlickoConvergenceFailure(): void {
    this.instruments?.glickoConvergenceFailures.add(1);
  }

  observeRatingDeviation(deviation: number): void {
    this.instruments?.ratingDeviation.record(deviation);
  }

  // --- To'lov (docs/15 §3.3 TO'LOV) -----------------------------------------

  incPaymentAttempt(labels: { provider: PaymentProviderLabel }): void {
    this.instruments?.paymentAttempts.add(1, { provider: labels.provider });
  }

  /** ⚠️  Bu yerda hech qanday karta yoki foydalanuvchi ma'lumoti YO'Q (§3.3). */
  incPaymentFailure(labels: {
    provider: PaymentProviderLabel;
    reason: PaymentFailureReason;
  }): void {
    this.instruments?.paymentFailures.add(1, {
      provider: labels.provider,
      reason: labels.reason,
    });
  }

  observePaymentDuration(
    seconds: number,
    labels: { provider: PaymentProviderLabel; operation: PaymentOperationLabel },
  ): void {
    this.instruments?.paymentDuration.record(seconds, {
      provider: labels.provider,
      operation: labels.operation,
    });
  }

  /** Debet ≠ kredit → pul yo'qolgan yoki yaratilgan. `page` alert. */
  setLedgerImbalance(tiyin: number): void {
    this.instruments?.ledgerImbalance.record(tiyin);
  }

  // --- Turnir (docs/15 §3.3 TURNIR) -----------------------------------------

  setActiveTournaments(count: number, labels: { status: ActiveTournamentStatusLabel }): void {
    this.instruments?.activeTournaments.record(count, { status: labels.status });
  }

  /**
   * REGISTRATSIYA QILINGAN, LEKIN HALI OZIQLANTIRILMAYDI (halol qayd).
   * Sabab: OTB partiyaning TUGASH vaqti tizimda qayd etilmaydi — hakam
   * faqat natijani kiritadi. "O'yin tugadi" signali DGT/broadcast bilan
   * keladi (docs/14 Faza 8). Uni Pairing.createdAt dan hisoblash boshqa
   * narsani o'lchagan bo'lardi — soxta raqamdan ko'ra bo'sh metrika afzal.
   */
  observeResultEntryLag(seconds: number): void {
    this.instruments?.resultEntryLag.record(seconds);
  }

  // --- Fair play (docs/15 §3.3 FAIR PLAY) -----------------------------------

  observeFairplayAnalysisDuration(seconds: number, labels: { depth: number }): void {
    this.instruments?.fairplayAnalysisDuration.record(seconds, {
      // Chuqurlik konfiguratsiya bilan chegaralangan (FAIRPLAY_ENGINE_DEPTH
      // 4..30) — yorliq sifatida xavfsiz, cheksiz emas.
      depth: String(Math.trunc(labels.depth)),
    });
  }

  incFairplaySignal(labels: { signalType: FairplaySignalTypeLabel; strength: number }): void {
    this.instruments?.fairplaySignals.add(1, {
      signal_type: labels.signalType,
      severity: fairplaySeverity(labels.strength),
    });
  }

  // --- Texnik: RED va USE (docs/15 §3.1, §3.2) ------------------------------

  /** `route` — SHABLON, xom URL EMAS (§3.2 ogohlantirishi). */
  observeHttpRequest(
    seconds: number,
    labels: { method: string; route: string | undefined; status: number },
  ): void {
    if (this.instruments === null) {
      return;
    }
    const attributes = {
      method: httpMethodLabel(labels.method),
      route: sanitizeRoute(labels.route),
      status: httpStatusLabel(labels.status),
    };
    this.instruments.httpRequestDuration.record(seconds, attributes);
    this.instruments.httpRequests.add(1, attributes);
  }

  /**
   * REGISTRATSIYA QILINGAN, LEKIN HALI OZIQLANTIRILMAYDI (halol qayd).
   * Sabab: pool saturation'ni Prisma faqat `previewFeatures = ["metrics"]`
   * bilan beradi (`prisma.$metrics.json()`); u schema generatori
   * o'zgarishini talab qiladi va bu observability qatlamining ishi emas.
   * docs/11 §6.1 bu metrikani talab qiladi — TODO(infra) sifatida ochiq.
   */
  setDbPoolWaiting(count: number): void {
    this.instruments?.dbPoolWaiting.record(count);
  }
}
