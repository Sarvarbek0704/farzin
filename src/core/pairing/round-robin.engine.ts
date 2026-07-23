import {
  ByeType,
  PairingImpossibleError,
  type ByeAssignment,
  type Pairing,
  type PairingEngine,
  type PairingRequest,
  type PairingResult,
  type PlayerPairingState,
} from './pairing.types';

/**
 * Round-robin (davra tizimi) juftlashtirish dvigateli — FIDE Berger jadvallari.
 *
 * Sof TypeScript: NestJS, Prisma, HTTP yo'q (ADR-0001). Determinizm mutlaq:
 * `Math.random`, `Date.now`, `Set` iteratsiya tartibi — ishlatilmaydi.
 *
 * JADVAL MANBASI (docs/05-pairing-engine.md §1.2):
 * FIDE Handbook C.04.1 Annex — Berger jadvallari. Bu yerda jadval FIDE'ning
 * rasmiy konstruksiyasi bilan qayta tiklanadi ("circle method": oxirgi
 * o'rindiq qo'zg'almas, qolganlari aylanadi). Konstruksiya FIDE jadvalining
 * o'zi — spec'dagi golden testlar N=4, 5, 6, 8 uchun natijani C.04.1 Annex
 * bilan bit-for-bit solishtiradi. Tur tartibi ham, stol tartibi ham, rang
 * taqsimoti ham FIDE jadvaliga aynan mos (§1.2 "tur tartibi ahamiyatli").
 *
 * O'RINDIQ (seat) ↔ O'YINCHI:
 * O'yinchilar `pairingNumber` bo'yicha o'sish tartibida 1..N o'rindiqlarga
 * o'tiradi. "Initial drawing of lots" (o'yinchi → jadval raqami) turnir
 * boshlanishidan OLDIN, engine'dan tashqarida bo'ladi — engine uchun u
 * allaqachon `pairingNumber`da muzlatilgan (§1.2 izohi).
 *
 * TOQ N (docs/05 §1.2 "Rang"):
 * Fantom (dummy) o'yinchi N+1-o'rindiqqa qo'yiladi. Fantomga to'g'ri kelgan
 * o'yinchi shu turda PAIRING_ALLOCATED bye (1 ochko) oladi.
 *
 * DOUBLE ROUND-ROBIN (docs/05 §1.3):
 * Alohida engine emas — shu klassning konfiguratsiyasi (`legs: 2`).
 * Ikkinchi aylana birinchisini takrorlaydi, ranglar teskari.
 *
 * HUJJATDA BELGILANMAGAN, BU YERDA QAT'IYLANGAN QARORLAR:
 *
 *  1. Chiqib ketgan (isWithdrawn) o'yinchi juftlashtirilmaydi. Uning
 *     jadvaldagi raqibi shu turda PAIRING_ALLOCATED bye (1 ochko) oladi —
 *     shunda port kafolati #4 ("har bir chiqmagan o'yinchi juftlashadi
 *     yoki bye oladi", pairing.types.ts) saqlanadi. Hakam natijani
 *     `arbiter` modulida forfeitga o'zgartirishi mumkin.
 *
 *  2. Hali qo'shilmagan o'yinchi (`joinedAtRound > roundNumber`) xuddi
 *     shunday: o'zi juftlashtirilmaydi, raqibi bye oladi. Round-robin'da
 *     kech qo'shilish odatda bo'lmaydi, lekin engine yiqilmasligi kerak.
 *
 *  3. `request.totalRounds` va `request.seed` E'TIBORSIZ qoldiriladi:
 *     jadval uzunligi faqat o'yinchilar sonidan hisoblanadi, tasodifiylik
 *     esa umuman yo'q (seed — pairing.types.ts bo'yicha zaxira maydon).
 *
 *  4. `diagnostics` qaytarilmaydi (maydon ixtiyoriy): `durationMs` uchun
 *     soat kerak bo'lardi, bu esa "bir xil input → bir xil output"
 *     kafolatini obyekt darajasida buzadi. Round-robin'da score group ham,
 *     float ham, relax qilinadigan kriteriy ham yo'q — diagnostika bo'sh.
 *
 * @see docs/05-pairing-engine.md §1.2, §1.3, AC-25, AC-26
 */

