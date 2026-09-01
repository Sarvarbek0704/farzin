import type { ReactNode } from 'react';

import { AuthProvider } from '@/lib/auth';

/**
 * `/oyin` shoxobchasi — kirish IXTIYORIY.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA AuthProvider ILDIZ layout'da EMAS
 *
 *  Provider mount bo'lganda `/auth/refresh` ga bir so'rov ketadi (sessiyani
 *  tiklash uchun). Uni ildizga qo'ysak — turnirlar, reyting, bosh sahifa
 *  kabi SOF OMMAVIY, SEO uchun muhim sahifalar ham har ochilishida
 *  keraksiz so'rov qilardi.
 *
 *  Shu sababli provider faqat kirish MA'NOGA EGA bo'lgan joyda:
 *   - `/oyin` — navbat va "mening o'yinlarim" tokensiz mumkin emas;
 *   - `/oyin/[id]` — tomoshabin tokensiz ko'radi, lekin O'YINCHI o'z
 *     o'yiniga aynan shu URL bilan kiradi va yurish qila olishi kerak.
 *
 *  Anonim ko'ruvchi uchun refresh 401 qaytaradi va sahifa tomoshabin
 *  ko'rinishida qoladi — xato emas, oddiy holat.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function OyinLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
