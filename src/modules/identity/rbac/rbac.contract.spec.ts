import {
  type Action,
  type Actor,
  type ResourceRef,
  type ResourceType,
  type Role,
  type Scope,
} from './permission.types';
import { POLICY } from './policy.registry';
import { RbacService } from './rbac.service';

/**
 * RBAC kontrakt testi — docs/01-product-spec.md §4.1 matritsasi va
 * POLICY reestrini QULFDA ushlaydi: jadval o'zgarsa test quladi,
 * reestr og'sa test quladi.
 *
 * Ikki qism:
 *  1. Reestr invariantlari — matritsaning "qizil chiziqlari"
 *     (AuditLog, RatingHistory, PARENT, CLUB_ADMIN, SPECTATOR).
 *  2. Xulq-atvor — scope semantikasi: IDOR, muddat, fields.
 */

/** §4 jadvalidagi 10 rol — prisma `Role` enum bilan aynan mos. */
const ALL_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'FEDERATION_ADMIN',
  'REGION_ADMIN',
  'CLUB_ADMIN',
  'ARBITER',
  'COACH',
  'SCHOOL_TEACHER',
  'PLAYER',
  'PARENT',
  'SPECTATOR',
];

/** §4.1 matritsasining 32 qatori. */
const ALL_RESOURCES: readonly ResourceType[] = [
  'User',
  'Session',
  'Player',
  'Federation',
  'Region',
  'Club',
  'ClubMembership',
  'Tournament',
  'TournamentSection',
  'Registration',
  'Round',
  'Pairing',
  'GameResult',
  'RatingPeriod',
  'RatingHistory',
  'Title',
  'Arbiter',
  'Appeal',
  'OnlineGame',
  'Move',
  'Puzzle',
  'PuzzleAttempt',
  'Coach',
  'Lesson',
  'School',
  'SchoolClass',
  'Student',
  'Subscription',
  'Invoice',
  'Payment',
  'AuditLog',
  'FairPlayCase',
];

const WRITE_ACTIONS: readonly Action[] = ['create', 'update', 'delete'];

const NOW = new Date('2026-07-23T12:00:00Z');

const service = new RbacService();

function actorWith(role: Role, scope: Scope, validUntil?: Date): Actor {
  return {
    userId: 'user-1',
    assignments: validUntil ? [{ role, scope, validUntil }] : [{ role, scope }],
  };
}

describe('POLICY reestri ↔ §4.1 matritsa (lockstep)', () => {
  it('har bir rol uchun yozuv bor — aynan 10 ta', () => {
    const keys = Object.keys(POLICY);
    expect(keys).toHaveLength(10);
    expect([...keys].sort()).toEqual([...ALL_ROLES].sort());
  });

  it("har bir Grant resursi matritsadagi 32 qatorning biri", () => {
    for (const role of ALL_ROLES) {
      for (const grant of POLICY[role]) {
        expect(ALL_RESOURCES).toContain(grant.resource);
      }
    }
  });

  it("bir rolda bir resurs uchun faqat bitta Grant (katak = grant)", () => {
    for (const role of ALL_ROLES) {
      const resources = POLICY[role].map((g) => g.resource);
      expect(new Set(resources).size).toBe(resources.length);
    }
  });

  it("har bir Grant'da kamida bitta amal bor va takror amal yo'q", () => {
    for (const role of ALL_ROLES) {
      for (const grant of POLICY[role]) {
        expect(grant.actions.length).toBeGreaterThan(0);
        expect(new Set(grant.actions).size).toBe(grant.actions.length);
      }
    }
  });
});

