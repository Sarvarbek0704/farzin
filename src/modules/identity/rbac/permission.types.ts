/**
 * RBAC — tiplar.
 *
 * Sof TypeScript. Framework bog'liqligi yo'q — bu domen fayli, NestJS
 * guard'lari keyinroq shu tiplar ustiga quriladi.
 *
 * RBAC ikki qatlamli: **rol** (nima qila oladi) + **scope** (qayerda).
 * Faqat rol yetarli emas — `CLUB_ADMIN` boshqa klubning turnirini
 * o'zgartira olmasligi kerak.
 *
 * @see docs/01-product-spec.md §4.2
 */

/**
 * Rollar — `prisma/schema.prisma` dagi `Role` enum bilan AYNAN mos.
 * docs/01-product-spec.md §4 jadvali.
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

export type Action = 'create' | 'read' | 'update' | 'delete';

/**
 * §4.1 matritsasining har bir qatoriga bitta a'zo —
 * `rbac.contract.spec.ts` ikkalasi mos kelishini tekshiradi.
 */
export type ResourceType =
  | 'User'
  | 'Session'
  | 'Player'
  | 'Federation'
  | 'Region'
  | 'Club'
  | 'ClubMembership'
  | 'Tournament'
  | 'TournamentSection'
  | 'Registration'
  | 'Round'
  | 'Pairing'
  | 'GameResult'
  | 'RatingPeriod'
  | 'RatingHistory'
  | 'Title'
  | 'Arbiter'
  | 'Appeal'
  | 'OnlineGame'
  | 'Move'
  | 'Puzzle'
  | 'PuzzleAttempt'
  | 'Coach'
  | 'Lesson'
  | 'School'
  | 'SchoolClass'
  | 'Student'
  | 'Subscription'
  | 'Invoice'
  | 'Payment'
  | 'AuditLog'
  | 'FairPlayCase';

/**
 * Rolni aniq bir daraxt shoxiga toraytiradi.
 * `own` = aktor resursning egasi bo'lishi shart.
 *
 * `UserRole.scopeType` (CLUB | REGION | FEDERATION | SCHOOL | TOURNAMENT)
 * bilan mos; `global` — scopeType NULL, `own` — shaxsiy resurslar uchun.
 */
export type Scope =
  | { kind: 'global' }
  | { kind: 'federation'; federationId: string }
  | { kind: 'region'; regionId: string }
  | { kind: 'club'; clubId: string }
  | { kind: 'tournament'; tournamentId: string }
  | { kind: 'school'; schoolId: string }
  | { kind: 'own' };

/**
 * Bitta ruxsat — §4.1 matritsasining bitta katagi.
 *
 * `scoped` — matritsadagi yulduzcha (R*, U*): amal FAQAT assignment
 * scope qamrovida ruxsatli. Yulduqchasiz katak (masalan, `Tournament`
 * ustidagi oddiy `R`) — ochiq ma'lumot, scope tekshirilmaydi.
 * Yozuv amallari (create/update/delete) uchun scope HAR DOIM
 * tekshiriladi — qarang `rbac.service.ts`.
 */
export interface Grant {
  readonly resource: ResourceType;
  readonly actions: readonly Action[];
  /** true = faqat assignment scope qamrovida (matritsadagi `*`). */
  readonly scoped?: boolean;
  /**
   * Yozishni ustunlar to'plamiga cheklaydi. Yo'q = barcha ustunlar.
   * Masalan, ARBITER `Tournament` da faqat `status` ni o'zgartiradi —
   * turnirni yurita oladi, qayta ta'riflay olmaydi.
   */
  readonly fields?: readonly string[];
}

/**
 * Bitta rol biriktirmasi — `UserRole` qatorining domen ko'rinishi.
 * `validUntil` — rol vaqtinchalik bo'lishi mumkin: ARBITER biriktirmasi
 * turnir tugagach tugaydi (§4.3 bandi 5).
 */
export interface RoleAssignment {
  readonly role: Role;
  readonly scope: Scope;
  readonly validUntil?: Date;
}

export interface Actor {
  readonly userId: string;
  readonly assignments: readonly RoleAssignment[];
}

/**
 * Maqsad qatorining ierarxiya konteksti — chaqiruvchi modul hal qiladi.
 * Masalan, PARENT uchun bolaning resursi `ownerUserId` orqali
 * `ParentLink` ni tekshirib "o'ziniki" deb belgilanadi.
 */
export interface ResourceRef {
  readonly type: ResourceType;
  readonly ownerUserId?: string;
  readonly clubId?: string;
  readonly regionId?: string;
  readonly federationId?: string;
  readonly tournamentId?: string;
  readonly schoolId?: string;
}
