import {
  canChangeStatus,
  canDelegate,
  canGrant,
  canRevoke,
  type ScopeRef,
} from './role-grant.rules';

/**
 * Rol berish qoidalari — IMTIYOZ OSHIRISH chegarasi.
 *
 * Bu yerdagi har bir "yo'q" aniq bir hujum yoki jimgina falokat
 * yo'lini yopadi: o'z darajasini ko'paytirish, oxirgi superadminni
 * yo'qotish, o'zini bloklab qo'yish.
 */

const GLOBAL: ScopeRef = { scopeType: null, scopeId: null };
const CLUB: ScopeRef = { scopeType: 'CLUB', scopeId: 'club-1' };
const FEDERATION: ScopeRef = { scopeType: 'FEDERATION', scopeId: 'fed-1' };
const TOURNAMENT: ScopeRef = { scopeType: 'TOURNAMENT', scopeId: 'trn-1' };

describe('canDelegate', () => {
  it('SUPER_ADMIN hamma rolni bera oladi', () => {
    expect(canDelegate(['SUPER_ADMIN'], 'SUPER_ADMIN')).toBe(true);
    expect(canDelegate(['SUPER_ADMIN'], 'PLAYER')).toBe(true);
  });

  it("HECH KIM O'Z darajasini ko'paytira olmaydi", () => {
    // Eng muhim invariant: bitta buzilgan FEDERATION_ADMIN hisobi
    // cheksiz ko'paya olmasligi kerak.
    expect(canDelegate(['FEDERATION_ADMIN'], 'FEDERATION_ADMIN')).toBe(false);
    expect(canDelegate(['REGION_ADMIN'], 'REGION_ADMIN')).toBe(false);
    expect(canDelegate(['CLUB_ADMIN'], 'CLUB_ADMIN')).toBe(false);
  });

  it('HECH KIM o`zidan YUQORI rolni bera olmaydi', () => {
    expect(canDelegate(['FEDERATION_ADMIN'], 'SUPER_ADMIN')).toBe(false);
    expect(canDelegate(['REGION_ADMIN'], 'FEDERATION_ADMIN')).toBe(false);
    expect(canDelegate(['CLUB_ADMIN'], 'REGION_ADMIN')).toBe(false);
  });

  it('pastdagi darajalar berilishi mumkin', () => {
    expect(canDelegate(['FEDERATION_ADMIN'], 'REGION_ADMIN')).toBe(true);
    expect(canDelegate(['REGION_ADMIN'], 'CLUB_ADMIN')).toBe(true);
    expect(canDelegate(['CLUB_ADMIN'], 'COACH')).toBe(true);
  });

  it("ma'muriy bo'lmagan rollar HECH NARSA bera olmaydi", () => {
    for (const role of ['ARBITER', 'COACH', 'PLAYER', 'PARENT', 'SPECTATOR'] as const) {
      expect(canDelegate([role], 'PLAYER')).toBe(false);
    }
  });

  it('bir nechta roldan ENG KUCHLISI hisobga olinadi', () => {
    expect(canDelegate(['PLAYER', 'FEDERATION_ADMIN'], 'REGION_ADMIN')).toBe(true);
  });
});