describe('Matritsa invariantlari (§4.1 izohi, §4.3)', () => {
  it("AuditLog: HECH BIR rol yoza olmaydi — log tizim tomonidan yoziladi", () => {
    for (const role of ALL_ROLES) {
      const grant = POLICY[role].find((g) => g.resource === 'AuditLog');
      if (grant) {
        expect(grant.actions).toEqual(['read']);
      }
      // Xulq-atvor darajasida ham: global scope bilan ham yozib bo'lmaydi.
      const actor = actorWith(role, { kind: 'global' });
      for (const action of WRITE_ACTIONS) {
        expect(service.can(actor, action, { type: 'AuditLog' }, NOW)).toBe(false);
      }
    }
  });

  it("RatingHistory: HECH BIR rolda update yo'q — tarix tuzatilmaydi (supersededAt)", () => {
    for (const role of ALL_ROLES) {
      const grant = POLICY[role].find((g) => g.resource === 'RatingHistory');
      if (grant) {
        expect(grant.actions).not.toContain('update');
      }
      const actor = actorWith(role, { kind: 'global' });
      expect(service.can(actor, 'update', { type: 'RatingHistory' }, NOW)).toBe(false);
    }
  });

  it('SUPER_ADMIN AuditLog ni o\'qiy oladi, lekin o\'chira olmaydi', () => {
    const admin = actorWith('SUPER_ADMIN', { kind: 'global' });
    expect(service.can(admin, 'read', { type: 'AuditLog' }, NOW)).toBe(true);
    expect(service.can(admin, 'delete', { type: 'AuditLog' }, NOW)).toBe(false);
  });

  it("PARENT yozuvlari: faqat Payment create (+ o'z Session ini yopish — matritsadagi R*D*)", () => {
    // §4.1 izohi: "PARENT da faqat Payment da yozish bor". Matritsaning
    // Session qatori PARENT ga R*D* beradi — bu domen yozuvi emas,
    // o'z sessiyasini yopish (logout). Shundan boshqa hech qanday
    // create/update/delete bo'lishi mumkin emas.
    const allowedWrites = new Set(['Payment:create', 'Session:delete']);
    for (const grant of POLICY.PARENT) {
      for (const action of grant.actions) {
        if (action === 'read') {
          continue;
        }
        expect(allowedWrites.has(`${grant.resource}:${action}`)).toBe(true);
      }
    }
    // update — umuman yo'q: ota-ona bola nomidan natijaga aralasha olmaydi.
    for (const grant of POLICY.PARENT) {
      expect(grant.actions).not.toContain('update');
    }
    // Xulq-atvor: bola nomidan to'lay oladi, natija kirita olmaydi.
    const parent = actorWith('PARENT', { kind: 'own' });
    expect(
      service.can(parent, 'create', { type: 'Payment', ownerUserId: 'user-1' }, NOW),
    ).toBe(true);
    expect(
      service.can(parent, 'create', { type: 'GameResult', ownerUserId: 'user-1' }, NOW),
    ).toBe(false);
    expect(
      service.can(parent, 'update', { type: 'Player', ownerUserId: 'user-1' }, NOW),
    ).toBe(false);
  });

  it("CLUB_ADMIN da FairPlayCase umuman yo'q — bosim manbai bo'lishi mumkin", () => {
    expect(POLICY.CLUB_ADMIN.find((g) => g.resource === 'FairPlayCase')).toBeUndefined();
    const clubAdmin = actorWith('CLUB_ADMIN', { kind: 'club', clubId: 'club-a' });
    expect(service.can(clubAdmin, 'read', { type: 'FairPlayCase', clubId: 'club-a' }, NOW)).toBe(
      false,
    );
  });

  it("SPECTATOR: faqat o'qish — birorta ham yozuv granti yo'q", () => {
    for (const grant of POLICY.SPECTATOR) {
      expect(grant.actions).toEqual(['read']);
    }
  });

  it("SPECTATOR ochiq resurslarni ro'yxatsiz (global scope) o'qiy oladi", () => {
    const spectator = actorWith('SPECTATOR', { kind: 'global' });
    expect(service.can(spectator, 'read', { type: 'Tournament' }, NOW)).toBe(true);
    expect(service.can(spectator, 'read', { type: 'Player' }, NOW)).toBe(true);
    expect(service.can(spectator, 'create', { type: 'Tournament' }, NOW)).toBe(false);
    // Yopiq resurslar — umuman yo'q.
    expect(service.can(spectator, 'read', { type: 'Invoice' }, NOW)).toBe(false);
    expect(service.can(spectator, 'read', { type: 'AuditLog' }, NOW)).toBe(false);
  });
});

