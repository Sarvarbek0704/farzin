import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS } from '../../../shared/redis/redis.module';
import { UserRepository } from '../user.repository';

export interface RoleAssignmentView {
  role: string;
  scopeType: string | null;
  scopeId: string | null;
}

/** Rol keshi TTL — 60 s. Rol bekor qilinsa eng ko'pi bilan shuncha kechikadi. */
const CACHE_TTL_SECONDS = 60;

/**
 * Avtorizatsiya uchun rollarni yetkazib berish.
 *
 * ⚠️  ROLLAR JWT'DAN OLINMAYDI — docs/10-security.md §3.4.
 *     15 daqiqalik token bekor qilingan hakamni 15 daqiqa hakamligicha
 *     qoldiradi. Rollar har so'rovda shu servisdan (DB, 60s Redis kesh
 *     bilan) olinadi.
 *
 * ⚠️  `invalidate(userId)` HAR ROL O'ZGARISHIDA chaqirilishi SHART —
 *     rol beruvchi kod bilan bir joyda.
 */
@Injectable()
export class AuthzService {
  constructor(
    private readonly users: UserRepository,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async getAssignments(userId: string): Promise<RoleAssignmentView[]> {
    const cacheKey = `authz:roles:${userId}`;

    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      return JSON.parse(cached) as RoleAssignmentView[];
    }

    const rows = await this.users.findActiveAssignments(userId);

    await this.redis.set(cacheKey, JSON.stringify(rows), 'EX', CACHE_TTL_SECONDS);
    return rows;
  }

  /** Rol o'zgarganda keshni darhol o'chirish. */
  async invalidate(userId: string): Promise<void> {
    await this.redis.del(`authz:roles:${userId}`);
  }
}
