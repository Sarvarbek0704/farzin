import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { type AppConfig, NodeEnv } from '../../../config/configuration';
import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { Public } from '../../../shared/auth/public.decorator';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthService, type AuthTokens, type CurrentUserResponse } from './auth.service';

/**
 * Refresh cookie nomi va yo'li. Path — faqat auth endpoint'lariga
 * yuboriladi, boshqa har so'rovga ortiqcha cookie ketmaydi.
 * docs/10-security.md §2.4
 */
const REFRESH_COOKIE = 'farzin_rt';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

interface AccessTokenResponse {
  accessToken: string;
  /** Sekundlarda */
  expiresIn: number;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.isProduction = config.get('nodeEnv', { infer: true }) === NodeEnv.Production;
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Ro'yxatdan o'tish (email + parol)" })
  @ApiResponse({ status: 201, description: "Access token body'da, refresh httpOnly cookie'da" })
  @ApiResponse({ status: 409, description: 'Email band' })
  @ApiResponse({ status: 429, description: 'Urinishlar chegarasi (3/soat, IP)' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    const tokens = await this.auth.register(dto, this.meta(req));
    return this.respond(res, tokens);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kirish' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: "Email yoki parol noto'g'ri (qaysi biri — aytilmaydi)" })
  @ApiResponse({ status: 429, description: "5/15min — IP va email bo'yicha alohida" })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    const tokens = await this.auth.login(dto, this.meta(req));
    return this.respond(res, tokens);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Token yangilash (rotatsiya)',
    description:
      "Refresh token httpOnly cookie'dan o'qiladi — body bo'sh. " +
      'Har token BIR MARTALIK: qayta ishlatish butun sessiya oilasini bekor qiladi.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Yaroqsiz/eskirgan/qayta ishlatilgan token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    const raw = this.readRefreshCookie(req);
    const tokens = await this.auth.refresh(raw, this.meta(req));
    return this.respond(res, tokens);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Chiqish (joriy qurilma). Idempotent.' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const raw = this.readRefreshCookie(req);
    if (raw !== '') {
      await this.auth.logout(raw);
    }
    this.clearRefreshCookie(res);
  }

  /**
   * KIM MEN? — hisob va HOZIRGI rollari.
   *
   * ═══════════════════════════════════════════════════════════════════════
   *  NEGA BU ENDPOINT KERAK
   *
   *  Rollar access token'ga ATAYLAB solinmagan (docs/10 §3.4): 15
   *  daqiqalik token bekor qilingan hakamni 15 daqiqa hakamligicha
   *  qoldirardi. Lekin oqibati shu — klient o'z huquqlarini
   *  BILMAYDI va "Ma'muriyat" bo'limini ko'rsatish kerakmi degan
   *  savolga javob berolmaydi.
   *
   *  Har ekranni ochib ko'rib, 404 kelsa yashirish ham mumkin edi,
   *  lekin u sakraydigan UI beradi. Bu endpoint — bitta so'rov,
   *  faqat O'Z ma'lumoti (boshqa hisobni ko'rsatmaydi).
   * ═══════════════════════════════════════════════════════════════════════
   *
   *  ⚠️  BU HIMOYA EMAS. Har endpoint baribir serverda tekshiriladi;
   *      bu javob faqat NIMANI KO'RSATISH kerakligini aytadi.
   */
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Hisobim va hozirgi rollarim (UI ko'rinishi uchun)" })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<CurrentUserResponse> {
    return await this.auth.describe(user.userId);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Barcha qurilmalardan chiqish' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.userId);
    this.clearRefreshCookie(res);
  }

  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Email tasdiqlash' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 422, description: "Token yaroqsiz yoki muddati o'tgan" })
  async verifyEmail(@Query('token') token: string | undefined): Promise<{ verified: boolean }> {
    await this.auth.verifyEmail(token ?? '');
    return { verified: true };
  }

  // --- Parol oqimlari (docs/10-security.md §7.1) -------------------------------

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Parolni tiklashni so'rash — email bilan",
    description:
      "HAR DOIM 204 qaytaradi, hisob bor-yo'qligidan qat'i nazar. " +
      'Aks holda bu endpoint foydalanuvchi bazasini sanab chiqish ' +
      'vositasiga aylanardi (docs/10-security.md §2.1).',
  })
  @ApiResponse({ status: 204, description: "So'rov qabul qilindi" })
  @ApiResponse({ status: 429, description: 'Limit: 3/soat (IP va email)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request): Promise<void> {
    await this.auth.requestPasswordReset(dto.email, this.meta(req));
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Token bilan yangi parol o'rnatish",
    description:
      'Token BIR MARTALIK. Muvaffaqiyatdan keyin BARCHA sessiyalar bekor ' +
      'qilinadi — tiklash stsenariysi "hisob egallangan bo\'lishi mumkin" ' +
      'farazi ustiga qurilgan.',
  })
  @ApiResponse({ status: 204, description: "Parol o'rnatildi, barcha sessiyalar bekor" })
  @ApiResponse({ status: 422, description: "Token yaroqsiz yoki muddati o'tgan" })
  @ApiResponse({ status: 429, description: 'Limit: 5/soat (IP)' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.newPassword, this.meta(req));
    // Bu brauzerdagi refresh cookie ham o'lik — tozalaymiz, aks holda
    // klient bekor qilingan token bilan 401 olib chalkashadi.
    this.clearRefreshCookie(res);
  }

  @Post('password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Parolni almashtirish (joriy parol majburiy)',
    description:
      "Joriy parol MAJBURIY: o'g'irlangan access token bilan hisobni " +
      'butunlay egallab olishning oldini oladi. Barcha sessiyalar bekor.',
  })
  @ApiResponse({ status: 204, description: 'Parol almashtirildi, qayta kirish kerak' })
  @ApiResponse({ status: 422, description: "Joriy parol noto'g'ri" })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
      this.meta(req),
    );
    this.clearRefreshCookie(res);
  }

  // ---------------------------------------------------------------------

  private meta(req: Request): { ip?: string | undefined; userAgent?: string | undefined } {
    return { ip: req.ip, userAgent: req.get('user-agent') };
  }

  /** Access — body'da (klient xotirada saqlaydi). Refresh — FAQAT cookie'da. */
  private respond(res: Response, tokens: AuthTokens): AccessTokenResponse {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      // Dev'da http://localhost — secure cookie ishlamaydi.
      secure: this.isProduction,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires: tokens.refreshExpiresAt,
    });
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  private readRefreshCookie(req: Request): string {
    // cookie-parser o'rnatilgan, lekin runtime'da middleware'siz ham
    // yiqilmasin — tip qasddan kengaytiriladi.
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE] ?? '';
  }
}
