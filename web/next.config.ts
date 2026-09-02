import type { NextConfig } from 'next';

/**
 * Farzin — ommaviy frontend.
 *
 * Bu ilova backend repo ICHIDA, lekin ALOHIDA paket sifatida yashaydi
 * (o'z package.json, o'z lockfile, o'z node_modules). Sabab: root
 * `Dockerfile` `pnpm install --frozen-lockfile` bilan quriladi va
 * pnpm workspace qo'shilsa lockfile mos kelmay build YIQILARDI —
 * ya'ni docs/AUDIT.md KRITIK-1 tuzatilishi buzilardi. `.dockerignore`
 * ga `web/` qo'shilgan: backend image'iga frontend TUSHMAYDI.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Konteynerda ishlatish uchun minimal chiqish (docs/11 §2).
  output: 'standalone',

  /*
   * Ildizni ANIQ ko'rsatamiz.
   *
   * Ikkita lockfile bor (root backend + shu paket) va Next ildizni
   * o'zi taxmin qilib, root'ni tanlab olardi. Oqibati ikkita:
   *  - har build'da ogohlantirish;
   *  - `standalone` chiqishi `.next/standalone/web/server.js` ga
   *    joylashardi, ya'ni ishga tushirish yo'li repo tuzilishiga
   *    bog'liq bo'lib qolardi.
   * Endi ildiz — shu paketning o'zi va server `.next/standalone/server.js`.
   */
  outputFileTracingRoot: import.meta.dirname,

  // Backend `/api/v1/*` ni shu origin ostida ochamiz — brauzerda CORS
  // muammosi umuman tug'ilmaydi va cookie (refresh) bir xil saytda
  // qoladi. Server tomondagi fetch to'g'ridan-to'g'ri API'ga boradi
  // (lib/api.ts), bu rewrite faqat KLIENT so'rovlari uchun.
  async rewrites() {
    const target = process.env.FARZIN_API_URL ?? 'http://localhost:3000';
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;
