import { onlineTimeCategory } from './time-category';

/**
 * Chegaralar manbai: docs/06-rating-system.md §5 jadvali (ONLINE qatorlari)
 * va §5.1 formulasi. OTB chegaralari BOSHQA (klassik ≥ 60 daqiqa) —
 * bu funksiya faqat onlayn uchun.
 */
describe('onlineTimeCategory', () => {
  describe("TZ dagi aniq misollar (docs/06:677)", () => {
    it('90+30 → 120 daqiqa → klassik', () => {
      expect(onlineTimeCategory(90 * 60, 30)).toBe('CLASSICAL');
    });

    it('3+2 → 5 daqiqa → blits', () => {
      expect(onlineTimeCategory(3 * 60, 2)).toBe('BLITZ');
    });
  });

  describe('chegaralar (docs/06 §5 jadvali)', () => {
    it('3 daqiqadan KAM — bullet', () => {
      expect(onlineTimeCategory(60, 0)).toBe('BULLET'); // 1 daqiqa
      expect(onlineTimeCategory(119, 0)).toBe('BULLET');
      expect(onlineTimeCategory(60, 1)).toBe('BULLET'); // 1 + 1 = 2 daqiqa
    });

    it('aynan 3 daqiqa — blits, bullet EMAS', () => {
      expect(onlineTimeCategory(180, 0)).toBe('BLITZ');
      expect(onlineTimeCategory(120, 1)).toBe('BLITZ'); // 2 + 1 = 3
    });

    it('3–10 daqiqa — blits, 10 ning O`ZI ham blits (FIDE: ≤ 10)', () => {
      expect(onlineTimeCategory(300, 0)).toBe('BLITZ');
      expect(onlineTimeCategory(600, 0)).toBe('BLITZ');
      expect(onlineTimeCategory(180, 7)).toBe('BLITZ'); // 3 + 7 = 10
    });

    it('10 dan ko`p, 30 dan kam — rapid', () => {
      expect(onlineTimeCategory(601, 0)).toBe('RAPID');
      expect(onlineTimeCategory(900, 10)).toBe('RAPID'); // 15 + 10 = 25
      expect(onlineTimeCategory(29 * 60, 0)).toBe('RAPID');
    });

    it('ONLAYN klassik 30 daqiqadan boshlanadi — OTB dagi 60 emas', () => {
      expect(onlineTimeCategory(30 * 60, 0)).toBe('CLASSICAL');
      expect(onlineTimeCategory(20 * 60, 10)).toBe('CLASSICAL'); // 20 + 10 = 30
      // Ayni shu joyda OTB jadvalidan farq bor: OTB da 30 daqiqa hali
      // RAPID. Onlayn o'yinlar uchun docs/06 §5 ONLINE_CLASSICAL ni
      // "≥ 30 min" deb belgilaydi.
      expect(onlineTimeCategory(45 * 60, 0)).toBe('CLASSICAL');
    });
  });

  it('increment daqiqaga 1:1 qo`shiladi (docs/06 §5.1 formulasi)', () => {
    // 1+0 = 1 daqiqa (bullet), 1+2 = 3 daqiqa (blits).
    expect(onlineTimeCategory(60, 0)).toBe('BULLET');
    expect(onlineTimeCategory(60, 2)).toBe('BLITZ');
  });
});
