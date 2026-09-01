import { BusinessRuleError } from '../../core/errors/domain.error';
import { assertTimeCategoryMatches } from './time-control.guard';

describe('assertTimeCategoryMatches', () => {
  it('mos kelsa — o`tkazadi', () => {
    expect(() => {
      assertTimeCategoryMatches({
        timeCategory: 'BLITZ',
        baseTimeSeconds: 300,
        incrementSeconds: 0,
      });
    }).not.toThrow();
  });

  it('K-19 hujumi: 30 daqiqalik o`yin "BULLET" deb yuborilsa — RAD', () => {
    expect(() => {
      assertTimeCategoryMatches({
        timeCategory: 'BULLET',
        baseTimeSeconds: 30 * 60,
        incrementSeconds: 0,
      });
    }).toThrow(BusinessRuleError);
  });

  it('xato kutilgan kategoriyani AYTADI — klient nima yuborishini bilsin', () => {
    try {
      assertTimeCategoryMatches({
        timeCategory: 'BULLET',
        baseTimeSeconds: 30 * 60,
        incrementSeconds: 0,
      });
      throw new Error('xato kutilgan edi');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).code).toBe('TIME_CATEGORY_MISMATCH');
      expect((e as Error).message).toContain('CLASSICAL');
    }
  });

  it('teskari yo`nalish ham yopiq: 1 daqiqalik o`yin "CLASSICAL" emas', () => {
    expect(() => {
      assertTimeCategoryMatches({
        timeCategory: 'CLASSICAL',
        baseTimeSeconds: 60,
        incrementSeconds: 0,
      });
    }).toThrow(BusinessRuleError);
  });

  it('chegaradagi qiymat: 10 daqiqa BLITZ, RAPID emas', () => {
    expect(() => {
      assertTimeCategoryMatches({
        timeCategory: 'BLITZ',
        baseTimeSeconds: 600,
        incrementSeconds: 0,
      });
    }).not.toThrow();

    expect(() => {
      assertTimeCategoryMatches({
        timeCategory: 'RAPID',
        baseTimeSeconds: 600,
        incrementSeconds: 0,
      });
    }).toThrow(BusinessRuleError);
  });
});
