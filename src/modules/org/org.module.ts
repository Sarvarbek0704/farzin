import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { ORG_PORT } from './org.port';
import { OrgController } from './org.controller';
import { OrgRepository } from './org.repository';
import { OrgService } from './org.service';

/**
 * Org — federatsiya, viloyat, klub. [CANON 5] #3.
 *
 * Boshqa modullar ORG_PORT orqali ishlaydi (docs/02-architecture.md §6.1).
 */
@Module({
  imports: [IdentityModule],
  controllers: [OrgController],
  providers: [OrgService, OrgRepository, { provide: ORG_PORT, useExisting: OrgService }],
  exports: [ORG_PORT],
})
export class OrgModule {}
