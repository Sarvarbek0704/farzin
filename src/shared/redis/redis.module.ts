import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import type { AppConfig } from '../../config/configuration';

/**
 * Redis ulanish token'i. Inject qilish:
 *
 *   constructor(@Inject(REDIS) private readonly redis: Redis) {}
 *
 * Redis NIMA UCHUN ishlatiladi va NIMA UCHUN ISHLATILMAYDI —
 * docs/02-architecture.md §8.2 jadvaliga qarang. Qisqacha:
 * cache, navbat, rate-limit, sessiya keshi — HA;
 * asosiy ma'lumot, pul, audit — YO'Q.
 */
export const REDIS = Symbol('REDIS');

/** Graceful shutdown — ochiq buyruqlar tugashini kutadi. */
class RedisShutdown implements OnApplicationShutdown {
  constructor(private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (config: ConfigService<AppConfig, true>): Redis => {
        const redis = config.get('redis', { infer: true });
        return new Redis({
          host: redis.host,
          port: redis.port,
          ...(redis.password !== undefined && { password: redis.password }),
          db: redis.db,
          // Ilova ishga tushishida Redis hali tayyor bo'lmasligi mumkin
          // (docker compose) — cheksiz emas, lekin sabrli retry.
          retryStrategy: (times: number): number => Math.min(times * 200, 5_000),
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        });
      },
      inject: [ConfigService],
    },
    {
      provide: RedisShutdown,
      useFactory: (redis: Redis): RedisShutdown => new RedisShutdown(redis),
      inject: [REDIS],
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
