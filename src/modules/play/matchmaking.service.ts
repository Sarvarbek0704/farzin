import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { Redis } from 'ioredis';

import { multiStageNotImplemented } from '../../core/clock/chess-clock';
import { BusinessRuleError } from '../../core/errors/domain.error';
import { PLAYER_PORT, type PlayerPort } from '../player/player.port';
import { RATING_PORT, type RatingPort } from '../rating/rating.port';
import { REDIS } from '../../shared/redis/redis.module';
import { PlayService } from './play.service';
import {
  PLAY_MATCHED_EVENT,
  type ClockTypeValue,
  type MatchmakingJoinResult,
  type PlayMatchedEvent,
  type TimeCategoryValue,
} from './play.types';

/**
 * Matchmaking — Redis sorted-set navbati (docs/07-realtime-and-clock.md §9).
 *
 * DIZAYN:
 *  - Har (timeCategory, clockType, base, inc) chelagi uchun ALOHIDA zset:
 *    `game:mm:{tc}:{ct}:{base}:{inc}`, score = Glicko-2 reyting (§9.3 —
 *    ZRANGEBYSCORE bilan oraliqdagi nomzod O(log N + M) da topiladi).
 *    Reyting RATING_PORT'dan; hech qachon o'ynamagan → 1500 displey bazasi.
 *  - Oddiy (naive) juftlashtiruvchi: oraliqdagi BIRINCHI mos nomzod
 *    olinadi. Reyting oralig'i kutish bilan KENGAYADI (§9.2 formulasi);
 *    boshlang'ich oraliq ±200 (kichik pool uchun; §9.2 dagi 100 dan
 *    kengroq — ongli mahalliy qaror).
 *  - ATOMIKLIK (§9.4): juftlashtirish Lua script'da — ikkala o'yinchi ham
 *    hali navbatda bo'lsagina ZREM. Ikki parallel juftlashtiruvchi bitta
 *    o'yinchini ikki o'yinga qo'sha olmaydi.
 *  - Bitta hisob — bitta navbat (§9.5 #5): `game:mm:user:{playerId}`
 *    markeri, SET NX.
 *  - Navbat ro'yxati clientga HECH QACHON ko'rsatilmaydi (§9.5 #1) —
 *    bunday endpoint yo'q.
 *  - Juftlik topilgach o'yin DARHOL yaratiladi (§9.5 #2 — "qabul
 *    qilasizmi?" dialogi yo'q) va gateway EventEmitter2 orqali xabardor
 *    qilinadi (transportni service bilmaydi).
 *  - Davriy supurish (@Interval): ikki o'yinchi ham jim kutayotganda
 *    kengaygan oynalar kesishishini tekshiradi. BullMQ repeatable job
 *    (§9.4) — ko'p instance bosqichida; hozircha in-process interval.
 *
 * KEYINGA QOLDIRILGAN (halol ro'yxat): RD asosidagi kenglik (§9.2 k·RD),
 * takroriy raqib past prioriteti (§9.5 #4), abort-jazo cooldown (§9.5 #3).
 */

export interface MatchmakingConfig {
  readonly initialDelta: number;
  readonly deltaStep: number;
  readonly stepIntervalMs: number;
  readonly maxDelta: number;
}

/** §9.2 formulasi; boshlang'ich ±200 — kichik pool uchun mahalliy qaror. */
export const DEFAULT_MATCHMAKING_CONFIG: MatchmakingConfig = {
  initialDelta: 200,
  deltaStep: 50,
  stepIntervalMs: 10_000,
  maxDelta: 500,
};

/** t ms kutgandan keyingi qidiruv oralig'i (docs/07 §9.2 currentDelta). */
export function currentDelta(cfg: MatchmakingConfig, waitedMs: number): number {
  const steps = Math.floor(Math.max(0, waitedMs) / cfg.stepIntervalMs);
  return Math.min(cfg.initialDelta + steps * cfg.deltaStep, cfg.maxDelta);
}

export interface PoolId {
  readonly timeCategory: TimeCategoryValue;
  readonly clockType: ClockTypeValue;
  readonly baseTimeSeconds: number;
  readonly incrementSeconds: number;
}

/** Chelak kaliti — prompt formati: game:mm:{tc}:{ct}:{base}:{inc}. */
export function bucketKey(pool: PoolId): string {
  return `game:mm:${pool.timeCategory}:${pool.clockType}:${String(pool.baseTimeSeconds)}:${String(pool.incrementSeconds)}`;
}

/** Chelak kalitidan PoolId'ni tiklash (supurish uchun). Buzuq kalit → null. */
export function parseBucketKey(key: string): PoolId | null {
  const parts = key.split(':');
  if (parts.length !== 6 || parts[0] !== 'game' || parts[1] !== 'mm') {
    return null;
  }
  const base = Number(parts[4]);
  const inc = Number(parts[5]);
  if (!Number.isInteger(base) || !Number.isInteger(inc)) {
    return null;
  }
  return {
    timeCategory: parts[2] as TimeCategoryValue,
    clockType: parts[3] as ClockTypeValue,
    baseTimeSeconds: base,
    incrementSeconds: inc,
  };
}

