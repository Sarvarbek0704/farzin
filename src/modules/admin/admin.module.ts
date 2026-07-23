import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { AuditLogController } from './audit-log.controller';
import { AuditLogRepository } from './audit-log.repository';

/**
 * Admin — back-office. [CANON 5] #16.
 * Hozircha: audit log ko'rish. Keyin: feature flag boshqaruvi, break-glass.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AuditLogController],
  providers: [AuditLogRepository],
})
export class AdminModule {}
