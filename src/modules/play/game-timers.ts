import { Injectable, type OnModuleDestroy } from '@nestjs/common';

import type { ClockSide } from '../../core/clock/chess-clock';
import type { ClockPayload, TimeCategoryValue } from './play.types';

/**
 * O'yin taymerlari registri — proaktiv flag, diskonnekt grace va
 * clock_update tick'lari (docs/07-realtime-and-clock.md §3.5, §3.7, §3.8).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  DIZAYN:
 *   - Bu sinf FAQAT setTimeout/setInterval bufeti: har o'yin uchun handle
 *     saqlaydi, eskisini tozalab yangisini qo'yadi. Biznes qarori (flag
 *     bormi, abandon qilinsinmi) chaqiruvchida — callback ichida.
 *   - Sof yordamchilar (flagDelayMs, graceMsFor) alohida funksiya qilib
 *     chiqarilgan — ular vaqt manbaisiz, unit testda tekshiriladi.
 *
 *  MULTI-INSTANCE HALOLLIGI (docs/07 §10.3 hali BAJARILMAGAN):
 *   - Flag taymeri OXIRGI yurishni qabul qilgan instance'da yashaydi.
 *     Instance o'lsa proaktiv yo'l yo'qoladi, lekin REAKTIV yo'l
 *     (game:claim_timeout, §3.5 1-yo'l) baribir ishlaydi — o'yin abadiy
 *     ACTIVE qolib ketmaydi, faqat flag e'loni raqib da'vosiga qoladi.
 *   - Grace taymeri socket ushlab turgan instance'da. ownerNodeId affinity
 *     va forward (§10.3) — keyingi bosqich; hozircha bitta instance rejimi.
 *   - Broadcast server.to(room) orqali — Redis adapter ulanganda (§10.1)
 *     bu barcha instance'larga yetadi, taymer joylashuvi o'zgarmaydi.
 *
 *  TAYMER OQMASLIGI (jest open-handle xavfsizligi): har finish/abort/
 *  resign'da chaqiruvchi clearGame() qiladi; onModuleDestroy BARCHA
 *  handle'larni bekor qiladi — app.close() dan keyin event loop toza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Flag tekshiruvi zaxira vaqti (ms): taymer qolgan vaqt + epsilon'da uyg'onadi
 * — chegara holatida (elapsed === remaining hali flag EMAS, chess-clock
 * hujjati) bir tsikl oldin uyg'onib bekor ishlamaslik uchun.
 */
export const FLAG_EPSILON_MS = 100;

/** clock_update sinxron tick oralig'i (docs/07 §3.7 — "har N soniyada"). */
export const CLOCK_TICK_INTERVAL_MS = 5_000;

/**
 * Diskonnekt grace davrlari — docs/07 §3.8 DISCONNECT_POLICIES jadvalidan
 * AYNAN olingan boshlang'ich qiymatlar (hujjatning o'zi halol tan oladi:
 * ular o'lchovga emas, taxminga asoslangan — real telemetriya bilan
 * sozlanadi). Kategoriya nomlari bizning TimeCategory enum'iga moslangan.
 */
export const DISCONNECT_GRACE_MS: Readonly<Record<TimeCategoryValue, number>> = {
  BULLET: 10_000,
  BLITZ: 15_000,
  RAPID: 30_000,
  CLASSICAL: 120_000,
};

/**
 * Grace davri: env override (PLAY_DISCONNECT_GRACE_MS — testlar qisqa grace
 * bilan abandonment oqimini tekshiradi, ops ham vaqtincha burashi mumkin)
 * yoki §3.8 jadvali.
 */
export function graceMsFor(category: TimeCategoryValue, overrideMs: number | null): number {
  return overrideMs ?? DISCONNECT_GRACE_MS[category];
}

/**
 * Yurishdan keyingi flag taymeri kechikishi: yurayotgan tomonning qolgan
 * vaqti + epsilon. Soat to'xtagan bo'lsa (running=null — o'yin tugagan
 * yoki hali boshlanmagan) taymer KERAK EMAS → null.
 */
export function flagDelayMs(clock: ClockPayload): number | null {
  if (clock.running === null) {
    return null;
  }
  const remainingMs = clock.running === 'w' ? clock.whiteMs : clock.blackMs;
  return Math.max(0, remainingMs) + FLAG_EPSILON_MS;
}

@Injectable()
export class GameTimers implements OnModuleDestroy {
  private readonly flags = new Map<string, NodeJS.Timeout>();
  private readonly ticks = new Map<string, NodeJS.Timeout>();
  private readonly graces = new Map<string, NodeJS.Timeout>();

  private graceKey(gameId: string, side: ClockSide): string {
    return `${gameId}:${side}`;
  }

  // --- Flag (docs/07 §3.5 proaktiv yo'l) -----------------------------------

  /** Har yurishda QAYTA qo'yiladi — eski handle avval tozalanadi. */
  scheduleFlag(gameId: string, delayMs: number, cb: () => void): void {
    this.clearFlag(gameId);
    this.flags.set(gameId, setTimeout(cb, delayMs));
  }

  clearFlag(gameId: string): void {
    const handle = this.flags.get(gameId);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.flags.delete(gameId);
    }
  }

  // --- clock_update tick (docs/07 §3.7) ------------------------------------

  /** Idempotent: mavjud tick bo'lsa yangisi qo'yilmaydi. */
  startTick(gameId: string, intervalMs: number, cb: () => void): void {
    if (this.ticks.has(gameId)) {
      return;
    }
    this.ticks.set(gameId, setInterval(cb, intervalMs));
  }

  stopTick(gameId: string): void {
    const handle = this.ticks.get(gameId);
    if (handle !== undefined) {
      clearInterval(handle);
      this.ticks.delete(gameId);
    }
  }

  // --- Diskonnekt grace (docs/07 §3.8, §8) ---------------------------------

  scheduleGrace(gameId: string, side: ClockSide, delayMs: number, cb: () => void): void {
    this.clearGrace(gameId, side);
    this.graces.set(this.graceKey(gameId, side), setTimeout(cb, delayMs));
  }

  /** @returns true — kutayotgan grace bor edi va bekor qilindi (reconnect). */
  clearGrace(gameId: string, side: ClockSide): boolean {
    const key = this.graceKey(gameId, side);
    const handle = this.graces.get(key);
    if (handle === undefined) {
      return false;
    }
    clearTimeout(handle);
    this.graces.delete(key);
    return true;
  }

  // --- Umumiy tozalash ------------------------------------------------------

  /** O'yin tugadi — unga tegishli BARCHA taymerlar bekor. */
  clearGame(gameId: string): void {
    this.clearFlag(gameId);
    this.stopTick(gameId);
    this.clearGrace(gameId, 'w');
    this.clearGrace(gameId, 'b');
  }

  /** Jest open-handle xavfsizligi: app.close() → hech qanday handle qolmaydi. */
  onModuleDestroy(): void {
    for (const handle of this.flags.values()) {
      clearTimeout(handle);
    }
    for (const handle of this.ticks.values()) {
      clearInterval(handle);
    }
    for (const handle of this.graces.values()) {
      clearTimeout(handle);
    }
    this.flags.clear();
    this.ticks.clear();
    this.graces.clear();
  }
}