/** PAB (pairing-allocated bye) ochkosi — pairing.types.ts: "Odatda 1 ochko". */
const PAIRING_ALLOCATED_BYE_POINTS = 1;

export interface RoundRobinOptions {
  /**
   * Aylanalar soni: 1 — oddiy round-robin, 2 — double round-robin.
   * docs/05-pairing-engine.md §1.3 — `legs: 2` konfiguratsiyasi.
   */
  readonly legs?: 1 | 2;
}

/** Berger jadvalidagi bitta stol: o'rindiq raqamlari (1..tableSize). */
interface SeatPair {
  readonly whiteSeat: number;
  readonly blackSeat: number;
}

export class RoundRobinEngine implements PairingEngine {
  readonly system: 'ROUND_ROBIN' | 'DOUBLE_ROUND_ROBIN';

  /**
   * Semantik versiya. Jadval konstruksiyasi yoki bye/withdrawal qoidasi
   * o'zgarsa — MAJBURIY oshiriladi (`Round.pairingEngineVersion` uchun).
   */
  readonly version = '1.0.0';

  private readonly legs: 1 | 2;

  constructor(options: RoundRobinOptions = {}) {
    this.legs = options.legs ?? 1;
    this.system = this.legs === 2 ? 'DOUBLE_ROUND_ROBIN' : 'ROUND_ROBIN';
  }

  pair(request: PairingRequest): Promise<PairingResult> {
    return Promise.resolve(this.compute(request));
  }

  private compute(request: PairingRequest): PairingResult {
    const seats = seatingOrder(request);
    const n = seats.length;

    if (n < 2) {
      throw new PairingImpossibleError(
        request.roundId,
        `round-robin uchun kamida 2 o'yinchi kerak, berilgani ${String(n)} ta`,
      );
    }

    // Toq N → fantom o'yinchi qo'shiladi (docs/05 §1.2 "Rang").
    const tableSize = n % 2 === 0 ? n : n + 1;
    const roundsPerLeg = tableSize - 1;
    const scheduleLength = this.legs * roundsPerLeg;
    const { roundNumber } = request;

    if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > scheduleLength) {
      throw new PairingImpossibleError(
        request.roundId,
        `roundNumber=${String(roundNumber)} jadvaldan tashqarida ` +
          `(1..${String(scheduleLength)}, N=${String(n)}, legs=${String(this.legs)})`,
      );
    }

    const activeCount = seats.filter((player) => isActive(player, roundNumber)).length;
    if (activeCount < 2) {
      throw new PairingImpossibleError(
        request.roundId,
        `kamida 2 aktiv o'yinchi kerak, hozir ${String(activeCount)} ta`,
      );
    }

    // Ikkinchi aylana (double RR) — o'sha jadval, ranglar teskari (§1.3).
    const legRound = ((roundNumber - 1) % roundsPerLeg) + 1;
    const isSecondLeg = roundNumber > roundsPerLeg;

    const pairings: Pairing[] = [];
    const byes: ByeAssignment[] = [];
    let boardNumber = 1;

    for (const seatPair of bergerRound(tableSize, legRound)) {
      const white = playerAtSeat(seats, isSecondLeg ? seatPair.blackSeat : seatPair.whiteSeat);
      const black = playerAtSeat(seats, isSecondLeg ? seatPair.whiteSeat : seatPair.blackSeat);

      const whiteActive = white !== null && isActive(white, roundNumber);
      const blackActive = black !== null && isActive(black, roundNumber);

      if (whiteActive && blackActive) {
        pairings.push({
          boardNumber,
          whitePlayerId: white.playerId,
          blackPlayerId: black.playerId,
        });
        boardNumber += 1;
      } else if (whiteActive) {
        // Raqib — fantom (toq N) yoki nofaol → PAB. Header'dagi qaror #1-2.
        byes.push(pairingAllocatedBye(white));
      } else if (blackActive) {
        byes.push(pairingAllocatedBye(black));
      }
      // Ikkala tomon ham nofaol/fantom: bu stol bu turda o'ynalmaydi.
    }

    return { pairings, byes, engineVersion: this.version };
  }
}

