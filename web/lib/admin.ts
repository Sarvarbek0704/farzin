/**
 * Ma'muriy API — TIPLAR va YO'LLAR.
 *
 * So'rovlar komponentda `authFetch` bilan yuboriladi (token
 * `AuthProvider` xotirasida — lib/auth.tsx izohi).
 */

export type Role =
  | 'SUPER_ADMIN'
  | 'FEDERATION_ADMIN'
  | 'REGION_ADMIN'
  | 'CLUB_ADMIN'
  | 'ARBITER'
  | 'COACH'
  | 'SCHOOL_TEACHER'
  | 'PLAYER'
  | 'PARENT'
  | 'SPECTATOR';

export type ScopeType = 'FEDERATION' | 'REGION' | 'CLUB' | 'SCHOOL' | 'TOURNAMENT';

export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED';

export interface AdminRole {
  id: string;
  role: Role;
  scopeType: ScopeType | null;
  scopeId: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  emailVerified: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  roles: AdminRole[];
}

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
  createdAt: string;
}

export const ADMIN = {
  users: '/api/v1/admin/users',
  stats: '/api/v1/admin/users/stats',
  user: (id: string): string => `/api/v1/admin/users/${id}`,
  roles: (userId: string): string => `/api/v1/admin/users/${userId}/roles`,
  role: (assignmentId: string): string => `/api/v1/admin/users/roles/${assignmentId}`,
  status: (userId: string): string => `/api/v1/admin/users/${userId}/status`,
  auditLogs: '/api/v1/admin/audit-logs',
} as const;

/**
 * Rol → qaysi qamrov TURI talab qilinadi.
 *
 * ⚠️  Bu jadval backenddagi `ALLOWED_SCOPES` bilan MOS bo'lishi kerak
 *     (`role-grant.rules.ts`). Takrorlash ataylab: shart backendda
 *     MAJBURIY (u yagona himoya), bu yerda esa forma to'g'ri
 *     maydonlarni ko'rsatishi uchun. Mos kelmasa foydalanuvchi 422
 *     oladi — jimgina noto'g'ri holat emas.
 */
export const SCOPE_FOR_ROLE: Record<Role, readonly (ScopeType | null)[]> = {
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

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Superadmin',
  FEDERATION_ADMIN: 'Federatsiya admini',
  REGION_ADMIN: 'Viloyat admini',
  CLUB_ADMIN: 'Klub admini',
  ARBITER: 'Hakam',
  COACH: 'Murabbiy',
  SCHOOL_TEACHER: "O'qituvchi",
  PLAYER: "O'yinchi",
  PARENT: 'Ota-ona',
  SPECTATOR: 'Tomoshabin',
};

export const SCOPE_LABEL: Record<ScopeType, string> = {
  FEDERATION: 'Federatsiya',
  REGION: 'Viloyat',
  CLUB: 'Klub',
  SCHOOL: 'Maktab',
  TOURNAMENT: 'Turnir',
};

export const STATUS_LABEL: Record<UserStatus, string> = {
  PENDING_VERIFICATION: 'Tasdiqlanmagan',
  ACTIVE: 'Faol',
  SUSPENDED: 'Vaqtincha to`xtatilgan',
  BANNED: 'Bloklangan',
  DELETED: "O'chirilgan",
};

/** Holat nishoni uslubi — rang YOLG'IZ signal emas, matn ham bor. */
export function statusClass(status: UserStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'badge badge-open';
    case 'SUSPENDED':
    case 'BANNED':
      return 'badge badge-cancelled';
    default:
      return 'badge';
  }
}

/**
 * SABAB uchun minimal uzunlik — backend DTO bilan bir xil.
 *
 * Backendda bu MAJBURIY (audit yozuvi sababsiz rad etiladi); bu yerda
 * esa foydalanuvchi "ok" yozib 400 olmasligi uchun.
 */
export const REASON_MIN_LENGTH = 10;

/** Amallar ro'yxati — audit filtri uchun. */
export const AUDIT_ACTIONS = [
  'role.granted',
  'role.revoked',
  'user.status_changed',
  'user.registered',
  'auth.login',
  'auth.login_failed',
  'result.updated',
  'payment.succeeded',
  'refund.requested',
  'fairplay.decision',
] as const;
