import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Page } from '../../shared/pagination/cursor';
import { type Actor, CurrentActor, RequirePermission } from '../identity/rbac.port';
import { DecideAppealDto } from './dto/decide-appeal.dto';
import { DecideCaseDto } from './dto/decide-case.dto';
import { ListCasesQuery } from './dto/list-cases.query';
import { SubmitAppealDto } from './dto/submit-appeal.dto';
import { SubmitReportDto } from './dto/submit-report.dto';
import { FairplayService } from './fairplay.service';
import type {
  AppealRow,
  FairPlayCaseDetail,
  FairPlayCaseOwnView,
  FairPlayCaseRow,
} from './fairplay.types';

/**
 * Fairplay endpointlari — docs/08-fair-play.md.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  KANON: bu API EHTIMOLLIK ko'rsatadi, ISBOT emas (docs/08 §0). Hech bir
 *  endpoint avtomatik jazo bermaydi; sanksiya faqat /decide — odam +
 *  yozma asos. Foydalanuvchiga ko'rinadigan matnlarda "tizim aniqladi"
 *  formulirovkasi YO'Q (docs/08 §10).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Guard qatlami — rol-darajali gate (@RequirePermission); scope va
 * "commission vs own" semantikasi service'da (docs/10-security.md §3).
 * CLUB_ADMIN'da FairPlayCase granti YO'Q → guard 404 (bosim vektori,
 * docs/08 §6.3).
 */
@ApiTags('fairplay')
@Controller()
export class FairplayController {
  constructor(private readonly service: FairplayService) {}

  // --- Shikoyat -----------------------------------------------------------------

  @Post('fairplay/reports')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "O'yin haqida shikoyat — signal + tahlil navbati (javobda ish ID'si YO'Q)",
  })
  @ApiResponse({ status: 422, description: 'SUSPECT_REQUIRED | SUSPECT_NOT_IN_GAME | SELF_REPORT' })
  submitReport(
    @CurrentActor() actor: Actor,
    @Body() dto: SubmitReportDto,
  ): Promise<{ received: true }> {
    return this.service.submitReport(actor, {
      gameId: dto.gameId,
      reason: dto.reason,
      suspectPlayerId: dto.suspectPlayerId,
    });
  }

  // --- Komissiya ----------------------------------------------------------------

  @Get('fairplay/cases')
  @ApiBearerAuth('access-token')
  @RequirePermission('FairPlayCase', 'read')
  @ApiOperation({ summary: 'Komissiya navbati — aggregateScore DESC, cursor' })
  listCases(
    @CurrentActor() actor: Actor,
    @Query() query: ListCasesQuery,
  ): Promise<Page<FairPlayCaseRow>> {
    return this.service.listCases(actor, { first: query.first, after: query.after });
  }

  @Get('fairplay/cases/:id')
  @ApiBearerAuth('access-token')
  @RequirePermission('FairPlayCase', 'read')
  @ApiOperation({ summary: 'Ish + dalillar (signal, hisobot, apellyatsiya) — komissiya' })
  getCase(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FairPlayCaseDetail> {
    return this.service.getCaseDetail(actor, id);
  }

  @Post('fairplay/cases/:id/decide')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @RequirePermission('FairPlayCase', 'update')
  @ApiOperation({
    summary: "KOMISSIYA QARORI — yozma asos MAJBURIY; sanksiyaga yagona yo'l (docs/08 §4)",
  })
  @ApiResponse({ status: 422, description: 'RATIONALE_REQUIRED | SANCTION_UNTIL_*' })
  @ApiResponse({ status: 409, description: 'Ish allaqachon hal qilingan' })
  decideCase(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideCaseDto,
  ): Promise<FairPlayCaseRow> {
    return this.service.decideCase(actor, id, {
      decision: dto.decision,
      rationale: dto.rationale,
      sanctionUntil: dto.sanctionUntil,
    });
  }

  // --- O'yinchi -----------------------------------------------------------------

  @Get('fairplay/my-cases')
  @ApiBearerAuth('access-token')
  @RequirePermission('FairPlayCase', 'read')
  @ApiOperation({
    summary: "O'z ishlari — cheklangan ko'rinish (detektsiya ichki detali oshkor emas)",
  })
  listMyCases(@CurrentActor() actor: Actor): Promise<FairPlayCaseOwnView[]> {
    return this.service.listMyCases(actor);
  }

  // --- Apellyatsiya ---------------------------------------------------------------

  @Post('fairplay/cases/:id/appeals')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @RequirePermission('Appeal', 'create')
  @ApiOperation({ summary: "Apellyatsiya — o'z ishi bo'yicha, 30 kun oynada (docs/08 §4.2)" })
  @ApiResponse({ status: 422, description: 'APPEAL_NOT_AVAILABLE | APPEAL_WINDOW_CLOSED' })
  submitAppeal(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAppealDto,
  ): Promise<AppealRow> {
    return this.service.submitAppeal(actor, id, dto.reason);
  }

  @Get('appeals/:id')
  @ApiBearerAuth('access-token')
  @RequirePermission('Appeal', 'read')
  @ApiOperation({ summary: "Apellyatsiya — egasi yoki ko'rib chiquvchi" })
  getAppeal(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AppealRow> {
    return this.service.getAppeal(actor, id);
  }

  @Post('appeals/:id/decide')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @RequirePermission('Appeal', 'update')
  @ApiOperation({
    summary: 'Apellyatsiya qarori — BOSHQA tarkib, yozma asos; UPHELD → sanksiya bekor',
  })
  @ApiResponse({ status: 422, description: 'APPEAL_DECISION_TEXT_REQUIRED | APPEAL_SAME_REVIEWER' })
  decideAppeal(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideAppealDto,
  ): Promise<AppealRow> {
    return this.service.decideAppeal(actor, id, { status: dto.status, decision: dto.decision });
  }
}
