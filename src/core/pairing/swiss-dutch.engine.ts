import {
  ByeType,
  Color,
  FloatDirection,
  PairingImpossibleError,
  type ByeAssignment,
  type Pairing,
  type PairingDiagnostics,
  type PairingEngine,
  type PairingRequest,
  type PairingResult,
  type PlayerPairingState,
} from './pairing.types';
import { colorPenaltiesFor, WeightScheme } from './swiss/bracket-weights';
import { allocateColors } from './swiss/colors';
import { pairAllBrackets } from './swiss/score-brackets';
import { prepareSwissPlayers, toAllocationSide, type SwissPlayer } from './swiss/swiss-types';
import { verifyAbsoluteCriteria, type ColoredPair } from './swiss/verify';

export { PairingIntegrityError, type PairingCriterion } from './swiss/verify';

/**
 * FIDE (Dutch) System — C.04.3, 2026-02-01 redaksiyasi.
 *
 * NORMATIV MANBA: docs/references/fide-c0403-dutch-2026-02.md (verbatim).
 * Algoritm qarori: docs/adr/0007-blossom-matching-for-pairing.md va uni
 * aniqlashtiruvchi docs/adr/0009-swiss-bracket-sequential-matching.md.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  VALIDATSIYA HOLATI — HALOL BAYON (TZ Faza 2 DoD):
 *
 *  ✔ Property-testlar bilan tekshirilgan (C1 takror juftlik yo'q, rang
 *    chegaralari, qamrov, determinizm, kirish tartibiga befarqlik) —
 *    swiss-dutch.engine.property.spec.ts;
 *  ✔ Qo'lda, qoida-ma-qoida hisoblangan golden ssenariylar bilan
 *    tekshirilgan — swiss-dutch.engine.spec.ts;
 *  ✘ Swiss-Manager / JaVaFo bilan real turnirlarda TEKSHIRILMAGAN.
 *    Sifat kriteriylari tanlovida FIDE ketma-ketligidan farqlar bo'lishi
 *    mumkin (ADR-0009 "halol chegaralar"). Ishlab chiqarishda ishonishdan
 *    OLDIN shadow-mode (mavjud vosita bilan parallel yurgizish) SHART.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MODDALAR → KOD XARITASI:
 *  Article 1.2 (tartib)            → compute(): (scoreX2 desc, pairingNumber asc)
 *  Article 1.3 (scoregroup/bracket)→ swiss/score-brackets.ts
 *  Article 1.4 (float)             → PlayerPairingState.floatHistory
 *                                    (arbiter/pairing-state.builder.ts hisoblaydi)
 *  Article 1.5 (PAB)               → swiss/score-brackets.ts dummy tugun,
 *                                    ochko = 1 (g'alaba bilan teng)
 *  Article 1.6–1.7 (rang afzalligi)→ swiss/colors.ts colorPreferenceOf
 *  Article 1.8 (topscorer)         → swiss/swiss-types.ts prepareSwissPlayers
 *  Article 1.9 (round-pairing)     → swiss/score-brackets.ts pairAllBrackets
 *  Article 2.1 (C1–C3 absolyut)    → swiss/swiss-types.ts canMeet + verify.ts
 *  Article 2.2 (C4 to'liqlik)      → score-brackets merge-kaskadi (isbot:
 *                                    yakuniy global bracket = global matching)
 *  Article 2.3 (C5 PAB)            → dummy qirra og'irligi (C5 darajasi)
 *  Article 2.4 (C6–C21 sifat)      → swiss/bracket-weights.ts darajalari
 *  Article 3 (bracket jarayoni)    → matching bilan almashtirilgan (ADR-0009);
 *                                    3.4.1 "perfect candidate" qisqa yo'li bor
 *  Article 4 (ketma-ketlik)        → TB og'irlik darajasi (4.2.2 transpozitsiya
 *                                    tartibiga mos, exchange tartibi taqriban)
 *  Article 5 (rang taqsimoti)      → swiss/colors.ts allocateColors (5.2.1–5.2.5)
 *
 * DETERMINIZM: Math.random/Date.now yo'q; barcha tartiblar total order
 * (oxirgi kalit — pairingNumber, u unikal). Bir xil PairingRequest →
 * bit-for-bit bir xil pairings/byes. `diagnostics.durationMs` bundan
 * mustasno (o'lchov, qarorlarga ta'sir qilmaydi) — determinizm testlari
 * uni chetlab solishtiradi.
 *
 * KENGAYTIRISH NUQTALARI: request.initialColor (Article 5.1 qur'a rangi,
 * default oq); request.seed E'TIBORSIZ qoldiriladi (pairing.types.ts talabi).
 */
