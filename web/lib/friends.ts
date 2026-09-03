/**
 * Do'stlar API'si — TIPLAR va YO'LLAR.
 *
 * So'rovning o'zi bu yerda yuborilmaydi: har chaqiriq token talab
 * qiladi va token `AuthProvider` ichida (xotirada, `lib/auth.tsx` dagi
 * izohga qarang). Shuning uchun fetch komponentda, `authFetch` bilan
 * bajariladi — bu fayl esa shakl va manzillarni bir joyda saqlaydi.
 */

export type FriendStatus = 'PENDING' | 'ACCEPTED' | 'BLOCKED';

export interface FriendRow {
  friendshipId: string;
  otherPlayerId: string;
  firstName: string;
  lastName: string;
  title: string | null;
  status: FriendStatus;
  /** So'rovni MEN yuborganmi — kelgan va yuborilganni ajratadi. */
  outgoing: boolean;
  createdAt: string;
}

export const FRIENDS = {
  list: '/api/v1/friends',
  requests: '/api/v1/friends/requests',
  blocks: '/api/v1/friends/blocks',
  accept: (id: string): string => `/api/v1/friends/${id}/accept`,
  /** Rad etish ham, do'stlikdan chiqarish ham — bitta yo'l (backend farqni O'ZI biladi). */
  end: (id: string): string => `/api/v1/friends/${id}`,
  unblock: (id: string): string => `/api/v1/friends/blocks/${id}`,
} as const;

/** Ommaviy o'yinchi qidiruvi — do'st qo'shish uchun. */
export interface PlayerSearchRow {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
}

export function playerSearchPath(query: string): string {
  return `/api/v1/players?first=10&q=${encodeURIComponent(query)}`;
}

/**
 * Qidiruv uchun MINIMAL uzunlik — backend DTO bilan bir xil (2).
 *
 * Bu takrorlash ataylab: shart backendda MAJBURIY (u yagona
 * himoya), bu yerda esa foydalanuvchi bitta harf yozganda 400
 * xatosini ko'rmasligi uchun.
 */
export const MIN_SEARCH_LENGTH = 2;
