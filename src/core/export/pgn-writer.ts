import type {
  ExportPairing,
  ExportPairingResult,
  ExportPlayer,
  ExportRound,
  SectionExportData,
} from './export.types';

/**
 * PGN yozuvchi — seksiyaning barcha o'ynalgan partiyalarini bitta
 * ko'p-partiyali PGN matniga aylantiradi.
 *
 * Sof funksiya: holat yo'q, yon ta'sir yo'q, chiqish faqat kirishga
 * bog'liq (ADR-0001, `core-must-stay-pure`).
 *
 * Standart: "Portable Game Notation Specification and Implementation
 * Guide" (Steven J. Edwards, 1994) — quyida "PGN spec".
 * Maqsad: docs/14-roadmap.md Faza 1 — "PGN eksport" DoD'i "Swiss-Manager'da
 * ochiladi" bo'lgani uchun konservativ, eng keng mos keladigan shakl
 * tanlangan.
 *
 * QARORLAR (hujjatlashtirilgan):
 *  - Bye — partiya EMAS (raqib yo'q), PGN'ga kirmaydi.
 *  - UNPLAYED — hali natijasiz juftlik, partiya emas — kirmaydi.
 *  - Forfeit (WHITE_WIN_FORFEIT / BLACK_WIN_FORFEIT): PGN odati bo'yicha
 *    Result oddiy "1-0"/"0-1", qo'shimcha [Termination "forfeit"] tegi
 *    (PGN spec §9.8.1 Termination qiymatlari ro'yxatida "forfeit" bor).
 *  - DOUBLE_FORFEIT: PGN spec §8.2.6 faqat to'rt token'ga ruxsat beradi
 *    (1-0, 0-1, 1/2-1/2, *) — "0-0" nostandart va ko'p dasturlarni
 *    sindiradi. Shuning uchun Result "*" + [Termination "forfeit"].
 *  - Movetext: saqlangan `pairing.pgn` bo'lsa — xom o'tkaziladi (faqat
 *    whitespace normallashtiriladi va 80 ustunda buklanadi, PGN spec §3.2);
 *    bo'lmasa — faqat natija tokenining o'zi ("result-only game").
 *  - Sana noma'lum qismi "?" bilan (PGN spec §8.1.1.3): bizda sana yo to'liq
 *    bor, yo yo'q — shuning uchun amalda "YYYY.MM.DD" yoki "????.??.??".
 *
 * Chiqish deterministik: partiyalar tur raqami, keyin taxta raqami
 * bo'yicha saralanadi (kirish massivlari tartibidan mustaqil).
 */

/** PGN spec §3.2: qator uzunligi 80 belgidan oshmasligi tavsiya etiladi. */
const MAX_LINE = 80;

const RESULT_TOKENS = ['1-0', '0-1', '1/2-1/2', '*'] as const;
type ResultToken = (typeof RESULT_TOKENS)[number];

export function writeSectionPgn(data: SectionExportData): string {
  const playerById = new Map<string, ExportPlayer>(data.players.map((p) => [p.registrationId, p]));
  const rounds = [...data.rounds].sort((a, b) => a.number - b.number);

  const games: string[] = [];
  for (const round of rounds) {
    const pairings = [...round.pairings].sort((a, b) => a.boardNumber - b.boardNumber);
    for (const pairing of pairings) {
      // Bye — partiya emas; UNPLAYED — hali partiya emas (header qarori).
      if (pairing.blackRegistrationId === null || pairing.result === 'UNPLAYED') {
        continue;
      }
      games.push(writeGame(data, round, pairing, playerById));
    }
  }
  return games.join('\n');
}

// --- Bitta partiya --------------------------------------------------------------

