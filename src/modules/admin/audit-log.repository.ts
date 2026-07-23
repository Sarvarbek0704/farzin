import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../shared/prisma/prisma.service';

export interface AuditLogRow {
  id: string;
  action: string;
  actorUserId: string | null;
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  traceId: string | null;
  createdAt: Date;
}

export interface AuditLogFilter {
  action?: string | undefined;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  actorUserId?: string | undefined;
}

@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Faqat O'QISH — jadval immutable, yozish faqat AuditService orqali. */
  async list(filter: AuditLogFilter, first: number, afterId: string | null): Promise<AuditLogRow[]> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.action !== undefined && { action: filter.action }),
      ...(filter.resourceType !== undefined && { resourceType: filter.resourceType }),
      ...(filter.resourceId !== undefined && { resourceId: filter.resourceId }),
      ...(filter.actorUserId !== undefined && { actorUserId: filter.actorUserId }),
      // UUID v7 vaqt-tartibli: id > cursor — yaratilish tartibida oldinga.
      ...(afterId !== null && { id: { gt: afterId } }),
    };

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { id: 'asc' },
      take: first + 1,
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorUserId: row.actorUserId,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      before: row.before,
      after: row.after,
      ipAddress: row.ipAddress,
      traceId: row.traceId,
      createdAt: row.createdAt,
    }));
  }
}
