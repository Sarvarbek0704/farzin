import { Injectable } from '@nestjs/common';
import type { Pairing, Round, Standing } from '@prisma/client';

import { ConflictError, NotFoundError } from '../../core/errors/domain.error';
import { AuditService } from '../../shared/audit/audit.service';
import { OutboxService } from '../../shared/outbox/outbox.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { PairingSystem } from '../tournament/tournament.types';
import type {
  PairingHistoryEntry,
  PairingResultValue,
  RoundStatusValue,
} from './arbiter.types';

/**
 * Arbiter ma'lumot qatlami — Prisma FAQAT shu faylda
 * (.dependency-cruiser.js `prisma-only-in-infrastructure`).
 *
 * Har yozuv amali audit yozuvi bilan BIR TRANZAKSIYADA
 * (docs/10-security.md §10, shared/audit/audit.service.ts). Tur yakuni
 * esa qo'shimcha ravishda outbox event bilan ham atomik (ADR-0008).
 *
 * MODUL CHEGARASI HAQIDA: Round/Pairing/Standing jadvallari — arbiter
 * mas'uliyati ("natija kiritish", docs/02-architecture.md §5 #7).
 * tournament_sections/tournaments/registrations o'qishlari — kontekst
 * uchun kulrang zona; Faza 1 uchun qabul qilingan.
 * TODO(Faza 2): tournament modulidan TournamentPort ajratib, seksiya/
 *               turnir kontekstini port orqali olish.
 */

// --- Qator (row) tiplar --------------------------------------------------------

export interface SectionContextRow {
  id: string;
  tournamentId: string;
  name: string;
  pairingSystem: PairingSystem;
  totalRounds: number;
  tieBreakOrder: string[];
  tournament: {
    id: string;
    /** TournamentStatus literal — 'IN_PROGRESS' tekshiruvi uchun. */
    status: string;
    isPublic: boolean;
    clubId: string | null;
    regionId: string | null;
    federationId: string | null;
    /** Eksport metasi (PGN/TRF header, fayl nomi) uchun. */
    name: string;
    slug: string;
    venueName: string | null;
    startDate: Date;
    endDate: Date;
  };
}

// --- Eksport qatorlari (docs/14-roadmap.md Faza 1 "Eksport") -------------------

export interface ExportPlayerRow {
  registrationId: string;
  pairingNumber: number;
  ratingAtEntry: number | null;
  /** ChessTitle literal (GM/IM/...) yoki null. */
  titleAtEntry: string | null;
  firstName: string;
  lastName: string;
  gender: 'MALE' | 'FEMALE' | null;
  birthDate: Date | null;
  fideId: string | null;
  /** Standing.points Decimal → string (ADR-0006 uslubi); jadval yo'q — null. */
  points: string | null;
  rank: number | null;
}

export interface ExportPairingItemRow {
  boardNumber: number;
  whiteRegistrationId: string;
  blackRegistrationId: string | null;
  result: PairingResultValue;
  pgn: string | null;
}

export interface ExportRoundRow {
  number: number;
  scheduledStartAt: Date | null;
  pairings: ExportPairingItemRow[];
}

/** Seksiya eksporti uchun barcha qatorlar — core/export kirishi xomashyosi. */
export interface SectionExportRows {
  players: ExportPlayerRow[];
  rounds: ExportRoundRow[];
}

export interface ParticipantRow {
  id: string;
  pairingNumber: number | null;
  ratingAtEntry: number | null;
  isWithdrawn: boolean;
  joinedAtRound: number | null;
}

export interface RoundRow {
  id: string;
  sectionId: string;
  number: number;
  status: RoundStatusValue;
  completedAt: Date | null;
  pairingEngineVersion: string | null;
  pairingComputedAt: Date | null;
  pairingDurationMs: number | null;
  createdAt: Date;
}

export interface PairingRow {
  id: string;
  roundId: string;
  boardNumber: number;
  whiteRegistrationId: string;
  blackRegistrationId: string | null;
  result: PairingResultValue;
  resultEnteredBy: string | null;
  resultEnteredAt: Date | null;
}

export interface RoundWithPairings extends RoundRow {
  pairings: PairingRow[];
}

