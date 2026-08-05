import {
  Color,
  FloatDirection,
  type PlayerId,
  type PlayerPairingState,
} from '../../core/pairing/pairing.types';
import type { PairingHistoryEntry, ParticipantSeed } from './arbiter.types';
import { outcomeFor, sideOf } from './result-mapping';

/**
 * Juftliklar tarixidan `PlayerPairingState[]` qurish — SOF funksiya.
 *
 * Engine (core/pairing) DB haqida bilmaydi; service DB qatorlarini shu
 * funksiya orqali engine kirish shakliga keltiradi. `PlayerId` brand'i
 * ostida `Registration.id` yuradi — juftlashtirish seksiya ichida
 * ro'yxat (registration) darajasida ishlaydi (prisma/schema.prisma:
 * Pairing.white/blackRegistrationId).
 *
 * Maydonlar semantikasi (core/pairing/pairing.types.ts bilan mos):
 *  - points        — hisobga kirgan natijalar yig'indisi (bye/forfeit ham);
 *  - opponentIds   — juftlashtirilgan HAR QANDAY raqib (natijasi UNPLAYED
 *                    bo'lsa ham — juftlik allaqachon berilgan, FIDE C1);
 *  - colorHistory  — faqat taxtada o'ynalgan partiyalar ("bye bo'lgan
 *                    turda element YO'Q");
 *  - hasReceivedBye — FIDE C2 blokeri: BYE_FULL olgan YOKI o'ynamasdan
 *                    g'alaba ochkosini olgan (forfeit g'alaba). Bunday
 *                    o'yinchi PAB olmaydi (C.04.3 Article 2.1.2);
 *  - floatHistory  — HAR yakunlangan tur uchun bitta element (Swiss
 *                    C14–C17 tekislashni talab qiladi), FIDE C.04.3
 *                    Article 1.4 bo'yicha:
 *                      1.4.2 — turli ochkoli ikki o'yinchi o'ynasa, tur
 *                              BOSHIdagi ochko bo'yicha yuqorisi Down,
 *                              pastkisi Up;
 *                      1.4.3 — to'liq/yarim ochkoli bye yoki forfeit
 *                              g'alaba (o'ynamasdan mag'lubiyat ochkosidan
 *                              ko'p olish) — Down;
 *                      1.4.4 — boshqa hech kim float olmaydi (None).
 *                    Round-robin engine bu maydonni ishlatmaydi.
 */
