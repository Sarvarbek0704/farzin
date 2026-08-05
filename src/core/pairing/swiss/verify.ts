/**
 * Majburiy post-verifikatsiya (TZ Faza 2): dvigatel O'ZI chiqargan natijani
 * absolyut kriteriylar bo'yicha qayta tekshiradi. Bu tekshiruv yiqilishi
 * HECH QACHON kuzatilmasligi kerak — yiqilsa, bu dvigateldagi bug va
 * natija hakamga chiqarilmaydi (jimgina noto'g'ri juftlashtirishdan ko'ra
 * portlagan xato afzal).
 *
 * Tekshiriladigan absolyut talablar (FIDE C.04.3 2026-02, Article 2.1):
 *  [C1]  hech bir juftlik takrorlanmaydi;
 *  [C2]  PAB — faqat haqli o'yinchiga, ko'pi bilan bittaga;
 *  [C3]  oqibat-tekshiruv rang chegaralari orqali: berilgan rang biror
 *        NON-topscorer'ni |CD| > 2 ga yoki uch marta ketma-ket bir xil
 *        rangga olib kelmasligi kerak (istisno — topscorer yoki topscorer
 *        raqibi, Article 2.4.5–2.4.6 aynan shu holatlarni sifat darajasiga
 *        tushiradi);
 *  qamrov — har bir aktiv o'yinchi aynan bir marta (juftlik yoki PAB).
 */

import { Color, type PlayerId, type RoundId } from '../pairing.types';
import { colorOutcomeFlags, type SwissPlayer } from './swiss-types';

/**
 * Ichki izchillik buzilishi — bu KUTILMAGAN holat (PairingImpossibleError
 * dan farqli). 500 sifatida ko'tariladi va darhol bug sifatida tekshirilishi
 * shart.
 */
export class PairingIntegrityError extends Error {
  readonly code = 'PAIRING_INTEGRITY';

  constructor(
    readonly roundId: RoundId,
    readonly reason: string,
  ) {
    super(`Round ${roundId} juftlashtirish butunligi buzildi: ${reason}`);
    this.name = 'PairingIntegrityError';
    Object.setPrototypeOf(this, PairingIntegrityError.prototype);
  }
}

/** Rang berilgan yakuniy juftlik. */
export interface ColoredPair {
  readonly white: SwissPlayer;
  readonly black: SwissPlayer;
}

export function verifyAbsoluteCriteria(
  roundId: RoundId,
  activePlayers: readonly SwissPlayer[],
  pairs: readonly ColoredPair[],
  pab: SwissPlayer | null,
): void {
  // Qamrov: har bir aktiv o'yinchi aynan bir marta.
  const seen = new Set<PlayerId>();
  const take = (p: SwissPlayer, where: string): void => {
    if (seen.has(p.state.playerId)) {
      throw new PairingIntegrityError(
        roundId,
        `o'yinchi ${p.state.playerId} ikki marta ishtirok etdi (${where})`,
      );
    }
    seen.add(p.state.playerId);
  };

  for (const pair of pairs) {
    take(pair.white, 'juftlik');
    take(pair.black, 'juftlik');

    // [C1]
    if (
      pair.white.state.opponentIds.has(pair.black.state.playerId) ||
      pair.black.state.opponentIds.has(pair.white.state.playerId)
    ) {
      throw new PairingIntegrityError(
        roundId,
        `C1 buzildi: ${pair.white.state.playerId} va ${pair.black.state.playerId} avval o'ynagan`,
      );
    }

    // [C3] oqibati — rang chegaralari (non-topscorer juftliklarda mutlaq).
    const anyTopscorer = pair.white.isTopscorer || pair.black.isTopscorer;
    if (!anyTopscorer) {
      for (const [p, got] of [
        [pair.white, Color.White],
        [pair.black, Color.Black],
      ] as const) {
        const flags = colorOutcomeFlags(p, got);
        if (flags.exceedsColorDiff) {
          throw new PairingIntegrityError(
            roundId,
            `rang chegarasi buzildi: ${p.state.playerId} uchun |CD| > 2 (topscorer emas)`,
          );
        }
        if (flags.threeInARow) {
          throw new PairingIntegrityError(
            roundId,
            `rang chegarasi buzildi: ${p.state.playerId} uch marta ketma-ket bir xil rang (topscorer emas)`,
          );
        }
      }
    }
  }

  if (pab !== null) {
    take(pab, 'PAB');
    // [C2]
    if (!pab.pabEligible) {
      throw new PairingIntegrityError(
        roundId,
        `C2 buzildi: ${pab.state.playerId} allaqachon bye/o'ynamasdan g'alaba olgan, PAB mumkin emas`,
      );
    }
  }

  if (seen.size !== activePlayers.length) {
    throw new PairingIntegrityError(
      roundId,
      `qamrov buzildi: ${String(activePlayers.length)} aktiv o'yinchidan ${String(seen.size)} tasi qamrab olindi`,
    );
  }
  for (const p of activePlayers) {
    if (!seen.has(p.state.playerId)) {
      throw new PairingIntegrityError(
        roundId,
        `qamrov buzildi: ${p.state.playerId} juftliksiz va bye'siz qoldi`,
      );
    }
  }
}
