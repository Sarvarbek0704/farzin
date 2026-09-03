import type { FriendshipStatus } from './friendship.rules';

/** Do'stlik qatori — ID'lar bilan, ISM'siz (repository shu darajada to'xtaydi). */
export interface FriendLink {
  friendshipId: string;
  /** Juftlikdagi IKKINCHI o'yinchi. */
  otherPlayerId: string;
  status: FriendshipStatus;
  /** So'rovni MEN yuborganmi — kutilayotgan so'rovlarni ajratish uchun. */
  outgoing: boolean;
  createdAt: Date;
}

/** API javobi — o'yinchi ma'lumoti PLAYER_PORT'dan qo'shilgan holda. */
export interface FriendRow extends FriendLink {
  firstName: string;
  lastName: string;
  title: string | null;
}
