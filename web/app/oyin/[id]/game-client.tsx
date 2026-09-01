'use client';

import type { GameState } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { LiveGame } from './live-game';

/**
 * Server komponenti bilan `LiveGame` orasidagi ko'prik.
 *
 * Server komponenti tokenni O'QIY OLMAYDI: access token faqat xotirada,
 * refresh esa httpOnly cookie'da va u `Path=/api/v1/auth` bilan
 * cheklangan (docs/10 §2.4). Ya'ni sessiyani faqat brauzerdagi
 * `AuthProvider` biladi — shu sababli token shu yupqa klient qatlamidan
 * o'tkaziladi.
 *
 * `accessToken` uch holatli: `undefined` (hali aniqlanmagan), `null`
 * (kirilmagan), satr (kirgan). Uchalasi ham `LiveGame` ga o'zgarishsiz
 * beriladi — u har biriga boshqacha munosabatda bo'ladi.
 */
export function GameClient({ initial }: { initial: GameState }) {
  const { accessToken } = useAuth();
  return <LiveGame initial={initial} token={accessToken} />;
}
