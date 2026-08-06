import {
  CLOCK_TICK_INTERVAL_MS,
  DISCONNECT_GRACE_MS,
  FLAG_EPSILON_MS,
  flagDelayMs,
  GameTimers,
  graceMsFor,
} from './game-timers';
import type { ClockPayload } from './play.types';

/**
 * Taymer registri va sof yordamchilar — jest fake timers bilan.
 * Biznes qarori (flag bormi) bu qatlamda YO'Q — faqat handle hayoti
 * tekshiriladi: qayta qo'yish eskisini bekor qiladi, clearGame/
 * onModuleDestroy hech narsa qoldirmaydi (jest open-handle xavfsizligi).
 */
describe('game-timers', () => {
  const clock = (running: 'w' | 'b' | null, whiteMs = 5_000, blackMs = 7_000): ClockPayload => ({
    whiteMs,
    blackMs,
    running,
    serverSentAtMs: 0,
  });

  describe('flagDelayMs (sof)', () => {
    it('yurayotgan tomonning qolgan vaqti + epsilon', () => {
      expect(flagDelayMs(clock('w'))).toBe(5_000 + FLAG_EPSILON_MS);
      expect(flagDelayMs(clock('b'))).toBe(7_000 + FLAG_EPSILON_MS);
    });

    it("soat to'xtagan (running=null) → taymer kerak emas", () => {
      expect(flagDelayMs(clock(null))).toBeNull();
    });

    it('manfiy qoldiq 0 ga clamp qilinadi (epsilon qoladi)', () => {
      expect(flagDelayMs(clock('w', -50))).toBe(FLAG_EPSILON_MS);
    });
  });

  describe('graceMsFor (sof, docs/07 §3.8 jadvali)', () => {
    it("override yo'q → kategoriya jadvali", () => {
      expect(graceMsFor('BULLET', null)).toBe(10_000);
      expect(graceMsFor('BLITZ', null)).toBe(15_000);
      expect(graceMsFor('RAPID', null)).toBe(30_000);
      expect(graceMsFor('CLASSICAL', null)).toBe(120_000);
      expect(graceMsFor('BLITZ', null)).toBe(DISCONNECT_GRACE_MS.BLITZ);
    });

    it('override har doim yutadi (test/ops tugmasi)', () => {
      expect(graceMsFor('CLASSICAL', 2_000)).toBe(2_000);
    });
  });

  describe('GameTimers registri', () => {
    let timers: GameTimers;

    beforeEach(() => {
      jest.useFakeTimers();
      timers = new GameTimers();
    });

    afterEach(() => {
      timers.onModuleDestroy();
      jest.useRealTimers();
    });

    it("scheduleFlag: qayta qo'yish ESKISINI bekor qiladi (har yurishda yangi)", () => {
      const first = jest.fn();
      const second = jest.fn();
      timers.scheduleFlag('g1', 1_000, first);
      timers.scheduleFlag('g1', 2_000, second);

      jest.advanceTimersByTime(1_500);
      expect(first).not.toHaveBeenCalled();
      jest.advanceTimersByTime(600);
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('clearFlag: bekor qilingan taymer otilmaydi', () => {
      const cb = jest.fn();
      timers.scheduleFlag('g1', 1_000, cb);
      timers.clearFlag('g1');
      jest.advanceTimersByTime(5_000);
      expect(cb).not.toHaveBeenCalled();
    });

    it("startTick idempotent: ikkinchi chaqiruv ikkinchi interval qo'ymaydi", () => {
      const cb = jest.fn();
      timers.startTick('g1', CLOCK_TICK_INTERVAL_MS, cb);
      timers.startTick('g1', CLOCK_TICK_INTERVAL_MS, cb);
      jest.advanceTimersByTime(CLOCK_TICK_INTERVAL_MS * 2);
      expect(cb).toHaveBeenCalledTimes(2); // 2 tick, 4 emas
      timers.stopTick('g1');
      jest.advanceTimersByTime(CLOCK_TICK_INTERVAL_MS * 2);
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it("grace: clearGrace faqat mavjud bo'lsa true (reconnect aniqlash)", () => {
      const cb = jest.fn();
      timers.scheduleGrace('g1', 'w', 3_000, cb);
      expect(timers.clearGrace('g1', 'w')).toBe(true); // bor edi — reconnect
      expect(timers.clearGrace('g1', 'w')).toBe(false); // endi yo'q
      jest.advanceTimersByTime(10_000);
      expect(cb).not.toHaveBeenCalled();
    });

    it("grace ranglar bo'yicha mustaqil: w bekor bo'lsa b otiladi", () => {
      const wCb = jest.fn();
      const bCb = jest.fn();
      timers.scheduleGrace('g1', 'w', 1_000, wCb);
      timers.scheduleGrace('g1', 'b', 1_000, bCb);
      timers.clearGrace('g1', 'w');
      jest.advanceTimersByTime(1_500);
      expect(wCb).not.toHaveBeenCalled();
      expect(bCb).toHaveBeenCalledTimes(1);
    });

    it("clearGame: o'yinning flag + tick + ikkala grace'i birdan bekor", () => {
      const flag = jest.fn();
      const tick = jest.fn();
      const grace = jest.fn();
      timers.scheduleFlag('g1', 1_000, flag);
      timers.startTick('g1', 1_000, tick);
      timers.scheduleGrace('g1', 'w', 1_000, grace);
      timers.scheduleGrace('g1', 'b', 1_000, grace);

      timers.clearGame('g1');
      jest.advanceTimersByTime(10_000);
      expect(flag).not.toHaveBeenCalled();
      expect(tick).not.toHaveBeenCalled();
      expect(grace).not.toHaveBeenCalled();
    });

    it("clearGame boshqa o'yinga TEGMAYDI", () => {
      const other = jest.fn();
      timers.scheduleFlag('g2', 1_000, other);
      timers.clearGame('g1');
      jest.advanceTimersByTime(1_500);
      expect(other).toHaveBeenCalledTimes(1);
    });

    it("onModuleDestroy: BARCHA handle'lar bekor (open-handle yo'q)", () => {
      const cb = jest.fn();
      timers.scheduleFlag('g1', 1_000, cb);
      timers.startTick('g2', 1_000, cb);
      timers.scheduleGrace('g3', 'b', 1_000, cb);

      timers.onModuleDestroy();
      jest.advanceTimersByTime(10_000);
      expect(cb).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
