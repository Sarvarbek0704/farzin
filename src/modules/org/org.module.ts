import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { OrgController } from './org.controller';
import { OrgRepository } from './org.repository';
import { OrgService } from './org.service';

/**
 * Org — federatsiya, viloyat, klub. [CANON 5] #3.
 */
@Module({
  imports: [IdentityModule],
  controllers: [OrgController],
  providers: [OrgService, OrgRepository],
})
export class OrgModule {}
