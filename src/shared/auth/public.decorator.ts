import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Endpoint'ni autentifikatsiyasiz ochish.
 *
 * Default — HAMMASI YOPIQ (JwtAuthGuard global). Ochiq endpoint ongli
 * qaror va shu dekorator bilan belgilanadi. Aksincha bo'lsa (default
 * ochiq, yopish esdan chiqadi) — bu xavfsizlik teshigi.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
