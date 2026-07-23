import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/**
 * Audit — global cross-cutting servis (logging va Prisma kabi).
 * Har modul biznes o'zgarishini o'z tranzaksiyasida audit qiladi.
 *
 * @see docs/10-security.md §10
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
