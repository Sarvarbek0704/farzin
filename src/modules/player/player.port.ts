/**
 * Player modulining PUBLIC porti.
 *
 * Boshqa modullar (`tournament`, `rating`, ...) o'yinchi ma'lumotini
 * FAQAT shu interfeys orqali oladi — `players` jadvalini to'g'ridan-to'g'ri
 * O'QIMAYDI. docs/02-architecture.md §6.1
 */

export interface PlayerSummary {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  fideId: string | null;
}

export interface PlayerPort {
  findById(id: string): Promise<PlayerSummary | null>;
  findManyByIds(ids: readonly string[]): Promise<PlayerSummary[]>;
  /**
   * Aktorning (User) o'z o'yinchi profili — self-registration kabi
   * oqimlarda "kim ro'yxatdan o'tmoqda?" savoliga javob.
   * Profil yo'q yoki User'ga bog'lanmagan → null.
   */
  findSummaryByUserId(userId: string): Promise<(PlayerSummary & { userId: string }) | null>;
}

export const PLAYER_PORT = Symbol('PLAYER_PORT');
