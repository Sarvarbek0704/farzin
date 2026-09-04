import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import type { AppConfig } from '../../config/configuration';
import { SlidingWindowLimiter } from '../../shared/rate-limit/sliding-window.limiter';
import { NotificationModule } from '../notification/notification.module';
import { UserAdminController } from './admin/user-admin.controller';
import { UserAdminRepository } from './admin/user-admin.repository';
import { UserAdminService } from './admin/user-admin.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtStrategy } from './auth/jwt.strategy';
import { AuthzService } from './authz/authz.service';
import { TotpController } from './mfa/totp.controller';
import { TotpService } from './mfa/totp.service';
import { PasswordService } from './password/password.service';
import { RbacGuard } from './rbac.port';
import { RbacService } from './rbac/rbac.service';
import { RefreshTokenService } from './token/refresh-token.repository';
import { UserRepository } from './user.repository';

/**
 * Identity — auth, sessiya, RBAC. [CANON 5] #1.
 *
 * Eksport: AuthzService (guard'lar uchun). Boshqa modullar foydalanuvchi
 * ma'lumotini to'g'ridan-to'g'ri `users` jadvalidan O'QIMAYDI.
 *
 * @see docs/10-security.md
 * @see docs/14-roadmap.md — Faza 0
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const jwt = config.get('jwt', { infer: true });
        return {
          secret: jwt.accessSecret,
          signOptions: {
            algorithm: 'HS256' as const,
            // Konfiguratsiyada "15m" ko'rinishida — jsonwebtoken StringValue.
            expiresIn: jwt.accessTtl as unknown as number,
            issuer: 'farzin',
          },
        };
      },
    }),
    // Tranzaksion pochta (email tasdiqlash) — TRANSACTIONAL_MAILER porti.
    // Aylanma bog'liqlik YO'Q: NotificationModule identity'ni import
    // qilmaydi (uning endpointlari own-only, notification.module.ts izohi).
    NotificationModule,
  ],
  controllers: [AuthController, TotpController, UserAdminController],
  providers: [
    AuthService,
    AuthzService,
    PasswordService,
    RbacGuard,
    RbacService,
    RefreshTokenService,
    TotpService,
    UserRepository,
    UserAdminRepository,
    UserAdminService,
    JwtStrategy,
    SlidingWindowLimiter,
  ],
  exports: [AuthzService, RbacService, RbacGuard],
})
export class IdentityModule {}
