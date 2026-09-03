import { Inject, Injectable } from '@nestjs/common';

import { BusinessRuleError, NotFoundError } from '../../core/errors/domain.error';
import { PLAYER_PORT, type PlayerPort } from '../player/player.port';
import { FriendRepository, isUniqueViolation } from './friend.repository';
import type { FriendLink, FriendRow } from './friend.types';
import {
  canAccept,
  canBlock,
  canDecline,
  canRemove,
  canRequest,
  canUnblock,
  type Decision,
  type Denial,
  type FriendshipView,
} from './friendship.rules';

/**
 * Do'stlik — so'rov, qabul, rad, bekor qilish, bloklash.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  QAROR VA BAJARISH AJRATILGAN
 *
 *  "Kim nimani qila oladi" — `friendship.rules.ts` da, sof funksiyalarda.
 *  Bu yerda faqat: aktyorni o'yinchiga aylantirish, qatorni topish,
 *  qoidadan so'rash va yozish. Shu tufayli xavfsizlik shartlari
 *  DB'siz testlanadi va servis o'qishga qulay qoladi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  MAVJUDLIKNI OSHKOR QILMASLIK: bloklangan odamga "sizni bloklashdi"
 *  deyilmaydi — u faqat umumiy rad javobini oladi (rules.ts izohi).
 */
@Injectable()
export class FriendService {
  constructor(
    private readonly repo: FriendRepository,
    @Inject(PLAYER_PORT) private readonly players: PlayerPort,
  ) {}

  /** Aktyorning o'yinchi profili — do'stlik o'yinchilar orasida. */
  private async me(actorUserId: string): Promise<string> {
    const player = await this.players.findSummaryByUserId(actorUserId);
    if (player === null) {
      throw new BusinessRuleError(
        'PLAYER_PROFILE_REQUIRED',
        "Do'stlik uchun o'yinchi profili kerak",
      );
    }
    return player.id;
  }

  async listFriends(actorUserId: string): Promise<FriendRow[]> {
    return await this.withNames(await this.repo.listFor(await this.me(actorUserId), 'ACCEPTED'));
  }

  /** Kutilayotgan so'rovlar — kelgan ham, yuborilgan ham (`outgoing` bilan). */
  async listPending(actorUserId: string): Promise<FriendRow[]> {
    return await this.withNames(await this.repo.listFor(await this.me(actorUserId), 'PENDING'));
  }

  async request(actorUserId: string, targetPlayerId: string): Promise<{ id: string }> {
    const meId = await this.me(actorUserId);

    // Maqsad mavjudligini tekshiramiz: aks holda "so'rov yuborildi"
    // deb yolgon aytgan bolardik.
    if ((await this.players.findById(targetPlayerId)) === null) {
      throw new NotFoundError('Player', targetPlayerId);
    }

    const existing = await this.repo.findPair(meId, targetPlayerId);
    assertAllowed(canRequest(meId, targetPlayerId, existing));

    try {
      const row = await this.repo.createRequest(meId, targetPlayerId, actorUserId);
      return { id: row.id };
    } catch (e) {
      // POYGA: ikki odam bir vaqtda bir-biriga so'rov yuborsa, DB'dagi
      // juftlik indeksi ikkinchisini rad etadi. Bu XATO emas — ikkinchi
      // odam uchun bu "kelayotgan so'rov bor" degani.
      if (isUniqueViolation(e)) {
        throw new BusinessRuleError(
          'INCOMING_REQUEST_PENDING',
          "Bu o'yinchidan sizga so'rov kelgan — uni qabul qiling",
        );
      }
      throw e;
    }
  }

  async accept(actorUserId: string, friendshipId: string): Promise<void> {
    const { meId, row } = await this.load(actorUserId, friendshipId);
    assertAllowed(canAccept(meId, row));
    await this.repo.accept(friendshipId, actorUserId);
  }

  /**
   * Aloqani TUGATISH — bitta endpoint, ikki ma'no.
   *
   * Kutilayotgan so'rov uchun bu "rad etish" (yoki o'z so'rovini
   * qaytarib olish), qabul qilingani uchun "do'stlikdan chiqarish".
   * Ikkalasi ham qatorni o'chiradi, shuning uchun ALOHIDA endpoint
   * qilinmadi: frontend qaysi ro'yxatdan bosganini bilsa ham, holat
   * shu orada o'zgargan bo'lishi mumkin va foydalanuvchi "noto'g'ri
   * tugma" xatosini olardi.
   *
   * AUDIT'da esa farq SAQLANADI — rad etish va do'stlikdan chiqarish
   * boshqa-boshqa hodisalar.
   */
  async end(actorUserId: string, friendshipId: string): Promise<void> {
    const { meId, row } = await this.load(actorUserId, friendshipId);
    if (row.status === 'PENDING') {
      assertAllowed(canDecline(meId, row));
      await this.repo.remove(friendshipId, actorUserId, 'friend.decline');
      return;
    }
    assertAllowed(canRemove(meId, row));
    await this.repo.remove(friendshipId, actorUserId, 'friend.remove');
  }