export class SwissDutchEngine implements PairingEngine {
  readonly system = 'SWISS_DUTCH';

  /**
   * Semantik versiya. Og'irlik funksiyasi yoki algoritm o'zgarsa MAJBURIY
   * oshiriladi (`Round.pairingEngineVersion` auditi).
   */
  readonly version = '1.0.0';

  pair(request: PairingRequest): Promise<PairingResult> {
    return Promise.resolve(this.compute(request));
  }

  private compute(request: PairingRequest): PairingResult {
    const startedAt = performance.now(); // faqat diagnostika; qarorlarga ta'sir yo'q

    const { roundNumber, totalRounds } = request;
    if (!Number.isInteger(roundNumber) || roundNumber < 1) {
      throw new PairingImpossibleError(
        request.roundId,
        `roundNumber=${String(roundNumber)} yaroqsiz (>= 1 butun son kutiladi)`,
      );
    }
    if (!Number.isInteger(totalRounds) || totalRounds < roundNumber) {
      throw new PairingImpossibleError(
        request.roundId,
        `totalRounds=${String(totalRounds)} yaroqsiz (roundNumber=${String(roundNumber)} dan ` +
          "kichik bo'lmasligi kerak — topscorer aniqlash, Article 1.8, shunga bog'liq)",
      );
    }

    // Article 1.2 — tartib: ochko kamayish, TPN (pairingNumber) o'sish.
    // pairingNumber unikalligi determinizm sharti (round-robin bilan bir xil).
    const sorted = [...request.players].sort((a, b) => {
      const sa = Math.round(a.points * 2);
      const sb = Math.round(b.points * 2);
      if (sa !== sb) {
        return sb - sa;
      }
      return a.pairingNumber - b.pairingNumber;
    });
    const seenNumbers = new Set<number>();
    for (const p of sorted) {
      if (seenNumbers.has(p.pairingNumber)) {
        throw new PairingImpossibleError(
          request.roundId,
          `pairingNumber=${String(p.pairingNumber)} takrorlangan — tartib aniqlanmaydi`,
        );
      }
      seenNumbers.add(p.pairingNumber);
    }

    const activeStates = sorted.filter((p) => isActive(p, roundNumber));
    if (activeStates.length === 0) {
      throw new PairingImpossibleError(request.roundId, "birorta ham aktiv o'yinchi yo'q");
    }

    const initialColor = request.initialColor ?? Color.White;
    const players = prepareSwissPlayers(activeStates, roundNumber, totalRounds);
    const needPab = players.length % 2 === 1;

    const scores = players.map((p) => p.scoreX2);
    const scheme = new WeightScheme({
      n: players.length,
      minScoreX2: Math.min(...scores),
      maxScoreX2: Math.max(...scores),
      maxUnplayed: roundNumber - 1,
      initialColor,
    });

    const outcome = pairAllBrackets(players, scheme, needPab, request.roundId);

    // Article 5 — rang taqsimoti (juftlik ichida sof funksiya).
    const colored: ColoredPair[] = outcome.pairs.map(([hi, lo]) => {
      const alloc = allocateColors(toAllocationSide(hi), toAllocationSide(lo), initialColor);
      return alloc.firstIsWhite ? { white: hi, black: lo } : { white: lo, black: hi };
    });

    // Taxta tartibi: juftlikdagi eng yuqori rank (Article 1.2) bo'yicha —
    // 1-taxtada eng yuqori bracket juftligi (C.04.2 amaliyoti bilan mos).
    colored.sort(
      (a, b) =>
        Math.min(a.white.rankIndex, a.black.rankIndex) -
        Math.min(b.white.rankIndex, b.black.rankIndex),
    );

    // MAJBURIY post-verifikatsiya (TZ Faza 2): absolyut kriteriylar.
    // Buzilish = dvigatel bugi → PairingIntegrityError (bu HECH QACHON
    // bo'lmasligi kerak).
    verifyAbsoluteCriteria(request.roundId, players, colored, outcome.pab);

    const pairings: Pairing[] = colored.map((p, index) => ({
      boardNumber: index + 1,
      whitePlayerId: p.white.state.playerId,
      blackPlayerId: p.black.state.playerId,
    }));

    const byes: ByeAssignment[] =
      outcome.pab === null
        ? []
        : [
            {
              playerId: outcome.pab.state.playerId,
              type: ByeType.PairingAllocated,
              // Article 1.5 / Basic Rules 3-modda: g'alaba bilan teng ochko.
              points: 1,
            },
          ];

    const diagnostics = buildDiagnostics(players, colored, outcome.pab, initialColor, startedAt);

    return { pairings, byes, engineVersion: this.version, diagnostics };
  }
}

