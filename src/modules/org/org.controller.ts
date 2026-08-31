import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../shared/auth/public.decorator';
import { type Actor, CurrentActor, RequirePermission } from '../identity/rbac.port';
import { CreateClubDto, CreateFederationDto, CreateRegionDto, UpdateClubDto } from './dto/org.dtos';
import type { ClubRow, FederationRow, RegionRow } from './org.repository';
import { OrgService } from './org.service';

/**
 * Org endpointlari. O'qish — ochiq (kalendar/katalog ma'lumoti),
 * yozish — RBAC: guard rol-darajali gate, service scope tekshiruvi.
 */
@ApiTags('org')
@Controller()
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  // --- Federations ----------------------------------------------------------

  @Public()
  @Get('federations')
  @ApiOperation({ summary: 'Federatsiyalar' })
  listFederations(): Promise<FederationRow[]> {
    return this.orgService.listFederations();
  }

  @Post('federations')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @RequirePermission('Federation', 'create')
  @ApiOperation({ summary: 'Federatsiya yaratish (faqat SUPER_ADMIN)' })
  @ApiResponse({ status: 404, description: "Ruxsat yo'q (403 emas — oshkor qilmaslik)" })
  createFederation(
    @CurrentActor() actor: Actor,
    @Body() dto: CreateFederationDto,
  ): Promise<FederationRow> {
    return this.orgService.createFederation(actor, dto);
  }

  // --- Regions ----------------------------------------------------------------

  @Public()
  @Get('regions')
  @ApiOperation({ summary: 'Viloyatlar' })
  listRegions(@Query('federationId') federationId?: string): Promise<RegionRow[]> {
    return this.orgService.listRegions(federationId);
  }

  @Post('regions')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @RequirePermission('Region', 'create')
  @ApiOperation({ summary: 'Viloyat yaratish (SUPER_ADMIN, FEDERATION_ADMIN)' })
  createRegion(@CurrentActor() actor: Actor, @Body() dto: CreateRegionDto): Promise<RegionRow> {
    return this.orgService.createRegion(actor, {
      federationId: dto.federationId,
      name: dto.name,
      soatoCode: dto.soatoCode,
    });
  }

  // --- Clubs --------------------------------------------------------------------

  @Public()
  @Get('clubs')
  @ApiOperation({ summary: 'Klublar' })
  listClubs(@Query('regionId') regionId?: string): Promise<ClubRow[]> {
    return this.orgService.listClubs(regionId);
  }

  @Public()
  @Get('clubs/:id')
  @ApiOperation({ summary: 'Klub' })
  getClub(@Param('id', ParseUUIDPipe) id: string): Promise<ClubRow> {
    return this.orgService.getClub(id);
  }

  @Post('clubs')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @RequirePermission('Club', 'create')
  @ApiOperation({ summary: 'Klub yaratish' })
  createClub(@CurrentActor() actor: Actor, @Body() dto: CreateClubDto): Promise<ClubRow> {
    return this.orgService.createClub(actor, {
      regionId: dto.regionId,
      name: dto.name,
      slug: dto.slug,
      address: dto.address,
      contactPhone: dto.contactPhone,
      contactEmail: dto.contactEmail,
    });
  }

  @Patch('clubs/:id')
  @ApiBearerAuth('access-token')
  @RequirePermission('Club', 'update')
  @ApiOperation({ summary: "Klubni tahrirlash — faqat o'z qamrovida (IDOR himoyasi)" })
  updateClub(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClubDto,
  ): Promise<ClubRow> {
    return this.orgService.updateClub(actor, id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone }),
      ...(dto.contactEmail !== undefined && { contactEmail: dto.contactEmail }),
    });
  }
}
