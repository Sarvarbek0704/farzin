import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../../shared/audit/audit.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { FriendLink } from './friend.types';
import type { FriendshipStatus, FriendshipView } from './friendship.rules';

export interface FriendshipRow extends FriendshipView {
  id: string;
}

/**
 * Do'stlik saqlash qatlami.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU YERDA ISM YO'Q — FAQAT ID
 *
 *  Ro'yxatga o'yinchi ismi kerak, lekin uni `include: { requester: ... }`
 *  bilan olish OSONROQ bo'lsa-da, arxitektura qoidasini buzardi:
 *  "modul boshqa modulning jadvaliga so'rov yubormaydi"
 *  (docs/02-architecture.md §5, ADR-0001).
 *
 *  Shuning uchun repository ID qaytaradi, servis esa ismlarni
 *  PLAYER_PORT orqali oladi. Bir so'rov ortadi, chegara buzilmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class FriendRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Juftlik uchun qator — YO'NALISHDAN QAT'I NAZAR.
   *
   * Bazada juftlik bo'yicha funksional unikal indeks bor
   * (migration: `friendships_pair_unique`), ya'ni natija ko'pi bilan
   * bitta bo'ladi.
   */
  async findPair(a: string, b: string): Promise<FriendshipRow | null> {
    const row = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
    });
    return row === null ? null : toRow(row);
  }

  async findById(id: string): Promise<FriendshipRow | null> {
    const row = await this.prisma.friendship.findUnique({ where: { id } });
    return row === null ? null : toRow(row);
  }

  /**
   * O'yinchining do'stlari yoki kutilayotgan so'rovlari.
   *
   * Chaqiruvchi holatni O'ZI beradi va servis buni faqat ACCEPTED /
   * PENDING bilan chaqiradi. BLOKLANGANLAR alohida yo'l bilan
   * (`listBlockedBy`) olinadi — u yerda "kim bloklagan" filtri bor,
   * bu yerda esa yo'q.
   */
  async listFor(playerId: string, status: FriendshipStatus): Promise<FriendLink[]> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status,
        OR: [{ requesterId: playerId }, { addresseeId: playerId }],
      },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map((r) => toLink(r, playerId));
  }

  /**
   * MEN bloklaganlar.
   *
   * `blockedById` bo'yicha filtr MUHIM: meni bloklagan odamning qatori
   * ham shu juftlikda turadi, lekin u menga ko'rinmasligi kerak —
   * aks holda "kim meni bloklagan" ro'yxati paydo bo'lardi.
   */
  async listBlockedBy(playerId: string): Promise<FriendLink[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'BLOCKED', blockedById: playerId },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map((r) => toLink(r, playerId));
  }

  // --- Yozish amallari (har biri AUDIT bilan) ------------------------------------

  async createRequest(
    requesterId: string,
    addresseeId: string,
    actorUserId: string,
  ): Promise<FriendshipRow> {
    return await this.prisma.$transaction(async (tx) => {
      const row = await tx.friendship.create({
        data: { requesterId, addresseeId, status: 'PENDING' },
      });
      await this.audit.write(tx, {
        action: 'friend.request',
        actorUserId,
        resourceType: 'Friendship',
        resourceId: row.id,
        after: { requesterId, addresseeId, status: 'PENDING' },
      });
      return toRow(row);
    });
  }

  async accept(id: string, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.friendship.update({
        where: { id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      await this.audit.write(tx, {
        action: 'friend.accept',
        actorUserId,
        resourceType: 'Friendship',
        resourceId: id,
        after: { status: 'ACCEPTED' },
      });
    });
  }

  /**
   * Rad etish va do'stlikni bekor qilish — IKKALASI ham qatorni
   * o'chiradi (sxemadagi izoh: DECLINED holati ataylab yo'q).
   */
  async remove(id: string, actorUserId: string, action: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.friendship.findUnique({ where: { id } });
      await tx.friendship.delete({ where: { id } });
      await this.audit.write(tx, {
        action,
        actorUserId,
        resourceType: 'Friendship',
        resourceId: id,
        ...(before === null
          ? {}
          : {
              before: {
                requesterId: before.requesterId,
                addresseeId: before.addresseeId,
                status: before.status,
              },
            }),
      });
    });
  }

  /**
   * Bloklash — qator bo'lmasa yaratiladi, bo'lsa BLOCKED ga o'tadi.
   *
   * `blockedById` MAJBURIY (DB cheklovi ham talab qiladi): blokni
   * faqat qo'ygan odam ocha olishi kerak.
   */
  async block(
    actorPlayerId: string,
    targetPlayerId: string,
    actorUserId: string,
  ): Promise<FriendshipRow> {
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.friendship.findFirst({
        where: {
          OR: [
            { requesterId: actorPlayerId, addresseeId: targetPlayerId },
            { requesterId: targetPlayerId, addresseeId: actorPlayerId },
          ],
        },
      });

      const row =
        existing === null
          ? await tx.friendship.create({
              data: {
                requesterId: actorPlayerId,
                addresseeId: targetPlayerId,
                status: 'BLOCKED',
                blockedById: actorPlayerId,
              },
            })
          : await tx.friendship.update({
              where: { id: existing.id },
              // `acceptedAt` tozalanadi — DB cheklovi buni talab qiladi
              // (ACCEPTED bo'lmagan qatorda sana bo'lmasligi kerak).
              data: { status: 'BLOCKED', blockedById: actorPlayerId, acceptedAt: null },
            });

      await this.audit.write(tx, {
        action: 'friend.block',
        actorUserId,
        resourceType: 'Friendship',
        resourceId: row.id,
        after: { blockedById: actorPlayerId, targetPlayerId },
      });
      return toRow(row);
    });
  }

  async unblock(id: string, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.friendship.delete({ where: { id } });
      await this.audit.write(tx, {
        action: 'friend.unblock',
        actorUserId,
        resourceType: 'Friendship',
        resourceId: id,
      });
    });
  }
}

/**
 * Ro'yxat chegarasi.
 *
 * Sahifalash ATAYLAB yo'q: do'stlar ro'yxati tabiatan kichik va uni
 * bo'lib berish UI'ni murakkablashtirardi. Chegara esa baribir kerak —
 * cheksiz so'rov himoyasiz qolmasin.
 */
const LIST_LIMIT = 200;

function toLink(
  row: {
    id: string;
    requesterId: string;
    addresseeId: string;
    status: string;
    createdAt: Date;
  },
  playerId: string,
): FriendLink {
  const outgoing = row.requesterId === playerId;
  return {
    friendshipId: row.id,
    otherPlayerId: outgoing ? row.addresseeId : row.requesterId,
    status: row.status as FriendshipStatus,
    outgoing,
    createdAt: row.createdAt,
  };
}

function toRow(row: {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: string;
  blockedById: string | null;
}): FriendshipRow {
  return {
    id: row.id,
    requesterId: row.requesterId,
    addresseeId: row.addresseeId,
    status: row.status as FriendshipStatus,
    blockedById: row.blockedById,
  };
}

/** Prisma unikal cheklov xatosi — poyga holatida yuz beradi. */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}
