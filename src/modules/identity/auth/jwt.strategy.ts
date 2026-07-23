import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AppConfig } from '../../../config/configuration';
import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import type { AccessTokenPayload } from './auth.service';

/**
 * Access token strategiyasi.
 *
 * - Algoritm ALLOWLIST: faqat HS256. `alg: none` va RS/HS almashtirish
 *   hujumlari rad etiladi. docs/10-security.md §1.3
 * - Payload'da rollar YO'Q — ular AuthzService orqali DB/Redis'dan olinadi.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<AppConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('jwt', { infer: true }).accessSecret,
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return { userId: payload.sub, sessionId: payload.sid };
  }
}
