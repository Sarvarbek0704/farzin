import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { type AppConfig, NodeEnv } from '../../../config/configuration';
import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { Public } from '../../../shared/auth/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthService, type AuthTokens } from './auth.service';

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
  @ApiResponse({ status: 201, description: 'Access token body\'da, refresh httpOnly cookie\'da' })
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
  @ApiResponse({ status: 429, description: '5/15min — IP va email bo\'yicha alohida' })
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
      "Har token BIR MARTALIK: qayta ishlatish butun sessiya oilasini bekor qiladi.",
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

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Joriy foydalanuvchi (token tekshiruvi)' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
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
