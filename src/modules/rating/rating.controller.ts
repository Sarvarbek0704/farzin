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

import { Public } from '../../shared/auth/public.decorator';
import type { Page } from '../../shared/pagination/cursor';
import { type Actor, CurrentActor, RequirePermission } from '../identity/rbac.port';
import { ComputePeriodDto } from './dto/compute-period.dto';
import { CreateRatingPeriodDto } from './dto/create-rating-period.dto';
import { LeaderboardQuery } from './dto/leaderboard.query';
import { ListRatingPeriodsQuery } from './dto/list-rating-periods.query';
import { RatingHistoryQuery } from './dto/rating-history.query';
import { RatingService } from './rating.service';
import type { LeaderboardRow, RatingHistoryRow, RatingPeriodRow } from './rating.types';

/**
 * Rating endpointlari. O'qish — ochiq (milliy reyting ommaviy hujjat,
 * docs/14-roadmap.md Faza 3 "onlayn, ochiq, tekshiriladigan"), yozish —
 * RBAC: faqat SUPER_ADMIN / FEDERATION_ADMIN (policy.registry.ts).
 *
 * RD (deviation) javobda OCHIQ ko'rsatiladi — "reyting nuqta emas,
 * taqsimot" halolligi (docs/06 §1.2, docs/14 Faza 3).
 */
@ApiTags('rating')
@Controller()
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  // --- Ommaviy o'qishlar -------------------------------------------------------

  @Public()
  @Get('ratings')
  @ApiOperation({
    summary: "Reyting ro'yxati (leaderboard) — kategoriya bo'yicha, provisional ko'rsatilmaydi",
  })
  @ApiResponse({ status: 422, description: 'INVALID_RATING_CATEGORY — OTB+BULLET mavjud emas' })
  leaderboard(@Query() query: LeaderboardQuery): Promise<Page<LeaderboardRow>> {
    return this.ratingService.leaderboard({
      environment: query.environment,
      timeCategory: query.timeCategory,
      first: query.first,
      after: query.after,
    });
  }

  @Public()
  @Get('players/:id/rating-history')
  @ApiOperation({
    summary:
      "O'yinchi reyting tarixi — har davr uchun before/after va kirgan o'yinlar (docs/06 §8.3)",
  })
  playerHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RatingHistoryQuery,
  ): Promise<Page<RatingHistoryRow>> {
    return this.ratingService.playerHistory(id, {
      environment: query.environment,
      timeCategory: query.timeCategory,
      first: query.first,
      after: query.after,
    });
  }

  @Public()
  @Get('rating-periods')
  @ApiOperation({ summary: "Rating davrlari ro'yxati (ommaviy — hisob shaffofligi)" })
  listPeriods(@Query() query: ListRatingPeriodsQuery): Promise<Page<RatingPeriodRow>> {
    return this.ratingService.listPeriods({
      environment: query.environment,
      timeCategory: query.timeCategory,
      first: query.first,
      after: query.after,
    });
  }

  // --- Boshqaruv ---------------------------------------------------------------

  @Post('rating-periods')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @RequirePermission('RatingPeriod', 'create')
  @ApiOperation({ summary: 'Rating davri yaratish — kesishuvchi davr 409' })
  @ApiResponse({ status: 409, description: 'Kesishuvchi davr allaqachon bor' })
  createPeriod(
    @CurrentActor() actor: Actor,
    @Body() dto: CreateRatingPeriodDto,
  ): Promise<RatingPeriodRow> {
    return this.ratingService.createPeriod(actor, {
      environment: dto.environment,
      timeCategory: dto.timeCategory,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      ...(dto.tau !== undefined && { tau: dto.tau }),
    });
  }

  @Post('rating-periods/:id/compute')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @RequirePermission('RatingPeriod', 'update')
  @ApiOperation({
    summary:
      'Davrni hisoblash/qayta hisoblash — IDEMPOTENT, sabab majburiy (audit + outbox RatingRecomputed)',
  })
  @ApiResponse({ status: 409, description: 'Bu davr uchun hisoblash davom etmoqda' })
  computePeriod(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ComputePeriodDto,
  ): Promise<RatingPeriodRow> {
    return this.ratingService.computePeriod(actor, id, dto.reason);
  }
}
