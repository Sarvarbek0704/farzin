import { Injectable } from '@nestjs/common';

import { BusinessRuleError } from '../../../core/errors/domain.error';
import type { NotificationRow, RecipientUser } from '../notification.types';
import type { NotificationChannelAdapter } from './channel.port';

/**
 * TELEGRAM kanal — STUB (billing ClickProvider pretsedenti:
 * PROVIDER_NOT_CONFIGURED).
 *
 * TODO(notification): implementatsiyadan OLDIN majburiy shartlar:
 *  1. TELEGRAM_BOT_TOKEN (.env.example'da o'rni ajratilgan) — BotFather
 *     orqali olinadi; rasmiy Bot API hujjati (core.telegram.org/bots/api)
 *     bo'yicha sendMessage. API BU YERDA O'YLAB TOPILMAYDI.
 *  2. User ↔ Telegram chat_id bog'lash oqimi: OAuthAccount(provider=
 *     'telegram') bor (schema), lekin chat_id saqlash va /start opt-in
 *     oqimi hali yo'q — opt-in'siz yuborib BO'LMAYDI.
 */
@Injectable()
export class TelegramChannel implements NotificationChannelAdapter {
  readonly channel = 'TELEGRAM' as const;
  readonly enabled = false;

  canDeliverTo(_user: RecipientUser): boolean {
    return false;
  }

  send(_notification: NotificationRow, _user: RecipientUser): Promise<void> {
    return Promise.reject(
      new BusinessRuleError(
        'PROVIDER_NOT_CONFIGURED',
        "TELEGRAM kanali hali sozlanmagan: bot token va chat_id bog'lash oqimi kerak",
        { channel: this.channel },
      ),
    );
  }
}
