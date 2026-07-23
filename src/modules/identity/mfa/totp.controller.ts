import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { NotFoundError } from '../../../core/errors/domain.error';
import { UserRepository } from '../user.repository';
import { TotpService } from './totp.service';

class TotpCodeDto {
  @ApiProperty({ example: '123456', description: 'TOTP kod yoki zaxira kod' })
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}

/**
 * TOTP 2FA boshqaruvi. docs/10-security.md §2.5
 *
 * Admin/hakam rollari uchun 2FA MAJBURIY bo'ladi (§15) — majburlash
 * rol berish oqimida qo'shiladi (TODO: rol berish endpointi bilan birga).
 */
@ApiTags('auth')
@ApiBearerAuth('access-token')
@Controller('auth/2fa')
export class TotpController {
  constructor(
    private readonly totp: TotpService,
    private readonly users: UserRepository,
  ) {}

  @Post('enroll')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "2FA ro'yxatga olishni boshlash",
    description: 'QR kod uchun otpauth:// URL qaytadi. 10 daqiqa ichida /activate chaqiriladi.',
  })
  async enroll(@CurrentUser() user: AuthenticatedUser): Promise<{ otpauthUrl: string }> {
    const account = await this.users.findById(user.userId);
    if (account === null) {
      throw new NotFoundError('User');
    }
    return await this.totp.enroll(user.userId, account.email ?? user.userId);
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '2FA ni yoqish (ilovadagi kod bilan tasdiqlash)',
    description:
      "Zaxira kodlar FAQAT SHU JAVOBDA, bir marta ko'rsatiladi — " +
      'saqlab olinsin. Keyin faqat hash saqlanadi.',
  })
  @ApiResponse({ status: 401, description: "Kod noto'g'ri" })
  async activate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TotpCodeDto,
  ): Promise<{ backupCodes: string[] }> {
    return await this.totp.activate(user.userId, dto.code);
  }

  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "2FA ni o'chirish (joriy kod talab qilinadi)" })
  async disable(@CurrentUser() user: AuthenticatedUser, @Body() dto: TotpCodeDto): Promise<void> {
    const account = await this.users.findById(user.userId);
    if (account === null) {
      throw new NotFoundError('User');
    }
    await this.totp.disable(account, dto.code);
  }
}
