import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS } from '../redis/redis.module';

export interface RateLimitDecision {
  allowed: boolean;
  /** Rad etilganda: necha sekunddan keyin qayta urinish mumkin */
  retryAfterSeconds: number;
  remaining: number;
}

/**
 * Sliding window rate limiter — Redis sorted set.
 *
 * FIXED WINDOW ATAYLAB ISHLATILMAYDI: chegara ikki oyna tutashgan joyda
 * ikki baravar so'rovga yo'l qo'yadi. docs/10-security.md §7.2
 *
 * Muhim nozik nuqta: RAD ETILGAN urinish oynaga QO'SHILMAYDI (zadd'dan
 * keyin limit oshsa yozuv o'chiriladi). Aks holda hujumchi o'z banini
 * cheksiz uzaytirib, kalitni bo'lishayotgan halol foydalanuvchini ham
 * qulflab qo'yadi.
 */
@Injectable()
export class SlidingWindowLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * @param key    "login:ip:1.2.3.4" | "login:email:a@b.c" kabi
   * @param limit  oynadagi ruxsat etilgan urinishlar soni
   * @param windowSeconds oyna kengligi
   */
  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
    const redisKey = `rl:${key}`;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const member = `${String(now)}:${randomUUID()}`;

    const [, , cardResult] = (await this.redis
      .multi()
      .zremrangebyscore(redisKey, 0, windowStart)
      .zadd(redisKey, now, member)
      .zcard(redisKey)
      .expire(redisKey, windowSeconds)
      .exec()) as [unknown, unknown, [Error | null, number], unknown];

    const count = cardResult[1];

    if (count > limit) {
      // Rad etilgan urinish oynadan olib tashlanadi (yuqoridagi izoh).
      await this.redis.zrem(redisKey, member);
      const oldest = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
      const oldestScore = oldest.length >= 2 ? Number(oldest[1]) : now;
      const retryAfterMs = oldestScore + windowSeconds * 1000 - now;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        remaining: 0,
      };
    }

    return { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, limit - count) };
  }

  /** Muvaffaqiyatdan keyin hisoblagichni tozalash (masalan login:email:*). */
  async reset(key: string): Promise<void> {
    await this.redis.del(`rl:${key}`);
  }
}
