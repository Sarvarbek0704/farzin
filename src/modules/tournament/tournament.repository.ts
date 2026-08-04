import { Injectable } from '@nestjs/common';
import type { ChessTitle, Registration, Tournament, TournamentSection } from '@prisma/client';

import { AuditService } from '../../shared/audit/audit.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { TournamentStatus } from './tournament-status.machine';
import type {
  ClockType,
  Gender,
  PairingSystem,
  PlayEnvironment,
  TimeCategory,
} from './tournament.types';

/**
 * Tournament ma'lumot qatlami — Prisma FAQAT shu faylda
 * (.dependency-cruiser.js `prisma-only-in-infrastructure`).
 *
 * Har yozuv amali audit yozuvi bilan BIR TRANZAKSIYADA —
 * docs/10-security.md §10, shared/audit/audit.service.ts.
 */

export interface TournamentRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  federationId: string | null;
  regionId: string | null;
  clubId: string | null;
  organizerId: string;
  status: TournamentStatus;
  venueName: string | null;
  address: string | null;
  startDate: Date;
  endDate: Date;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  /** TIYINDA. JSON'da BigInt yo'q — string sifatida uzatiladi (ADR-0006). */
  entryFeeAmount: string | null;
  entryFeeCurrency: string;
  isFideRated: boolean;
  isNationallyRated: boolean;
  isPublic: boolean;
  createdAt: Date;
}

export interface SectionRow {
  id: string;
  tournamentId: string;
  name: string;
  pairingSystem: PairingSystem;
  timeCategory: TimeCategory;
  environment: PlayEnvironment;
  totalRounds: number;
  clockType: ClockType;
  baseTimeSeconds: number;
  incrementSeconds: number;
  minRating: number | null;
  maxRating: number | null;
  minBirthYear: number | null;
  maxBirthYear: number | null;
  genderRestriction: Gender | null;
  maxPlayers: number | null;
  tieBreakOrder: string[];
  createdAt: Date;
}

export interface RegistrationRow {
  id: string;
  sectionId: string;
  playerId: string;
  pairingNumber: number | null;
  ratingAtEntry: number | null;
  titleAtEntry: string | null;
  isConfirmed: boolean;
  isWithdrawn: boolean;
  withdrawnAt: Date | null;
  withdrawnReason: string | null;
  joinedAtRound: number | null;
  createdAt: Date;
}

export interface CreateTournamentInput {
  name: string;
  slug: string;
  description?: string | undefined;
  federationId?: string | undefined;
  regionId?: string | undefined;
  clubId?: string | undefined;
  organizerId: string;
  venueName?: string | undefined;
  address?: string | undefined;
  startDate: Date;
  endDate: Date;
  registrationOpensAt?: Date | undefined;
  registrationClosesAt?: Date | undefined;
  /** TIYINDA (butun son). */
  entryFeeAmount?: number | undefined;
  isFideRated?: boolean | undefined;
  isNationallyRated?: boolean | undefined;
  isPublic?: boolean | undefined;
}

export interface UpdateTournamentInput {
  name?: string;
  description?: string | null;
  venueName?: string | null;
  address?: string | null;
  startDate?: Date;
  endDate?: Date;
  registrationOpensAt?: Date | null;
  registrationClosesAt?: Date | null;
  /** TIYINDA (butun son). null = start puli olib tashlandi. */
  entryFeeAmount?: number | null;
  isFideRated?: boolean;
  isNationallyRated?: boolean;
  isPublic?: boolean;
}

export interface ListTournamentsFilter {
  status?: TournamentStatus | undefined;
  regionId?: string | undefined;
}

export interface CreateSectionInput {
  tournamentId: string;
  name: string;
  pairingSystem?: PairingSystem | undefined;
  timeCategory: TimeCategory;
  environment?: PlayEnvironment | undefined;
  totalRounds: number;
  clockType: ClockType;
  baseTimeSeconds: number;
  incrementSeconds?: number | undefined;
  minRating?: number | undefined;
  maxRating?: number | undefined;
  minBirthYear?: number | undefined;
  maxBirthYear?: number | undefined;
  genderRestriction?: Gender | undefined;
  maxPlayers?: number | undefined;
  tieBreakOrder?: string[] | undefined;
}

