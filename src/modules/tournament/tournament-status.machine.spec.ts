import { BusinessRuleError } from '../../core/errors/domain.error';
import {
  assertTransition,
  canTransition,
  TOURNAMENT_STATUSES,
  type TournamentStatus,
} from './tournament-status.machine';

/**
 * Holat mashinasi testlari.
 *
 * Ruxsat etilgan o'tishlar to'plami YOPIQ: quyidagi ro'yxatda bo'lmagan
 * HAR QANDAY (from, to) juftligi taqiqlangan. Ikkala yo'nalish ham
 * tekshiriladi — oq ro'yxat va butun matritsa ustidan inkor.
 */
describe('tournament-status.machine', () => {
  const allowed: readonly (readonly [TournamentStatus, TournamentStatus])[] = [
    ['DRAFT', 'REGISTRATION_OPEN'],
    ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'],
    ['REGISTRATION_CLOSED', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'COMPLETED'],
    ['DRAFT', 'CANCELLED'],
    ['REGISTRATION_OPEN', 'CANCELLED'],
    ['REGISTRATION_CLOSED', 'CANCELLED'],
    ['IN_PROGRESS', 'CANCELLED'],
  ];

  describe('canTransition — ruxsat etilganlar', () => {
    it.each(allowed)('%s → %s ruxsat', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });
  });

  describe("canTransition — taqiqlanganlar (to'liq matritsa inkori)", () => {
    const isAllowed = (from: TournamentStatus, to: TournamentStatus): boolean =>
      allowed.some(([f, t]) => f === from && t === to);

    it("oq ro'yxatdan tashqari HAMMA o'tish taqiqlangan", () => {
      for (const from of TOURNAMENT_STATUSES) {
        for (const to of TOURNAMENT_STATUSES) {
          expect(canTransition(from, to)).toBe(isAllowed(from, to));
        }
      }
    });

    it.each([
      ['DRAFT', 'REGISTRATION_CLOSED'], // bosqich sakrash yo'q
      ['DRAFT', 'IN_PROGRESS'],
      ['DRAFT', 'COMPLETED'],
      ['REGISTRATION_OPEN', 'DRAFT'], // orqaga qaytish yo'q
      ['REGISTRATION_OPEN', 'IN_PROGRESS'],
      ['REGISTRATION_CLOSED', 'REGISTRATION_OPEN'],
      ['IN_PROGRESS', 'REGISTRATION_CLOSED'],
      ['COMPLETED', 'IN_PROGRESS'], // terminal holatdan chiqish yo'q
      ['COMPLETED', 'CANCELLED'],
      ['CANCELLED', 'DRAFT'],
      ['CANCELLED', 'REGISTRATION_OPEN'],
      ['DRAFT', 'DRAFT'], // o'z-o'ziga o'tish ham yo'q
      ['IN_PROGRESS', 'IN_PROGRESS'],
    ] as const)('%s → %s taqiq', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  describe('assertTransition', () => {
    it("ruxsat etilgan o'tishda jim o'tadi", () => {
      expect(() => {
        assertTransition('DRAFT', 'REGISTRATION_OPEN');
      }).not.toThrow();
    });

    it("taqiqlangan o'tishda INVALID_STATUS_TRANSITION tashlaydi", () => {
      expect.assertions(3);
      try {
        assertTransition('COMPLETED', 'IN_PROGRESS');
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessRuleError);
        const domainError = error as BusinessRuleError;
        expect(domainError.code).toBe('INVALID_STATUS_TRANSITION');
        expect(domainError.meta).toEqual({ from: 'COMPLETED', to: 'IN_PROGRESS' });
      }
    });
  });
});
