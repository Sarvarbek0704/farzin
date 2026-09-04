import type { Role } from '../rbac.port';

/**
 * ROL BERISH QOIDALARI — sof mantiq (DB, framework yo'q).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA BU ALOHIDA VA SOF FAYL
 *
 *  Bu yerdagi har bir "yo'q" — imtiyoz oshirishning (privilege
 *  escalation) oldini oladi. Bunday shartlar servis ichida DB
 *  chaqiruvlari orasiga sochilib ketsa, ularni birma-bir tekshirish
 *  uchun butun modulni ko'tarish kerak bo'lardi.
 *
 *  Sof funksiya — bir necha qatorli test, va har qoida o'z testiga ega
 *  (`role-grant.rules.spec.ts`).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️  BU QATLAM RBAC O'RNINI BOSMAYDI. Endpointga kirish huquqi
 *      `@RequirePermission('User', 'update')` bilan tekshiriladi;
 *      bu yerdagi qoidalar UNDAN KEYIN qo'llanadi va "huquqi bor odam
 *      NIMANI bera oladi" degan ikkinchi savolga javob beradi.
 */

/** `UserRole.scopeType` qiymatlari (sxemadagi izohga mos). */
export type ScopeType = 'FEDERATION' | 'REGION' | 'CLUB' | 'SCHOOL' | 'TOURNAMENT';

export interface ScopeRef {
  readonly scopeType: ScopeType | null;
  readonly scopeId: string | null;
}

export type GrantDenial =
  | 'ROLE_NOT_DELEGABLE'
  | 'SCOPE_REQUIRED'
  | 'SCOPE_NOT_ALLOWED'
  | 'SCOPE_ID_REQUIRED'
  | 'SCOPE_ID_NOT_ALLOWED'
  | 'LAST_SUPER_ADMIN'
  | 'SELF_LOCKOUT';

export type Decision = { ok: true } | { ok: false; reason: GrantDenial };

const ALLOW: Decision = { ok: true };

function deny(reason: GrantDenial): Decision {
  return { ok: false, reason };
}

/**
 * Har rol uchun RUXSAT ETILGAN scope turlari.
 *
 * `null` — global (scope'siz). Ro'yxat sxemadagi izohdan
 * (`UserRole.scopeType`) va docs/01 §4.2 dan olingan:
 * "faqat rolni tekshirish YETARLI EMAS".
 *
 * Nega ARBITER ikki xil: turnir hakami TURNIRGA biriktiriladi va
 * turnir tugagach muddati o'tadi (§4.3 bandi 5), milliy hakam esa
 * doimiy — u global.
 */
const ALLOWED_SCOPES: Record<Role, readonly (ScopeType | null)[]> = {
  SUPER_ADMIN: [null],
  FEDERATION_ADMIN: ['FEDERATION'],
  REGION_ADMIN: ['REGION'],
  CLUB_ADMIN: ['CLUB'],
  SCHOOL_TEACHER: ['SCHOOL'],
  ARBITER: ['TOURNAMENT', null],
  COACH: ['CLUB', 'SCHOOL', null],
  PLAYER: [null],
  PARENT: [null],
  SPECTATOR: [null],
};

/**
 * DELEGATSIYA ZINASI — kim qaysi rolni bera oladi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ASOSIY INVARIANT: HECH KIM O'Z DARAJASINI KO'PAYTIRA OLMAYDI
 *
 *  FEDERATION_ADMIN boshqa FEDERATION_ADMIN yarata OLMAYDI — aks holda
 *  bitta buzilgan hisob cheksiz ko'payardi va uni ortga qaytarish
 *  imkonsiz bo'lardi. Sizning darajangizni faqat YUQORIDAGI daraja
 *  yaratadi.
 *
 *  SUPER_ADMIN — yagona istisno: u SUPER_ADMIN bera oladi, chunki aks
 *  holda ikkinchi superadminni umuman qo'shib bo'lmasdi (birinchisi
 *  seed yoki server skripti bilan yaratiladi).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️  HOZIRCHA BU JADVALNING FAQAT SUPER_ADMIN QATORI ISHLAYDI.
 *      Qolgan qatorlar TA'RIF sifatida turadi: scope ichida delegatsiya
 *      (masalan REGION_ADMIN o'z viloyatidagi klub adminini tayinlashi)
 *      ierarxiyani DB'dan yurib chiqishni talab qiladi — "bu klub shu
 *      viloyatdami?" degan savol. U hali yozilmagan, shuning uchun
 *      controller global `User update` huquqini talab qiladi va amalda
 *      faqat SUPER_ADMIN o'tadi. Yarim ishlaydigan scope tekshiruvi
 *      yo'qidan XAVFLIROQ bo'lardi.
 */
