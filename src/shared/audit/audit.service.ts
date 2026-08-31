import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

import { BusinessRuleError } from '../../core/errors/domain.error';

/**
 * Audit yozuvi. Maydonlar `AuditLog` jadvaliga mos (prisma/schema.prisma).
 */
export interface AuditEntry {
  /** "tournament.result.update" | "auth.refresh_reuse_detected" | ... */
  action: string;
  /** NULL = tizim harakati (job, cron) */
  actorUserId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  /** Oldingi holat — nima o'zgargani ko'rinsin */
  before?: Prisma.InputJsonValue;
  /** Yangi holat */
  after?: Prisma.InputJsonValue;
  /** Majburiy sabab (REASON_REQUIRED ro'yxatidagi harakatlar uchun) */
  reason?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Sabab MAJBURIY bo'lgan harakatlar — sababsiz yozuv RAD ETILADI.
 * Bu sport: natija o'zgartirildi — "nega?" savoliga javob bo'lishi shart.
 *
 * @see docs/10-security.md §10.2
 */
const REASON_REQUIRED: ReadonlySet<string> = new Set([
  'result.updated',
  'pairing.manual_override',
  'rating.recalculated',
  'user.banned',
  'refund.requested',
  'admin.impersonate',
  // Fair-play: qaror odam karyerasiga tegadi — asossiz yozuv RAD
  // (docs/08 §4, docs/14 Faza 6 "Majburiy sabab yozish").
  'fairplay.decision',
  'appeal.decision',
]);

/**
 * Audit log servisi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ATOMIKLIK — MUZOKARA QILINMAYDIGAN TALAB.
 *
 *  `write()` Prisma.TransactionClient qabul qiladi va biznes o'zgarishi
 *  bilan BIR TRANZAKSIYADA ishlaydi. Natija saqlanib, audit yozuvi
 *  saqlanmasa — bu izsiz o'zgarish. Qabul qilinmaydi.
 *
 *    await prisma.$transaction(async (tx) => {
 *      const before = await tx.pairing.findUnique(...);
 *      await tx.pairing.update(...);
 *      await audit.write(tx, { action: 'result.updated', before, ... });
 *    });
 *
 *  Jadval IMMUTABLE: UPDATE/DELETE trigger va REVOKE bilan taqiqlanadi
 *  (migration'da). docs/10-security.md §10, docs/15-observability.md §8.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class AuditService {
  constructor(private readonly cls: ClsService) {}

  async write(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    if (
      REASON_REQUIRED.has(entry.action) &&
      (entry.reason === undefined || entry.reason.trim() === '')
    ) {
      throw new BusinessRuleError(
        'AUDIT_REASON_REQUIRED',
        `"${entry.action}" harakati uchun sabab ko'rsatish majburiy`,
        { action: entry.action },
      );
    }

    // Sabab `after` JSON'iga qo'shiladi — alohida ustun yo'q
    // (prisma/schema.prisma haqiqat manbai).
    const after =
      entry.after !== undefined
        ? entry.reason !== undefined
          ? mergeReason(entry.after, entry.reason)
          : entry.after
        : entry.reason !== undefined
          ? { reason: entry.reason }
          : undefined;

    await tx.auditLog.create({
      data: {
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        // exactOptionalPropertyTypes: aniq `undefined` uzatilmaydi —
        // maydon faqat qiymat borida qo'shiladi.
        ...(entry.before !== undefined && { before: entry.before }),
        ...(after !== undefined && { after }),
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        // ClsService tipi string deydi, lekin HTTP kontekstidan tashqarida
        // (job/cron) runtime'da undefined qaytadi — himoya saqlanadi.
        traceId: (this.cls.getId() as string | undefined) ?? null,
      },
    });
  }
}

function mergeReason(after: Prisma.InputJsonValue, reason: string): Prisma.InputJsonValue {
  if (typeof after === 'object' && !Array.isArray(after)) {
    return { ...(after as Prisma.InputJsonObject), reason };
  }
  return { value: after, reason };
}
