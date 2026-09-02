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

  private presenceKey(gameId: string, side: 'w' | 'b'): string {
    return `game:presence:${gameId}:${side}`;
  }

  /** Yangi o'yin uchun boshlang'ich yozuv (SET — o'yin ID unikal, NX shart emas). */
  async init(gameId: string, state: ClockState): Promise<void> {
    const entry: ClockEntry = { version: 1, state };
    await this.redis.set(this.key(gameId), JSON.stringify(entry), 'EX', ClockStore.TTL_SECONDS);
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

  /**
   * O'yin tugadi — jonli yozuvlar o'chiriladi (yakuniy holat PostgreSQL'da).
   * Presence markerlari ham shu yerda ketadi — har finish yo'lida avtomatik.
   */
  async clear(gameId: string): Promise<void> {
    await this.redis
      .multi()
      .del(
        this.key(gameId),
        this.drawKey(gameId),
        this.presenceKey(gameId, 'w'),
        this.presenceKey(gameId, 'b'),
        this.goneKey(gameId, 'w'),
        this.goneKey(gameId, 'b'),
      )
      // "Ketgan" indeksidan ham chiqariladi — aks holda tugagan o'yin
      // supurgich ro'yxatida abadiy qolardi.
      .srem(ClockStore.GONE_INDEX, `${gameId}:w`, `${gameId}:b`)
      .exec();
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

  // --- Presence markerlari (docs/07 §3.8, §8) -----------------------------------
  //
  // `game:presence:{gameId}:{color}` — o'yinchining shu o'yin room'ida jonli
  // socket'i BORLIGI haqidagi ARZON multi-instance signal. Gateway ulanishda
  // qo'yadi, oxirgi socket uzilganda o'chiradi; o'yin tugaganda clear()
  // ikkalasini ham supuradi.
  //
  // HALOL CHEKLOV (bitta instance rejimi): grace taymeri va "hali ham
  // yo'qmi?" tekshiruvi hozircha socket ushlab turgan instance'ning
  // IN-MEMORY registriga tayanadi — marker faqat kelajakdagi multi-instance
  // bosqich (docs/07 §10.3 affinity) uchun tashqi iz. Ikki instance'da bir
  // o'yinchining ikki socket'i bo'lsa, marker oxirgi yozgan instance
  // qarashida qoladi — bu bosqichda qabul qilingan soddalashtirish.

  async setPresence(gameId: string, side: 'w' | 'b'): Promise<void> {
    await this.redis.set(this.presenceKey(gameId, side), '1', 'EX', ClockStore.TTL_SECONDS);
  }

  async clearPresence(gameId: string, side: 'w' | 'b'): Promise<void> {
    await this.redis.del(this.presenceKey(gameId, side));
  }

  async isPresent(gameId: string, side: 'w' | 'b'): Promise<boolean> {
    return (await this.redis.exists(this.presenceKey(gameId, side))) === 1;
  }

  // --- "Ketgan" markerlari (grace supurgichi uchun) -----------------------------
  //
  // `game:gone:{gameId}:{side}` = KETGAN PAYT (ms). Presence markeri faqat
  // "yo'q" deydi, QACHONDAN BERI yo'qligini aytmaydi — grace qарори esa
  // aynan shu vaqtga bog'liq.
  //
  // Qo'shimcha `game:gone:index` to'plami — supurgich barcha kalitlarni
  // SCAN qilmasligi uchun. Bu to'plam KICHIK: unda faqat uzilib turgan
  // o'yinchilar bo'ladi.
  //
  // NEGA KERAK: grace taymeri socket ushlab turgan instansiyada yashaydi.
  // O'sha instansiya o'lsa taymer yo'qoladi va o'yin ABANDONED bo'lmay
  // osilib qoladi. Marker tashqarida (Redis'da) bo'lgani uchun boshqa
  // instansiya qarorni davom ettira oladi.

  private goneKey(gameId: string, side: 'w' | 'b'): string {
    return `game:gone:${gameId}:${side}`;
  }

  private static readonly GONE_INDEX = 'game:gone:index';

  async markGone(gameId: string, side: 'w' | 'b', atMs: number): Promise<void> {
    await this.redis
      .multi()
      .set(this.goneKey(gameId, side), String(atMs), 'EX', ClockStore.TTL_SECONDS)
      .sadd(ClockStore.GONE_INDEX, `${gameId}:${side}`)
      .exec();
  }

  async clearGone(gameId: string, side: 'w' | 'b'): Promise<void> {
    await this.redis
      .multi()
      .del(this.goneKey(gameId, side))
      .srem(ClockStore.GONE_INDEX, `${gameId}:${side}`)
      .exec();
  }

  /**
   * Uzilib turgan o'yinchilar ro'yxati.
   *
   * O'z-o'zini tozalaydi: indeksda bor, lekin kaliti yo'q (TTL o'tgan
   * yoki o'yin tugagan) yozuvlar indeksdan olib tashlanadi — aks holda
   * to'plam abadiy o'sardi.
   */
  async listGone(): Promise<{ gameId: string; side: 'w' | 'b'; atMs: number }[]> {
    const members = await this.redis.smembers(ClockStore.GONE_INDEX);
    const out: { gameId: string; side: 'w' | 'b'; atMs: number }[] = [];

    for (const member of members) {
      const sep = member.lastIndexOf(':');
      const gameId = member.slice(0, sep);
      const side = member.slice(sep + 1);
      if (gameId === '' || (side !== 'w' && side !== 'b')) {
        await this.redis.srem(ClockStore.GONE_INDEX, member);
        continue;
      }
      const raw = await this.redis.get(this.goneKey(gameId, side));
      if (raw === null) {
        await this.redis.srem(ClockStore.GONE_INDEX, member);
        continue;
      }
      const atMs = Number(raw);
      if (!Number.isFinite(atMs)) {
        await this.clearGone(gameId, side);
        continue;
      }
      out.push({ gameId, side, atMs });
    }
    return out;
  }
}
