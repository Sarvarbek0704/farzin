'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Autentifikatsiya holati — hakam konsoli uchun.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ACCESS TOKEN FAQAT XOTIRADA (localStorage EMAS)
 *
 *  docs/10-security.md §2.4: refresh token httpOnly cookie'da, ya'ni
 *  JavaScript uni O'QIY OLMAYDI. Access token'ni localStorage'ga qo'yish
 *  shu himoyani BEKOR QILARDI: XSS bo'lsa hujumchi tokenni o'qib oladi.
 *  Xotirada saqlash — sahifa yangilanganda token yo'qoladi, lekin
 *  `/auth/refresh` uni cookie orqali qaytaradi (mount'dagi `bootstrap`).
 *
 *  Bu ataylab qilingan savdo: bir marta qo'shimcha so'rov ↔ XSS'da
 *  o'g'irlanmaydigan token.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  So'rovlar `/api/...` ga boradi — next.config.ts rewrite'i orqali
 *  BIR XIL origin'da qoladi, ya'ni refresh cookie (SameSite=Strict,
 *  Path=/api/v1/auth) muammosiz yuboriladi.
 */

interface AuthState {
  /** `null` — kirilmagan. `undefined` — hali aniqlanmadi (yuklanmoqda). */
  accessToken: string | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Avtorizatsiyalangan so'rov — 401 da bir marta refresh qilib qayta uradi. */
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthState | null>(null);

export class AuthError extends Error {}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null | undefined>(undefined);

  // Ref — `authFetch` identifikatori o'zgarmasin (useEffect qayta
  // ishlamasin), lekin eng yangi tokenni ko'rsin.
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = accessToken ?? null;

  /** Refresh cookie orqali yangi access token olish. */
  const refresh = useCallback(async (): Promise<string | null> => {
    // ⚠️  `keepalive` MAJBURIY. Refresh har chaqiriqda cookie'ni
    //     AYLANTIRADI (rotation) va reuse-detection'da grace davri yo'q
    //     (docs/10 §2.4 — ataylab). Foydalanuvchi refresh ketayotganda
    //     boshqa sahifaga o'tsa, oddiy fetch BEKOR bo'ladi: server
    //     allaqachon aylantirgan, yangi cookie esa yo'qoladi — keyingi
    //     refresh eski token bilan borib, BUTUN sessiya oilasi bekor
    //     qilinadi (jonli sinovda "tez navigatsiya = chiqib qolish"
    //     bo'lib ko'ringan xato). `keepalive` bilan so'rov sahifa
    //     almashganda ham yakunlanadi va Set-Cookie qo'llanadi.
    const res = await fetch('/api/v1/auth/refresh', { method: 'POST', keepalive: true });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { accessToken: string };
    tokenRef.current = body.accessToken;
    setAccessToken(body.accessToken);
    return body.accessToken;
  }, []);

  // Ilova ochilganda: cookie bor bo'lsa sessiyani tiklaymiz.
  useEffect(() => {
    void refresh().then((token) => {
      if (token === null) {
        setAccessToken(null);
      }
    });
  }, [refresh]);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      // Cookie o'rnatuvchi so'rov — navigatsiya uni yo'qotmasin
      // (refresh'dagi izohga qarang).
      keepalive: true,
    });

    if (!res.ok) {
      const problem = (await res.json().catch(() => ({}))) as { title?: string };
      // Backend ataylab "email yoki parol noto'g'ri" deydi — qaysi biri
      // ekanini aytmaydi (user enumeration himoyasi). Xabarni
      // O'ZGARTIRMAYMIZ.
      throw new AuthError(problem.title ?? "Kirishning iloji bo'lmadi");
    }

    const body = (await res.json()) as { accessToken: string };
    tokenRef.current = body.accessToken;
    setAccessToken(body.accessToken);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await fetch('/api/v1/auth/logout', { method: 'POST', keepalive: true }).catch(() => undefined);
    tokenRef.current = null;
    setAccessToken(null);
  }, []);

  const authFetch = useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      const call = (token: string | null): Promise<Response> => {
        // `Headers` ishlatiladi, obyekt spread'i EMAS: `init.headers`
        // massiv yoki `Headers` bo'lishi mumkin va spread ularni
        // indekslar ro'yxatiga aylantirardi.
        const headers = new Headers(init?.headers);
        if (token !== null) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return fetch(path, { ...init, headers });
      };

      let res = await call(tokenRef.current);

      // Access token 15 daqiqa yashaydi — muddati o'tishi ODATIY hol,
      // xato emas. Bir marta yangilab qayta uramiz.
      if (res.status === 401) {
        const token = await refresh();
        if (token === null) {
          setAccessToken(null);
          throw new AuthError('Sessiya tugadi — qaytadan kiring');
        }
        res = await call(token);
      }

      return res;
    },
    [refresh],
  );

  const value = useMemo<AuthState>(
    () => ({ accessToken, login, logout, authFetch }),
    [accessToken, login, logout, authFetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth faqat AuthProvider ichida ishlaydi');
  }
  return context;
}

/**
 * Javobni JSON qilib o'qish; xato bo'lsa RFC 9457 dan tushunarli
 * xabar chiqarish.
 */
export async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as {
      title?: string;
      code?: string;
    };
    throw new Error(problem.title ?? `So'rov muvaffaqiyatsiz (${String(res.status)})`);
  }
  return (await res.json()) as T;
}
