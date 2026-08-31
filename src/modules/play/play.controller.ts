import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../shared/auth/public.decorator';
import { type Actor, CurrentActor, RequirePermission } from '../identity/rbac.port';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { MatchmakingJoinDto } from './dto/matchmaking-join.dto';
import { MatchmakingService } from './matchmaking.service';
import { PlayService } from './play.service';
import type { GameRow, GameStatePayload, MatchmakingJoinResult } from './play.types';

/**
 * Play REST endpointlari — minimal sirt (asosiy oqim WebSocket'da,
 * play.gateway.ts). docs/07-realtime-and-clock.md.
 *
 * O'yin ko'rinishi OMMAVIY (tomoshabin rejimi); yozuvlar auth talab qiladi.
 * Navbatdagilar RO'YXATI endpointi ATAYLAB YO'Q (docs/07 §9.5 #1 —
 * raqibni tanlab olish imkonsiz bo'lishi kerak).
 */
@ApiTags('play')
@Controller('play')
export class PlayController {
  constructor(
    private readonly play: PlayService,
    private readonly matchmaking: MatchmakingService,
  ) {}

  @Post('challenges')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @RequirePermission('OnlineGame', 'create')
  @ApiOperation({ summary: "Do'stona chaqiriq — havola raqib bilan ulashiladi" })
  @ApiResponse({ status: 404, description: 'Raqib topilmadi' })
  @ApiResponse({ status: 422, description: "O'zingizga qarshi / profil yo'q / MULTI_STAGE" })
  createChallenge(
    @CurrentActor() actor: Actor,
    @Body() dto: CreateChallengeDto,
  ): Promise<GameStatePayload> {
    return this.play.createFriendChallenge(actor.userId, {
      opponentPlayerId: dto.opponentPlayerId,
      timeCategory: dto.timeCategory,
      clockType: dto.clockType,
      baseTimeSeconds: dto.baseTimeSeconds,
      incrementSeconds: dto.incrementSeconds,
    });
  }

  @Public()
  @Get('games/:id')
  @ApiOperation({ summary: "O'yin holati — ommaviy tomoshabin ko'rinishi (fen, soat, status)" })
  @ApiResponse({ status: 404, description: "O'yin topilmadi" })
  getGame(@Param('id', ParseUUIDPipe) id: string): Promise<GameStatePayload> {
    return this.play.getGameView(id, null);
  }

  @Get('my/games')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "O'z faol o'yinlarim" })
  listMyGames(@CurrentActor() actor: Actor): Promise<GameRow[]> {
    return this.play.listActiveGamesFor(actor.userId);
  }

  @Post('matchmaking/join')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @RequirePermission('OnlineGame', 'create')
  @ApiOperation({
    summary:
      "Navbatga turish. Juftlik topilsa o'yin DARHOL yaratiladi (docs/07 §9.5 — tasdiqlash dialogi yo'q)",
  })
  @ApiResponse({ status: 422, description: "Allaqachon navbatda / profil yo'q" })
  joinQueue(
    @CurrentActor() actor: Actor,
    @Body() dto: MatchmakingJoinDto,
  ): Promise<MatchmakingJoinResult> {
    return this.matchmaking.join(actor.userId, {
      timeCategory: dto.timeCategory,
      clockType: dto.clockType,
      baseTimeSeconds: dto.baseTimeSeconds,
      incrementSeconds: dto.incrementSeconds,
    });
  }

  @Post('matchmaking/leave')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Navbatdan chiqish (idempotent)' })
  leaveQueue(@CurrentActor() actor: Actor): Promise<{ left: boolean }> {
    return this.matchmaking.leave(actor.userId);
  }
}
