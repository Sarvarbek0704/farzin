import type { Server } from 'node:http';

import type { Role } from '@prisma/client';
import type { Redis } from 'ioredis';
import request, { type Response } from 'supertest';

import type { PrismaService } from '../../src/shared/prisma/prisma.service';

/**
 * Integration test yordamchilari — HTTP (supertest) va DB (Prisma) qatlami.
 *
 * Cookie nomi/yo'li auth.controller.ts bilan mos: `farzin_rt`,
 * path=/api/v1/auth (docs/10-security.md §2.4).
 */

export const REFRESH_COOKIE = 'farzin_rt';
export const DEFAULT_PASSWORD = 'kuchli-parol-2026';

// --- HTTP ------------------------------------------------------------------

export interface RegisterInput {
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
}

export async function registerUser(server: Server, input: RegisterInput): Promise<Response> {
  return await request(server)
    .post('/api/v1/auth/register')
    .send({
      email: input.email,
      password: input.password ?? DEFAULT_PASSWORD,
      firstName: input.firstName ?? 'Sarvarbek',
      lastName: input.lastName ?? 'Sodiqov',
    });
}

export async function loginUser(
  server: Server,
  email: string,
  password: string = DEFAULT_PASSWORD,
): Promise<Response> {
  return await request(server).post('/api/v1/auth/login').send({ email, password });
}

/** Refresh — token FAQAT httpOnly cookie'da keladi, body bo'sh. */
export async function refreshWithCookie(server: Server, cookie: string): Promise<Response> {
  return await request(server).post('/api/v1/auth/refresh').set('Cookie', cookie).send();
}

export async function logoutWithCookie(server: Server, cookie: string): Promise<Response> {
  return await request(server).post('/api/v1/auth/logout').set('Cookie', cookie).send();
}

/** Set-Cookie qatorlari (supertest tipi `any` — aniq massivga keltiriladi). */
export function setCookieLines(res: Response): string[] {
  const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  if (raw === undefined) {
    return [];
  }
  return Array.isArray(raw) ? raw : [raw];
}

/** `farzin_rt=<qiymat>` juftligi — keyingi so'rovning Cookie header'i uchun. */
export function extractRefreshCookie(res: Response): string {
  const line = setCookieLines(res).find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (line === undefined) {
    throw new Error(`${REFRESH_COOKIE} cookie topilmadi (Set-Cookie: yo'q)`);
  }
  return line.split(';')[0]!;
}

/** Cookie juftligidan xom token qiymati. */
export function cookieValue(cookiePair: string): string {
  return cookiePair.slice(cookiePair.indexOf('=') + 1);
}

/** Access token payload'idan userId (sub) — JWT imzosi tekshirilmaydi, test. */
export function userIdFromToken(accessToken: string): string {
  const payload = JSON.parse(
    Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8'),
  ) as { sub: string };
  return payload.sub;
}

export function bearer(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}

// --- DB / Redis --------------------------------------------------------------

/**
 * Rol berish — to'g'ridan-to'g'ri DB orqali (admin endpointi Faza 0'da
 * cheklangan). authz Redis keshi (60s TTL, authz.service.ts) DARHOL
 * tozalanadi — aks holda yangi rol keyingi so'rovda ko'rinmaydi.
 */
export async function grantRole(
  prisma: PrismaService,
  redis: Redis,
  userId: string,
  role: Role,
  scopeType?: string,
  scopeId?: string,
): Promise<void> {
  await prisma.userRole.create({
    data: {
      userId,
      role,
      scopeType: scopeType ?? null,
      scopeId: scopeId ?? null,
    },
  });
  await redis.del(`authz:roles:${userId}`);
}

/**
 * Testlar orasidagi izolyatsiya: DB TRUNCATE (prisma.service.ts
 * truncateAll) + Redis flushall.
 *
 * flushall NIMANI tozalaydi: SlidingWindowLimiter kalitlari (register
 * 3/soat, login 5/15min — docs/10-security.md §7.1; tozalanmasa testlar
 * bir-birini 429 bilan bo'g'adi) VA authz rol keshi.
 */
export async function resetState(prisma: PrismaService, redis: Redis): Promise<void> {
  await prisma.truncateAll();
  await redis.flushall();
}

// --- RFC 9457 tekshiruvi -------------------------------------------------------

/**
 * Har xato javobi RFC 9457 Problem Details shaklida bo'lishi shart
 * (docs/04-api-spec.md §2.5) — media type bilan birga.
 */
export function expectProblem(res: Response, status: number, code: string): void {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toContain('application/problem+json');
  expect(res.body).toMatchObject({ status, code });
  expect(typeof res.body.type).toBe('string');
  expect(typeof res.body.title).toBe('string');
  expect(typeof res.body.traceId).toBe('string');
  expect(typeof res.body.instance).toBe('string');
}
