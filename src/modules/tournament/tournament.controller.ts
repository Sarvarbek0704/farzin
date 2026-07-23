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
import type { Page } from '../../shared/pagination/cursor';
import { type Actor, CurrentActor, RequirePermission } from '../identity/rbac.port';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { ListTournamentsQuery } from './dto/list-tournaments.query';
import { RegisterDto } from './dto/register.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { WithdrawRegistrationDto } from './dto/withdraw-registration.dto';
import type { RegistrationRow, SectionRow, TournamentRow } from './tournament.repository';
import { type PublicRegistrationView, TournamentService } from './tournament.service';

/**
 * Tournament endpointlari. O'qish — ochiq (kalendar — ommaviy ma'lumot),
 * yozish — RBAC: guard rol-darajali gate, service scope tekshiruvi
 * yuklangan obyekt bilan (docs/10-security.md §3).
 */
@ApiTags('tournaments')
@Controller()
export class TournamentController {
  constructor(private readonly tournamentService: TournamentService) {}

  // --- Tournament -----------------------------------------------------------

  @Public()
  @Get('tournaments')
  @ApiOperation({ summary: 'Turnir kalendari (cursor pagination, filtrlar)' })
  list(@Query() query: ListTournamentsQuery): Promise<Page<TournamentRow>> {
    return this.tournamentService.listPublic({
      first: query.first,
      after: query.after,
      status: query.status,
      regionId: query.regionId,
    });
  }

  @Public()
  @Get('tournaments/:id')
  @ApiOperation({ summary: "Turnir (ommaviy ko'rinish)" })
  @ApiResponse({ status: 404, description: 'Topilmadi YOKI yopiq/DRAFT — farq bildirilmaydi' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<TournamentRow> {
    return this.tournamentService.getPublicById(id);
  }

  @Post('tournaments')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @RequirePermission('Tournament', 'create')
  @ApiOperation({ summary: 'Turnir yaratish (holat: DRAFT, tashkilotchi: aktor)' })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateTournamentDto): Promise<TournamentRow> {
    return this.tournamentService.create(actor, {
      name: dto.name,
      slug: dto.slug,
      startDate: dto.startDate,
      endDate: dto.endDate,
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.clubId !== undefined && { clubId: dto.clubId }),
      ...(dto.regionId !== undefined && { regionId: dto.regionId }),
      ...(dto.federationId !== undefined && { federationId: dto.federationId }),
      ...(dto.venueName !== undefined && { venueName: dto.venueName }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.registrationOpensAt !== undefined && {
        registrationOpensAt: dto.registrationOpensAt,
      }),
      ...(dto.registrationClosesAt !== undefined && {
        registrationClosesAt: dto.registrationClosesAt,
      }),
      ...(dto.entryFeeAmount !== undefined && { entryFeeAmount: dto.entryFeeAmount }),
      ...(dto.isFideRated !== undefined && { isFideRated: dto.isFideRated }),
      ...(dto.isNationallyRated !== undefined && { isNationallyRated: dto.isNationallyRated }),
      ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
    });
  }

  @Patch('tournaments/:id')
  @ApiBearerAuth('access-token')
  @RequirePermission('Tournament', 'update')
  @ApiOperation({ summary: 'Turnirni tahrirlash — faqat DRAFT/REGISTRATION_OPEN' })
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTournamentDto,
  ): Promise<TournamentRow> {
    return this.tournamentService.update(actor, id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.venueName !== undefined && { venueName: dto.venueName }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.startDate !== undefined && { startDate: dto.startDate }),
      ...(dto.endDate !== undefined && { endDate: dto.endDate }),
      ...(dto.registrationOpensAt !== undefined && {
        registrationOpensAt: dto.registrationOpensAt,
      }),
      ...(dto.registrationClosesAt !== undefined && {
        registrationClosesAt: dto.registrationClosesAt,
      }),
      ...(dto.entryFeeAmount !== undefined && { entryFeeAmount: dto.entryFeeAmount }),
      ...(dto.isFideRated !== undefined && { isFideRated: dto.isFideRated }),
      ...(dto.isNationallyRated !== undefined && { isNationallyRated: dto.isNationallyRated }),
      ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
    });
  }

  @Post('tournaments/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @RequirePermission('Tournament', 'update')
  @ApiOperation({
    summary: "Holat o'tishi (status mashinasi); CANCELLED uchun sabab majburiy",
  })
  changeStatus(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
  ): Promise<TournamentRow> {
    return this.tournamentService.changeStatus(actor, id, dto.status, dto.reason);
  }

  // --- Sections -----------------------------------------------------------------

  @Post('tournaments/:id/sections')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @RequirePermission('TournamentSection', 'create')
  @ApiOperation({ summary: "Seksiya qo'shish — faqat DRAFT holatida" })
  createSection(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSectionDto,
  ): Promise<SectionRow> {
    return this.tournamentService.createSection(actor, id, {
      name: dto.name,
      timeCategory: dto.timeCategory,
      totalRounds: dto.totalRounds,
      clockType: dto.clockType,
      baseTimeSeconds: dto.baseTimeSeconds,
      ...(dto.pairingSystem !== undefined && { pairingSystem: dto.pairingSystem }),
      ...(dto.environment !== undefined && { environment: dto.environment }),
      ...(dto.incrementSeconds !== undefined && { incrementSeconds: dto.incrementSeconds }),
      ...(dto.minRating !== undefined && { minRating: dto.minRating }),
      ...(dto.maxRating !== undefined && { maxRating: dto.maxRating }),
      ...(dto.minBirthYear !== undefined && { minBirthYear: dto.minBirthYear }),
      ...(dto.maxBirthYear !== undefined && { maxBirthYear: dto.maxBirthYear }),
      ...(dto.genderRestriction !== undefined && { genderRestriction: dto.genderRestriction }),
      ...(dto.maxPlayers !== undefined && { maxPlayers: dto.maxPlayers }),
      ...(dto.tieBreakOrder !== undefined && { tieBreakOrder: dto.tieBreakOrder }),
    });
  }

  @Public()
  @Get('tournaments/:id/sections')
  @ApiOperation({ summary: 'Turnir seksiyalari' })
  listSections(@Param('id', ParseUUIDPipe) id: string): Promise<SectionRow[]> {
    return this.tournamentService.listSections(id);
  }

  // --- Registrations --------------------------------------------------------------

  @Post('sections/:sectionId/registrations')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @RequirePermission('Registration', 'create')
  @ApiOperation({
    summary: "O'zini ro'yxatga olish — turnir REGISTRATION_OPEN bo'lishi shart",
  })
  register(
    @CurrentActor() actor: Actor,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    // Body hozircha bo'sh — forbidNonWhitelisted ortiqcha maydonni rad etadi.
    @Body() _dto: RegisterDto,
  ): Promise<RegistrationRow> {
    return this.tournamentService.register(actor, sectionId);
  }

  @Public()
  @Get('sections/:sectionId/registrations')
  @ApiOperation({
    summary: "Ishtirokchilar — faqat tasdiqlangan va chiqmaganlar (ochiq ma'lumot)",
  })
  listRegistrations(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
  ): Promise<PublicRegistrationView[]> {
    return this.tournamentService.listPublicRegistrations(sectionId);
  }

  @Post('registrations/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "Ro'yxatdan chiqarish — o'z ro'yxati yoki mas'ul (sabab majburiy)",
  })
  withdraw(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WithdrawRegistrationDto,
  ): Promise<RegistrationRow> {
    return this.tournamentService.withdraw(actor, id, dto.reason);
  }
}