describe('RbacService.can — scope semantikasi (§4.2)', () => {
  it("FEDERATION_ADMIN o'z federatsiyasining turnirini yangilaydi, boshqanikini EMAS", () => {
    const fedAdmin = actorWith('FEDERATION_ADMIN', {
      kind: 'federation',
      federationId: 'fed-uzb',
    });
    expect(
      service.can(fedAdmin, 'update', { type: 'Tournament', federationId: 'fed-uzb' }, NOW),
    ).toBe(true);
    expect(
      service.can(fedAdmin, 'update', { type: 'Tournament', federationId: 'fed-kaz' }, NOW),
    ).toBe(false);
  });

  it("CLUB_ADMIN (A klubi) B klubini yangilay olmaydi — IDOR holati", () => {
    const clubAdmin = actorWith('CLUB_ADMIN', { kind: 'club', clubId: 'club-a' });
    expect(service.can(clubAdmin, 'update', { type: 'Club', clubId: 'club-a' }, NOW)).toBe(true);
    expect(service.can(clubAdmin, 'update', { type: 'Club', clubId: 'club-b' }, NOW)).toBe(false);
    // Boshqa klubning turniri ham yopiq.
    expect(
      service.can(clubAdmin, 'create', { type: 'Tournament', clubId: 'club-b' }, NOW),
    ).toBe(false);
  });

  it("PLAYER o'z profilini yangilaydi, boshqanikini EMAS", () => {
    const player = actorWith('PLAYER', { kind: 'own' });
    expect(service.can(player, 'update', { type: 'Player', ownerUserId: 'user-1' }, NOW)).toBe(
      true,
    );
    expect(service.can(player, 'update', { type: 'Player', ownerUserId: 'user-2' }, NOW)).toBe(
      false,
    );
  });

  it("yulduqchasiz o'qish ochiq: PLAYER (own scope) har qanday turnirni ko'radi", () => {
    const player = actorWith('PLAYER', { kind: 'own' });
    // Tournament — PLAYER uchun yulduqchasiz R: scope talab qilinmaydi.
    expect(service.can(player, 'read', { type: 'Tournament', clubId: 'club-x' }, NOW)).toBe(true);
    // RatingHistory — PLAYER uchun R*: faqat o'ziniki.
    expect(
      service.can(player, 'read', { type: 'RatingHistory', ownerUserId: 'user-1' }, NOW),
    ).toBe(true);
    expect(
      service.can(player, 'read', { type: 'RatingHistory', ownerUserId: 'user-2' }, NOW),
    ).toBe(false);
  });

  it("muddati o'tgan biriktirma hech narsa bermaydi (ARBITER validUntil)", () => {
    const resource: ResourceRef = { type: 'GameResult', tournamentId: 'tour-1' };
    const scope: Scope = { kind: 'tournament', tournamentId: 'tour-1' };

    const active = actorWith('ARBITER', scope, new Date('2026-07-24T00:00:00Z'));
    expect(service.can(active, 'create', resource, NOW)).toBe(true);

    const expired = actorWith('ARBITER', scope, new Date('2026-07-01T00:00:00Z'));
    expect(service.can(expired, 'create', resource, NOW)).toBe(false);
    expect(service.writableFields(expired, { type: 'Tournament', tournamentId: 'tour-1' }, NOW))
      .toEqual([]);
  });

  it("scope noaniq bo'lsa — rad (ResourceRef da mos maydon yo'q)", () => {
    const clubAdmin = actorWith('CLUB_ADMIN', { kind: 'club', clubId: 'club-a' });
    // clubId berilmagan turnir — qamrov isbotlanmagan, yozuv rad etiladi.
    expect(service.can(clubAdmin, 'update', { type: 'Tournament' }, NOW)).toBe(false);
  });
});

describe('writableFields — ustun darajasidagi cheklov (§4.2)', () => {
  it("ARBITER Tournament da faqat ['status'] ni yoza oladi", () => {
    const arbiter = actorWith('ARBITER', { kind: 'tournament', tournamentId: 'tour-1' });
    expect(
      service.writableFields(arbiter, { type: 'Tournament', tournamentId: 'tour-1' }, NOW),
    ).toEqual(['status']);
    // Boshqa turnirda — umuman yozolmaydi.
    expect(
      service.writableFields(arbiter, { type: 'Tournament', tournamentId: 'tour-2' }, NOW),
    ).toEqual([]);
  });

  it("ARBITER Appeal da faqat ['status', 'decision']", () => {
    const arbiter = actorWith('ARBITER', { kind: 'tournament', tournamentId: 'tour-1' });
    expect(
      service.writableFields(arbiter, { type: 'Appeal', tournamentId: 'tour-1' }, NOW),
    ).toEqual(['status', 'decision']);
  });

  it("SUPER_ADMIN uchun cheklovsiz — 'all'", () => {
    const admin = actorWith('SUPER_ADMIN', { kind: 'global' });
    expect(service.writableFields(admin, { type: 'Tournament' }, NOW)).toBe('all');
  });

  it("update huquqi yo'q bo'lsa — bo'sh ro'yxat", () => {
    const parent = actorWith('PARENT', { kind: 'own' });
    expect(
      service.writableFields(parent, { type: 'Tournament', ownerUserId: 'user-1' }, NOW),
    ).toEqual([]);
  });
});