/** Juftlik + tur konteksti — natija kiritish qoidalari uchun. */
export interface PairingContextRow extends PairingRow {
  sectionId: string;
  roundNumber: number;
  roundStatus: RoundStatusValue;
}

export interface StandingRow {
  registrationId: string;
  /** Decimal → string (ADR-0006 uslubi: JSON'da aniq kasr yo'qolmasin). */
  points: string;
  rank: number | null;
  tieBreakValues: Record<string, number>;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  colorHistory: string[];
  floatHistory: string[];
  computedAt: Date;
}

export interface CreateRoundBoardInput {
  boardNumber: number;
  whiteRegistrationId: string;
  blackRegistrationId: string | null;
  result: PairingResultValue;
}

export interface CreateRoundInput {
  sectionId: string;
  number: number;
  engineVersion: string;
  durationMs: number;
  boards: CreateRoundBoardInput[];
}

export interface UpsertStandingInput {
  registrationId: string;
  points: string;
  rank: number;
  tieBreakValues: Record<string, number>;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  colorHistory: string[];
  floatHistory: string[];
}

@Injectable()
export class ArbiterRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // --- Kontekst -------------------------------------------------------------

  /** Seksiya + turnir konteksti (ruxsat va holat tekshiruvlari uchun). */
  async findSectionWithTournament(sectionId: string): Promise<SectionContextRow | null> {
    const row = await this.prisma.tournamentSection.findUnique({
      where: { id: sectionId },
      include: { tournament: true },
    });
    // Soft-delete qilingan turnir ko'rinmaydi (row yo'q holat bilan teng).
    if (row?.tournament.deletedAt !== null) {
      return null;
    }
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      name: row.name,
      pairingSystem: row.pairingSystem,
      totalRounds: row.totalRounds,
      tieBreakOrder: row.tieBreakOrder,
      tournament: {
        id: row.tournament.id,
        status: row.tournament.status,
        isPublic: row.tournament.isPublic,
        clubId: row.tournament.clubId,
        regionId: row.tournament.regionId,
        federationId: row.tournament.federationId,
        name: row.tournament.name,
        slug: row.tournament.slug,
        venueName: row.tournament.venueName,
        startDate: row.tournament.startDate,
        endDate: row.tournament.endDate,
      },
    };
  }

  /**
   * Eksport uchun to'liq ma'lumot (docs/14-roadmap.md Faza 1 "Eksport"):
   * raqam olgan ishtirokchilar (o'yinchi profili va jadval qatori bilan)
   * hamda barcha turlar juftliklari bilan. Chiqib ketganlar HAM kiradi —
   * ularning o'ynagan partiyalari hisobotda qolishi shart (TRF/PGN
   * tarixiy hujjat).
   */
  async sectionExportData(sectionId: string): Promise<SectionExportRows> {
    const registrations = await this.prisma.registration.findMany({
      where: { sectionId, pairingNumber: { not: null } },
      orderBy: { pairingNumber: 'asc' },
      include: {
        player: {
          select: {
            firstName: true,
            lastName: true,
            gender: true,
            birthDate: true,
            fideId: true,
          },
        },
        standing: { select: { points: true, rank: true } },
      },
    });

    const rounds = await this.prisma.round.findMany({
      where: { sectionId },
      orderBy: { number: 'asc' },
      include: { pairings: { orderBy: { boardNumber: 'asc' } } },
    });

    return {
      players: registrations.map((r) => ({
        registrationId: r.id,
        // where sharti null'ni chiqarib tashlagan; 0 — tip himoyasi.
        pairingNumber: r.pairingNumber ?? 0,
        ratingAtEntry: r.ratingAtEntry,
        titleAtEntry: r.titleAtEntry,
        firstName: r.player.firstName,
        lastName: r.player.lastName,
        gender: r.player.gender,
        birthDate: r.player.birthDate,
        fideId: r.player.fideId,
        points: r.standing?.points.toString() ?? null,
        rank: r.standing?.rank ?? null,
      })),
      rounds: rounds.map((round) => ({
        number: round.number,
        scheduledStartAt: round.scheduledStartAt,
        pairings: round.pairings.map((p) => ({
          boardNumber: p.boardNumber,
          whiteRegistrationId: p.whiteRegistrationId,
          blackRegistrationId: p.blackRegistrationId,
          result: p.result,
          pgn: p.pgn,
        })),
      })),
    };
  }

  /** Aktor shu turnirga biriktirilgan hakammi (TournamentArbiter qatori). */
  async isArbiterOf(tournamentId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.tournamentArbiter.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
      select: { id: true },
    });
    return row !== null;
  }

  // --- Registration ----------------------------------------------------------

  /** Aktiv (tasdiqlangan, chiqmagan) ro'yxatlar — raqam berish nomzodlari. */
  async activeRegistrations(sectionId: string): Promise<ParticipantRow[]> {
    const rows = await this.prisma.registration.findMany({
      where: { sectionId, isConfirmed: true, isWithdrawn: false },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toParticipantRow);
  }

  /**
   * Raqam olgan ishtirokchilar — juftlashtirish va jadval uchun.
   * Chiqib ketganlar HAM kiradi: Berger jadvalidagi o'rindig'i saqlanadi
   * (round-robin.engine.ts header qarori #1), natijalari jadvalda qoladi.
   */
  async numberedRegistrations(sectionId: string): Promise<ParticipantRow[]> {
    const rows = await this.prisma.registration.findMany({
      where: { sectionId, pairingNumber: { not: null } },
      orderBy: { pairingNumber: 'asc' },
    });
    return rows.map(toParticipantRow);
  }

  /**
   * Juftlashtirish raqamlarini berish — reyting bo'yicha, bir marta.
   *
   * Tartib (docs/05-pairing-engine.md §2 — "turnir boshlanganda reyting
   * bo'yicha"): ratingAtEntry DESC NULLS LAST, keyin createdAt ASC,
   * keyin id ASC (to'liq determinizm). Idempotent: hammasi raqamli
   * bo'lsa — hech narsa qilmaydi; QISMAN raqamlangan holat — ma'lumot
   * ziddiyati → ConflictError (yarim holat ustiga yozilmaydi).
   */
  async assignPairingNumbers(sectionId: string, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const regs = await tx.registration.findMany({
        where: { sectionId, isConfirmed: true, isWithdrawn: false },
        orderBy: [
          { ratingAtEntry: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      });

      const numbered = regs.filter((r) => r.pairingNumber !== null);
      if (numbered.length === regs.length && regs.length > 0) {
        return; // allaqachon berilgan — idempotent
      }
      if (numbered.length > 0) {
        throw new ConflictError('Juftlashtirish raqamlari qisman berilgan — ziddiyat', {
          sectionId,
          numbered: numbered.length,
          total: regs.length,
        });
      }

      let next = 1;
      for (const reg of regs) {
        await tx.registration.update({
          where: { id: reg.id },
          data: { pairingNumber: next },
        });
        next += 1;
      }

      await this.audit.write(tx, {
        action: 'section.pairing_numbers_assigned',
        actorUserId,
        resourceType: 'TournamentSection',
        resourceId: sectionId,
        after: { count: regs.length },
      });
    });
  }

  // --- Round / Pairing --------------------------------------------------------

  /**
   * Tur + juftliklarni bitta tranzaksiyada yaratish. Round darhol PAIRED
   * holatida tug'iladi (juftlashtirish sinxron — RR uchun millisekundlar).
   */
  async createRoundWithPairings(
    input: CreateRoundInput,
    actorUserId: string,
  ): Promise<RoundWithPairings> {
    return await this.prisma.$transaction(async (tx) => {
      const round = await tx.round.create({
        data: {
          sectionId: input.sectionId,
          number: input.number,
          status: 'PAIRED',
          pairingEngineVersion: input.engineVersion,
          pairingComputedAt: new Date(),
          pairingDurationMs: input.durationMs,
        },
      });

      await tx.pairing.createMany({
        data: input.boards.map((board) => ({
          roundId: round.id,
          boardNumber: board.boardNumber,
          whiteRegistrationId: board.whiteRegistrationId,
          blackRegistrationId: board.blackRegistrationId,
          result: board.result,
        })),
      });

      await this.audit.write(tx, {
        action: 'round.paired',
        actorUserId,
        resourceType: 'Round',
        resourceId: round.id,
        after: {
          sectionId: input.sectionId,
          number: input.number,
          boards: input.boards.length,
          byes: input.boards.filter((b) => b.blackRegistrationId === null).length,
          engineVersion: input.engineVersion,
        },
      });

      const pairings = await tx.pairing.findMany({
        where: { roundId: round.id },
        orderBy: { boardNumber: 'asc' },
      });
      return { ...toRoundRow(round), pairings: pairings.map(toPairingRow) };
    });
  }

  async findRound(roundId: string): Promise<RoundWithPairings | null> {
    const row = await this.prisma.round.findUnique({
      where: { id: roundId },
      include: { pairings: { orderBy: { boardNumber: 'asc' } } },
    });
    if (row === null) {
      return null;
    }
    return { ...toRoundRow(row), pairings: row.pairings.map(toPairingRow) };
  }

  async findRoundBySectionAndNumber(
    sectionId: string,
    number: number,
  ): Promise<RoundWithPairings | null> {
    const row = await this.prisma.round.findUnique({
      where: { sectionId_number: { sectionId, number } },
      include: { pairings: { orderBy: { boardNumber: 'asc' } } },
    });
    if (row === null) {
      return null;
    }
    return { ...toRoundRow(row), pairings: row.pairings.map(toPairingRow) };
  }

  async listRounds(sectionId: string): Promise<RoundRow[]> {
    const rows = await this.prisma.round.findMany({
      where: { sectionId },
      orderBy: { number: 'asc' },
    });
    return rows.map(toRoundRow);
  }

  async latestRound(sectionId: string): Promise<RoundRow | null> {
    const row = await this.prisma.round.findFirst({
      where: { sectionId },
      orderBy: { number: 'desc' },
    });
    return row === null ? null : toRoundRow(row);
  }

  /** Juftlik + tur konteksti — natija kiritish oqimi uchun. */
  async findPairingContext(pairingId: string): Promise<PairingContextRow | null> {
    const row = await this.prisma.pairing.findUnique({
      where: { id: pairingId },
      include: { round: { select: { sectionId: true, number: true, status: true } } },
    });
    if (row === null) {
      return null;
    }
    return {
      ...toPairingRow(row),
      sectionId: row.round.sectionId,
      roundNumber: row.round.number,
      roundStatus: row.round.status,
    };
  }

  /**
   * Seksiyaning BARCHA juftliklari, tur tartibida — jadval hisoblash va
   * keyingi tur uchun o'yinchi holatini qurishga kirish.
   */
  async completedPairingsForSection(sectionId: string): Promise<PairingHistoryEntry[]> {
    const rows = await this.prisma.pairing.findMany({
      where: { round: { sectionId } },
      select: {
        whiteRegistrationId: true,
        blackRegistrationId: true,
        result: true,
        round: { select: { number: true } },
      },
      orderBy: [{ round: { number: 'asc' } }, { boardNumber: 'asc' }],
    });
    return rows.map((row) => ({
      roundNumber: row.round.number,
      whiteRegistrationId: row.whiteRegistrationId,
      blackRegistrationId: row.blackRegistrationId,
      result: row.result,
    }));
  }

  /**
   * Natija kiritish/tuzatish. Audit BIR TRANZAKSIYADA:
   * birinchi kiritish → 'result.created'; o'zgartirish → 'result.updated'
   * (sabab MAJBURIY — AuditService REASON_REQUIRED ro'yxati buni
   * qo'shimcha himoya qiladi).
   */
  async enterResult(
    pairingId: string,
    result: PairingResultValue,
    actorUserId: string,
    reason: string | null,
  ): Promise<PairingRow> {
    return await this.prisma.$transaction(async (tx) => {
      const before = await tx.pairing.findUnique({ where: { id: pairingId } });
      if (before === null) {
        throw new NotFoundError('Pairing', pairingId);
      }

      const updated = await tx.pairing.update({
        where: { id: pairingId },
        data: {
          result: result,
          resultEnteredBy: actorUserId,
          resultEnteredAt: new Date(),
        },
      });

      await this.audit.write(tx, {
        action: before.result === 'UNPLAYED' ? 'result.created' : 'result.updated',
        actorUserId,
        resourceType: 'Pairing',
        resourceId: pairingId,
        before: { result: before.result },
        after: {
          result: updated.result,
          roundId: updated.roundId,
          boardNumber: updated.boardNumber,
        },
        ...(reason !== null && { reason }),
      });

      return toPairingRow(updated);
    });
  }

  /**
   * Turni yakunlash: holat + completedAt + outbox `RoundCompleted`
   * (ADR-0008 ro'yxatidagi event) + audit — hammasi BIR TRANZAKSIYADA.
   */
  async completeRound(roundId: string, actorUserId: string): Promise<RoundWithPairings> {
    return await this.prisma.$transaction(async (tx) => {
      const before = await tx.round.findUnique({ where: { id: roundId } });
      if (before === null) {
        throw new NotFoundError('Round', roundId);
      }

      const updated = await tx.round.update({
        where: { id: roundId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      await this.outbox.enqueue(tx, {
        eventType: 'RoundCompleted',
        aggregateType: 'Round',
        aggregateId: roundId,
        payload: {
          roundId,
          sectionId: updated.sectionId,
          roundNumber: updated.number,
        },
      });

      await this.audit.write(tx, {
        action: 'round.completed',
        actorUserId,
        resourceType: 'Round',
        resourceId: roundId,
        before: { status: before.status },
        after: { status: updated.status, sectionId: updated.sectionId, number: updated.number },
      });

      const pairings = await tx.pairing.findMany({
        where: { roundId },
        orderBy: { boardNumber: 'asc' },
      });
      return { ...toRoundRow(updated), pairings: pairings.map(toPairingRow) };
    });
  }

  // --- Standing ---------------------------------------------------------------

  /**
   * Jadvalni to'liq qayta yozish (upsert). Standing — denormalizatsiya,
   * haqiqat manbai Pairing.result (prisma/schema.prisma izohi), shuning
   * uchun bu yerda audit YO'Q — hisob istalgan payt qayta chiqariladi.
   */
  async upsertStandings(sectionId: string, rows: UpsertStandingInput[]): Promise<void> {
    const computedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const data = {
          points: row.points,
          rank: row.rank,
          tieBreakValues: row.tieBreakValues,
          gamesPlayed: row.gamesPlayed,
          wins: row.wins,
          draws: row.draws,
          losses: row.losses,
          colorHistory: row.colorHistory,
          floatHistory: row.floatHistory,
          computedAt,
        };
        await tx.standing.upsert({
          where: { registrationId: row.registrationId },
          create: { sectionId, registrationId: row.registrationId, ...data },
          update: data,
        });
      }
    });
  }

  async getStandings(sectionId: string): Promise<StandingRow[]> {
    const rows = await this.prisma.standing.findMany({
      where: { sectionId },
      orderBy: [{ rank: 'asc' }],
    });
    return rows.map(toStandingRow);
  }
}

