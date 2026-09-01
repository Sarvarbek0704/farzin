import { formatInTimeZone } from 'date-fns-tz';

import type { SectionExportData } from '../../core/export/export.types';
import type { PairingSystem } from '../tournament/tournament.types';
import type { SectionContextRow, SectionExportRows } from './arbiter.repository';

/**
 * Repository qatorlari → core/export kirishi (SectionExportData) — SOF
 * xaritalash. Prisma yo'q (repo qatorlaridan keyin), Nest yo'q; faqat
 * date-fns-tz (modul qatlamida ruxsat, core'da emas).
 *
 * QARORLAR:
 *  - Sanalar Asia/Tashkent kamarida formatlanadi (prisma/schema.prisma:
 *    "Sana + vaqt, timezone bilan. Asia/Tashkent") — UTC bo'yicha kesish
 *    yarim tunda boshqa kunga o'tkazib yuborar edi.
 *  - Player.birthDate esa @db.Date (vaqtsiz) — UTC bo'yicha kesiladi,
 *    kamar surishi sanani buzmasin.
 *  - PGN Site: venueName bo'lsa "venue, Tashkent UZB"; bo'lmasa null →
 *    yozuvchi "?" qo'yadi. TRF 022 shahar: hozircha "Tashkent" doimiysi —
 *    sxemada shahar maydoni yo'q. TODO(Faza 2): region nomidan olish.
 *  - TRF 102 (bosh hakam): User modelida ism yo'q — null (qator yozilmaydi).
 *    TODO(Faza 2): TournamentArbiter → Player profilidan.
 */

const EXPORT_TIME_ZONE = 'Asia/Tashkent';

/** Turnir tashkil etuvchi federatsiya kodi — platforma O'zbekistonniki. */
const HOST_FEDERATION = 'UZB';

export function buildSectionExportData(
  section: SectionContextRow,
  rows: SectionExportRows,
): SectionExportData {
  const t = section.tournament;
  return {
    tournamentName: t.name,
    sectionName: section.name,
    site: t.venueName === null ? null : `${t.venueName}, Tashkent ${HOST_FEDERATION}`,
    city: 'Tashkent',
    federation: HOST_FEDERATION,
    startDate: tashkentDate(t.startDate),
    endDate: tashkentDate(t.endDate),
    tournamentType: trfTournamentType(section.pairingSystem),
    chiefArbiter: null,
    players: rows.players.map((p) => ({
      registrationId: p.registrationId,
      startRank: p.pairingNumber,
      lastName: p.lastName,
      firstName: p.firstName,
      gender: p.gender,
      title: p.titleAtEntry,
      rating: p.ratingAtEntry,
      federation: HOST_FEDERATION,
      fideId: p.fideId,
      birthDate: p.birthDate === null ? null : p.birthDate.toISOString().slice(0, 10),
      points: p.points === null ? 0 : Number(p.points),
      rank: p.rank,
    })),
    rounds: rows.rounds.map((round) => ({
      number: round.number,
      date: round.scheduledStartAt === null ? null : tashkentDate(round.scheduledStartAt),
      pairings: round.pairings.map((pairing) => ({
        boardNumber: pairing.boardNumber,
        whiteRegistrationId: pairing.whiteRegistrationId,
        blackRegistrationId: pairing.blackRegistrationId,
        result: pairing.result,
        pgn: pairing.pgn,
      })),
    })),
  };
}

/** Yuklab olish fayl nomi: "<turnir-slug>-<seksiya-slug>.<ext>". */
export function exportFilename(
  section: SectionContextRow,
  extension: 'pgn' | 'trf' | 'pdf',
): string {
  return `${section.tournament.slug}-${slugify(section.name)}.${extension}`;
}

// --- Yordamchilar ----------------------------------------------------------------

/** Timestamptz → Asia/Tashkent kamarida "YYYY-MM-DD". */
function tashkentDate(date: Date): string {
  return formatInTimeZone(date, EXPORT_TIME_ZONE, 'yyyy-MM-dd');
}

/**
 * Seksiya nomi → fayl nomiga yaroqli slug (turnir slug'i DB'da tayyor).
 * Lotin bo'lmagan belgilar tushib qoladi; bo'sh qolsa — "seksiya".
 */
function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  return slug === '' ? 'seksiya' : slug;
}

/** PairingSystem → TRF 092 "type of tournament" matni. */
function trfTournamentType(system: PairingSystem): string {
  switch (system) {
    case 'SWISS_DUTCH':
      return 'Individual: Swiss-System';
    case 'ROUND_ROBIN':
      return 'Individual: Round-Robin';
    case 'DOUBLE_ROUND_ROBIN':
      return 'Individual: Double Round-Robin';
    case 'KNOCKOUT':
      return 'Individual: Knock-Out';
    case 'SCHEVENINGEN':
      return 'Team: Scheveningen';
    case 'TEAM_SWISS':
      return 'Team: Swiss-System';
  }
}
