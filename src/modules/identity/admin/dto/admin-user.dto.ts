import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../../shared/pagination/cursor';

export const ROLES = [
  'SUPER_ADMIN',
  'FEDERATION_ADMIN',
  'REGION_ADMIN',
  'CLUB_ADMIN',
  'ARBITER',
  'COACH',
  'SCHOOL_TEACHER',
  'PLAYER',
  'PARENT',
  'SPECTATOR',
] as const;

export const SCOPE_TYPES = ['FEDERATION', 'REGION', 'CLUB', 'SCHOOL', 'TOURNAMENT'] as const;

export const MANAGEABLE_STATUSES = ['ACTIVE', 'SUSPENDED', 'BANNED'] as const;

export const USER_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'BANNED',
  'DELETED',
] as const;

/**
 * SABAB — barcha ma'muriy yozuvlar uchun MAJBURIY.
 *
 * `AuditService` `role.granted`, `role.revoked` va
 * `user.status_changed` uchun sababni talab qiladi va sababsiz
 * yozuvni RAD ETADI. Minimal uzunlik "ok" kabi bo'sh javoblarni
 * to'sadi: keyin bu yozuvni o'qiydigan odamga foyda bo'lishi kerak.
 */
const REASON_MIN = 10;
const REASON_MAX = 500;

export class ListAdminUsersQuery {
  @ApiPropertyOptional({ description: 'Email, telefon yoki ism', minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: (typeof USER_STATUSES)[number];

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  first?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  after?: string;
}

export class GrantRoleDto {
  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role!: (typeof ROLES)[number];

  @ApiPropertyOptional({
    enum: SCOPE_TYPES,
    description: 'Global rollar uchun berilmaydi (SUPER_ADMIN, PLAYER, …)',
  })
  @IsOptional()
  @IsIn(SCOPE_TYPES)
  scopeType?: (typeof SCOPE_TYPES)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @ApiPropertyOptional({
    description: 'Muddat — turnir hakami uchun turnir tugagan sana (docs/01 §4.3)',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiProperty({ minLength: REASON_MIN, maxLength: REASON_MAX })
  @IsString()
  @MinLength(REASON_MIN)
  @MaxLength(REASON_MAX)
  reason!: string;
}

export class RevokeRoleDto {
  @ApiProperty({ minLength: REASON_MIN, maxLength: REASON_MAX })
  @IsString()
  @MinLength(REASON_MIN)
  @MaxLength(REASON_MAX)
  reason!: string;
}

export class SetUserStatusDto {
  @ApiProperty({ enum: MANAGEABLE_STATUSES })
  @IsIn(MANAGEABLE_STATUSES)
  status!: (typeof MANAGEABLE_STATUSES)[number];

  @ApiProperty({ minLength: REASON_MIN, maxLength: REASON_MAX })
  @IsString()
  @MinLength(REASON_MIN)
  @MaxLength(REASON_MAX)
  reason!: string;
}