export interface CreateRegistrationInput {
  sectionId: string;
  playerId: string;
  titleAtEntry?: string | undefined;
  /** Ro'yxat paytidagi reyting snapshot'i (RATING_PORT). null = reytingsiz. */
  ratingAtEntry: number | null;
  isConfirmed: boolean;
}

@Injectable()
export class TournamentRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Tournament -----------------------------------------------------------

  async createTournament(
    input: CreateTournamentInput,
    actorUserId: string,
  ): Promise<TournamentRow> {
    return await this.prisma.$transaction(async (tx) => {
      const created = await tx.tournament.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          federationId: input.federationId ?? null,
          regionId: input.regionId ?? null,
          clubId: input.clubId ?? null,
          organizerId: input.organizerId,
          venueName: input.venueName ?? null,
          address: input.address ?? null,
          startDate: input.startDate,
          endDate: input.endDate,
          registrationOpensAt: input.registrationOpensAt ?? null,
          registrationClosesAt: input.registrationClosesAt ?? null,
          entryFeeAmount: input.entryFeeAmount !== undefined ? BigInt(input.entryFeeAmount) : null,
          ...(input.isFideRated !== undefined && { isFideRated: input.isFideRated }),
          ...(input.isNationallyRated !== undefined && {
            isNationallyRated: input.isNationallyRated,
          }),
          ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
        },
      });
      await this.audit.write(tx, {
        action: 'tournament.created',
        actorUserId,
        resourceType: 'Tournament',
        resourceId: created.id,
        after: {
          name: created.name,
          slug: created.slug,
          organizerId: created.organizerId,
          startDate: created.startDate.toISOString(),
          endDate: created.endDate.toISOString(),
        },
      });
      return toTournamentRow(created);
    });
  }

  async findById(id: string): Promise<TournamentRow | null> {
    const row = await this.prisma.tournament.findFirst({ where: { id, deletedAt: null } });
    return row === null ? null : toTournamentRow(row);
  }

  async findBySlug(slug: string): Promise<TournamentRow | null> {
    const row = await this.prisma.tournament.findFirst({ where: { slug, deletedAt: null } });
    return row === null ? null : toTournamentRow(row);
  }

  /**
   * Ommaviy kalendar: faqat isPublic, DRAFT ko'rinmaydi, soft-delete yo'q.
   * Cursor pagination — WHERE id > cursor ORDER BY id (UUID v7 vaqt
   * bo'yicha tartiblangan). shared/pagination/cursor.ts
   */
  async listPublic(
    first: number,
    afterId: string | null,
    filter: ListTournamentsFilter,
  ): Promise<TournamentRow[]> {
    const rows = await this.prisma.tournament.findMany({
      where: {
        deletedAt: null,
        isPublic: true,
        status: filter.status ?? { not: 'DRAFT' },
        ...(filter.regionId !== undefined && { regionId: filter.regionId }),
        ...(afterId !== null && { id: { gt: afterId } }),
      },
      orderBy: { id: 'asc' },
      take: first + 1,
    });
    return rows.map(toTournamentRow);
  }

  async updateTournament(
    id: string,
    input: UpdateTournamentInput,
    actorUserId: string,
  ): Promise<TournamentRow> {
    return await this.prisma.$transaction(async (tx) => {
      const before = await tx.tournament.findUniqueOrThrow({ where: { id } });
      const updated = await tx.tournament.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.venueName !== undefined && { venueName: input.venueName }),
          ...(input.address !== undefined && { address: input.address }),
          ...(input.startDate !== undefined && { startDate: input.startDate }),
          ...(input.endDate !== undefined && { endDate: input.endDate }),
          ...(input.registrationOpensAt !== undefined && {
            registrationOpensAt: input.registrationOpensAt,
          }),
          ...(input.registrationClosesAt !== undefined && {
            registrationClosesAt: input.registrationClosesAt,
          }),
          ...(input.entryFeeAmount !== undefined && {
            entryFeeAmount: input.entryFeeAmount === null ? null : BigInt(input.entryFeeAmount),
          }),
          ...(input.isFideRated !== undefined && { isFideRated: input.isFideRated }),
          ...(input.isNationallyRated !== undefined && {
            isNationallyRated: input.isNationallyRated,
          }),
          ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
        },
      });
      await this.audit.write(tx, {
        action: 'tournament.updated',
        actorUserId,
        resourceType: 'Tournament',
        resourceId: id,
        before: toTournamentAuditView(before),
        after: toTournamentAuditView(updated),
      });
      return toTournamentRow(updated);
    });
  }

  /**
   * Holat o'zgarishi — o'tish qoidasi service qatlamida
   * (tournament-status.machine.ts) tekshirilgan bo'lishi shart.
   * CANCELLED uchun `reason` majburiy — service kafolatlaydi, bu yerda
   * audit yozuviga kiradi.
   */
  async changeStatus(
    id: string,
    status: TournamentStatus,
    actorUserId: string,
    reason?: string,
  ): Promise<TournamentRow> {
    return await this.prisma.$transaction(async (tx) => {
      const before = await tx.tournament.findUniqueOrThrow({ where: { id } });
      const updated = await tx.tournament.update({ where: { id }, data: { status } });
      await this.audit.write(tx, {
        action: 'tournament.status_changed',
        actorUserId,
        resourceType: 'Tournament',
        resourceId: id,
        before: { status: before.status },
        after: { status: updated.status },
        ...(reason !== undefined && { reason }),
      });
      return toTournamentRow(updated);
    });
  }

  // --- TournamentSection ------------------------------------------------------

  async createSection(input: CreateSectionInput, actorUserId: string): Promise<SectionRow> {
    return await this.prisma.$transaction(async (tx) => {
      const created = await tx.tournamentSection.create({
        data: {
          tournamentId: input.tournamentId,
          name: input.name,
          ...(input.pairingSystem !== undefined && { pairingSystem: input.pairingSystem }),
          timeCategory: input.timeCategory,
          ...(input.environment !== undefined && { environment: input.environment }),
          totalRounds: input.totalRounds,
          clockType: input.clockType,
          baseTimeSeconds: input.baseTimeSeconds,
          ...(input.incrementSeconds !== undefined && {
            incrementSeconds: input.incrementSeconds,
          }),
          minRating: input.minRating ?? null,
          maxRating: input.maxRating ?? null,
          minBirthYear: input.minBirthYear ?? null,
          maxBirthYear: input.maxBirthYear ?? null,
          genderRestriction: input.genderRestriction ?? null,
          maxPlayers: input.maxPlayers ?? null,
          tieBreakOrder: input.tieBreakOrder ?? [],
        },
      });
      await this.audit.write(tx, {
        action: 'tournament.section_created',
        actorUserId,
        resourceType: 'TournamentSection',
        resourceId: created.id,
        after: {
          tournamentId: created.tournamentId,
          name: created.name,
          pairingSystem: created.pairingSystem,
          totalRounds: created.totalRounds,
        },
      });
      return toSectionRow(created);
    });
  }

  async listSections(tournamentId: string): Promise<SectionRow[]> {
    const rows = await this.prisma.tournamentSection.findMany({
      where: { tournamentId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toSectionRow);
  }

  async findSectionById(id: string): Promise<SectionRow | null> {
    const row = await this.prisma.tournamentSection.findUnique({ where: { id } });
    return row === null ? null : toSectionRow(row);
  }

  // --- Registration -------------------------------------------------------------

  async createRegistration(
    input: CreateRegistrationInput,
    actorUserId: string,
  ): Promise<RegistrationRow> {
    return await this.prisma.$transaction(async (tx) => {
      const created = await tx.registration.create({
        data: {
          sectionId: input.sectionId,
          playerId: input.playerId,
          // Faza 3: ratingAtEntry — service RATING_PORT'dan olib beradi.
          // Muzlatilgan snapshot: turnir davomida reyting o'zgarsa ham
          // juftlashtirish SHU qiymatdan foydalanadi (schema izohi).
          ratingAtEntry: input.ratingAtEntry,
          titleAtEntry: (input.titleAtEntry as ChessTitle | undefined) ?? null,
          isConfirmed: input.isConfirmed,
        },
      });
      await this.audit.write(tx, {
        action: 'registration.created',
        actorUserId,
        resourceType: 'Registration',
        resourceId: created.id,
        after: {
          sectionId: created.sectionId,
          playerId: created.playerId,
          isConfirmed: created.isConfirmed,
        },
      });
      return toRegistrationRow(created);
    });
  }

  async findRegistration(sectionId: string, playerId: string): Promise<RegistrationRow | null> {
    const row = await this.prisma.registration.findUnique({
      where: { sectionId_playerId: { sectionId, playerId } },
    });
    return row === null ? null : toRegistrationRow(row);
  }

  async findRegistrationById(id: string): Promise<RegistrationRow | null> {
    const row = await this.prisma.registration.findUnique({ where: { id } });
    return row === null ? null : toRegistrationRow(row);
  }

  async listRegistrations(sectionId: string): Promise<RegistrationRow[]> {
    const rows = await this.prisma.registration.findMany({
      where: { sectionId },
      orderBy: { id: 'asc' },
    });
    return rows.map(toRegistrationRow);
  }

  /** Chiqmagan (aktiv) ro'yxatlar soni — maxPlayers limiti uchun. */
  async countActiveRegistrations(sectionId: string): Promise<number> {
    return await this.prisma.registration.count({
      where: { sectionId, isWithdrawn: false },
    });
  }

  async withdrawRegistration(
    id: string,
    reason: string,
    actorUserId: string,
  ): Promise<RegistrationRow> {
    return await this.prisma.$transaction(async (tx) => {
      const before = await tx.registration.findUniqueOrThrow({ where: { id } });
      const updated = await tx.registration.update({
        where: { id },
        data: {
          isWithdrawn: true,
          withdrawnAt: new Date(),
          withdrawnReason: reason,
        },
      });
      await this.audit.write(tx, {
        action: 'registration.withdrawn',
        actorUserId,
        resourceType: 'Registration',
        resourceId: id,
        before: { isWithdrawn: before.isWithdrawn },
        after: { isWithdrawn: true, sectionId: updated.sectionId, playerId: updated.playerId },
        reason,
      });
      return toRegistrationRow(updated);
    });
  }
}

// --- Mapper'lar ---------------------------------------------------------------

function toTournamentRow(t: Tournament): TournamentRow {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    federationId: t.federationId,
    regionId: t.regionId,
    clubId: t.clubId,
    organizerId: t.organizerId,
    status: t.status,
    venueName: t.venueName,
    address: t.address,
    startDate: t.startDate,
    endDate: t.endDate,
    registrationOpensAt: t.registrationOpensAt,
    registrationClosesAt: t.registrationClosesAt,
    entryFeeAmount: t.entryFeeAmount === null ? null : t.entryFeeAmount.toString(),
    entryFeeCurrency: t.entryFeeCurrency,
    isFideRated: t.isFideRated,
    isNationallyRated: t.isNationallyRated,
    isPublic: t.isPublic,
    createdAt: t.createdAt,
  };
}

