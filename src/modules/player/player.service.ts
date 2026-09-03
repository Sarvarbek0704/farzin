import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../../core/errors/domain.error';
import {
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  MAX_PAGE_SIZE,
  type Page,
  toPage,
} from '../../shared/pagination/cursor';
import type { Actor } from '../identity/rbac.port';
import { RbacService } from '../identity/rbac.port';
import type { PlayerPort, PlayerSummary } from './player.port';
import { PlayerRepository, type PlayerRow, type UpdatePlayerInput } from './player.repository';

@Injectable()
export class PlayerService implements PlayerPort {
  constructor(
    private readonly players: PlayerRepository,
    private readonly rbac: RbacService,
  ) {}

  /** Ommaviy ro'yxat — cursor pagination (docs/04-api-spec.md §3). */
  async listPublic(
    first: number | undefined,
    after: string | undefined,
    search?: string,
  ): Promise<Page<PublicPlayer>> {
    const pageSize = Math.min(Math.max(first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const afterId = after !== undefined ? decodeCursor(after) : null;
    // Bo'sh/probel qidiruv — filtrsiz ro'yxat (DTO minLength'ni tekshiradi,
    // bu yerda faqat probel qirqiladi).
    const trimmed = search?.trim() ?? '';
    const rows = await this.players.listPublic(pageSize, afterId, trimmed === '' ? null : trimmed);
    return toPage(rows.map(toPublic), pageSize);
  }

  /**
   * Bitta profil. Yopiq profil ham, mavjud bo'lmagan ham — 404.
   * Farq bildirilmaydi (ma'lumot sizdirmaslik). docs/04-api-spec.md §2.4
   */
  async getPublicById(id: string): Promise<PublicPlayer> {
    const player = await this.players.findById(id);
    if (!player?.isPublic) {
      throw new NotFoundError('Player', id);
    }
    return toPublic(player);
  }

  /** O'z profili — yopiq bo'lsa ham ko'rinadi. */
  async getOwn(userId: string): Promise<PlayerRow> {
    const player = await this.players.findByUserId(userId);
    if (player === null) {
      throw new NotFoundError('Player');
    }
    return player;
  }

  /**
   * O'z profilini tahrirlash.
   *
   * IDOR himoyasi: tekshiruv YUKLANGAN obyekt bilan —
   * `rbac.can(actor, 'update', { type: 'Player', ownerUserId })`.
   * docs/10-security.md §3
   */
  async updateOwn(actor: Actor, input: UpdatePlayerInput): Promise<PlayerRow> {
    const player = await this.players.findByUserId(actor.userId);
    if (player === null) {
      throw new NotFoundError('Player');
    }

    const allowed = this.rbac.can(actor, 'update', {
      type: 'Player',
      ...(player.userId !== null && { ownerUserId: player.userId }),
    });
    if (!allowed) {
      throw new NotFoundError('Player');
    }

    return await this.players.update(player.id, input);
  }

  // --- PlayerPort (boshqa modullar uchun) --------------------------------

  async findById(id: string): Promise<PlayerSummary | null> {
    const player = await this.players.findById(id);
    return player === null ? null : toSummary(player);
  }

  /**
   * BITTA so'rov — har ID uchun alohida emas.
   *
   * Ilgari bu yer `Promise.all(ids.map(findById))` edi: 200 do'stli
   * ro'yxat 200 ta SQL so'roviga aylanardi. Chaqiruvchi buni ko'rmaydi,
   * shuning uchun N+1 shu yerda, port ortida yopiladi.
   */
  async findManyByIds(ids: readonly string[]): Promise<PlayerSummary[]> {
    if (ids.length === 0) {
      return [];
    }
    return (await this.players.findManyByIds(ids)).map(toSummary);
  }

  async findSummaryByUserId(userId: string): Promise<(PlayerSummary & { userId: string }) | null> {
    const player = await this.players.findByUserId(userId);
    if (player?.userId == null) {
      return null;
    }
    return { ...toSummary(player), userId: player.userId };
  }
}

/**
 * Ommaviy javob — `userId` SIZ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA userId OLIB TASHLANADI
 *
 *  `userId` — hisobning ichki identifikatori va JWT'dagi `sub`.
 *  Ommaviy ro'yxat uni qaytarganda har kim istalgan o'yinchining
 *  hisob ID'sini yig'ib olardi. O'g'irlanadigan sir emas, lekin
 *  ommaviy sirtda unga EHTIYOJ ham yo'q: hamma tashqi murojaat
 *  `playerId` bilan boradi.
 *
 *  Jonli tekshiruvda ko'rindi: `GET /players?q=...` javobida `userId`
 *  turgan edi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export type PublicPlayer = Omit<PlayerRow, 'userId'>;

function toPublic(player: PlayerRow): PublicPlayer {
  const { userId: _userId, ...rest } = player;
  return rest;
}

function toSummary(player: PlayerRow): PlayerSummary {
  return {
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    title: player.title,
    fideId: player.fideId,
    userId: player.userId,
  };
}
