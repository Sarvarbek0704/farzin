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
  /**
   * Profil bog'langan hisob — bog'lanmagan bo'lsa `null`.
   *
   * Kerak bo'ladi, chunki WebSocket xonalari FOYDALANUVCHI bo'yicha
   * nomlanadi (`user:{userId}`), o'yin esa O'YINCHI bo'yicha. Xabar
   * yuborish uchun bu ko'prik shart — masalan do'stona chaqiriqda
   * raqibga "sizga o'yin ochildi" deb aytish.
   *
   * Turnir arxivida o'yinchi bor, lekin hisobi yo'q bo'lishi mumkin —
   * shuning uchun `null` bo'lishi ODATIY hol, xato emas.
   */
  userId: string | null;
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
