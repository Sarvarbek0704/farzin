import { OnlineGameStatus } from '@prisma/client';

import {
  DECISIVE_ONLINE_STATUSES,
  DRAW_ONLINE_STATUSES,
  onlineRatedResult,
  RATED_ONLINE_STATUSES,
} from './online-result-mapping';
import type { OnlineGameStatusValue } from '../play/play.types';

/**
 * Onlayn status → reyting natijasi mapping'i — Prisma enum ustidan
 * TO'LIQ (exhaustive) tekshiruv: schema'ga yangi status qo'shilsa-yu
 * mapping unutilsa, bu test yiqiladi.
 */
describe('online-result-mapping', () => {
  const ALL_STATUSES = Object.values(OnlineGameStatus) as OnlineGameStatusValue[];

  it("Prisma enum'ining HAR BIR qiymati jadvalda aniq tasniflangan", () => {
    const decisive = new Set(DECISIVE_ONLINE_STATUSES);
    const draws = new Set(DRAW_ONLINE_STATUSES);
    const excluded = new Set<OnlineGameStatusValue>(['PENDING', 'ACTIVE', 'ABORTED']);

    for (const status of ALL_STATUSES) {
      const buckets = [decisive.has(status), draws.has(status), excluded.has(status)];
      // Aynan bitta chelakka tushadi — kesishma ham, tushib qolish ham yo'q.
      expect({ status, count: buckets.filter(Boolean).length }).toEqual({ status, count: 1 });
    }
    expect(RATED_ONLINE_STATUSES).toHaveLength(decisive.size + draws.size);
  });

  it.each([
    ['CHECKMATE', 'WHITE', 'WHITE_WIN'],
    ['CHECKMATE', 'BLACK', 'BLACK_WIN'],
    ['RESIGNATION', 'WHITE', 'WHITE_WIN'],
    ['RESIGNATION', 'BLACK', 'BLACK_WIN'],
    ['TIMEOUT', 'WHITE', 'WHITE_WIN'],
    ['TIMEOUT', 'BLACK', 'BLACK_WIN'],
    ['ABANDONED', 'WHITE', 'WHITE_WIN'],
    ['ABANDONED', 'BLACK', 'BLACK_WIN'],
  ] as const)('%s + winner=%s → %s', (status, winner, expected) => {
    expect(onlineRatedResult(status, winner)).toBe(expected);
  });

  it.each([
    'STALEMATE',
    'DRAW_AGREED',
    'THREEFOLD_REPETITION',
    'FIFTY_MOVE_RULE',
    'INSUFFICIENT_MATERIAL',
    'TIMEOUT_VS_INSUFFICIENT_MATERIAL',
  ] as const)("%s → DRAW (winnerColor'dan qat'i nazar)", (status) => {
    expect(onlineRatedResult(status, null)).toBe('DRAW');
    // Durang statusida winnerColor bo'lishi anomaliya — baribir DRAW.
    expect(onlineRatedResult(status, 'WHITE')).toBe('DRAW');
  });

  it.each(['PENDING', 'ACTIVE', 'ABORTED'] as const)('%s → null (reytingga kirmaydi)', (status) => {
    expect(onlineRatedResult(status, null)).toBeNull();
    expect(onlineRatedResult(status, 'WHITE')).toBeNull();
  });

  it("g'olibsiz ABANDONED (ikkalasi ketgan) → null — o'ynalgan natija yo'q", () => {
    expect(onlineRatedResult('ABANDONED', null)).toBeNull();
  });

  it("hal qiluvchi statusda g'olibsiz qator (ma'lumot anomaliyasi) → null", () => {
    expect(onlineRatedResult('CHECKMATE', null)).toBeNull();
    expect(onlineRatedResult('TIMEOUT', null)).toBeNull();
    expect(onlineRatedResult('RESIGNATION', null)).toBeNull();
  });
});
