import { Inject, Injectable } from '@nestjs/common';

import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  NotFoundError,
} from '../../core/errors/domain.error';
import {
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  MAX_PAGE_SIZE,
  type Page,
  toPage,
} from '../../shared/pagination/cursor';
import { type Actor, RbacService } from '../identity/rbac.port';
import { ORG_PORT, type OrgPort } from '../org/org.port';
import { PLAYER_PORT, type PlayerPort } from '../player/player.port';
import { RATING_PORT, type RatingPort } from '../rating/rating.port';
import { assertTransition, type TournamentStatus } from './tournament-status.machine';
import {
  type CreateSectionInput,
  type CreateTournamentInput,
  type RegistrationRow,
  type SectionRow,
  TournamentRepository,
  type TournamentRow,
  type UpdateTournamentInput,
} from './tournament.repository';

/** Ommaviy ishtirokchilar ro'yxati elementi — faqat ochiq ma'lumot. */
export interface PublicRegistrationView {
  id: string;
  playerId: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  fideId: string | null;
}

/**
 * Ommaviy ro'yxatga olish hisoboti.
 *
 * QISMAN muvaffaqiyat mumkin: bitta o'yinchidagi xato butun importni
 * yiqitmaydi (tournament.service.ts registerMany izohi).
 */
export interface BulkRegistrationResult {
  /** So'ralgan identifikatorlar soni (takrorlar bilan). */
  requested: number;
  /** Yaratilgan Registration identifikatorlari. */
  registered: string[];
  /** Kirmagan o'yinchilar — sabab kodi bilan. */
  failed: { playerId: string; code: string; message: string }[];
}

/** Turnirning org-ierarxiya konteksti (yaratishda dto'dan keladi). */
export interface TournamentOrgInput {
  clubId?: string | undefined;
  regionId?: string | undefined;
  federationId?: string | undefined;
}

/**
 * Tournament — turnir yadrosi. [CANON 5] #4, docs/14-roadmap.md Faza 1.
 *
 * IDOR himoyasi: har yozuv amali YUKLANGAN obyektning ierarxiya
 * identifikatorlari bilan tekshiriladi (docs/10-security.md §3).
 * Ruxsat yo'q → 404, hech qachon 403 (docs/04-api-spec.md §2.4).
 *
 * Modul chegarasi: org konteksti ORG_PORT, o'yinchi ma'lumoti PLAYER_PORT
 * orqali (docs/02-architecture.md §6.1).
 */
@Injectable()
export class TournamentService {
  constructor(
    private readonly tournaments: TournamentRepository,
    private readonly rbac: RbacService,
    @Inject(PLAYER_PORT) private readonly players: PlayerPort,
    @Inject(ORG_PORT) private readonly org: OrgPort,
    @Inject(RATING_PORT) private readonly rating: RatingPort,
  ) {}

  // --- Tournament -----------------------------------------------------------