// --- Mapper'lar ---------------------------------------------------------------

function toParticipantRow(r: {
  id: string;
  pairingNumber: number | null;
  ratingAtEntry: number | null;
  isWithdrawn: boolean;
  joinedAtRound: number | null;
}): ParticipantRow {
  return {
    id: r.id,
    pairingNumber: r.pairingNumber,
    ratingAtEntry: r.ratingAtEntry,
    isWithdrawn: r.isWithdrawn,
    joinedAtRound: r.joinedAtRound,
  };
}

function toRoundRow(r: Round): RoundRow {
  return {
    id: r.id,
    sectionId: r.sectionId,
    number: r.number,
    status: r.status,
    completedAt: r.completedAt,
    pairingEngineVersion: r.pairingEngineVersion,
    pairingComputedAt: r.pairingComputedAt,
    pairingDurationMs: r.pairingDurationMs,
    createdAt: r.createdAt,
  };
}

function toPairingRow(p: Pairing): PairingRow {
  return {
    id: p.id,
    roundId: p.roundId,
    boardNumber: p.boardNumber,
    whiteRegistrationId: p.whiteRegistrationId,
    blackRegistrationId: p.blackRegistrationId,
    result: p.result,
    resultEnteredBy: p.resultEnteredBy,
    resultEnteredAt: p.resultEnteredAt,
  };
}

function toStandingRow(s: Standing): StandingRow {
  return {
    registrationId: s.registrationId,
    points: s.points.toString(),
    rank: s.rank,
    tieBreakValues: s.tieBreakValues as Record<string, number>,
    gamesPlayed: s.gamesPlayed,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    colorHistory: s.colorHistory,
    floatHistory: s.floatHistory,
    computedAt: s.computedAt,
  };
}
