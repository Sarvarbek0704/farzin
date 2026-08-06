import { Injectable } from '@nestjs/common';

import { BusinessRuleError } from '../../../core/errors/domain.error';
import type { NotificationRow, RecipientUser } from '../notification.types';
import type { NotificationChannelAdapter } from './channel.port';

/**
 * PUSH kanal — STUB (billing ClickProvider pretsedenti: PROVIDER_NOT_CONFIGURED).
 *
 * TODO(notification): implementatsiyadan OLDIN majburiy shartlar:
 *  1. FCM xizmat hisobi (FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY —
 *     .env.example'da o'rni ajratilgan) va firebase-admin SDK qarori.
 *  2. Qurilma tokenlarini saqlash modeli — schema'da hali JADVAL YO'Q
 *     (device_tokens migratsiyasi kerak); tokensiz push yuborib bo'lmaydi.
 *  3. Rasmiy FCM HTTP v1 hujjati bo'yicha xabar shakli — API BU YERDA
 *     O'YLAB TOPILMAYDI.
 */
@Injectable()
export class PushChannel implements NotificationChannelAdapter {
  readonly channel = 'PUSH' as const;
  readonly enabled = false;

  canDeliverTo(_user: RecipientUser): boolean {
    return false;
  }

  send(_notification: NotificationRow, _user: RecipientUser): Promise<void> {
    return Promise.reject(
      new BusinessRuleError(
        'PROVIDER_NOT_CONFIGURED',
        'PUSH kanali hali sozlanmagan: FCM xizmat hisobi va qurilma token jadvali kerak',
        { channel: this.channel },
      ),
    );
  }
}
