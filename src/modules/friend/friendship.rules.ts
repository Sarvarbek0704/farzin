/**
 * Do'stlik qoidalari — SOF mantiq (DB, framework yo'q).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA ALOHIDA FAYL
 *
 *  Bu yerdagi qarorlar "kim nimani qila oladi" degan savolga javob
 *  beradi va ular XAVFSIZLIK chegarasi: masalan, o'z so'rovini
 *  o'zi qabul qilish yoki begona odamning blokini ochish.
 *
 *  Servis qatlamida yozilsa, ular DB chaqiruvlari orasiga sochilib
 *  ketardi va testda har birini alohida tekshirish uchun butun
 *  modulni ko'tarish kerak bo'lardi. Sof funksiya — bir nechta
 *  qatorli test.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'BLOCKED';

/** Qarorga kerak bo'lgan minimal qator ko'rinishi. */
export interface FriendshipView {
  readonly requesterId: string;
  readonly addresseeId: string;
  readonly status: FriendshipStatus;
  readonly blockedById: string | null;
}

/** Ruxsat berilmagan amalning SABABI — controller uni 422 ga aylantiradi. */
export type Denial =
  | 'SELF_FRIENDSHIP'
  | 'ALREADY_FRIENDS'
  | 'REQUEST_PENDING'
  | 'INCOMING_REQUEST_PENDING'
  | 'BLOCKED'
  | 'NOT_ADDRESSEE'
  | 'NOT_PENDING'
  | 'NOT_MEMBER'
  | 'NOT_BLOCKED'
  | 'NOT_BLOCKER';

export type Decision = { ok: true } | { ok: false; reason: Denial };

const ALLOW: Decision = { ok: true };

function deny(reason: Denial): Decision {
  return { ok: false, reason };
}

/**
 * SO'ROV YUBORISH.
 *
 * `existing` — juftlik uchun mavjud qator (yo'nalishdan qat'i nazar),
 * yoki `null`.
 */
export function canRequest(
  actorPlayerId: string,
  targetPlayerId: string,
  existing: FriendshipView | null,
): Decision {
  if (actorPlayerId === targetPlayerId) {
    return deny('SELF_FRIENDSHIP');
  }
  if (existing === null) {
    return ALLOW;
  }
  if (existing.status === 'BLOCKED') {
    // Kim bloklaganini AYTMAYMIZ: bloklangan odam buni bilmasligi
    // kerak, aks holda blok o'zi signal bo'lib qoladi.
    return deny('BLOCKED');
  }
  if (existing.status === 'ACCEPTED') {
    return deny('ALREADY_FRIENDS');
  }
  // PENDING — kim so'ragani muhim: kelayotgan so'rovni QABUL qilish
  // kerak, yangi so'rov yuborish emas.
  return existing.requesterId === actorPlayerId
    ? deny('REQUEST_PENDING')
    : deny('INCOMING_REQUEST_PENDING');
}

/**
 * QABUL QILISH — faqat so'rov KELGAN tomon.
 *
 * O'z so'rovini o'zi qabul qilish eng ochiq suiiste'mol yo'li,
 * shuning uchun bu shart alohida test bilan qo'riqlanadi.
 */
export function canAccept(actorPlayerId: string, row: FriendshipView): Decision {
  if (row.status !== 'PENDING') {
    return deny('NOT_PENDING');
  }
  if (row.addresseeId !== actorPlayerId) {
    return deny('NOT_ADDRESSEE');
  }
  return ALLOW;
}

/**
 * RAD ETISH — kelgan so'rovni.
 *
 * So'rovchi ham o'z so'rovini bekor qila oladi: bu ham shu yo'l
 * (qator o'chiriladi), lekin faqat PENDING holatda.
 */
export function canDecline(actorPlayerId: string, row: FriendshipView): Decision {
  if (row.status !== 'PENDING') {
    return deny('NOT_PENDING');
  }
  return isMember(actorPlayerId, row) ? ALLOW : deny('NOT_MEMBER');
}

/** DO'STLIKNI BEKOR QILISH — ikkala tomon ham qila oladi. */
export function canRemove(actorPlayerId: string, row: FriendshipView): Decision {
  if (!isMember(actorPlayerId, row)) {
    return deny('NOT_MEMBER');
  }
  if (row.status === 'BLOCKED') {
    // Blokni "do'stlikdan chiqarish" bilan ochib bo'lmaydi — buning
    // uchun alohida amal bor va uni faqat BLOKLAGAN ocha oladi.
    return deny('BLOCKED');
  }
  return ALLOW;
}

/**
 * BLOKLASH — a'zo bo'lish shart emas: begona odamni ham bloklash
 * mumkin (qator yo'q bo'lsa yaratiladi).
 */
export function canBlock(actorPlayerId: string, targetPlayerId: string): Decision {
  return actorPlayerId === targetPlayerId ? deny('SELF_FRIENDSHIP') : ALLOW;
}

/**
 * BLOKNI OCHISH — faqat BLOKLAGAN odam.
 *
 * Aks holda bloklangan odam o'zi blokdan chiqib olardi va butun
 * himoya ma'nosini yo'qotardi.
 */
export function canUnblock(actorPlayerId: string, row: FriendshipView): Decision {
  if (row.status !== 'BLOCKED') {
    return deny('NOT_BLOCKED');
  }
  return row.blockedById === actorPlayerId ? ALLOW : deny('NOT_BLOCKER');
}

/** Juftlikdagi IKKINCHI o'yinchi. */
export function otherSide(actorPlayerId: string, row: FriendshipView): string {
  return row.requesterId === actorPlayerId ? row.addresseeId : row.requesterId;
}

function isMember(playerId: string, row: FriendshipView): boolean {
  return row.requesterId === playerId || row.addresseeId === playerId;
}
