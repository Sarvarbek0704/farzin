'use client';

import { usePathname, useRouter } from 'next/navigation';
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
import { io, type Socket } from 'socket.io-client';

import { useAuth } from '@/lib/auth';

/**
 * O'YIN BOSHLANDI — BUTUN ILOVA BO'YICHA.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA BU SOKET SAHIFADA EMAS, QOBIQDA
 *
 *  Ilgari `matchmaking:matched` tinglovchisi FAQAT `/oyin` sahifasida
 *  edi. Navbat uchun bu yetarli ko'rinardi — odam navbatga turgan
 *  sahifada turibdi-ku.
 *
 *  Do'stona chaqiriq buni buzdi: o'yinni BOSHQA odam ochadi va soat
 *  darhol ishlay boshlaydi. Chaqirilgan o'yinchi o'sha lahzada
 *  do'stlar ro'yxatida, reytingda yoki turnir sahifasida bo'lishi
 *  mumkin — va u hech narsa bilmasdi. Vaqti esa ketaverardi.
 *
 *  E2E testda aynan shu ko'rindi. Endi soket ilova qobig'ida yashaydi:
 *  qaysi sahifada bo'lmang, o'yin ochilganda taxtaga o'tasiz.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  BITTA soket: har sahifa o'ziniki ochsa, gateway bir foydalanuvchi
 *  uchun bir nechta ulanish ko'rardi va `user:{id}` xonasiga xabar
 *  takrorlanardi.
 */

interface PlaySocketState {
  /** Soket ulanganmi — navbat tugmalari shunga qarab ochiladi. */
  connected: boolean;
  /**
   * Har ULANISH (va QAYTA ulanish) da chaqiriladi.
   *
   * Push kafolat emas: uzilish lahzasida yuborilgan xabar yo'qoladi.
   * Shuning uchun sahifalar ulanish nuqtasida o'z holatini qayta
   * tekshirib olishi mumkin (`/oyin` — o'tkazib yuborilgan juftlikni).
   */
  subscribeConnected: (callback: () => void) => () => void;
}

const PlaySocketContext = createContext<PlaySocketState | null>(null);

export function PlaySocketProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [connected, setConnected] = useState(false);

  // Joriy yo'l REF orqali o'qiladi: uni effekt bog'liqligiga qo'ysak,
  // har navigatsiyada soket uzilib qayta ulanardi.
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  // Tinglovchilar ref'da: ular o'zgarganda soket QAYTA ULANMASLIGI
  // kerak — aks holda biz yopmoqchi bo'lgan bo'shliqni o'zimiz
  // ochib qo'yardik.
  const listeners = useRef<Set<() => void>>(new Set());

  const subscribeConnected = useCallback((callback: () => void): (() => void) => {
    listeners.current.add(callback);
    return () => {
      listeners.current.delete(callback);
    };
  }, []);

  useEffect(() => {
    if (accessToken === undefined || accessToken === null) {
      setConnected(false);
      return;
    }

    const base = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3000';
    const socket: Socket = io(`${base}/play`, {
      transports: ['websocket'],
      auth: { token: accessToken },
    });

    socket.on('connect', () => {
      setConnected(true);
      for (const callback of listeners.current) {
        callback();
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('matchmaking:matched', (payload: { gameId: string }) => {
      // ⚠️  BOSHQA O'YIN OYNAYOTGAN ODAMNI TORTIB OLMAYMIZ.
      //
      //     Do'stona chaqiriq bilan o'yinni BOSHQA odam ochadi. Agar
      //     chaqirilgan o'yinchi ayni paytda taxtada bo'lsa, uni
      //     yangi o'yinga ko'chirish jonli partiyani tashlab ketish
      //     degani — soati ishlab turgan holda. Yangi o'yin baribir
      //     yo'qolmaydi: u "Faol o'yinlarim" ro'yxatida turadi.
      if (isGameScreen(pathRef.current)) {
        return;
      }
      // Tasdiq SO'RALMAYDI: o'yin allaqachon mavjud va soat ishlayapti.
      // "O'ynaysizmi?" deb so'rash vaqt yo'qotish degani.
      router.push(`/oyin/${payload.gameId}`);
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken, router]);

  const value = useMemo<PlaySocketState>(
    () => ({ connected, subscribeConnected }),
    [connected, subscribeConnected],
  );

  return <PlaySocketContext.Provider value={value}>{children}</PlaySocketContext.Provider>;
}

/**
 * Yo'l O'YIN ekranimi?
 *
 * `/oyin` (navbat) va `/oyin/dostlar` — ro'yxat ekranlari, ular
 * o'yin EMAS. Faqat `/oyin/{id}` taxta ochib turadi.
 */
function isGameScreen(pathname: string): boolean {
  return /^\/oyin\/[0-9a-f-]{36}$/.test(pathname);
}

export function usePlaySocket(): PlaySocketState {
  const context = useContext(PlaySocketContext);
  if (context === null) {
    throw new Error('usePlaySocket faqat PlaySocketProvider ichida ishlaydi');
  }
  return context;
}