const DELEGABLE: Record<Role, readonly Role[]> = {
  SUPER_ADMIN: [
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
  ],
  FEDERATION_ADMIN: [
    'REGION_ADMIN',
    'CLUB_ADMIN',
    'ARBITER',
    'COACH',
    'SCHOOL_TEACHER',
    'PLAYER',
    'PARENT',
    'SPECTATOR',
  ],
  REGION_ADMIN: ['CLUB_ADMIN', 'ARBITER', 'COACH', 'PLAYER', 'PARENT', 'SPECTATOR'],
  CLUB_ADMIN: ['COACH', 'PLAYER', 'PARENT', 'SPECTATOR'],
  SCHOOL_TEACHER: [],
  ARBITER: [],
  COACH: [],
  PLAYER: [],
  PARENT: [],
  SPECTATOR: [],
};

/** Aktorning eng yuqori roli shu rolni bera oladimi? */
export function canDelegate(actorRoles: readonly Role[], role: Role): boolean {
  return actorRoles.some((own) => DELEGABLE[own].includes(role));
}

/**
 * ROL BERISH.
 *
 * Scope shakli rolga MOS bo'lishi shart: global rolga scope berilsa
 * yoki scoped rol scope'siz berilsa, natija jimgina noto'g'ri huquq
 * bo'lardi — `rbac.service` scope'ni shu maydonlardan o'qiydi.
 */
export function canGrant(actorRoles: readonly Role[], role: Role, scope: ScopeRef): Decision {
  if (!canDelegate(actorRoles, role)) {
    return deny('ROLE_NOT_DELEGABLE');
  }

  const allowed = ALLOWED_SCOPES[role];
  if (!allowed.includes(scope.scopeType)) {
    // Ikki holatni AJRATAMIZ: xabar foydalanuvchiga nima qilishni aytsin.
    return scope.scopeType === null ? deny('SCOPE_REQUIRED') : deny('SCOPE_NOT_ALLOWED');
  }

  // scopeType va scopeId BIRGA yuradi: biri bo'lib ikkinchisi
  // bo'lmasa, qator ma'nosiz bo'ladi.
  if (scope.scopeType !== null && scope.scopeId === null) {
    return deny('SCOPE_ID_REQUIRED');
  }
  if (scope.scopeType === null && scope.scopeId !== null) {
    return deny('SCOPE_ID_NOT_ALLOWED');
  }

  return ALLOW;
}

/**
 * ROLNI OLIB TASHLASH.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  OXIRGI SUPERADMIN HIMOYASI
 *
 *  Global SUPER_ADMIN qatorlari soni 1 ga tushgan bo'lsa, uni olib
 *  tashlash tizimni BOSHQARIB BO'LMAYDIGAN holatga olib kelardi:
 *  hech kim rol bera olmaydi, ya'ni tuzatish uchun serverga kirib
 *  SQL yozish kerak bo'lardi.
 *
 *  Bu xato jimgina sodir bo'ladi — odam o'zining ortiqcha rolini
 *  tozalayapman deb o'ylaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function canRevoke(
  actorRoles: readonly Role[],
  target: { role: Role; scope: ScopeRef },
  globalSuperAdminCount: number,
): Decision {
  if (!canDelegate(actorRoles, target.role)) {
    return deny('ROLE_NOT_DELEGABLE');
  }
  if (isLastGlobalSuperAdmin(target, globalSuperAdminCount)) {
    return deny('LAST_SUPER_ADMIN');
  }
  return ALLOW;
}

/**
 * HOLATNI O'ZGARTIRISH (bloklash / tiklash).
 *
 * Ikki qulf:
 *  1. O'ZINGIZNI bloklay olmaysiz — bir bosishda hisobingizdan
 *     ayrilish juda oson va qaytarib bo'lmaydi;
 *  2. oxirgi superadminni bloklash ham tizimni qulflab qo'yardi
 *     (login `status` ni tekshiradi — auth.service.ts).
 */
export function canChangeStatus(
  actorUserId: string,
  target: { userId: string; isGlobalSuperAdmin: boolean },
  newStatus: 'ACTIVE' | 'SUSPENDED' | 'BANNED',
  globalSuperAdminCount: number,
): Decision {
  if (newStatus === 'ACTIVE') {
    return ALLOW;
  }
  if (actorUserId === target.userId) {
    return deny('SELF_LOCKOUT');
  }
  if (target.isGlobalSuperAdmin && globalSuperAdminCount <= 1) {
    return deny('LAST_SUPER_ADMIN');
  }
  return ALLOW;
}

function isLastGlobalSuperAdmin(
  target: { role: Role; scope: ScopeRef },
  globalSuperAdminCount: number,
): boolean {
  return (
    target.role === 'SUPER_ADMIN' && target.scope.scopeType === null && globalSuperAdminCount <= 1
  );
}