  /** MEN bloklaganlar — bloklangan odam bu ro'yxatni ko'rmaydi. */
  async listBlocked(actorUserId: string): Promise<FriendRow[]> {
    return await this.withNames(await this.repo.listBlockedBy(await this.me(actorUserId)));
  }

  /**
   * ID'larga ism qo'shish — BITTA so'rov bilan (N+1 emas).
   *
   * O'yinchi topilmasa qator TASHLAB YUBORILADI: bu profil o'chirilgan
   * (yoki yopilgan) holat va ro'yxatda "noma'lum" qator ko'rsatishdan
   * ko'ra uni ko'rsatmaslik to'g'riroq.
   */
  private async withNames(links: FriendLink[]): Promise<FriendRow[]> {
    if (links.length === 0) {
      return [];
    }
    const players = await this.players.findManyByIds(links.map((l) => l.otherPlayerId));
    const byId = new Map(players.map((p) => [p.id, p]));

    return links.flatMap((link) => {
      const player = byId.get(link.otherPlayerId);
      return player === undefined
        ? []
        : [
            {
              ...link,
              firstName: player.firstName,
              lastName: player.lastName,
              title: player.title,
            },
          ];
    });
  }

  async block(actorUserId: string, targetPlayerId: string): Promise<{ id: string }> {
    const meId = await this.me(actorUserId);
    assertAllowed(canBlock(meId, targetPlayerId));
    if ((await this.players.findById(targetPlayerId)) === null) {
      throw new NotFoundError('Player', targetPlayerId);
    }
    const row = await this.repo.block(meId, targetPlayerId, actorUserId);
    return { id: row.id };
  }

  async unblock(actorUserId: string, friendshipId: string): Promise<void> {
    const { meId, row } = await this.load(actorUserId, friendshipId);
    assertAllowed(canUnblock(meId, row));
    await this.repo.unblock(friendshipId, actorUserId);
  }

  /**
   * Qatorni topish + aktyorni aniqlash.
   *
   * A'ZO BO'LMAGAN odamga 404: qator borligini ham oshkor qilmaymiz
   * (docs/04-api-spec.md §2.4 — RBAC ham shunday ishlaydi).
   */
  private async load(
    actorUserId: string,
    friendshipId: string,
  ): Promise<{ meId: string; row: FriendshipView }> {
    const meId = await this.me(actorUserId);
    const row = await this.repo.findById(friendshipId);
    if (row === null) {
      throw new NotFoundError('Friendship', friendshipId);
    }
    if (row.requesterId !== meId && row.addresseeId !== meId) {
      throw new NotFoundError('Friendship', friendshipId);
    }
    return { meId, row };
  }
}

/** Qoida rad etsa — 422 (RFC 9457 `code` bilan). */
function assertAllowed(decision: Decision): void {
  if (decision.ok) {
    return;
  }
  throw new BusinessRuleError(decision.reason, MESSAGES[decision.reason]);
}

/** Foydalanuvchiga ko'rinadigan xabarlar — kod bilan bir joyda. */
const MESSAGES: Record<Denial, string> = {
  SELF_FRIENDSHIP: "O'zingizni do'st qilib qo'sha olmaysiz",
  ALREADY_FRIENDS: "Siz allaqachon do'stsiz",
  REQUEST_PENDING: "So'rov allaqachon yuborilgan — javob kutilmoqda",
  INCOMING_REQUEST_PENDING: "Bu o'yinchidan sizga so'rov kelgan — uni qabul qiling",
  BLOCKED: "So'rov yuborib bo'lmadi",
  NOT_ADDRESSEE: "Bu so'rovni faqat u yuborilgan o'yinchi qabul qila oladi",
  NOT_PENDING: "So'rov holati o'zgargan — sahifani yangilang",
  NOT_MEMBER: 'Bu amal sizga tegishli emas',
  NOT_BLOCKED: 'Bu juftlik bloklanmagan',
  NOT_BLOCKER: 'Blokni faqat uni qo`ygan o`yinchi ochadi',
};