/** Audit JSON ko'rinishi — Date/BigInt JSON-xavfsiz shaklda. */
function toTournamentAuditView(t: Tournament): Record<string, string | boolean | null> {
  return {
    name: t.name,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate.toISOString(),
    entryFeeAmount: t.entryFeeAmount === null ? null : t.entryFeeAmount.toString(),
    isPublic: t.isPublic,
  };
}

function toSectionRow(s: TournamentSection): SectionRow {
  return {
    id: s.id,
    tournamentId: s.tournamentId,
    name: s.name,
    pairingSystem: s.pairingSystem,
    timeCategory: s.timeCategory,
    environment: s.environment,
    totalRounds: s.totalRounds,
    clockType: s.clockType,
    baseTimeSeconds: s.baseTimeSeconds,
    incrementSeconds: s.incrementSeconds,
    minRating: s.minRating,
    maxRating: s.maxRating,
    minBirthYear: s.minBirthYear,
    maxBirthYear: s.maxBirthYear,
    genderRestriction: s.genderRestriction,
    maxPlayers: s.maxPlayers,
    tieBreakOrder: s.tieBreakOrder,
    createdAt: s.createdAt,
  };
}

function toRegistrationRow(r: Registration): RegistrationRow {
  return {
    id: r.id,
    sectionId: r.sectionId,
    playerId: r.playerId,
    pairingNumber: r.pairingNumber,
    ratingAtEntry: r.ratingAtEntry,
    titleAtEntry: r.titleAtEntry,
    isConfirmed: r.isConfirmed,
    isWithdrawn: r.isWithdrawn,
    withdrawnAt: r.withdrawnAt,
    withdrawnReason: r.withdrawnReason,
    joinedAtRound: r.joinedAtRound,
    createdAt: r.createdAt,
  };
}