function writeGame(
  data: SectionExportData,
  round: ExportRound,
  pairing: ExportPairing,
  playerById: ReadonlyMap<string, ExportPlayer>,
): string {
  const white = playerById.get(pairing.whiteRegistrationId) ?? null;
  const black =
    pairing.blackRegistrationId === null
      ? null
      : (playerById.get(pairing.blackRegistrationId) ?? null);

  const resultToken = resultTokenOf(pairing.result);
  const termination = isForfeit(pairing.result) ? 'forfeit' : null;

  // Seven Tag Roster — PGN spec §8.1.1 aynan shu tartibda talab qiladi.
  const tags: [string, string][] = [
    ['Event', `${data.tournamentName} - ${data.sectionName}`],
    ['Site', data.site ?? '?'],
    ['Date', pgnDate(round.date ?? data.startDate)],
    ['Round', String(round.number)],
    ['White', playerName(white)],
    ['Black', playerName(black)],
    ['Result', resultToken],
  ];

  // Qo'shimcha teglar — faqat ma'lumot bor bo'lganda (PGN spec §9).
  // Tartib qat'iy: Title, Elo, FideId (har biri White keyin Black) — chiqish
  // deterministik bo'lsin.
  pushIfPresent(tags, 'WhiteTitle', white?.title ?? null);
  pushIfPresent(tags, 'BlackTitle', black?.title ?? null);
  pushIfPresent(tags, 'WhiteElo', ratingTag(white));
  pushIfPresent(tags, 'BlackElo', ratingTag(black));
  pushIfPresent(tags, 'WhiteFideId', white?.fideId ?? null);
  pushIfPresent(tags, 'BlackFideId', black?.fideId ?? null);
  if (termination !== null) {
    tags.push(['Termination', termination]);
  }

  const tagSection = tags.map(([name, value]) => `[${name} "${escapeTag(value)}"]`).join('\n');
  const movetext = buildMovetext(pairing.pgn, resultToken);

  // PGN spec §8: teg bo'limi + bo'sh qator + movetext + bo'sh qator.
  return `${tagSection}\n\n${movetext}\n`;
}

// --- Yordamchilar ----------------------------------------------------------------

/** Qiymat mavjud bo'lsagina teg qo'shish (bo'sh teg yozilmaydi). */
function pushIfPresent(tags: [string, string][], name: string, value: string | null): void {
  if (value !== null && value !== '') {
    tags.push([name, value]);
  }
}

/** Reyting tegi qiymati; o'yinchi yoki reyting yo'q — null. */
function ratingTag(player: ExportPlayer | null): string | null {
  const rating = player?.rating ?? null;
  return rating === null ? null : String(rating);
}

/** "Lastname, Firstname" (PGN spec §8.1.1.5); noma'lum o'yinchi — "?". */
function playerName(player: ExportPlayer | null): string {
  if (player === null) {
    return '?';
  }
  return `${player.lastName}, ${player.firstName}`;
}

/** ISO "YYYY-MM-DD" → PGN "YYYY.MM.DD"; null → "????.??.??" (spec §8.1.1.3). */
function pgnDate(isoDate: string | null): string {
  if (isoDate === null) {
    return '????.??.??';
  }
  return isoDate.replaceAll('-', '.');
}

/** Teg qiymatida `\` va `"` ekranlash (PGN spec §7); yangi qator — bo'sh joy. */
function escapeTag(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll(/[\r\n\t]+/g, ' ');
}

/** Header jadvalidagi natija → PGN tokeni (bye/UNPLAYED bu yerga kelmaydi). */
function resultTokenOf(result: ExportPairingResult): ResultToken {
  switch (result) {
    case 'WHITE_WIN':
    case 'WHITE_WIN_FORFEIT':
      return '1-0';
    case 'BLACK_WIN':
    case 'BLACK_WIN_FORFEIT':
      return '0-1';
    case 'DRAW':
      return '1/2-1/2';
    // DOUBLE_FORFEIT — header qarori: "*" + Termination "forfeit".
    default:
      return '*';
  }
}

function isForfeit(result: ExportPairingResult): boolean {
  return (
    result === 'WHITE_WIN_FORFEIT' || result === 'BLACK_WIN_FORFEIT' || result === 'DOUBLE_FORFEIT'
  );
}

/**
 * Movetext: saqlangan yozuv bo'lsa — whitespace normallashtirilib, natija
 * tokeni bilan tugashi kafolatlanib, 80 ustunda buklanadi; bo'lmasa —
 * faqat natija tokeni.
 */
function buildMovetext(storedPgn: string | null, resultToken: ResultToken): string {
  const stored = storedPgn?.trim() ?? '';
  if (stored === '') {
    return resultToken;
  }
  const normalized = stored.replaceAll(/\s+/g, ' ');
  const endsWithToken = RESULT_TOKENS.some((token) => normalized.endsWith(token));
  return wrap(endsWithToken ? normalized : `${normalized} ${resultToken}`);
}

/** So'z chegarasida MAX_LINE ustunga buklash (PGN spec §3.2). */
function wrap(text: string): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current === '') {
      current = word;
    } else if (current.length + 1 + word.length <= MAX_LINE) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') {
    lines.push(current);
  }
  return lines.join('\n');
}
