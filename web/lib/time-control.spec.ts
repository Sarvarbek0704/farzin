import { describe, expect, it } from 'vitest';

import { PRESETS, categoryFor, presetLabel } from './time-control';

/**
 * Bu testlar server tomonidagi `src/core/clock/time-category.spec.ts`
 * bilan JUFTLIKDA turadi: ikkala tomon docs/06 §5 ning ONLINE
 * chegaralarini bir xil qo'llashi shart. Server mos kelmagan
 * kategoriyani 422 bilan rad etadi.
 */
describe('categoryFor', () => {
  it('3 daqiqadan kam — bullet', () => {
    expect(categoryFor(60, 0)).toBe('BULLET');
    expect(categoryFor(60, 1)).toBe('BULLET'); // 1 + 1 = 2 daqiqa
    expect(categoryFor(119, 0)).toBe('BULLET');
  });

  it('increment daqiqaga 1:1 qo`shiladi (docs/06 §5.1)', () => {
    // 1+0 bullet edi; 1+2 esa 3 daqiqa -> blits.
    expect(categoryFor(60, 2)).toBe('BLITZ');
  });

  it('aynan 3 daqiqa — blits, bullet emas', () => {
    expect(categoryFor(180, 0)).toBe('BLITZ');
    expect(categoryFor(120, 1)).toBe('BLITZ'); // 2 + 1 = 3
  });

  it('10 daqiqaning O`ZI ham blits (FIDE: 10 va undan kam)', () => {
    expect(categoryFor(600, 0)).toBe('BLITZ');
    expect(categoryFor(180, 7)).toBe('BLITZ'); // 3 + 7 = 10
  });

  it('10 dan ko`p, 30 dan kam — rapid', () => {
    expect(categoryFor(601, 0)).toBe('RAPID');
    expect(categoryFor(900, 10)).toBe('RAPID'); // 15 + 10 = 25
    expect(categoryFor(29 * 60, 0)).toBe('RAPID');
  });

  it('ONLAYN klassik 30 daqiqadan — OTB dagi 60 dan emas', () => {
    expect(categoryFor(30 * 60, 0)).toBe('CLASSICAL');
    expect(categoryFor(20 * 60, 10)).toBe('CLASSICAL'); // 20 + 10 = 30
    expect(categoryFor(45 * 60, 0)).toBe('CLASSICAL');
  });
});

describe('PRESETS', () => {
  it('barchasi backend DTO chegarasiga sig`adi (base 15..21600, inc 0..180)', () => {
    for (const p of PRESETS) {
      expect(p.baseSeconds).toBeGreaterThanOrEqual(15);
      expect(p.baseSeconds).toBeLessThanOrEqual(21_600);
      expect(p.incrementSeconds).toBeGreaterThanOrEqual(0);
      expect(p.incrementSeconds).toBeLessThanOrEqual(180);
    }
  });

  it('takrorlanmaydi — bir xil chelakka ikki tugma bo`lmasin', () => {
    const keys = PRESETS.map((p) => `${String(p.baseSeconds)}:${String(p.incrementSeconds)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('presetLabel', () => {
  it('daqiqa + increment', () => {
    expect(presetLabel({ baseSeconds: 180, incrementSeconds: 2 })).toBe('3+2');
    expect(presetLabel({ baseSeconds: 60, incrementSeconds: 0 })).toBe('1+0');
    expect(presetLabel({ baseSeconds: 900, incrementSeconds: 10 })).toBe('15+10');
  });

  it('butun bo`lmagan daqiqa yaxlitlanib yolg`on ko`rsatmaydi', () => {
    expect(presetLabel({ baseSeconds: 90, incrementSeconds: 0 })).toBe('1.5+0');
  });
});
