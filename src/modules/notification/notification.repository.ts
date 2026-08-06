import { Injectable } from '@nestjs/common';
import type { Notification, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/prisma/prisma.service';
import type {
  NotificationChannelValue,
  NotificationRow,
  RecipientUser,
} from './notification.types';

/**
 * Notification ma'lumot qatlami — Prisma FAQAT shu faylda
 * (.dependency-cruiser.js `prisma-only-in-infrastructure`).
 *
 * MODUL CHEGARASI: registrations/players/invoices/users/user_roles/
 * tournament_sections o'qishlari — qabul qiluvchini aniqlash uchun
 * KULRANG ZONA (arbiter/rating.repository.ts Faza 1 pretsedenti):
 * boshqa modul jadvalini o'qish FAQAT shu repository ichida, service/port
 * qatlamiga chiqmaydi. YOZUV faqat `notifications` jadvaliga.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  IDEMPOTENTLIK (ADR-0008 "ishlangan event'lar jurnali" texnikasi).
 *
 *  Outbox at-least-once — xuddi shu event ikki marta kelishi MUMKIN.
 *  Schema'da (eventId, userId, templateKey) uchun unique YO'Q va yangi
 *  jadval/migratsiya ATAYLAB qo'shilmadi: `payload` JSON'ida MAJBURIY
 *  `eventId` maydoni saqlanadi va insert'dan oldin BIR tranzaksiyada
 *  `WHERE userId IN (...) AND templateKey AND payload->>'eventId'`
 *  mavjudlik tekshiruvi qilinadi (`createBatchIdempotent`).
 *
 *  Nega bu yetarli: publisher advisory lock bilan YAGONA (outbox.publisher
 *  ADVISORY_LOCK_KEY) — bir eventId hech qachon PARALLEL ishlanmaydi,
 *  faqat KETMA-KET qayta yetkaziladi; ketma-ket holatda check-then-insert
 *  poygasiz ishlaydi. Qoldiq risk (kelajakda parallel publisher) hujjatda:
 *  unda schema'ga funksional unique index kerak bo'ladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

function toRow(n: Notification): NotificationRow {
  return {
    id: n.id,
    userId: n.userId,
    channel: n.channel,
    templateKey: n.templateKey,
    // payload'ni har doim obyekt sifatida yozamiz — bu defensiv keltirish.
    payload:
      typeof n.payload === 'object' && n.payload !== null && !Array.isArray(n.payload)
        ? (n.payload)
        : {},
    sentAt: n.sentAt,
    readAt: n.readAt,
    failedAt: n.failedAt,
    failureReason: n.failureReason,
    createdAt: n.createdAt,
  };
}

export interface CreateBatchInput {
  /** Outbox event id (yoki sintetik `game-finished:<id>`) — dedupe kaliti. */
  eventId: string;
  templateKey: string;
  /** Shablon o'zgaruvchilari — `eventId` repository tomonidan qo'shiladi. */
  payload: Record<string, unknown>;
  /** userId+kanal juftliklari (bir user bir nechta kanal olishi mumkin). */
  rows: readonly { userId: string; channel: NotificationChannelValue }[];
}

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- Yozish (idempotent) -----------------------------------------------------

  /**
   * Bir event uchun qabul qiluvchilar to'plamini BIR tranzaksiyada,
   * idempotent yaratish (fayl sarlavhasidagi mexanizm).
   *
   * Dedupe kaliti — (eventId, userId, templateKey): shu event shu user
   * uchun OLDIN ishlangan bo'lsa, uning BARCHA kanal qatorlari o'tkazib
   * yuboriladi (kanallar birinchi yetkazishda birga insert qilingan).
   * Qaytarilgan massiv — faqat YANGI yaratilgan qatorlar (dispatch uchun).
   */
  async createBatchIdempotent(input: CreateBatchInput): Promise<NotificationRow[]> {
    if (input.rows.length === 0) {
      return [];
    }
    const payload: Prisma.InputJsonObject = {
      ...(input.payload as Prisma.InputJsonObject),
      eventId: input.eventId,
    };
    const userIds = [...new Set(input.rows.map((r) => r.userId))];

    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.notification.findMany({
        where: {
          userId: { in: userIds },
          templateKey: input.templateKey,
          payload: { path: ['eventId'], equals: input.eventId },
        },
        select: { userId: true },
      });
      const alreadyNotified = new Set(existing.map((e) => e.userId));
      const fresh = input.rows.filter((r) => !alreadyNotified.has(r.userId));
      if (fresh.length === 0) {
        return [];
      }
      const created = await tx.notification.createManyAndReturn({
        data: fresh.map((r) => ({
          userId: r.userId,
          channel: r.channel,
          templateKey: input.templateKey,
          payload,
        })),
      });
      return created.map(toRow);
    });
  }

  async markSent(id: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { sentAt: new Date(), failedAt: null, failureReason: null },
    });
  }

  async markFailed(id: string, reason: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      // failureReason ustuni matn — 500 belgi yetarli, cheksiz stack emas.
      data: { failedAt: new Date(), failureReason: reason.slice(0, 500) },
    });
  }

  // --- O'qish (foydalanuvchi API'si) --------------------------------------------
  //
  // FEED = FAQAT IN_APP qatorlari (hujjatlangan qaror): EMAIL/SMS qatorlari
  // yetkazish JURNALI — ularni feed'da ko'rsatish bir voqeani ikki marta
  // ko'rsatish va unread hisobini buzish bo'lardi (docs/01 §2.14
  // "bir voqea uchun bir kanaldan faqat bir marta" ruhi).

  /**
   * O'z xabarlari — cursor pagination, YANGI birinchi (`id DESC`; UUID v7
   * vaqt bo'yicha tartiblangani uchun bu yaratilish tartibi teskarisi).
   */
  async listForUser(
    userId: string,
    first: number,
    afterId: string | null,
    unreadOnly: boolean,
  ): Promise<NotificationRow[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        channel: 'IN_APP',
        ...(afterId !== null && { id: { lt: afterId } }),
        ...(unreadOnly && { readAt: null }),
      },
      orderBy: { id: 'desc' },
      take: first + 1,
    });
    return rows.map(toRow);
  }

  /**
   * O'qildi deb belgilash — userId QAMROVI SHART (IDOR): boshqa userning
   * id'si bilan so'rov `null` qaytaradi → service 404 (docs/04 §2.4).
   * Allaqachon o'qilgan xabar — idempotent no-op (readAt o'zgarmaydi).
   */
  async markRead(id: string, userId: string): Promise<NotificationRow | null> {
    const found = await this.prisma.notification.findFirst({
      where: { id, userId, channel: 'IN_APP' },
    });
    if (found === null) {
      return null;
    }
    if (found.readAt !== null) {
      return toRow(found);
    }
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return toRow(updated);
  }

  /** Hammasini o'qildi qilish — nechta qator yangilangani qaytadi. */
  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, channel: 'IN_APP', readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async unreadCount(userId: string): Promise<number> {
    return await this.prisma.notification.count({
      where: { userId, channel: 'IN_APP', readAt: null },
    });
  }

  // --- Qabul qiluvchini aniqlash (kulrang zona o'qishlari) ------------------------

  /**
   * Kanal tanlash uchun qabul qiluvchilar kesimi. Faol (o'chirilmagan)
   * userlar — deletedAt soft-delete hurmat qilinadi.
   */
  async recipientsByIds(userIds: readonly string[]): Promise<RecipientUser[]> {
    if (userIds.length === 0) {
      return [];
    }
    return await this.prisma.user.findMany({
      where: { id: { in: [...userIds] }, deletedAt: null },
      select: { id: true, email: true, emailVerified: true, locale: true },
    });
  }

  /**
   * RoundCompleted qabul qiluvchilari: seksiyaning TASDIQLANGAN va
   * chiqarilmagan ro'yxatlari → player.userId (akkauntsiz o'yinchi —
   * userId NULL — xabar olmaydi, bu to'g'ri).
   */
  async confirmedSectionUserIds(sectionId: string): Promise<string[]> {
    const regs = await this.prisma.registration.findMany({
      where: { sectionId, isConfirmed: true, isWithdrawn: false },
      select: { player: { select: { userId: true } } },
    });
    return [...new Set(regs.map((r) => r.player.userId).filter((id): id is string => id !== null))];
  }

  /** RoundCompleted shablon konteksti — seksiya + turnir nomi. */
  async sectionContext(
    sectionId: string,
  ): Promise<{ sectionName: string; tournamentName: string } | null> {
    const section = await this.prisma.tournamentSection.findUnique({
      where: { id: sectionId },
      select: { name: true, tournament: { select: { name: true } } },
    });
    if (section === null) {
      return null;
    }
    return { sectionName: section.name, tournamentName: section.tournament.name };
  }

  /**
   * PaymentCompleted/RefundIssued qabul qiluvchisi: billing payload'ida
   * userId YO'Q (billing.repository.ts outbox payload'i) — invoysdan
   * o'qiladi. userId NULL bo'lishi mumkin (tizim invoysi) → xabar yo'q.
   */
  async invoiceRecipient(
    invoiceId: string,
  ): Promise<{ userId: string | null; invoiceNumber: string } | null> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { userId: true, number: true },
    });
    if (invoice === null) {
      return null;
    }
    return { userId: invoice.userId, invoiceNumber: invoice.number };
  }

  /**
   * FairPlayCaseOpened qabul qiluvchilari: FAQAT SUPER_ADMIN'lar
   * (docs/08 §6.3 kirish huquqi jadvali; o'yinchiga bu bosqichda xabar
   * YO'Q — §4.1 3-band "asossiz shubha yetkazilmaydi").
   */
  async superAdminUserIds(): Promise<string[]> {
    const roles = await this.prisma.userRole.findMany({
      where: { role: 'SUPER_ADMIN' },
      select: { userId: true },
    });
    return [...new Set(roles.map((r) => r.userId))];
  }

  /** game.finished uchun: playerId'lar → userId'lar (akkauntsizlar tushib qoladi). */
  async userIdsForPlayers(playerIds: readonly string[]): Promise<string[]> {
    if (playerIds.length === 0) {
      return [];
    }
    const players = await this.prisma.player.findMany({
      where: { id: { in: [...playerIds] } },
      select: { userId: true },
    });
    return [...new Set(players.map((p) => p.userId).filter((id): id is string => id !== null))];
  }
}
