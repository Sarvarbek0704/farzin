import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

import type { ClockState } from '../../core/clock/chess-clock';
import { REDIS } from '../../shared/redis/redis.module';
import type { ClockEntry } from './play.types';

/**
 * Jonli soat holati — Redis.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA REDIS (docs/02-architecture.md §8.2 — ongli trade-off):
 *  har clock yangilanishini PostgreSQL'ga yozish bema'nilik. Taymer
 *  Redis'da; o'yin tugagach YAKUNIY holat PostgreSQL'ga
 *  (OnlineGame.whiteTimeLeftMs/blackTimeLeftMs), har yurish esa Move
 *  jadvaliga yoziladi (clockAfterMs bilan).
 *
 *  QAYTA TIKLASH YO'LI (Redis yo'qolsa / TTL o'tsa): docs/02 §8.2 —
 *  "o'yinni yurishlar tarixidan tiklash mumkin, faqat qolgan vaqt taxminiy
 *  bo'ladi". play.service.reconstructClock: har tomonning oxirgi
 *  Move.clockAfterMs qiymati olinadi (yo'q bo'lsa baseMs), lastEventAtMs =
 *  hozir — ya'ni yo'qolgan oraliq o'yinchidan OLINMAYDI (docs/07 §8.3:
 *  server nosozligi uchun o'yinchi jazolanmaydi).
 *
 *  ATOMIKLIK: yangilash Lua script bilan CAS (versiya solishtirish).
 *  WATCH/MULTI EMAS, chunki WATCH ulanish-darajali holat — REDIS tokeni
 *  esa umumiy (shared) klient: boshqa buyruqlar WATCH oynasini buzadi.
 *  Lua bitta atomik birlikda bajariladi va umumiy klientda xavfsiz.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class ClockStore {
  /** TTL zaxirasi: eng uzoq klassik o'yin ham 24 soatdan oshmaydi. */
  private static readonly TTL_SECONDS = 24 * 60 * 60;

  /** Durang taklifi bayrog'i TTL — o'yin bilan birga yashaydi. */
  private static readonly DRAW_TTL_SECONDS = 24 * 60 * 60;

  /**
   * CAS: mavjud yozuv versiyasi kutilganiga teng bo'lsagina almashtiradi.
   * ARGV[1] = kutilgan versiya, ARGV[2] = yangi JSON (version allaqachon +1),
   * ARGV[3] = TTL (s). 1 = muvaffaqiyat, 0 = konflikt/yo'q.
   */
  private static readonly CAS_SCRIPT = `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return 0 end
    local cur = cjson.decode(raw)
    if tostring(cur.version) ~= ARGV[1] then return 0 end
    redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
    return 1
  `;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(gameId: string): string {
    return `game:clock:${gameId}`;
  }

  private drawKey(gameId: string): string {
    return `game:draw:${gameId}`;
  }

  /** Yangi o'yin uchun boshlang'ich yozuv (SET — o'yin ID unikal, NX shart emas). */
  async init(gameId: string, state: ClockState): Promise<void> {
    const entry: ClockEntry = { version: 1, state };
    await this.redis.set(
      this.key(gameId),
      JSON.stringify(entry),
      'EX',
      ClockStore.TTL_SECONDS,
    );
  }

  async load(gameId: string): Promise<ClockEntry | null> {
    const raw = await this.redis.get(this.key(gameId));
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw) as ClockEntry;
  }

  /**
   * Atomik yangilash (Lua CAS). `false` = parallel yozuv yutib ketdi —
   * chaqiruvchi yozuvni TOZALAB yuboradi (keyingi o'qish DB'dan qayta
   * tiklaydi — o'z-o'zini davolaydigan yo'l, service hujjatiga qarang).
   */
  async update(gameId: string, expectedVersion: number, state: ClockState): Promise<boolean> {
    const next: ClockEntry = { version: expectedVersion + 1, state };
    const res = await this.redis.eval(
      ClockStore.CAS_SCRIPT,
      1,
      this.key(gameId),
      String(expectedVersion),
      JSON.stringify(next),
      String(ClockStore.TTL_SECONDS),
    );
    return res === 1;
  }

  /** O'yin tugadi — jonli yozuv o'chiriladi (yakuniy holat PostgreSQL'da). */
  async clear(gameId: string): Promise<void> {
    await this.redis.del(this.key(gameId), this.drawKey(gameId));
  }

  // --- Durang taklifi bayrog'i (docs/07 §7.2 draw_offer/draw_accept) -----------

  async setDrawOffer(gameId: string, side: 'w' | 'b'): Promise<void> {
    await this.redis.set(this.drawKey(gameId), side, 'EX', ClockStore.DRAW_TTL_SECONDS);
  }

  async getDrawOffer(gameId: string): Promise<'w' | 'b' | null> {
    const raw = await this.redis.get(this.drawKey(gameId));
    return raw === 'w' || raw === 'b' ? raw : null;
  }

  async clearDrawOffer(gameId: string): Promise<void> {
    await this.redis.del(this.drawKey(gameId));
  }
}