export function buildPairingStates(
  participants: readonly ParticipantSeed[],
  history: readonly PairingHistoryEntry[],
): PlayerPairingState[] {
  const sorted = [...history].sort((a, b) => a.roundNumber - b.roundNumber);
  const maxRound = sorted.reduce((acc, e) => Math.max(acc, e.roundNumber), 0);

  // --- 1-o'tish: tur-ma-tur float hisobi (tur BOSHIdagi ochkolar bilan) ----
  const byRound = new Map<number, PairingHistoryEntry[]>();
  for (const entry of sorted) {
    const bucket = byRound.get(entry.roundNumber);
    if (bucket === undefined) {
      byRound.set(entry.roundNumber, [entry]);
    } else {
      bucket.push(entry);
    }
  }

  const floatArrays = new Map<string, FloatDirection[]>(
    participants.map((p) => [
      p.registrationId,
      new Array<FloatDirection>(maxRound).fill(FloatDirection.None),
    ]),
  );
  const runningPoints = new Map<string, number>();
  const pointsOf = (id: string): number => runningPoints.get(id) ?? 0;
  const addPoints = (id: string, score: number): void => {
    runningPoints.set(id, pointsOf(id) + score);
  };

  for (let round = 1; round <= maxRound; round += 1) {
    const entries = byRound.get(round) ?? [];
    const setFloat = (id: string, direction: FloatDirection): void => {
      const arr = floatArrays.get(id);
      if (arr !== undefined) {
        arr[round - 1] = direction;
      }
    };

    for (const entry of entries) {
      const white = entry.whiteRegistrationId;
      const black = entry.blackRegistrationId;
      if (black === null) {
        // 1.4.3: o'ynamasdan mag'lubiyat (0) dan ko'p ochko → downfloat.
        if (entry.result === 'BYE_FULL' || entry.result === 'BYE_HALF') {
          setFloat(white, FloatDirection.Down);
        }
        continue;
      }
      switch (entry.result) {
        case 'WHITE_WIN':
        case 'BLACK_WIN':
        case 'DRAW': {
          const pw = pointsOf(white);
          const pb = pointsOf(black);
          if (pw > pb) {
            setFloat(white, FloatDirection.Down);
            setFloat(black, FloatDirection.Up);
          } else if (pb > pw) {
            setFloat(black, FloatDirection.Down);
            setFloat(white, FloatDirection.Up);
          }
          break;
        }
        // 1.4.3: forfeit g'alaba — o'ynamasdan g'alaba ochkosi → downfloat.
        case 'WHITE_WIN_FORFEIT':
          setFloat(white, FloatDirection.Down);
          break;
        case 'BLACK_WIN_FORFEIT':
          setFloat(black, FloatDirection.Down);
          break;
        default:
          break; // DOUBLE_FORFEIT, UNPLAYED — float yo'q (1.4.4).
      }
    }

    // Ochkolar tur YAKUNIda qo'llanadi (keyingi tur floatlari uchun).
    for (const entry of entries) {
      const whiteOutcome = outcomeFor(entry.result, 'WHITE');
      if (whiteOutcome !== null) {
        addPoints(entry.whiteRegistrationId, whiteOutcome.score);
      }
      if (entry.blackRegistrationId !== null) {
        const blackOutcome = outcomeFor(entry.result, 'BLACK');
        if (blackOutcome !== null) {
          addPoints(entry.blackRegistrationId, blackOutcome.score);
        }
      }
    }
  }

  // --- 2-o'tish: har ishtirokchi uchun yakuniy holat -----------------------
  return participants.map((participant) => {
    let points = 0;
    let hasReceivedBye = false;
    const opponentIds = new Set<PlayerId>();
    const colorHistory: Color[] = [];

    for (const entry of sorted) {
      const side = sideOf(entry, participant.registrationId);
      if (side === null) {
        continue;
      }

      if (entry.blackRegistrationId === null) {
        // Bye — raqib yo'q. C2 blokeri faqat to'liq ochkoli bye'da.
        if (entry.result === 'BYE_FULL') {
          hasReceivedBye = true;
        }
      } else {
        const opponentId =
          side === 'WHITE' ? entry.blackRegistrationId : entry.whiteRegistrationId;
        opponentIds.add(opponentId as PlayerId);
        // C2 blokeri: forfeit g'alaba = o'ynamasdan g'alaba ochkosi.
        if (
          (side === 'WHITE' && entry.result === 'WHITE_WIN_FORFEIT') ||
          (side === 'BLACK' && entry.result === 'BLACK_WIN_FORFEIT')
        ) {
          hasReceivedBye = true;
        }
      }

      const outcome = outcomeFor(entry.result, side);
      if (outcome === null) {
        continue; // UNPLAYED — ochkoga ham, rang tarixiga ham kirmaydi
      }
      points += outcome.score;
      if (outcome.playedOverBoard) {
        colorHistory.push(side === 'WHITE' ? Color.White : Color.Black);
      }
    }

    return {
      playerId: participant.registrationId as PlayerId,
      pairingNumber: participant.pairingNumber,
      // Reytingsiz o'yinchi — 0. Engine'lar reytingni ishlatmaydi (Swiss
      // tartibi pairingNumber'da muzlatilgan), qiymat faqat tip uchun.
      rating: participant.ratingAtEntry ?? 0,
      points,
      opponentIds,
      colorHistory,
      floatHistory: floatArrays.get(participant.registrationId) ?? [],
      hasReceivedBye,
      isWithdrawn: participant.isWithdrawn,
      joinedAtRound: participant.joinedAtRound ?? 1,
    };
  });
}
