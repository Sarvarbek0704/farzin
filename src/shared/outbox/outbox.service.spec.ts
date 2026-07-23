import { backoffDelayMs, OUTBOX_EVENT_TYPES, OutboxService } from './outbox.service';

describe('OutboxService', () => {
  describe('backoffDelayMs', () => {
    it('eksponensial o\'sadi: 2s, 4s, 8s...', () => {
      expect(backoffDelayMs(1)).toBe(2_000);
      expect(backoffDelayMs(2)).toBe(4_000);
      expect(backoffDelayMs(3)).toBe(8_000);
    });

    it("5 daqiqadan oshmaydi (cap)", () => {
      expect(backoffDelayMs(9)).toBe(5 * 60 * 1_000);
      expect(backoffDelayMs(50)).toBe(5 * 60 * 1_000);
      expect(backoffDelayMs(1_000)).toBe(5 * 60 * 1_000);
    });

    it('manfiy bo\'lmaydi va chekli', () => {
      for (let i = 0; i <= 100; i += 1) {
        const delay = backoffDelayMs(i);
        expect(delay).toBeGreaterThan(0);
        expect(Number.isFinite(delay)).toBe(true);
      }
    });
  });

  describe("ro'yxat qat'iyligi (ADR-0008)", () => {
    it('faqat 5 ta kritik event turi ruxsatli', () => {
      expect([...OUTBOX_EVENT_TYPES].sort()).toEqual(
        [
          'FairPlayCaseOpened',
          'PaymentCompleted',
          'RatingRecomputed',
          'RefundIssued',
          'RoundCompleted',
        ].sort(),
      );
    });

    it("ro'yxatdan tashqari event turi rad etiladi", async () => {
      const service = new OutboxService();
      const tx = {
        outboxEvent: {
          create: jest.fn(),
        },
      };

      await expect(
        service.enqueue(tx as never, {
          // Ataylab noto'g'ri tur — runtime himoyani tekshiramiz
          eventType: 'PlayerProfileUpdated' as never,
          aggregateType: 'Player',
          aggregateId: '019-test',
          payload: {},
        }),
      ).rejects.toMatchObject({ code: 'OUTBOX_EVENT_NOT_ALLOWED' });

      expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    });

    it('ruxsatli event yoziladi', async () => {
      const service = new OutboxService();
      const tx = {
        outboxEvent: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      await service.enqueue(tx as never, {
        eventType: 'RoundCompleted',
        aggregateType: 'Round',
        aggregateId: '019-round',
        payload: { roundId: '019-round' },
      });

      expect(tx.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventType: 'RoundCompleted' }) as unknown,
      });
    });
  });
});
