import type { NotificationChannelAdapter } from './channels/channel.port';
import type { NotificationRepository } from './notification.repository';
import { eligibleChannels, NotificationService } from './notification.service';
import type {
  NotificationChannelValue,
  NotificationRow,
  RecipientUser,
} from './notification.types';

/**
 * Orkestratsiya mantiqi — kanal tanlash (sof) va ikki fazali dispatch.
 *
 * Mock siyosati (docs/13-testing-strategy.md): repository — modul ichki
 * chegarasi, DB'siz unit testda mock qilinadi; DB bilan to'liq oqim
 * integration'da (test/integration/notification.spec.ts).
 */

function user(overrides: Partial<RecipientUser> = {}): RecipientUser {
  return {
    id: 'u1',
    email: 'a@test.uz',
    emailVerified: true,
    locale: 'uz-Latn',
    ...overrides,
  };
}

function adapter(
  channel: NotificationChannelValue,
  overrides: Partial<Pick<NotificationChannelAdapter, 'enabled' | 'canDeliverTo'>> = {},
): Pick<NotificationChannelAdapter, 'channel' | 'enabled' | 'canDeliverTo'> {
  return {
    channel,
    enabled: true,
    canDeliverTo: () => true,
    ...overrides,
  };
}

describe('eligibleChannels (sof kanal tanlash)', () => {
  it("yoqilgan va yetkaza oladigan kanallar o'tadi", () => {
    const map = new Map([
      ['IN_APP', adapter('IN_APP')],
      ['EMAIL', adapter('EMAIL')],
    ] as const);
    expect(eligibleChannels(['IN_APP', 'EMAIL'], map, user())).toEqual(['IN_APP', 'EMAIL']);
  });

  it("o'chirilgan kanal (provider-gating) qatorga aylanmaydi", () => {
    const map = new Map([
      ['IN_APP', adapter('IN_APP')],
      ['SMS', adapter('SMS', { enabled: false })],
    ] as const);
    expect(eligibleChannels(['IN_APP', 'SMS'], map, user())).toEqual(['IN_APP']);
  });

  it("EMAIL tasdiqlanmagan manzilga tanlanmaydi (canDeliverTo)", () => {
    const map = new Map([
      ['IN_APP', adapter('IN_APP')],
      ['EMAIL', adapter('EMAIL', { canDeliverTo: (u) => u.email !== null && u.emailVerified })],
    ] as const);
    expect(eligibleChannels(['IN_APP', 'EMAIL'], map, user({ emailVerified: false }))).toEqual([
      'IN_APP',
    ]);
    expect(eligibleChannels(['IN_APP', 'EMAIL'], map, user({ email: null }))).toEqual(['IN_APP']);
  });

  it("adapteri yo'q kanal jimgina tushib qoladi", () => {
    const map = new Map([['IN_APP', adapter('IN_APP')]] as const);
    expect(eligibleChannels(['IN_APP', 'TELEGRAM'], map, user())).toEqual(['IN_APP']);
  });
});

describe('NotificationService.notifyUsers (dispatch)', () => {
  function row(overrides: Partial<NotificationRow>): NotificationRow {
    return {
      id: 'n1',
      userId: 'u1',
      channel: 'IN_APP',
      templateKey: 'round.completed',
      payload: { eventId: 'e1' },
      sentAt: null,
      readAt: null,
      failedAt: null,
      failureReason: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  interface RepoMock {
    recipientsByIds: jest.Mock;
    createBatchIdempotent: jest.Mock;
    markSent: jest.Mock;
    markFailed: jest.Mock;
  }

  function makeService(
    repo: RepoMock,
    adapters: NotificationChannelAdapter[],
  ): NotificationService {
    return new NotificationService(repo as unknown as NotificationRepository, adapters);
  }

  const fullAdapter = (
    channel: NotificationChannelValue,
    send: jest.Mock,
    overrides: Partial<NotificationChannelAdapter> = {},
  ): NotificationChannelAdapter => ({
    channel,
    enabled: true,
    canDeliverTo: () => true,
    send: send,
    ...overrides,
  });

  it("muvaffaqiyatli yetkazish → markSent; kanal xatosi → markFailed, THROW YO'Q", async () => {
    const inAppSend = jest.fn().mockResolvedValue(undefined);
    const emailSend = jest.fn().mockRejectedValue(new Error('SMTP down'));
    const repo: RepoMock = {
      recipientsByIds: jest.fn().mockResolvedValue([user()]),
      createBatchIdempotent: jest.fn().mockResolvedValue([
        row({ id: 'n1', channel: 'IN_APP' }),
        row({ id: 'n2', channel: 'EMAIL' }),
      ]),
      markSent: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const service = makeService(repo, [
      fullAdapter('IN_APP', inAppSend),
      fullAdapter('EMAIL', emailSend),
    ]);

    // Email yiqilsa ham promise RESOLVE bo'ladi — event loop'ga xato otilmaydi.
    const created = await service.notifyUsers({
      eventId: 'e1',
      templateKey: 'round.completed',
      payload: { roundNumber: 1 },
      userIds: ['u1'],
      channels: ['IN_APP', 'EMAIL'],
    });

    expect(created).toBe(2);
    expect(repo.markSent).toHaveBeenCalledWith('n1');
    expect(repo.markFailed).toHaveBeenCalledWith('n2', 'SMTP down');
  });

  it('dedupe: repository [] qaytarsa dispatch UMUMAN chaqirilmaydi', async () => {
    const send = jest.fn();
    const repo: RepoMock = {
      recipientsByIds: jest.fn().mockResolvedValue([user()]),
      createBatchIdempotent: jest.fn().mockResolvedValue([]),
      markSent: jest.fn(),
      markFailed: jest.fn(),
    };
    const service = makeService(repo, [fullAdapter('IN_APP', send)]);

    const created = await service.notifyUsers({
      eventId: 'e1',
      templateKey: 'round.completed',
      payload: {},
      userIds: ['u1'],
      channels: ['IN_APP'],
    });

    expect(created).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(repo.markSent).not.toHaveBeenCalled();
  });

  it("qabul qiluvchi topilmasa (o'chirilgan user) yozuv ham yaratilmaydi", async () => {
    const repo: RepoMock = {
      recipientsByIds: jest.fn().mockResolvedValue([]),
      createBatchIdempotent: jest.fn(),
      markSent: jest.fn(),
      markFailed: jest.fn(),
    };
    const service = makeService(repo, []);

    const created = await service.notifyUsers({
      eventId: 'e1',
      templateKey: 'round.completed',
      payload: {},
      userIds: ['ghost'],
      channels: ['IN_APP'],
    });

    expect(created).toBe(0);
    expect(repo.createBatchIdempotent).not.toHaveBeenCalled();
  });

  it("DB yozuv xatosi TASHQARIGA chiqadi (outbox retry, ADR-0008) — dispatch emas", async () => {
    const repo: RepoMock = {
      recipientsByIds: jest.fn().mockResolvedValue([user()]),
      createBatchIdempotent: jest.fn().mockRejectedValue(new Error('DB down')),
      markSent: jest.fn(),
      markFailed: jest.fn(),
    };
    const service = makeService(repo, [fullAdapter('IN_APP', jest.fn())]);

    await expect(
      service.notifyUsers({
        eventId: 'e1',
        templateKey: 'round.completed',
        payload: {},
        userIds: ['u1'],
        channels: ['IN_APP'],
      }),
    ).rejects.toThrow('DB down');
  });
});
