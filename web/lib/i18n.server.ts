import { cookies } from 'next/headers';

import { LOCALE_COOKIE, normalizeLocale, translate, type Locale, type MessageKey } from './i18n';

/**
 * i18n ning SERVER qismi.
 *
 * Alohida fayl, chunki `next/headers` faqat server komponentida ishlaydi;
 * `i18n.ts` esa til almashtirgich (klient) tomonidan ham import qilinadi.
 */

/**
 * Joriy til.
 * Cookie yo'q bo'lsa — default (`uz-Latn`), brifning asosiy tili.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}

/** `t` — sahifada qulay chaqiruv uchun. */
export async function getTranslator(): Promise<(key: MessageKey) => string> {
  const locale = await getLocale();
  return (key: MessageKey) => translate(locale, key);
}
