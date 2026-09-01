import { onlineTimeCategory } from '../../core/clock/time-category';
import { BusinessRuleError } from '../../core/errors/domain.error';

import type { TimeCategoryValue } from './play.types';

/**
 * Klient bergan `timeCategory` vaqt nazoratiga MOS kelishini tekshiradi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA KERAK (docs/AUDIT.md K-19)
 *
 *  DTO `timeCategory` ni faqat ro'yxatdan tekshiradi. Lekin bu qiymat
 *  keyin REYTING HOVUZINI tanlaydi:
 *      getCurrentRating(playerId, 'ONLINE', timeCategory)
 *  va docs/06 §5 har kategoriyaga MUSTAQIL reyting saqlaydi.
 *
 *  Tekshiruvsiz 30 daqiqalik o'yinni "BULLET" deb yuborish mumkin edi —
 *  ya'ni bullet reytingini uzun o'yinlarda o'ynab olish. Bu
 *  kategoriyalarni ajratishning ma'nosini yo'q qilardi.
 *
 *  Qiymat JIMGINA to'g'rilanmaydi, RAD ETILADI: klient so'ragan hovuz
 *  bilan o'yin tushgan hovuz boshqa bo'lib qolsa, buni hech kim
 *  sezmasdi. Xato xabari kutilgan qiymatni aytadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function assertTimeCategoryMatches(input: {
  timeCategory: TimeCategoryValue;
  baseTimeSeconds: number;
  incrementSeconds: number;
}): void {
  const expected = onlineTimeCategory(input.baseTimeSeconds, input.incrementSeconds);
  if (input.timeCategory === expected) {
    return;
  }
  throw new BusinessRuleError(
    'TIME_CATEGORY_MISMATCH',
    `Bu vaqt nazorati uchun kategoriya ${expected} bo'lishi kerak, ${input.timeCategory} emas`,
  );
}
