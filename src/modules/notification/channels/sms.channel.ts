import { Injectable } from '@nestjs/common';

import { BusinessRuleError } from '../../../core/errors/domain.error';
import type { NotificationRow, RecipientUser } from '../notification.types';
import type { NotificationChannelAdapter } from './channel.port';

/**
 * SMS kanal — STUB (billing ClickProvider pretsedenti: PROVIDER_NOT_CONFIGURED).
 *
 * TODO(notification): implementatsiyadan OLDIN majburiy shartlar:
 *  1. Eskiz.uz hisob ma'lumotlari (ESKIZ_EMAIL/ESKIZ_PASSWORD/ESKIZ_FROM —
 *     .env.example'da o'rni ajratilgan) va RASMIY API hujjati
 *     (notify.eskiz.uz). API shakli BU YERDA O'YLAB TOPILMAYDI —
 *     billing Click stub'idagi qoida.
 *  2. User.phone + phoneVerified oqimi (SMS OTP — docs/14-roadmap.md
 *     "Qilinmagan" ro'yxatida) — tasdiqlanmagan raqamga SMS yuborilmaydi.
 *  3. Narx nazorati: SMS pullik — retry siyosati va kunlik limit kerak.
 *
 * Shu shartlargacha: `enabled = false` → service qator ham yaratmaydi;
 * to'g'ridan-to'g'ri chaqiruv PROVIDER_NOT_CONFIGURED bilan yiqiladi.
 */
@Injectable()
export class SmsChannel implements NotificationChannelAdapter {
  readonly channel = 'SMS' as const;
  readonly enabled = false;

  canDeliverTo(_user: RecipientUser): boolean {
    return false;
  }

  send(_notification: NotificationRow, _user: RecipientUser): Promise<void> {
    return Promise.reject(
      new BusinessRuleError(
        'PROVIDER_NOT_CONFIGURED',
        "SMS kanali hali sozlanmagan: Eskiz.uz hisob ma'lumotlari va rasmiy API hujjati kerak",
        { channel: this.channel },
      ),
    );
  }
}