describe('canGrant — scope shakli', () => {
  it('SUPER_ADMIN faqat GLOBAL bo`ladi', () => {
    expect(canGrant(['SUPER_ADMIN'], 'SUPER_ADMIN', GLOBAL)).toEqual({ ok: true });
    // Scope'li superadmin — ma'nosiz va xavfli: rbac.service uni
    // scope bo'yicha o'qir edi.
    expect(canGrant(['SUPER_ADMIN'], 'SUPER_ADMIN', CLUB)).toEqual({
      ok: false,
      reason: 'SCOPE_NOT_ALLOWED',
    });
  });

  it('CLUB_ADMIN scope`SIZ berilmaydi', () => {
    // Aks holda u BARCHA klublarning admini bo'lib qolardi.
    expect(canGrant(['SUPER_ADMIN'], 'CLUB_ADMIN', GLOBAL)).toEqual({
      ok: false,
      reason: 'SCOPE_REQUIRED',
    });
    expect(canGrant(['SUPER_ADMIN'], 'CLUB_ADMIN', CLUB)).toEqual({ ok: true });
  });

  it('rol NOTO`G`RI scope turida berilmaydi', () => {
    expect(canGrant(['SUPER_ADMIN'], 'CLUB_ADMIN', FEDERATION)).toEqual({
      ok: false,
      reason: 'SCOPE_NOT_ALLOWED',
    });
  });

  it('ARBITER — turnirga YOKI global (milliy hakam)', () => {
    expect(canGrant(['SUPER_ADMIN'], 'ARBITER', TOURNAMENT)).toEqual({ ok: true });
    expect(canGrant(['SUPER_ADMIN'], 'ARBITER', GLOBAL)).toEqual({ ok: true });
  });

  it('scopeType bor, scopeId yo`q — rad', () => {
    expect(canGrant(['SUPER_ADMIN'], 'CLUB_ADMIN', { scopeType: 'CLUB', scopeId: null })).toEqual({
      ok: false,
      reason: 'SCOPE_ID_REQUIRED',
    });
  });

  it('scopeId bor, scopeType yo`q — rad', () => {
    expect(canGrant(['SUPER_ADMIN'], 'PLAYER', { scopeType: null, scopeId: 'club-1' })).toEqual({
      ok: false,
      reason: 'SCOPE_ID_NOT_ALLOWED',
    });
  });

  it('delegatsiya huquqi YO`Q bo`lsa scope tekshirilmaydi ham', () => {
    expect(canGrant(['CLUB_ADMIN'], 'SUPER_ADMIN', GLOBAL)).toEqual({
      ok: false,
      reason: 'ROLE_NOT_DELEGABLE',
    });
  });
});

describe('canRevoke', () => {
  it('oddiy rolni olib tashlash mumkin', () => {
    expect(canRevoke(['SUPER_ADMIN'], { role: 'ARBITER', scope: TOURNAMENT }, 2)).toEqual({
      ok: true,
    });
  });

  it('OXIRGI global superadmin OLIB TASHLANMAYDI', () => {
    // Aks holda tizimni faqat serverda SQL bilan tiklash mumkin bo'lardi.
    expect(canRevoke(['SUPER_ADMIN'], { role: 'SUPER_ADMIN', scope: GLOBAL }, 1)).toEqual({
      ok: false,
      reason: 'LAST_SUPER_ADMIN',
    });
  });

  it('ikkitadan bo`lsa bittasini olib tashlash mumkin', () => {
    expect(canRevoke(['SUPER_ADMIN'], { role: 'SUPER_ADMIN', scope: GLOBAL }, 2)).toEqual({
      ok: true,
    });
  });

  it('bera olmaydigan rolni OLIB HAM tashlay olmaydi', () => {
    // Aks holda CLUB_ADMIN federatsiya adminini o'chirib tashlardi.
    expect(canRevoke(['CLUB_ADMIN'], { role: 'FEDERATION_ADMIN', scope: FEDERATION }, 3)).toEqual({
      ok: false,
      reason: 'ROLE_NOT_DELEGABLE',
    });
  });
});

describe('canChangeStatus', () => {
  const other = { userId: 'user-b', isGlobalSuperAdmin: false };

  it('begonani bloklash mumkin', () => {
    expect(canChangeStatus('user-a', other, 'SUSPENDED', 3)).toEqual({ ok: true });
    expect(canChangeStatus('user-a', other, 'BANNED', 3)).toEqual({ ok: true });
  });

  it("O'ZINGIZNI bloklab bo'lmaydi", () => {
    // Bir bosishda o'z hisobidan ayrilish — qaytarib bo'lmaydigan xato.
    expect(
      canChangeStatus('user-a', { userId: 'user-a', isGlobalSuperAdmin: true }, 'SUSPENDED', 5),
    ).toEqual({ ok: false, reason: 'SELF_LOCKOUT' });
  });

  it('OXIRGI superadminni bloklab bo`lmaydi', () => {
    expect(
      canChangeStatus('user-a', { userId: 'user-b', isGlobalSuperAdmin: true }, 'BANNED', 1),
    ).toEqual({ ok: false, reason: 'LAST_SUPER_ADMIN' });
  });

  it('TIKLASH har doim mumkin — hatto o`zini ham', () => {
    // Qulflar faqat bir tomonga ishlaydi: bloklashga qarshi.
    expect(
      canChangeStatus('user-a', { userId: 'user-a', isGlobalSuperAdmin: true }, 'ACTIVE', 1),
    ).toEqual({ ok: true });
  });
});