/**
 * O'yinchilarni o'rindiqlarga o'tkazish: `pairingNumber` bo'yicha o'sish
 * tartibida stable sort. Takrorlangan raqam — jadval o'rni noaniq bo'lib
 * qoladi, bu determinizmni buzadi → xato.
 */
function seatingOrder(request: PairingRequest): readonly PlayerPairingState[] {
  const sorted = [...request.players].sort((a, b) => a.pairingNumber - b.pairingNumber);
  sorted.forEach((player, index) => {
    const next = sorted[index + 1];
    if (next?.pairingNumber === player.pairingNumber) {
      throw new PairingImpossibleError(
        request.roundId,
        `pairingNumber=${String(player.pairingNumber)} takrorlangan — jadval o'rni aniqlanmaydi`,
      );
    }
  });
  return sorted;
}

/** Fantom o'rindiq (toq N da tableSize) uchun `null` qaytadi. */
function playerAtSeat(
  seats: readonly PlayerPairingState[],
  seat: number,
): PlayerPairingState | null {
  return seats[seat - 1] ?? null;
}

/** Chiqib ketgan yoki hali qo'shilmagan o'yinchi juftlashtirilmaydi. */
function isActive(player: PlayerPairingState, roundNumber: number): boolean {
  return !player.isWithdrawn && player.joinedAtRound <= roundNumber;
}

function pairingAllocatedBye(player: PlayerPairingState): ByeAssignment {
  return {
    playerId: player.playerId,
    type: ByeType.PairingAllocated,
    points: PAIRING_ALLOCATED_BYE_POINTS,
  };
}

/**
 * FIDE C.04.1 Annex Berger jadvalining `round`-turi (1 asosli), o'rindiq
 * raqamlarida. `tableSize` HAR DOIM juft (toq N uchun fantom allaqachon
 * qo'shilgan).
 *
 * Konstruksiya ("circle method", FIDE jadvallari aynan shundan tuzilgan):
 *
 *  - `tableSize`-o'rindiq QO'ZG'ALMAS. Uning raqibi ("yetakchi"):
 *        leader(r) = ((r − 1) · tableSize/2) mod (tableSize − 1) + 1
 *    Bu FIDE jadvalidagi 1, m+1, 2, m+2, ... ketma-ketlikning o'zi
 *    (masalan, N=8: 1, 5, 2, 6, 3, 7, 4).
 *
 *  - Yetakchi stoli rangi almashinib turadi: toq turda yetakchi oq
 *    (FIDE: "1-8"), juft turda qo'zg'almas o'yinchi oq (FIDE: "8-5").
 *
 *  - Qolgan stollar: yetakchidan i qadam OLDINDAGI o'yinchi oq, i qadam
 *    ORQADAGI o'yinchi qora — (leader+i, leader−i), mod (tableSize−1).
 *    FIDE jadvalidagi stol tartibi ham aynan shu: avval qo'zg'almas
 *    o'yinchi stoli, keyin i = 1, 2, ...
 *
 * Golden testlar (round-robin.engine.spec.ts) bu funksiya chiqishini FIDE
 * jadvali bilan bit-for-bit solishtiradi — docs/05 §1.2 talabi, AC-25.
 */
function bergerRound(tableSize: number, round: number): readonly SeatPair[] {
  const half = tableSize / 2;
  const modulus = tableSize - 1;
  const leader = ((round - 1) * half) % modulus + 1;

  const pairs: SeatPair[] = [];

  // 1-stol: qo'zg'almas o'rindiq va yetakchi. Rang tur juft-toqligiga qarab.
  if (round % 2 === 1) {
    pairs.push({ whiteSeat: leader, blackSeat: tableSize });
  } else {
    pairs.push({ whiteSeat: tableSize, blackSeat: leader });
  }

  for (let i = 1; i < half; i += 1) {
    pairs.push({
      whiteSeat: wrapSeat(leader + i, modulus),
      blackSeat: wrapSeat(leader - i, modulus),
    });
  }

  return pairs;
}

/** 1..modulus oraliqqa aylantirish (aylana bo'ylab). */
function wrapSeat(value: number, modulus: number): number {
  return ((((value - 1) % modulus) + modulus) % modulus) + 1;
}
