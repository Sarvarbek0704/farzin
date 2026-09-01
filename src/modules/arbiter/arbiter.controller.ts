import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../../shared/auth/public.decorator';
import { type Actor, CurrentActor, RequirePermission } from '../identity/rbac.port';
import type { PairingRow, RoundRow, RoundWithPairings, StandingRow } from './arbiter.repository';
import { ArbiterService } from './arbiter.service';
import { EnterResultDto } from './dto/enter-result.dto';

/**
 * Arbiter endpointlari — hakam paneli: turlar, taxtalar, natijalar,
 * jadval (docs/14-roadmap.md Faza 1). O'qish — ochiq (jadval va
 * juftliklar ommaviy ma'lumot), yozish — RBAC gate + service'da
 * hakam/tashkilotchi scope tekshiruvi (docs/10-security.md §3).
 */
@ApiTags('arbiter')
@Controller()
export class ArbiterController {
  constructor(private readonly arbiterService: ArbiterService) {}

  // --- Rounds -----------------------------------------------------------------

  /**
   * docs/04-api-spec.md AIP-136 bo'yicha bu aslida `rounds:generate`
   * custom method — lekin Nest marshrutida literal ':' noqulay, shuning
   * uchun POST /rounds "keyingi turni GENERATSIYA qilish" harakati
   * sifatida hujjatlanadi (body yo'q, tur raqami server tomonda).
   */
  @Post('sections/:sectionId/rounds')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @RequirePermission('Round', 'create')
  @ApiOperation({
    summary:
      "Keyingi turni generatsiya qilish (round-robin/double round-robin) — oldingi tur COMPLETED bo'lishi shart",
  })
  @ApiResponse({
    status: 422,
    description:
      'PAIRING_IMPOSSIBLE | PREVIOUS_ROUND_NOT_COMPLETED | PAIRING_SYSTEM_NOT_IMPLEMENTED',
  })
  generateRound(
    @CurrentActor() actor: Actor,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
  ): Promise<RoundWithPairings> {
    return this.arbiterService.generateRound(actor, sectionId);
  }

  @Public()
  @Get('sections/:sectionId/rounds')
  @ApiOperation({ summary: 'Seksiya turlari (ommaviy)' })
  listRounds(@Param('sectionId', ParseUUIDPipe) sectionId: string): Promise<RoundRow[]> {
    return this.arbiterService.listRounds(sectionId);
  }

  @Public()
  @Get('rounds/:id')
  @ApiOperation({ summary: 'Tur + juftliklar (ommaviy)' })
  getRound(@Param('id', ParseUUIDPipe) id: string): Promise<RoundWithPairings> {
    return this.arbiterService.getRound(id);
  }

  @Post('rounds/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @RequirePermission('Round', 'update')
  @ApiOperation({
    summary:
      "Turni yakunlash — barcha natijalar kiritilgan bo'lishi shart (outbox: RoundCompleted)",
  })
  completeRound(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoundWithPairings> {
    return this.arbiterService.completeRound(actor, id);
  }

  // --- Results ------------------------------------------------------------------

  // TODO(Faza 1): Idempotency-Key header (docs/04-api-spec.md §5) —
  //               takroriy so'rov bir xil natija qaytarsin.
  @Patch('pairings/:id/result')
  @ApiBearerAuth('access-token')
  @RequirePermission('GameResult', 'create')
  @ApiOperation({
    summary: "Natija kiritish/tuzatish — mavjud natijani o'zgartirishda sabab majburiy",
  })
  enterResult(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EnterResultDto,
  ): Promise<PairingRow> {
    return this.arbiterService.enterResult(actor, id, dto.result, dto.reason);
  }

  // --- Standings ------------------------------------------------------------------

  @Public()
  @Get('sections/:sectionId/standings')
  @ApiOperation({ summary: 'Jadval + tie-break qiymatlari, rank tartibida (ommaviy)' })
  getStandings(@Param('sectionId', ParseUUIDPipe) sectionId: string): Promise<StandingRow[]> {
    return this.arbiterService.getStandings(sectionId);
  }

  // --- Export ---------------------------------------------------------------------
  //
  // docs/14-roadmap.md Faza 1 "Eksport": PGN va Chess-Results (TRF16).
  // docs/04-api-spec.md uslubi: PGN — matnli javob (GET .../pgn →
  // text/plain oilasi). Yuklab olish uchun Content-Disposition attachment.

  @Public()
  @Get('sections/:sectionId/export/pgn')
  @ApiProduces('application/x-chess-pgn')
  @ApiOperation({
    summary: 'Seksiya partiyalari PGN formatida (ommaviy) — bir fayl, tur/taxta tartibida',
  })
  async exportPgn(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const file = await this.arbiterService.exportPgn(sectionId);
    // PGN'ning rasmiy MIME turi (PGN spec §21) — application/x-chess-pgn.
    res.type('application/x-chess-pgn');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return file.content;
  }

  @Public()
  @Get('sections/:sectionId/export/trf')
  @ApiProduces('text/plain')
  @ApiOperation({
    summary: 'Seksiya FIDE TRF16 formatida (ommaviy) — Chess-Results / Swiss-Manager import qiladi',
  })
  async exportTrf(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const file = await this.arbiterService.exportTrf(sectionId);
    res.type('text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return file.content;
  }

  // --- PDF (offline degradatsiya, docs/11-infrastructure.md §12.4) ---------------
  //
  //  Bu ikki endpoint BOSIB CHIQARISH uchun: turnir zalida internet
  //  uzilsa hakam qog'oz bilan davom etadi. PDF binar, shuning uchun
  //  `@Res({ passthrough: true })` emas — javob to'g'ridan-to'g'ri
  //  yoziladi (passthrough Buffer'ni JSON qilib yuborardi).

  @Public()
  @Get('sections/:sectionId/export/pairings/:roundNumber/pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: "Juftlik varaqasi PDF (ommaviy) — bosib chiqarishga mo'ljallangan",
    description:
      "Natija ustuni O'YNALMAGAN juftliklarda BO'SH qoladi — hakam qo'lda " +
      "to'ldiradi. Bu offline oqimning mohiyati.",
  })
  @ApiResponse({ status: 404, description: 'Seksiya yoki tur topilmadi' })
  async exportPairingsPdf(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('roundNumber', ParseIntPipe) roundNumber: number,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.arbiterService.exportPairingSheetPdf(sectionId, roundNumber);
    sendPdf(res, file.filename, file.content);
  }

  @Public()
  @Get('sections/:sectionId/export/standings/pdf')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: "Jadval PDF (ommaviy) — bosib chiqarishga mo'ljallangan" })
  async exportStandingsPdf(
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.arbiterService.exportStandingsPdf(sectionId);
    sendPdf(res, file.filename, file.content);
  }
}

/** PDF javobi — nomi va uzunligi bilan (brauzer progressni ko'rsatsin). */
function sendPdf(res: Response, filename: string, content: Buffer): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(content.length));
  res.end(content);
}
