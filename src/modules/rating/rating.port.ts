import type { PlayEnvironment, TimeCategory } from './rating.types';

/**
 * Rating modulining PUBLIC porti.
 *
 * Boshqa modullar (`tournament`, ...) reyting ma'lumotini FAQAT shu
 * interfeys orqali oladi — `player_ratings` jadvalini to'g'ridan-to'g'ri
 * O'QIMAYDI. docs/02-architecture.md §6.1
 */

export interface CurrentRating {
  /** Joriy Glicko-2 reytingi (display shkala, kasrli). */
  rating: number;
  /**
   * Provisional — hali rasmiy emas (docs/06 §4.2). Turnir seedingida
   * ishlatiladi, lekin bayroq bilan — hakam ko'radi.
   */
  isProvisional: boolean;
}

export interface RatingPort {
  /**
   * O'yinchining shu kategoriya (environment, timeCategory) dagi joriy
   * reytingi. Hech qachon o'ynamagan → null (chaqiruvchi null'ni saqlaydi,
   * 1500 deb TAXMIN QILMAYDI — snapshot halolligi).
   */
  getCurrentRating(
    playerId: string,
    environment: PlayEnvironment,
    timeCategory: TimeCategory,
  ): Promise<CurrentRating | null>;
}

export const RATING_PORT = Symbol('RATING_PORT');
