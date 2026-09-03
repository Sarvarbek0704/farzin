import { Injectable } from '@nestjs/common';
import type { Player, Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/prisma/prisma.service';

/** Ommaviy profil ko'rinishi — sezgir maydonlarsiz. */
export interface PlayerRow {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  middleName: string | null;
  fullNameCyrl: string | null;
  birthDate: Date | null;
  gender: 'MALE' | 'FEMALE' | null;
  avatarUrl: string | null;
  fideId: string | null;
  title: string | null;
  federationId: string | null;
  regionId: string | null;
  isPublic: boolean;
  createdAt: Date;
}

export interface UpdatePlayerInput {
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  fullNameCyrl?: string | null;
  birthDate?: Date | null;
  gender?: 'MALE' | 'FEMALE' | null;
  regionId?: string | null;
  isPublic?: boolean;
}

@Injectable()
export class PlayerRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Ommaviy ro'yxat: faqat isPublic, soft-delete'lar ko'rinmaydi. */
  async listPublic(
    first: number,
    afterId: string | null,
    search: string | null = null,
  ): Promise<PlayerRow[]> {
    const rows = await this.prisma.player.findMany({
      where: {
        deletedAt: null,
        isPublic: true,
        ...(afterId !== null && { id: { gt: afterId } }),
        ...(search !== null && { OR: nameMatch(search) }),
      },
      orderBy: { id: 'asc' },
      take: first + 1,
    });
    return rows.map(toRow);
  }

  async findById(id: string): Promise<PlayerRow | null> {
    const row = await this.prisma.player.findFirst({ where: { id, deletedAt: null } });
    return row === null ? null : toRow(row);
  }

  /**
   * Ko'p ID — BITTA so'rov.
   *
   * `isPublic` bu yerda TEKSHIRILMAYDI: bu ichki port yo'li va uni
   * chaqiruvchi (do'stlar ro'yxati, turnir jadvali) allaqachon
   * "bu odamlarni ko'rish huquqim bor" degan kontekstda ishlaydi.
   * Ommaviy ro'yxat esa `listPublic` orqali boradi.
   */
  async findManyByIds(ids: readonly string[]): Promise<PlayerRow[]> {
    const rows = await this.prisma.player.findMany({
      where: { id: { in: [...ids] }, deletedAt: null },
    });
    return rows.map(toRow);
  }

  async findByUserId(userId: string): Promise<PlayerRow | null> {
    const row = await this.prisma.player.findFirst({ where: { userId, deletedAt: null } });
    return row === null ? null : toRow(row);
  }

  async update(id: string, input: UpdatePlayerInput): Promise<PlayerRow> {
    const data: Prisma.PlayerUpdateInput = {};
    if (input.firstName !== undefined) {
      data.firstName = input.firstName;
    }
    if (input.lastName !== undefined) {
      data.lastName = input.lastName;
    }
    if (input.middleName !== undefined) {
      data.middleName = input.middleName;
    }
    if (input.fullNameCyrl !== undefined) {
      data.fullNameCyrl = input.fullNameCyrl;
    }
    if (input.birthDate !== undefined) {
      data.birthDate = input.birthDate;
    }
    if (input.gender !== undefined) {
      data.gender = input.gender;
    }
    if (input.isPublic !== undefined) {
      data.isPublic = input.isPublic;
    }
    if (input.regionId !== undefined) {
      data.region =
        input.regionId === null ? { disconnect: true } : { connect: { id: input.regionId } };
    }

    const row = await this.prisma.player.update({ where: { id }, data });
    return toRow(row);
  }
}

/**
 * Ism bo'yicha qidiruv shartlari.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA `contains`, `startsWith` EMAS
 *
 *  O'zbek ismlari ro'yxatda turlicha yoziladi: "Sodiqov Sarvarbek" ham,
 *  "Sarvarbek Sodiqov" ham. Foydalanuvchi familiyani ham, ismni ham
 *  birinchi yozishi mumkin, shuning uchun ikkala maydon ham qidiriladi.
 *
 *  KIRIL yozuvi alohida maydonda (`fullNameCyrl`) — u ham qidiriladi:
 *  aks holda kirilcha yozadigan foydalanuvchi hech kimni topolmasdi.
 *
 *  ⚠️  Bu `LIKE '%...%'` ga aylanadi va indeksdan foydalanmaydi. Hozirgi
 *      o'lchamda (o'n minglab o'yinchi) bu yetarli; katta o'lchamda
 *      pg_trgm GIN indeksi kerak bo'ladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function nameMatch(search: string): Prisma.PlayerWhereInput[] {
  const mode = 'insensitive' as const;
  return [
    { firstName: { contains: search, mode } },
    { lastName: { contains: search, mode } },
    { fullNameCyrl: { contains: search, mode } },
  ];
}

function toRow(player: Player): PlayerRow {
  return {
    id: player.id,
    userId: player.userId,
    firstName: player.firstName,
    lastName: player.lastName,
    middleName: player.middleName,
    fullNameCyrl: player.fullNameCyrl,
    birthDate: player.birthDate,
    gender: player.gender,
    avatarUrl: player.avatarUrl,
    fideId: player.fideId,
    title: player.title,
    federationId: player.federationId,
    regionId: player.regionId,
    isPublic: player.isPublic,
    createdAt: player.createdAt,
  };
}