interface QueueMeta {
  /** userId — o'yin topilganda WS xabari uchun. */
  u: string;
  /** joinedAt (wall ms) — delta kengayishi uchun. */
  t: number;
  /** reyting — juftlik yaqinligi uchun. */
  r: number;
}

const REGISTRY_KEY = 'game:mm:buckets';
const QUEUE_TTL_SECONDS = 60 * 60;

/**
 * Atomik juftlashtirish (docs/07 §9.4): ikkala o'yinchi ham hali navbatda
 * bo'lsagina ikkalasi ham olib tashlanadi. Redis Lua — bitta atomik birlik.
 */
const PAIR_SCRIPT = `
  if redis.call('ZSCORE', KEYS[1], ARGV[1]) == false then return 0 end
  if redis.call('ZSCORE', KEYS[1], ARGV[2]) == false then return 0 end
  redis.call('ZREM', KEYS[1], ARGV[1], ARGV[2])
  redis.call('HDEL', KEYS[2], ARGV[1], ARGV[2])
  redis.call('DEL', KEYS[3], KEYS[4])
  return 1
`;

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);
  private readonly cfg = DEFAULT_MATCHMAKING_CONFIG;
  private sweeping = false;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(PLAYER_PORT) private readonly players: PlayerPort,
    @Inject(RATING_PORT) private readonly ratings: RatingPort,
    private readonly playService: PlayService,
    private readonly events: EventEmitter2,
  ) {}

  private metaKey(bucket: string): string {
    return `${bucket}:meta`;
  }

  private markerKey(playerId: string): string {
    return `game:mm:user:${playerId}`;
  }

  async join(userId: string, pool: PoolId): Promise<MatchmakingJoinResult> {
    if (pool.clockType === 'MULTI_STAGE') {
      throw multiStageNotImplemented();
    }
    const me = await this.players.findSummaryByUserId(userId);
    if (me === null) {
      throw new BusinessRuleError(
        'PLAYER_PROFILE_REQUIRED',
        "Navbatga turish uchun o'yinchi profili kerak",
      );
    }

    const current = await this.ratings.getCurrentRating(me.id, 'ONLINE', pool.timeCategory);
    const rating = current?.rating ?? 1500;

    const bucket = bucketKey(pool);
    // Bitta hisob — bitta navbat (docs/07 §9.5 #5).
    const marker = await this.redis.set(
      this.markerKey(me.id),
      bucket,
      'EX',
      QUEUE_TTL_SECONDS,
      'NX',
    );
    if (marker === null) {
      throw new BusinessRuleError('ALREADY_IN_QUEUE', 'Siz allaqachon navbatdasiz');
    }

    const meta: QueueMeta = { u: userId, t: Date.now(), r: rating };
    await this.redis
      .multi()
      .zadd(bucket, rating, me.id)
      .hset(this.metaKey(bucket), me.id, JSON.stringify(meta))
      .sadd(REGISTRY_KEY, bucket)
      .expire(bucket, QUEUE_TTL_SECONDS)
      .expire(this.metaKey(bucket), QUEUE_TTL_SECONDS)
      .exec();

    const matched = await this.tryMatchFor(pool, bucket, me.id, meta);
    if (matched !== null) {
      return { status: 'matched', gameId: matched };
    }
    return { status: 'queued' };
  }

  async leave(userId: string): Promise<{ left: boolean }> {
    const me = await this.players.findSummaryByUserId(userId);
    if (me === null) {
      return { left: false };
    }
    const bucket = await this.redis.get(this.markerKey(me.id));
    if (bucket === null) {
      return { left: false };
    }
    await this.redis
      .multi()
      .zrem(bucket, me.id)
      .hdel(this.metaKey(bucket), me.id)
      .del(this.markerKey(me.id))
      .exec();
    return { left: true };
  }

  /**
   * Davriy supurish: kutish bilan kengaygan oynalar kesishganda jim turgan
   * ikki o'yinchini juftlashtiradi. Xato yutiladi — navbat kritik yo'l emas.
   */
  @Interval(5_000)
  async sweep(): Promise<void> {
    if (this.sweeping) {
      return;
    }
    this.sweeping = true;
    try {
      const buckets = await this.redis.smembers(REGISTRY_KEY);
      for (const bucket of buckets) {
        const pool = parseBucketKey(bucket);
        if (pool === null) {
          await this.redis.srem(REGISTRY_KEY, bucket);
          continue;
        }
        await this.sweepBucket(pool, bucket);
      }
    } catch (e) {
      this.logger.warn(`matchmaking sweep failed: ${String(e)}`);
    } finally {
      this.sweeping = false;
    }
  }

  private async sweepBucket(pool: PoolId, bucket: string): Promise<void> {
    const members = await this.redis.zrange(bucket, 0, -1, 'WITHSCORES');
    if (members.length === 0) {
      await this.redis.srem(REGISTRY_KEY, bucket);
      return;
    }
    if (members.length < 4) {
      // zrange WITHSCORES: [m1, s1, m2, s2, ...] — kamida 2 o'yinchi kerak.
      return;
    }
    const rawMeta = await this.redis.hgetall(this.metaKey(bucket));
    const now = Date.now();

    interface Waiting {
      playerId: string;
      rating: number;
      meta: QueueMeta;
    }
    const waiting: Waiting[] = [];
    for (let i = 0; i + 1 < members.length; i += 2) {
      const playerId = members[i];
      const score = Number(members[i + 1]);
      const metaRaw = playerId === undefined ? undefined : rawMeta[playerId];
      if (playerId === undefined || metaRaw === undefined) {
        continue;
      }
      waiting.push({ playerId, rating: score, meta: JSON.parse(metaRaw) as QueueMeta });
    }
    // Uzoq kutganlar birinchi — adolat.
    waiting.sort((a, b) => a.meta.t - b.meta.t);

    for (let i = 0; i < waiting.length; i += 1) {
      const a = waiting[i];
      if (a === undefined) {
        continue;
      }
      for (let j = i + 1; j < waiting.length; j += 1) {
        const b = waiting[j];
        if (b === undefined) {
          continue;
        }
        const window = Math.max(
          currentDelta(this.cfg, now - a.meta.t),
          currentDelta(this.cfg, now - b.meta.t),
        );
        if (Math.abs(a.rating - b.rating) > window) {
          continue;
        }
        const paired = await this.pairAtomically(
          pool,
          bucket,
          a.playerId,
          b.playerId,
          a.meta,
          b.meta,
        );
        if (paired) {
          // Bu ikkisi band — ro'yxatdan chiqarib davom etamiz.
          waiting.splice(j, 1);
          waiting.splice(i, 1);
          i -= 1;
          break;
        }
      }
    }
  }

  /** Join paytidagi darhol urinish: oraliqdagi eng birinchi mos nomzod. */
  private async tryMatchFor(
    pool: PoolId,
    bucket: string,
    selfPlayerId: string,
    selfMeta: QueueMeta,
  ): Promise<string | null> {
    const delta = currentDelta(this.cfg, 0);
    const candidates = await this.redis.zrangebyscore(
      bucket,
      selfMeta.r - delta,
      selfMeta.r + delta,
      'LIMIT',
      0,
      10,
    );
    for (const candidateId of candidates) {
      if (candidateId === selfPlayerId) {
        continue;
      }
      const metaRaw = await this.redis.hget(this.metaKey(bucket), candidateId);
      if (metaRaw === null) {
        continue;
      }
      const candidateMeta = JSON.parse(metaRaw) as QueueMeta;
      const gameId = await this.pairAndCreate(
        pool,
        bucket,
        candidateId,
        candidateMeta,
        selfPlayerId,
        selfMeta,
      );
      if (gameId !== null) {
        return gameId;
      }
    }
    return null;
  }

  private async pairAtomically(
    pool: PoolId,
    bucket: string,
    aPlayerId: string,
    bPlayerId: string,
    aMeta: QueueMeta,
    bMeta: QueueMeta,
  ): Promise<boolean> {
    const gameId = await this.pairAndCreate(pool, bucket, aPlayerId, aMeta, bPlayerId, bMeta);
    return gameId !== null;
  }

  /**
   * Lua bilan atomik chiqarish + o'yin yaratish + gateway'ni xabardor qilish.
   * Rang qoidasi (birinchi bo'lak): UZOQROQ kutgan o'yinchi OQ.
   */
  private async pairAndCreate(
    pool: PoolId,
    bucket: string,
    aPlayerId: string,
    aMeta: QueueMeta,
    bPlayerId: string,
    bMeta: QueueMeta,
  ): Promise<string | null> {
    const removed = await this.redis.eval(
      PAIR_SCRIPT,
      4,
      bucket,
      this.metaKey(bucket),
      this.markerKey(aPlayerId),
      this.markerKey(bPlayerId),
      aPlayerId,
      bPlayerId,
    );
    if (removed !== 1) {
      return null;
    }

    const [white, black] =
      aMeta.t <= bMeta.t
        ? [
            { playerId: aPlayerId, userId: aMeta.u },
            { playerId: bPlayerId, userId: bMeta.u },
          ]
        : [
            { playerId: bPlayerId, userId: bMeta.u },
            { playerId: aPlayerId, userId: aMeta.u },
          ];

    const game = await this.playService.createGameWithClock({
      whitePlayerId: white.playerId,
      blackPlayerId: black.playerId,
      timeCategory: pool.timeCategory,
      clockType: pool.clockType,
      baseTimeSeconds: pool.baseTimeSeconds,
      incrementSeconds: pool.incrementSeconds,
      isRated: true,
    });

    const event: PlayMatchedEvent = {
      gameId: game.id,
      whiteUserId: white.userId,
      blackUserId: black.userId,
    };
    this.events.emit(PLAY_MATCHED_EVENT, event);
    return game.id;
  }
}
