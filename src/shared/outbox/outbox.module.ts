import { Global, Module } from '@nestjs/common';

import { OutboxPublisher } from './outbox.publisher';
import { OutboxService } from './outbox.service';

/**
 * Transactional outbox (ADR-0008).
 *
 * OutboxService — yozish (har modul o'z tranzaksiyasida ishlatadi).
 * OutboxPublisher — poll + publish (advisory lock bilan yagona).
 */
@Global()
@Module({
  providers: [OutboxService, OutboxPublisher],
  exports: [OutboxService],
})
export class OutboxModule {}
