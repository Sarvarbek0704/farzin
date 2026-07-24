import {
  Color,
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
 *  - hasReceivedBye — o'tmishda BYE_FULL olganmi (bir o'yinchi odatda
 *                    bir marta oladi);
 *  - floatHistory  — round-robin'da float tushunchasi yo'q → bo'sh.
 */
export function buildPairingStates(
  participants: readonly ParticipantSeed[],
  history: readonly PairingHistoryEntry[],
): PlayerPairingState[] {
  const sorted = [...history].sort((a, b) => a.roundNumber - b.roundNumber);

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
        // Bye — raqib yo'q. hasReceivedBye faqat to'liq ochkoli bye'da
        // (PAB semantikasi — pairing.types.ts ByeType.PairingAllocated).
        if (entry.result === 'BYE_FULL') {
          hasReceivedBye = true;
        }
      } else {
        const opponentId =
          side === 'WHITE' ? entry.blackRegistrationId : entry.whiteRegistrationId;
        opponentIds.add(opponentId as PlayerId);
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
      // Reytingsiz o'yinchi — 0. RR engine reytingni ishlatmaydi
      // (jadval faqat pairingNumber'ga tayanadi), qiymat faqat tip uchun.
      rating: participant.ratingAtEntry ?? 0,
      points,
      opponentIds,
      colorHistory,
      floatHistory: [],
      hasReceivedBye,
      isWithdrawn: participant.isWithdrawn,
      joinedAtRound: participant.joinedAtRound ?? 1,
    };
  });
}