/** Chiqib ketgan yoki hali qo'shilmagan o'yinchi juftlashtirilmaydi. */
function isActive(player: PlayerPairingState, roundNumber: number): boolean {
  return !player.isWithdrawn && player.joinedAtRound <= roundNumber;
}

/**
 * Diagnostika (hakam "nega bu juftlik?" so'raganda birinchi qatlam):
 * qaysi sifat kriteriylari amalda buzilgani NATIJADAN qayta hisoblanadi,
 * shuning uchun deterministik (durationMs dan tashqari).
 */
function buildDiagnostics(
  players: readonly SwissPlayer[],
  pairs: readonly ColoredPair[],
  pab: SwissPlayer | null,
  initialColor: Color,
  startedAt: number,
): PairingDiagnostics {
  const relaxed = new Set<string>();
  let floatCount = 0;

  for (const pair of pairs) {
    const pens = colorPenaltiesFor(pair.white, pair.black, initialColor);
    if (pens.c10 > 0) {
      relaxed.add('C10');
    }
    if (pens.c11 > 0) {
      relaxed.add('C11');
    }
    if (pens.c12 > 0) {
      relaxed.add('C12');
    }
    if (pens.c13 > 0) {
      relaxed.add('C13');
    }

    if (pair.white.scoreX2 !== pair.black.scoreX2) {
      // Article 1.4.2: yuqori ochkoli down, quyi ochkoli up float oladi.
      floatCount += 2;
      const down = pair.white.scoreX2 > pair.black.scoreX2 ? pair.white : pair.black;
      const up = down === pair.white ? pair.black : pair.white;
      if (down.floatPrev === FloatDirection.Down) {
        relaxed.add('C14');
      }
      if (up.floatPrev === FloatDirection.Up) {
        relaxed.add('C15');
      }
      if (down.floatPrevPrev === FloatDirection.Down) {
        relaxed.add('C16');
      }
      if (up.floatPrevPrev === FloatDirection.Up) {
        relaxed.add('C17');
      }
    }
  }

  if (pab !== null) {
    floatCount += 1; // Article 1.4.3: PAB — downfloat.
    if (pab.floatPrev === FloatDirection.Down) {
      relaxed.add('C14');
    }
    if (pab.floatPrevPrev === FloatDirection.Down) {
      relaxed.add('C16');
    }
  }

  const scoreGroups = new Set(players.map((p) => p.scoreX2));

  return {
    durationMs: performance.now() - startedAt,
    scoreGroupCount: scoreGroups.size,
    floatCount,
    relaxedCriteria: [...relaxed].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
  };
}
