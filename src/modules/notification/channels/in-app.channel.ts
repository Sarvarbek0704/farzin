import { Injectable } from '@nestjs/common';

import type { NotificationRow, RecipientUser } from '../notification.types';
import type { NotificationChannelAdapter } from './channel.port';

/**
 * IN_APP kanal — DB qatorining o'zi yetkazish: foydalanuvchi
 * GET /notifications bilan o'qiydi. `send` trivially resolve bo'ladi,
 * service darhol markSent (sentAt=now) qiladi.
 *
 * Tashqi bog'liqlik yo'q — har doim yoqilgan.
 */
@Injectable()
export class InAppChannel implements NotificationChannelAdapter {
  readonly channel = 'IN_APP' as const;
  readonly enabled = true;

  canDeliverTo(_user: RecipientUser): boolean {
    return true;
  }

  send(_notification: NotificationRow, _user: RecipientUser): Promise<void> {
    // Qator allaqachon DB'da — yetkazish shu.
    return Promise.resolve();
  }
}