  /** Ommaviy kalendar — cursor pagination (docs/04-api-spec.md §3). */
  async listPublic(query: {
    first?: number | undefined;
    after?: string | undefined;
    status?: TournamentStatus | undefined;
    regionId?: string | undefined;
  }): Promise<Page<TournamentRow>> {
    const pageSize = Math.min(Math.max(query.first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const afterId = query.after !== undefined ? decodeCursor(query.after) : null;
    const rows = await this.tournaments.listPublic(pageSize, afterId, {
      status: query.status,
      regionId: query.regionId,
    });
    return toPage(rows, pageSize);
  }

  /**
   * Ommaviy ko'rinish: yopiq (isPublic=false) yoki DRAFT turnir — 404,
   * mavjud emasligidan farq bildirilmaydi.
   *
   * TODO(Faza 1): owner-view — tashkilotchi/admin o'z DRAFT turnirini
   * ko'ra olishi kerak; hozircha ommaviy yo'l soddaligi uchun 404.
   */
  async getPublicById(id: string): Promise<TournamentRow> {
    const tournament = await this.tournaments.findById(id);
    if (tournament === null || !tournament.isPublic || tournament.status === 'DRAFT') {
      throw new NotFoundError('Tournament', id);
    }
    return tournament;
  }

  /**
   * Turnir yaratish.
   *
   * Ierarxiya: clubId berilsa klub → viloyat → federatsiya zanjiri
   * ORG_PORT orqali hal qilinadi; regionId berilsa viloyat → federatsiya.
   * Scope tekshiruvi shu to'liq kontekst bilan.
   *
   * organizerId — HAR DOIM aktorning o'zi, dto'dan olinmaydi
   * (mass assignment — docs/10-security.md §6). Holat DRAFT'dan boshlanadi.
   */
  async create(
    actor: Actor,
    input: Omit<CreateTournamentInput, 'organizerId' | 'clubId' | 'regionId' | 'federationId'> &
      TournamentOrgInput,
  ): Promise<TournamentRow> {
    const orgContext = await this.resolveOrgContext(input);

    const allowed = this.rbac.can(actor, 'create', { type: 'Tournament', ...orgContext });
    if (!allowed) {
      throw new NotFoundError('Tournament');
    }

    if (input.endDate < input.startDate) {
      throw new BusinessRuleError('INVALID_DATE_RANGE', 'endDate startDate dan oldin', {
        startDate: input.startDate.toISOString(),
        endDate: input.endDate.toISOString(),
      });
    }

    const existing = await this.tournaments.findBySlug(input.slug);
    if (existing !== null) {
      throw new ConflictError('Bu slug band', { slug: input.slug });
    }

    return await this.tournaments.createTournament(
      { ...input, ...orgContext, organizerId: actor.userId },
      actor.userId,
    );
  }

  /**
   * Tahrirlash — faqat DRAFT yoki REGISTRATION_OPEN holatida.
   * IN_PROGRESS dan keyin sana/start puli o'zgarmaydi — shu qoida bilan
   * kafolatlanadi. ARBITER (fields: ['status']) bu yerdan o'ta olmaydi —
   * unga faqat changeStatus.
   */
  async update(actor: Actor, id: string, input: UpdateTournamentInput): Promise<TournamentRow> {
    const tournament = await this.tournaments.findById(id);
    if (tournament === null) {
      throw new NotFoundError('Tournament', id);
    }

    // Ruxsat BIRINCHI — biznes qoidasi xatosi ham resurs haqida
    // ma'lumot sizdirmasin. docs/04-api-spec.md §2.4
    const writable = this.rbac.writableFields(actor, this.toResourceRef(tournament));
    if (writable !== 'all') {
      throw new NotFoundError('Tournament', id);
    }

    if (tournament.status !== 'DRAFT' && tournament.status !== 'REGISTRATION_OPEN') {
      throw new BusinessRuleError(
        'TOURNAMENT_NOT_EDITABLE',
        'Turnir faqat DRAFT yoki REGISTRATION_OPEN holatida tahrirlanadi',
        { status: tournament.status },
      );
    }

    const startDate = input.startDate ?? tournament.startDate;
    const endDate = input.endDate ?? tournament.endDate;
    if (endDate < startDate) {
      throw new BusinessRuleError('INVALID_DATE_RANGE', 'endDate startDate dan oldin', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
    }

    return await this.tournaments.updateTournament(id, input, actor.userId);
  }

  /**
   * Holat o'tishi — tournament-status.machine.ts dagi mashina bo'yicha.
   * CANCELLED uchun sabab MAJBURIY (auditga kiradi).
   * ARBITER ham o'tkaza oladi (POLICY: Tournament fields ['status']).
   */
  async changeStatus(
    actor: Actor,
    id: string,
    status: TournamentStatus,
    reason?: string,
  ): Promise<TournamentRow> {
    const tournament = await this.tournaments.findById(id);
    if (tournament === null) {
      throw new NotFoundError('Tournament', id);
    }

    const writable = this.rbac.writableFields(actor, this.toResourceRef(tournament));
    const allowed = writable === 'all' || writable.includes('status');
    if (!allowed) {
      throw new NotFoundError('Tournament', id);
    }

    assertTransition(tournament.status, status);

    const trimmedReason = reason?.trim();
    if (status === 'CANCELLED' && (trimmedReason === undefined || trimmedReason === '')) {
      throw new BusinessRuleError(
        'CANCEL_REASON_REQUIRED',
        'Turnirni bekor qilish uchun sabab majburiy',
        { status },
      );
    }

    return await this.tournaments.changeStatus(id, status, actor.userId, trimmedReason);
  }

  // --- TournamentSection ------------------------------------------------------

  /**
   * Seksiya faqat DRAFT holatida yaratiladi — ro'yxat ochilgach turnir
   * strukturasi o'zgarmaydi (juftlashtirish determinizmi).
   */
  async createSection(
    actor: Actor,
    tournamentId: string,
    input: Omit<CreateSectionInput, 'tournamentId'>,
  ): Promise<SectionRow> {
    const tournament = await this.tournaments.findById(tournamentId);
    if (tournament === null) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    const allowed = this.rbac.can(actor, 'create', {
      type: 'TournamentSection',
      ...this.toOrgRef(tournament),
      tournamentId: tournament.id,
    });
    if (!allowed) {
      throw new NotFoundError('Tournament', tournamentId);
    }

    if (tournament.status !== 'DRAFT') {
      throw new BusinessRuleError(
        'SECTION_ONLY_IN_DRAFT',
        "Seksiya faqat DRAFT holatidagi turnirga qo'shiladi",
        { status: tournament.status },
      );
    }
    if (input.totalRounds < 1) {
      throw new BusinessRuleError('INVALID_TOTAL_ROUNDS', 'totalRounds kamida 1', {
        totalRounds: input.totalRounds,
      });
    }
    if (input.baseTimeSeconds <= 0) {
      throw new BusinessRuleError('INVALID_BASE_TIME', "baseTimeSeconds musbat bo'lishi shart", {
        baseTimeSeconds: input.baseTimeSeconds,
      });
    }

    const siblings = await this.tournaments.listSections(tournamentId);
    if (siblings.some((s) => s.name === input.name)) {
      throw new ConflictError('Bu nomdagi seksiya allaqachon bor', { name: input.name });
    }

    return await this.tournaments.createSection({ ...input, tournamentId }, actor.userId);
  }

  /** Seksiyalar — ommaviy; yashirin turnirning seksiyalari ham yashirin. */
  async listSections(tournamentId: string): Promise<SectionRow[]> {
    await this.getPublicById(tournamentId);
    return await this.tournaments.listSections(tournamentId);
  }

  // --- Registration -------------------------------------------------------------

  /**
   * O'yinchining O'ZINI ro'yxatga olishi (self-registration).
   *
   * Qoidalar:
   *  - turnir REGISTRATION_OPEN holatida bo'lishi shart;
   *  - aktorning o'yinchi profili bo'lishi shart (PLAYER_PORT);
   *  - takroriy ro'yxat → 409 CONFLICT;
   *  - maxPlayers limiti → SECTION_FULL (kutish ro'yxati — keyinroq).
   *
   * TODO(Faza 1): hakam tomonidan ro'yxatga olish (dto'da playerId).
   * TODO(Faza 4): start puli bor turnirda to'lov oqimi — hozircha
   *               puli borlar isConfirmed=false (PENDING_PAYMENT semantikasi).
   */
  /**
   * Ro'yxatga olish.
   *
   * @param targetPlayerId  berilsa — BOSHQA o'yinchini ro'yxatga olish
   *   (hakam oqimi, docs/14-roadmap.md Faza 1 "o'zi yoki hakam tomonidan").
   *   Ilgari bu imkoniyat YO'Q edi va real turnirda kelib qolgan
   *   o'yinchini hakam qo'sha olmasdi (docs/AUDIT.md JIDDIY-8).
   *
   * RBAC farqi ATAYLAB avtomatik: o'zini ro'yxatga olishda `ownerUserId`
   * uzatiladi va `own` scope qamraydi; boshqa odamni ro'yxatga olishda
   * u UZATILMAYDI — `scopeCovers` uchun maydon `undefined` bo'ladi va
   * `own` grant qamramaydi ("noaniqlik = rad", rbac.service.ts). Ya'ni
   * faqat turnir/klub/federatsiya yoki global grant o'tadi.
   */
  async register(
    actor: Actor,
    sectionId: string,
    targetPlayerId?: string,
  ): Promise<RegistrationRow> {
    const section = await this.tournaments.findSectionById(sectionId);
    if (section === null) {
      throw new NotFoundError('TournamentSection', sectionId);
    }
    const tournament = await this.tournaments.findById(section.tournamentId);
    if (tournament === null) {
      throw new NotFoundError('Tournament', section.tournamentId);
    }

    const onBehalfOfOther = targetPlayerId !== undefined;
    const allowed = this.rbac.can(actor, 'create', {
      type: 'Registration',
      ...(onBehalfOfOther ? {} : { ownerUserId: actor.userId }),
      ...this.toOrgRef(tournament),
      tournamentId: tournament.id,
    });
    if (!allowed) {
      throw new NotFoundError('TournamentSection', sectionId);
    }

    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BusinessRuleError('REGISTRATION_NOT_OPEN', "Turnirda ro'yxatga olish ochiq emas", {
        status: tournament.status,
      });
    }

    const player = onBehalfOfOther
      ? await this.players.findById(targetPlayerId)
      : await this.players.findSummaryByUserId(actor.userId);
    if (player === null) {
      // O'zini ro'yxatga olishda — aktorning profili yo'q (avval profil
      // kerak); hakam oqimida — ko'rsatilgan o'yinchi topilmadi.
      throw new NotFoundError('Player', targetPlayerId);
    }

    const existing = await this.tournaments.findRegistration(sectionId, player.id);
    if (existing !== null) {
      throw new ConflictError("O'yinchi bu seksiyada allaqachon ro'yxatdan o'tgan", {
        sectionId,
        playerId: player.id,
      });
    }

    if (section.maxPlayers !== null) {
      const active = await this.tournaments.countActiveRegistrations(sectionId);
      if (active >= section.maxPlayers) {
        throw new BusinessRuleError('SECTION_FULL', "Seksiya to'lgan", {
          maxPlayers: section.maxPlayers,
        });
      }
    }

    // Faza 3: ratingAtEntry — reyting modulidan MUZLATILGAN snapshot
    // (RATING_PORT). Seksiya kategoriyasi (environment, timeCategory)
    // bo'yicha joriy reyting; hech qachon o'ynamagan → null qoladi
    // (1500 deb taxmin qilinmaydi — snapshot halolligi). Provisional
    // reyting ham seedingda ishlatiladi (docs/06-rating-system.md §4.2).
    const currentRating = await this.rating.getCurrentRating(
      player.id,
      section.environment,
      section.timeCategory,
    );

    return await this.tournaments.createRegistration(
      {
        sectionId,
        playerId: player.id,
        ...(player.title !== null && { titleAtEntry: player.title }),
        // Registration.ratingAtEntry — Int ustun: butun songa yaxlitlanadi.
        ratingAtEntry: currentRating === null ? null : Math.round(currentRating.rating),
        // TODO(Faza 4): to'lov oqimi — hozircha faqat bepul turnir avtomatik
        //               tasdiqlanadi.
        isConfirmed: tournament.entryFeeAmount === null,
      },
      actor.userId,
    );
  }

  /**
   * Ommaviy ro'yxatga olish — mavjud o'yinchilar ro'yxati bo'yicha.
   *
   * ═════════════════════════════════════════════════════════════════════
   *  QISMAN MUVAFFAQIYAT — ATAYLAB.
   *
   *  Bitta o'yinchi allaqachon ro'yxatda bo'lgani (yoki profili yo'qligi)
   *  BUTUN importni yiqitmasligi kerak: hakam 60 kishilik ro'yxatni
   *  yuklaganda 3 tasi takror bo'lsa, qolgan 57 tasi kirishi shart.
   *  Shuning uchun bu metod throw QILMAYDI, har o'yinchi uchun natija
   *  qaytaradi va chaqiruvchi (hakam) nima bo'lganini ko'radi.
   *
   *  Ruxsat xatosi ISTISNO: u birinchi o'yinchidayoq chiqadi va butun
   *  operatsiyani to'xtatadi — aks holda 200 ta 404 qaytarardik.
   * ═════════════════════════════════════════════════════════════════════
   *
   * Ketma-ket bajariladi, parallel EMAS: `countActiveRegistrations`
   * (maxPlayers tekshiruvi) parallel yozuvlarda limitdan oshib ketardi.
   */
  async registerMany(
    actor: Actor,
    sectionId: string,
    playerIds: readonly string[],
  ): Promise<BulkRegistrationResult> {
    const registered: string[] = [];
    const failed: { playerId: string; code: string; message: string }[] = [];

    // Takror identifikatorlar — ro'yxatda ikki marta yozilgan bo'lishi
    // mumkin; ikkinchisi baribir ConflictError bo'lardi, oldindan tozalash
    // esa hisobotni tushunarli qiladi.
    for (const playerId of [...new Set(playerIds)]) {
      try {
        const row = await this.register(actor, sectionId, playerId);
        registered.push(row.id);
      } catch (error) {
        if (error instanceof NotFoundError && error.meta.resource === 'TournamentSection') {
          // Ruxsat yo'q (yoki seksiya yo'q) — davom etishning ma'nosi yo'q.
          // `register` ruxsatsizlikni ATAYLAB shu xato bilan qaytaradi
          // (404, 403 emas — docs/04-api-spec.md §2.4).
          throw error;
        }
        if (error instanceof DomainError) {
          failed.push({ playerId, code: error.code, message: error.message });
          continue;
        }
        throw error;
      }
    }

    return { registered, failed, requested: playerIds.length };
  }

  /** Ommaviy ishtirokchilar ro'yxati — faqat tasdiqlangan va chiqmaganlar. */
  async listPublicRegistrations(sectionId: string): Promise<PublicRegistrationView[]> {
    const section = await this.tournaments.findSectionById(sectionId);
    if (section === null) {
      throw new NotFoundError('TournamentSection', sectionId);
    }
    await this.getPublicById(section.tournamentId);

    const rows = await this.tournaments.listRegistrations(sectionId);
    const visible = rows.filter((r) => r.isConfirmed && !r.isWithdrawn);
    const summaries = await this.players.findManyByIds(visible.map((r) => r.playerId));
    const byId = new Map(summaries.map((s) => [s.id, s]));

    return visible.map((r) => {
      const player = byId.get(r.playerId);
      return {
        id: r.id,
        playerId: r.playerId,
        firstName: player?.firstName ?? null,
        lastName: player?.lastName ?? null,
        title: player?.title ?? null,
        fideId: player?.fideId ?? null,
      };
    });
  }

  /**
   * Ro'yxatdan chiqarish — o'z ro'yxati YOKI scope ichidagi mas'ul
   * (hakam/tashkilotchi/klub admin). Sabab MAJBURIY — auditga kiradi.
   */
  async withdraw(actor: Actor, registrationId: string, reason: string): Promise<RegistrationRow> {
    const trimmedReason = reason.trim();
    if (trimmedReason === '') {
      throw new BusinessRuleError(
        'WITHDRAW_REASON_REQUIRED',
        "Ro'yxatdan chiqarish uchun sabab majburiy",
        {},
      );
    }

    const registration = await this.tournaments.findRegistrationById(registrationId);
    if (registration === null) {
      throw new NotFoundError('Registration', registrationId);
    }
    const section = await this.tournaments.findSectionById(registration.sectionId);
    if (section === null) {
      throw new NotFoundError('Registration', registrationId);
    }
    const tournament = await this.tournaments.findById(section.tournamentId);
    if (tournament === null) {
      throw new NotFoundError('Registration', registrationId);
    }

    const ownPlayer = await this.players.findSummaryByUserId(actor.userId);
    const isOwn = ownPlayer !== null && ownPlayer.id === registration.playerId;

    const ref = {
      type: 'Registration' as const,
      ...(isOwn && { ownerUserId: actor.userId }),
      ...this.toOrgRef(tournament),
      tournamentId: tournament.id,
    };
    // O'z ro'yxati — PLAYER'ning `delete` granti (CRD); mas'ullar — `update`.
    const allowed = isOwn
      ? this.rbac.can(actor, 'delete', ref) || this.rbac.can(actor, 'update', ref)
      : this.rbac.can(actor, 'update', ref);
    if (!allowed) {
      throw new NotFoundError('Registration', registrationId);
    }

    if (registration.isWithdrawn) {
      throw new ConflictError("Ro'yxat allaqachon chiqarilgan", { registrationId });
    }

    return await this.tournaments.withdrawRegistration(registrationId, trimmedReason, actor.userId);
  }

  // --- Yordamchilar -----------------------------------------------------------

  /** Turnirning org-ierarxiya identifikatorlari (RBAC scope uchun). */
  private toOrgRef(t: TournamentRow): {
    clubId?: string;
    regionId?: string;
    federationId?: string;
  } {
    return {
      ...(t.clubId !== null && { clubId: t.clubId }),
      ...(t.regionId !== null && { regionId: t.regionId }),
      ...(t.federationId !== null && { federationId: t.federationId }),
    };
  }

  private toResourceRef(t: TournamentRow): {
    type: 'Tournament';
    clubId?: string;
    regionId?: string;
    federationId?: string;
    tournamentId: string;
  } {
    return { type: 'Tournament', ...this.toOrgRef(t), tournamentId: t.id };
  }

  /**
   * dto'dagi org identifikatoridan to'liq kontekst: klub → viloyat →
   * federatsiya. Mavjud bo'lmagan klub/viloyat → 404.
   *
   * federationId to'g'ridan-to'g'ri berilsa tekshirilmaydi (org portida
   * federatsiya lookup'i yo'q) — noto'g'ri qiymat scope tekshiruvidan
   * o'tmaydi, faqat SUPER_ADMIN'da FK xatosiga boradi.
   */
  private async resolveOrgContext(input: TournamentOrgInput): Promise<{
    clubId?: string;
    regionId?: string;
    federationId?: string;
  }> {
    if (input.clubId !== undefined) {
      const context = await this.org.findClubContext(input.clubId);
      if (context === null) {
        throw new NotFoundError('Club', input.clubId);
      }
      return {
        clubId: context.clubId,
        regionId: context.regionId,
        federationId: context.federationId,
      };
    }
    if (input.regionId !== undefined) {
      const context = await this.org.findRegionContext(input.regionId);
      if (context === null) {
        throw new NotFoundError('Region', input.regionId);
      }
      return { regionId: context.regionId, federationId: context.federationId };
    }
    if (input.federationId !== undefined) {
      return { federationId: input.federationId };
    }
    return {};
  }
}
