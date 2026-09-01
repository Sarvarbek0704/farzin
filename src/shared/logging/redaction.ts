/**
 * Log redaksiyasi — SIRLAR HECH QACHON LOG'GA TUSHMAYDI.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA ALOHIDA FAYL
 *
 *  Bu ro'yxat ilgari `app.module.ts` ichida inline turardi va HECH QANDAY
 *  TEST bilan qoplanmagan edi (docs/AUDIT.md — Faza 0 DoD "Log'da
 *  parol/token yo'qligi test bilan tasdiqlangan" va Faza 4 DoD "Log'da
 *  karta ma'lumoti yo'qligi test bilan tasdiqlangan" bandlari).
 *
 *  Konfiguratsiyani modulga chiqarish uni HAQIQIY pino instansiyasi bilan
 *  tekshirish imkonini beradi (redaction.spec.ts): xotiradagi oqimga
 *  yozib, chiqishda sir bor-yo'qligini ko'rish. Bu "config to'g'ri
 *  ko'rinadi" degan taxmindan farqli o'laroq — ISBOT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @see docs/10-security.md §8
 * @see docs/15-observability.md §2.4
 */

export const REDACTION_CENSOR = '[REDACTED]';

/**
 * Redaksiya qilinadigan yo'llar.
 *
 * ⚠️  pino `redact.paths` ANIQ yo'llarni talab qiladi — u obyektni
 *     rekursiv kezib "parol"ga o'xshash kalitlarni O'ZI topmaydi.
 *     Ya'ni yangi sir maydoni qo'shilsa, u SHU YERGA ham qo'shilishi
 *     shart, aks holda jimgina log'ga tushadi.
 */
export const REDACTED_PATHS: readonly string[] = [
  // --- Autentifikatsiya (docs/10-security.md §8) ---------------------------
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.passwordHash',
  'req.body.totpSecret',
  'req.body.totpCode',
  'req.body.refreshToken',
  'req.body.token',
  'res.headers["set-cookie"]',

  // --- To'lov (docs/15-observability.md §2.4, Faza 4 DoD) ------------------
  //
  //  Karta ma'lumoti Farzin serverida SAQLANMAYDI (provayder
  //  tokenizatsiyasi — docs/09 §12). Lekin webhook body'si pino
  //  autoLogging bilan loglanadi va provayder u yerga nima qo'yishini
  //  biz nazorat qilmaymiz. Shuning uchun himoya CHUQURLIKDA: nomlar
  //  provayderlarda eng ko'p uchraydigan variantlar bo'yicha.
  'req.body.cardNumber',
  'req.body.card_number',
  'req.body.pan',
  'req.body.cvv',
  'req.body.cvc',
  'req.body.expiry',
  'req.body.card',
];

/**
 * nestjs-pino / pino `redact` konfiguratsiyasi.
 *
 * `paths` — o'zgaruvchan (mutable) massiv: pino tipi shuni talab qiladi.
 * Har chaqiruvda YANGI nusxa qaytadi, ya'ni chaqiruvchi uni o'zgartirsa
 * ham `REDACTED_PATHS` manbasi buzilmaydi.
 */
export function redactionConfig(): { paths: string[]; censor: string } {
  return { paths: [...REDACTED_PATHS], censor: REDACTION_CENSOR };
}
