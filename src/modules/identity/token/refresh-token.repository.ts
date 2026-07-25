import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../../../shared/audit/audit.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';

/** Refresh token yashash muddati: 30 kun. docs/10-security.md §2.2 */
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface IssuedRefreshToken {
  /** Xom token — FAQAT cookie'ga yoziladi, hech qayerda saqlanmaydi */
  token: string;
  familyId: string;
  expiresAt: Date;
}

export interface RotationResult {
  userId: string;
  familyId: string;
  token: string;
  expiresAt: Date;
}

interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * rotate() tranzaksiyasining ichki natijasi. Xato tranzaksiya ICHIDA
 * tashlanmaydi (rollback reuse-yozuvlarini yo'q qilardi) — natija
 * qaytariladi, throw commit'dan keyin.
 */
type RotationOutcome =
  | { kind: 'rotated'; result: RotationResult }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'reuse'; userId: string; familyId: string };

/**
 * Refresh token: rotatsiya + reuse detection.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  DIZAYN (docs/10-security.md §2.2-2.3, docs/02-architecture.md §9):
 *
 *  - Token = 32 bayt CSPRNG (base64url). JWT EMAS — claim'siz shunchaki
 *    qidiruv kaliti.
 *  - DB'da faqat SHA-256 hex saqlanadi. Argon2 EMAS: entropiya allaqachon
 *    256 bit — brute-force qilinadigan narsa yo'q, Argon2 esa har refresh'ga
 *    ~300 ms qo'shib DoS vektoriga aylanadi.
 *  - familyId: bitta login'dan kelib chiqqan tokenlar zanjiri.
 *  - Har token BIR MARTALIK. Ishlatilgan token qayta kelsa —
 *    BUTUN OILA bekor qilinadi (o'g'irlik alomati) + audit + 401.
 *  - Grace period YO'Q — ataylab: u reuse detection'ni zaiflashtiradi.
 *    Moslashmagan mobil klient refresh'ni klient tomonda serializatsiya
 *    qilsin, tekshiruvni bo'shatish yo'li YO'Q.
 *  - Rotatsiya SERIALIZABLE tranzaksiyada: READ COMMITTED'da ikki parallel
 *    refresh ikkalasi ham usedAt=null o'qib, ikkalasi ham rotatsiya qiladi.
 *  - Poygada yutqazgan so'rov = reuse deb qaraladi (ataylab false-positive
 *    tomonga og'ish).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Yangi oila — login/register paytida. */
  async issueNewFamily(userId: string, meta: RequestMeta): Promise<IssuedRefreshToken> {
    const familyId = randomUUID();
    return await this.persist(this.prisma, userId, familyId, meta);
  }

  /**
   * Rotatsiya + reuse detection. docs/10-security.md §2.3 — aynan shu tartib.
   *
   * @throws {UnauthorizedException} yaroqsiz / eskirgan / qayta ishlatilgan token
   */
  async rotate(rawToken: string, meta: RequestMeta): Promise<RotationResult> {
    const tokenHash = sha256(rawToken);

    // ⚠️  KRITIK NOZIKLIK: tranzaksiya ichida throw qilinsa, REUSE
    //     shoxidagi revokeFamily + audit yozuvlari ROLLBACK bo'ladi —
    //     ya'ni o'g'irlik aniqlanadi-yu, oila TIRIK qoladi. Shuning
    //     uchun tranzaksiya natija QAYTARADI (discriminated union),
    //     xato esa COMMIT'dan KEYIN tashlanadi. Bu xato jonli smoke
    //     testda ushlangan — regressiyaga yo'l qo'ymang.
    const outcome = await this.prisma.$transaction(
      async (tx): Promise<RotationOutcome> => {
        const stored = await tx.refreshToken.findUnique({ where: { tokenHash } });

        // 1. Notanish/soxta token — bekor qiladigan narsa yo'q.
        if (stored === null) {
          return { kind: 'invalid' };
        }

        // 2. REUSE: ishlatilgan yoki bekor qilingan token qayta keldi.
        //    Bu o'g'irlik alomati — butun oila o'ladi, egasi xabardor qilinadi.
        if (stored.usedAt !== null || stored.revokedAt !== null) {
          await this.revokeFamily(tx, stored.familyId);
          await this.audit.write(tx, {
            action: 'auth.refresh_reuse_detected',
            actorUserId: stored.userId,
            resourceType: 'RefreshToken',
            resourceId: stored.id,
            after: {
              familyId: stored.familyId,
              originalIp: stored.ipAddress,
              replayIp: meta.ip ?? null,
              originalUserAgent: stored.userAgent,
              replayUserAgent: meta.userAgent ?? null,
            },
            ipAddress: meta.ip ?? null,
            userAgent: meta.userAgent ?? null,
          });
          return { kind: 'reuse', userId: stored.userId, familyId: stored.familyId };
        }

        // 3. Muddati o'tgan.
        if (stored.expiresAt.getTime() < Date.now()) {
          return { kind: 'expired' };
        }

        // 4. Compare-and-set: poygada faqat bittasi yutadi.
        const now = new Date();
        const updated = await tx.refreshToken.updateMany({
          where: { id: stored.id, usedAt: null },
          data: { usedAt: now, revokedAt: now },
        });
        if (updated.count !== 1) {
          // Poygani yutqazdik → ikkinchi parallel so'rov allaqachon
          // rotatsiya qilgan → bu ham reuse deb qaraladi.
          await this.revokeFamily(tx, stored.familyId);
          return { kind: 'reuse', userId: stored.userId, familyId: stored.familyId };
        }

        // 5. Yangi token — o'sha oila ichida.
        const issued = await this.persist(tx, stored.userId, stored.familyId, meta);
        return {
          kind: 'rotated',
          result: {
            userId: stored.userId,
            familyId: stored.familyId,
            token: issued.token,
            expiresAt: issued.expiresAt,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // Tranzaksiya COMMIT bo'ldi — endi xato tashlash xavfsiz.
    switch (outcome.kind) {
      case 'rotated':
        return outcome.result;
      case 'invalid':
        throw new UnauthorizedException('Invalid refresh token');
      case 'expired':
        throw new UnauthorizedException('Refresh token expired');
      case 'reuse':
        this.logger.warn(
          { userId: outcome.userId, familyId: outcome.familyId },
          'Refresh token reuse aniqlandi — oila bekor qilindi',
        );
        throw new UnauthorizedException('Token reuse detected. Please sign in again.');
    }
  }

  /** Logout — taqdim etilgan token oilasini bekor qiladi. */
  async revokeByToken(rawToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (stored === null) {
      return; // Logout idempotent — noma'lum token jimgina o'tadi
    }
    await this.prisma.$transaction((tx) => this.revokeFamily(tx, stored.familyId));
  }

  /** Barcha qurilmalardan chiqish / break-glass. Bekor qilinganlar sonini qaytaradi. */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  private async revokeFamily(tx: Prisma.TransactionClient, familyId: string): Promise<void> {
    await tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async persist(
    db: Prisma.TransactionClient | PrismaService,
    userId: string,
    familyId: string,
    meta: RequestMeta,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    await db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(token),
        expiresAt,
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ip ?? null,
      },
    });

    return { token, familyId, expiresAt };
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
