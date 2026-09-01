import { describe, expect, it } from 'vitest';

import { PRESETS, categoryFor, presetLabel } from './time-control';

describe('categoryFor', () => {
  it('3 daqiqadan kam — bullet (onlayn konventsiyasi)', () => {
    expect(categoryFor(60, 0)).toBe('BULLET');
    expect(categoryFor(60, 1)).toBe('BULLET'); // 60 + 60 = 120 < 180
    // 2+1: 120 + 60 = AYNAN 180 -> blits. Lichess uni bullet deydi
    // (u base + 40 x inc ishlatadi), biz FIDE ning 60 x inc formulasida
    // qolamiz: bitta formulani oxirigacha qo`llash aralashtirishdan afzal.
    expect(categoryFor(120, 1)).toBe('BLITZ');
  });

  it('increment umumiy vaqtga 60 barobar qo`shiladi (FIDE formulasi)', () => {
    // 60 + 60x2 = 180 -> bullet EMAS. Increment'siz 60s bullet edi.
    expect(categoryFor(60, 0)).toBe('BULLET');
    expect(categoryFor(60, 2)).toBe('BLITZ');
  });

  it('3+0 = 180s — blits, bullet emas (chegara ochiq)', () => {
    expect(categoryFor(180, 0)).toBe('BLITZ');
  });

  it('FIDE: 10 daqiqa va undan kam — blits', () => {
    expect(categoryFor(600, 0)).toBe('BLITZ');
    expect(categoryFor(599, 0)).toBe('BLITZ');
  });

  it('FIDE: 10 dan ko`p, 60 dan kam — rapid', () => {
    expect(categoryFor(601, 0)).toBe('RAPID');
    expect(categoryFor(900, 10)).toBe('RAPID'); // 15+10 = 1500s
    expect(categoryFor(3599, 0)).toBe('RAPID');
  });

  it('60 daqiqa va undan ko`p — klassik', () => {
    expect(categoryFor(3600, 0)).toBe('CLASSICAL');
    expect(categoryFor(5400, 30)).toBe('CLASSICAL'); // 90+30
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
