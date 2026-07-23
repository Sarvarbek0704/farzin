import { type Action, type Grant, type Role } from './permission.types';

/**
 * POLICY reestri — docs/01-product-spec.md §4.1 matritsasining koddagi
 * yagona manbasi. Har rol uchun har katak bitta `Grant`.
 *
 * O'qish qoidasi (§4.1 legendasi):
 *  - Yulduqchali katak (R*, U*, CRUD*) → `scoped: true` — faqat assignment
 *    scope qamrovida.
 *  - Yulduqchasiz katak → ochiq amal; yozuvlar baribir scope bilan
 *    chegaralanadi (qarang rbac.service.ts).
 *
 * MUHIM invariantlar (kontrakt test bilan qulflangan):
 *  - `AuditLog` — hech kimda C/U/D yo'q, hatto SUPER_ADMIN da ham.
 *    Log tizim tomonidan yoziladi; bu audit logning butun ma'nosi.
 *  - `RatingHistory` — hech kimda U yo'q. Tarix tuzatilmaydi, ustiga
 *    yangi yozuv qo'yiladi (`supersededAt`).
 *  - ARBITER `Tournament` da faqat `status` — turnirni yuritadi,
 *    sana yoki start pulini o'zgartira olmaydi.
 *  - PARENT yozuvlari: faqat `Payment` create (bola nomidan to'lov) va
 *    o'z `Session` ini yopish. Natijaga aralasha olmaydi (§4.3 bandi 2).
 *  - `FairPlayCase` ni CLUB_ADMIN KO'RMAYDI — bosim manbai bo'lishi mumkin.
 *
 * @see docs/01-product-spec.md §4.1, §4.3
 */

const CRUD: readonly Action[] = ['create', 'read', 'update', 'delete'];
const CRU: readonly Action[] = ['create', 'read', 'update'];
const CRD: readonly Action[] = ['create', 'read', 'delete'];
const CR: readonly Action[] = ['create', 'read'];
const RU: readonly Action[] = ['read', 'update'];
const RD: readonly Action[] = ['read', 'delete'];
const R: readonly Action[] = ['read'];

