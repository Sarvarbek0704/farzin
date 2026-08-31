import {
  bucketKey,
  currentDelta,
  parseBucketKey,
  DEFAULT_MATCHMAKING_CONFIG,
  type PoolId,
} from './matchmaking.service';

/**
 * Matchmaking'ning SOF qismlari — chelak kaliti va reyting oynasi
 * kengayishi (docs/07-realtime-and-clock.md §9.2, §9.3).
 */
describe('matchmaking logic (pure)', () => {
  const pool: PoolId = {
    timeCategory: 'BLITZ',
    clockType: 'FISCHER_INCREMENT',
    baseTimeSeconds: 180,
    incrementSeconds: 2,
  };

  describe('bucketKey', () => {
    it('prompt formati: game:mm:{tc}:{ct}:{base}:{inc}', () => {
      expect(bucketKey(pool)).toBe('game:mm:BLITZ:FISCHER_INCREMENT:180:2');
    });

    it('parseBucketKey — teskari amal', () => {
      expect(parseBucketKey(bucketKey(pool))).toEqual(pool);
    });

    it('buzuq kalit → null', () => {
      expect(parseBucketKey('game:clock:abc')).toBeNull();
      expect(parseBucketKey('game:mm:BLITZ:FISCHER_INCREMENT:x:2')).toBeNull();
    });
  });

  describe('currentDelta (docs/07 §9.2)', () => {
    const cfg = DEFAULT_MATCHMAKING_CONFIG;

    it("boshlang'ich oyna ±200", () => {
      expect(currentDelta(cfg, 0)).toBe(200);
      expect(currentDelta(cfg, 9_999)).toBe(200);
    });

    it('har 10 soniyada +50 kengayadi', () => {
      expect(currentDelta(cfg, 10_000)).toBe(250);
      expect(currentDelta(cfg, 25_000)).toBe(300);
    });

    it("maxDelta'da to'xtaydi (docs/07 §14.6)", () => {
      expect(currentDelta(cfg, 60_000)).toBe(500);
      expect(currentDelta(cfg, 10 * 60_000)).toBe(500);
    });

    it("manfiy kutish — boshlang'ich oyna (himoya)", () => {
      expect(currentDelta(cfg, -5_000)).toBe(200);
    });
  });
});