export const POLICY: Readonly<Record<Role, readonly Grant[]>> = {
  // Platforma operatori. Scope: global. AuditLog va RatingHistory —
  // u uchun ham faqat o'qish.
  SUPER_ADMIN: [
    { resource: 'User', actions: CRUD },
    { resource: 'Session', actions: RD },
    { resource: 'Player', actions: CRUD },
    { resource: 'Federation', actions: CRUD },
    { resource: 'Region', actions: CRUD },
    { resource: 'Club', actions: CRUD },
    { resource: 'ClubMembership', actions: CRUD },
    { resource: 'Tournament', actions: CRUD },
    { resource: 'TournamentSection', actions: CRUD },
    { resource: 'Registration', actions: CRUD },
    { resource: 'Round', actions: CRUD },
    { resource: 'Pairing', actions: CRUD },
    { resource: 'GameResult', actions: CRUD },
    { resource: 'RatingPeriod', actions: CRUD },
    { resource: 'RatingHistory', actions: R },
    { resource: 'Title', actions: CRUD },
    { resource: 'Arbiter', actions: CRUD },
    { resource: 'Appeal', actions: CRUD },
    { resource: 'OnlineGame', actions: R },
    { resource: 'Move', actions: R },
    { resource: 'Puzzle', actions: CRUD },
    { resource: 'PuzzleAttempt', actions: R },
    { resource: 'Coach', actions: CRUD },
    { resource: 'Lesson', actions: CRUD },
    { resource: 'School', actions: CRUD },
    { resource: 'SchoolClass', actions: CRUD },
    { resource: 'Student', actions: CRUD },
    { resource: 'Subscription', actions: CRUD },
    { resource: 'Invoice', actions: CRUD },
    { resource: 'Payment', actions: CRUD },
    { resource: 'AuditLog', actions: R }, // HAMMA uchun read-only
    { resource: 'FairPlayCase', actions: CRUD },
  ],

  // Milliy federatsiya xodimi. Scope: bitta Federation.
  FEDERATION_ADMIN: [
    { resource: 'User', actions: R },
    { resource: 'Player', actions: CRU },
    { resource: 'Federation', actions: RU },
    { resource: 'Region', actions: CRUD },
    { resource: 'Club', actions: CRUD },
    { resource: 'ClubMembership', actions: R },
    { resource: 'Tournament', actions: CRUD },
    { resource: 'TournamentSection', actions: CRUD },
    { resource: 'Registration', actions: R },
    { resource: 'Round', actions: R },
    { resource: 'Pairing', actions: R },
    { resource: 'GameResult', actions: RU },
    { resource: 'RatingPeriod', actions: CRU },
    { resource: 'RatingHistory', actions: R },
    { resource: 'Title', actions: CRUD },
    { resource: 'Arbiter', actions: CRUD },
    { resource: 'Appeal', actions: R },
    { resource: 'Puzzle', actions: R },
    { resource: 'Coach', actions: R },
    { resource: 'Lesson', actions: R },
    { resource: 'School', actions: CRUD },
    { resource: 'SchoolClass', actions: R },
    { resource: 'Student', actions: R },
    { resource: 'Subscription', actions: R, scoped: true },
    { resource: 'Invoice', actions: R, scoped: true },
    { resource: 'Payment', actions: R, scoped: true },
    { resource: 'AuditLog', actions: R, scoped: true },
    { resource: 'FairPlayCase', actions: R },
  ],

  // Viloyat federatsiyasi. Scope: bitta Region.
  REGION_ADMIN: [
    { resource: 'User', actions: R, scoped: true },
    { resource: 'Player', actions: RU, scoped: true },
    { resource: 'Federation', actions: R },
    { resource: 'Region', actions: RU, scoped: true },
    { resource: 'Club', actions: CRUD, scoped: true },
    { resource: 'ClubMembership', actions: R, scoped: true },
    { resource: 'Tournament', actions: CRUD, scoped: true },
    { resource: 'TournamentSection', actions: CRUD, scoped: true },
    { resource: 'Registration', actions: R, scoped: true },
    { resource: 'Round', actions: R, scoped: true },
    { resource: 'Pairing', actions: R, scoped: true },
    { resource: 'GameResult', actions: R, scoped: true },
    { resource: 'RatingPeriod', actions: R },
    { resource: 'RatingHistory', actions: R },
    { resource: 'Title', actions: R },
    { resource: 'Arbiter', actions: CRU, scoped: true },
    { resource: 'Appeal', actions: R, scoped: true },
    { resource: 'Puzzle', actions: R },
    { resource: 'Coach', actions: R },
    { resource: 'Lesson', actions: R },
    { resource: 'School', actions: CRU, scoped: true },
    { resource: 'SchoolClass', actions: R, scoped: true },
    { resource: 'Student', actions: R, scoped: true },
    { resource: 'Subscription', actions: R, scoped: true },
    { resource: 'Invoice', actions: R, scoped: true },
    { resource: 'Payment', actions: R, scoped: true },
    { resource: 'AuditLog', actions: R, scoped: true },
  ],

  // Klub rahbari. Scope: bitta Club. FairPlayCase YO'Q (§4.1 izohi).
  CLUB_ADMIN: [
    { resource: 'User', actions: R, scoped: true },
    { resource: 'Player', actions: RU, scoped: true },
    { resource: 'Federation', actions: R },
    { resource: 'Region', actions: R },
    { resource: 'Club', actions: RU, scoped: true },
    { resource: 'ClubMembership', actions: CRUD, scoped: true },
    { resource: 'Tournament', actions: CRUD, scoped: true },
    { resource: 'TournamentSection', actions: CRUD, scoped: true },
    { resource: 'Registration', actions: CRUD, scoped: true },
    { resource: 'Round', actions: CRU, scoped: true },
    { resource: 'Pairing', actions: R, scoped: true },
    { resource: 'GameResult', actions: R, scoped: true },
    { resource: 'RatingPeriod', actions: R },
    { resource: 'RatingHistory', actions: R }, // reytingga tegmaydi (§4.3 bandi 4)
    { resource: 'Title', actions: R },
    { resource: 'Arbiter', actions: R },
    { resource: 'Appeal', actions: R, scoped: true },
    { resource: 'Puzzle', actions: R },
    { resource: 'Coach', actions: RU, scoped: true },
    { resource: 'Lesson', actions: R, scoped: true },
    { resource: 'Subscription', actions: RU, scoped: true },
    { resource: 'Invoice', actions: R, scoped: true },
    { resource: 'Payment', actions: R, scoped: true },
    { resource: 'AuditLog', actions: R, scoped: true },
  ],

  // Turnir hakami. Scope: biriktirilgan Tournament, `validUntil` bilan.
  ARBITER: [
    { resource: 'Player', actions: R, scoped: true },
    { resource: 'Federation', actions: R },
    { resource: 'Region', actions: R },
    { resource: 'Club', actions: R },
    // Turnirni yurita oladi, qayta ta'riflay olmaydi.
    { resource: 'Tournament', actions: RU, scoped: true, fields: ['status'] },
    { resource: 'TournamentSection', actions: RU, scoped: true },
    { resource: 'Registration', actions: RU, scoped: true },
    { resource: 'Round', actions: CRU, scoped: true },
    { resource: 'Pairing', actions: CRU, scoped: true },
    { resource: 'GameResult', actions: CRU, scoped: true },
    { resource: 'RatingPeriod', actions: R },
    { resource: 'RatingHistory', actions: R },
    { resource: 'Title', actions: R },
    { resource: 'Arbiter', actions: R, scoped: true },
    { resource: 'Appeal', actions: RU, scoped: true, fields: ['status', 'decision'] },
    { resource: 'Move', actions: R, scoped: true },
    { resource: 'Puzzle', actions: R },
    { resource: 'FairPlayCase', actions: R, scoped: true },
  ],

  // Murabbiy. Scope: o'z shogirdlari (chaqiruvchi modul hal qiladi).
  COACH: [
    { resource: 'Player', actions: R, scoped: true },
    { resource: 'Federation', actions: R },
    { resource: 'Region', actions: R },
    { resource: 'Club', actions: R },
    { resource: 'ClubMembership', actions: R, scoped: true },
    { resource: 'Tournament', actions: R },
    { resource: 'TournamentSection', actions: R },
    { resource: 'Registration', actions: R, scoped: true },
    { resource: 'Round', actions: R },
    { resource: 'Pairing', actions: R },
    { resource: 'GameResult', actions: R },
    { resource: 'RatingPeriod', actions: R },
    { resource: 'RatingHistory', actions: R },
    { resource: 'Title', actions: R },
    { resource: 'Appeal', actions: R, scoped: true },
    { resource: 'OnlineGame', actions: R, scoped: true },
    { resource: 'Move', actions: R, scoped: true },
    { resource: 'Puzzle', actions: CR },
    { resource: 'PuzzleAttempt', actions: R, scoped: true },
    { resource: 'Coach', actions: RU, scoped: true },
    { resource: 'Lesson', actions: CRUD, scoped: true },
    { resource: 'Student', actions: R, scoped: true },
    { resource: 'Invoice', actions: R, scoped: true },
    { resource: 'Payment', actions: R, scoped: true },
  ],

  // Maktab o'qituvchisi. Scope: o'z School / SchoolClass lari.
  SCHOOL_TEACHER: [
    { resource: 'Player', actions: R, scoped: true },
    { resource: 'Federation', actions: R },
    { resource: 'Region', actions: R },
    { resource: 'Club', actions: R },
    { resource: 'Tournament', actions: R },
    { resource: 'TournamentSection', actions: R },
    { resource: 'Round', actions: R },
    { resource: 'Pairing', actions: R },
    { resource: 'GameResult', actions: R },
    { resource: 'RatingPeriod', actions: R },
    { resource: 'RatingHistory', actions: R },
    { resource: 'Title', actions: R },
    { resource: 'Puzzle', actions: R },
    { resource: 'PuzzleAttempt', actions: R, scoped: true },
    { resource: 'Lesson', actions: CRU, scoped: true },
    { resource: 'School', actions: R, scoped: true },
    { resource: 'SchoolClass', actions: CRUD, scoped: true },
    // Bola profili default yopiq — faqat o'z sinfi (§4.3 bandi 1).
    { resource: 'Student', actions: CRUD, scoped: true },
  ],

  // O'yinchi. Scope: own — o'z ma'lumoti.
  PLAYER: [
    { resource: 'User', actions: RU, scoped: true },
    { resource: 'Session', actions: RD, scoped: true },
    { resource: 'Player', actions: RU, scoped: true },
    { resource: 'Federation', actions: R },
    { resource: 'Region', actions: R },
    { resource: 'Club', actions: R },
    { resource: 'ClubMembership', actions: R, scoped: true },
    { resource: 'Tournament', actions: R },
    { resource: 'TournamentSection', actions: R },
    { resource: 'Registration', actions: CRD, scoped: true },
    { resource: 'Round', actions: R },
    { resource: 'Pairing', actions: R },
    { resource: 'GameResult', actions: CR, scoped: true },
    { resource: 'RatingPeriod', actions: R },
    { resource: 'RatingHistory', actions: R, scoped: true },
    { resource: 'Title', actions: R },
    { resource: 'Arbiter', actions: R },
    { resource: 'Appeal', actions: CR, scoped: true },
    { resource: 'OnlineGame', actions: CR, scoped: true },
    { resource: 'Move', actions: CR, scoped: true },
    { resource: 'Puzzle', actions: R },
    { resource: 'PuzzleAttempt', actions: CR, scoped: true },
    { resource: 'Coach', actions: R },
    { resource: 'Lesson', actions: R, scoped: true },
    { resource: 'SchoolClass', actions: R, scoped: true },
    { resource: 'Student', actions: R, scoped: true },
    { resource: 'Invoice', actions: R, scoped: true },
    { resource: 'Payment', actions: CR, scoped: true },
    { resource: 'FairPlayCase', actions: R, scoped: true },
  ],

  // Ota-ona. Scope: bog'langan bola (read-only). Yagona yozuvlari:
  // Payment create (bola nomidan to'lov) va o'z Session ini yopish.
  PARENT: [
    { resource: 'User', actions: R, scoped: true },
    { resource: 'Session', actions: RD, scoped: true },
    { resource: 'Player', actions: R, scoped: true },
    { resource: 'Federation', actions: R },
    { resource: 'Region', actions: R },
    { resource: 'Club', actions: R },
    { resource: 'ClubMembership', actions: R, scoped: true },
    { resource: 'Tournament', actions: R },
    { resource: 'TournamentSection', actions: R },
    { resource: 'Registration', actions: R, scoped: true },
    { resource: 'Round', actions: R },
    { resource: 'Pairing', actions: R },
    { resource: 'GameResult', actions: R, scoped: true },
    { resource: 'RatingPeriod', actions: R },
    { resource: 'RatingHistory', actions: R, scoped: true },
    { resource: 'Title', actions: R },
    { resource: 'Appeal', actions: R, scoped: true },
    { resource: 'OnlineGame', actions: R, scoped: true },
    { resource: 'Move', actions: R, scoped: true },
    { resource: 'Puzzle', actions: R },
    { resource: 'PuzzleAttempt', actions: R, scoped: true },
    { resource: 'Coach', actions: R },
    { resource: 'Lesson', actions: R, scoped: true },
    { resource: 'SchoolClass', actions: R, scoped: true },
    { resource: 'Student', actions: R, scoped: true },
    { resource: 'Invoice', actions: R, scoped: true },
    { resource: 'Payment', actions: CR, scoped: true },
  ],

  // Tomoshabin / mehmon. Faqat ochiq ma'lumot, yozuv YO'Q.
  // Player dagi `scoped` — faqat ochiq profillar (isPublic filtri
  // chaqiruvchi modulda); SPECTATOR biriktirmasi global scope oladi.
  SPECTATOR: [
    { resource: 'Player', actions: R, scoped: true },
    { resource: 'Federation', actions: R },
    { resource: 'Region', actions: R },
    { resource: 'Club', actions: R },
    { resource: 'Tournament', actions: R },
    { resource: 'TournamentSection', actions: R },
    { resource: 'Round', actions: R },
    { resource: 'Pairing', actions: R },
    { resource: 'GameResult', actions: R },
    { resource: 'RatingPeriod', actions: R },
    { resource: 'RatingHistory', actions: R },
    { resource: 'Title', actions: R },
    { resource: 'Arbiter', actions: R },
    { resource: 'OnlineGame', actions: R },
    { resource: 'Move', actions: R },
    { resource: 'Puzzle', actions: R },
    { resource: 'Coach', actions: R },
  ],
};
