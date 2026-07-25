import type {
  ExportPairing,
  ExportPairingResult,
  ExportPlayer,
  ExportRound,
  SectionExportData,
} from './export.types';

/**
 * TRF16 yozuvchi — seksiyani FIDE Tournament Report Format (TRF16,
 * FIDE Handbook C.04.A Annex-2, 2016 redaksiyasi) matniga aylantiradi.
 * Chess-Results.com va Swiss-Manager aynan shu formatni import qiladi —
 * docs/14-roadmap.md Faza 1 "Chess-Results formatiga eksport (migratsiya
 * yo'li)" va docs/05-pairing-engine.md §8.3 (golden test manbai ham shu).
 *
 * Sof funksiya: holat va yon ta'sir yo'q (ADR-0001, `core-must-stay-pure`).
 *
 * USTUN POZITSIYALARI (1-indeksli, TRF16 spec bo'yicha) — 001 qator:
 *
 *   1-3   "001"                     49-52  reyting (o'ngga tekis)
 *   5-8   boshlang'ich raqam        54-56  federatsiya kodi
 *   10    jins (m/w)                58-68  FIDE raqami (o'ngga tekis)
 *   11-13 unvon (o'ngga tekis)      70-79  tug'ilgan sana YYYY/MM/DD
 *   15-47 "Familiya, Ism" (chapga)  81-84  ochko (masalan " 3.5")
 *                                   86-89  o'rin (rank)
 *
 * Keyin har tur uchun 10 belgilik blok (90+10k dan boshlab):
 *   92-95 raqib boshlang'ich raqami, 97 rang (w/b/-), 99 natija belgisi.
 *
 * NATIJA BELGILARI (TRF16):
 *   1 / = / 0  — taxtada o'ynalgan g'alaba / durang / mag'lubiyat
 *   + / -      — forfeit g'alaba / forfeit mag'lubiyat (rang — rejadagi rang)
 *   U          — juftlashtiruvchi bergan bye (PAB, 1 ochko) — bizda BYE_FULL
 *   H          — yarim ochkoli bye (BYE_HALF)
 *   Z          — nol ochkoli bye (BYE_ZERO)
 *   -          — turda umuman juftlanmagan (raqib 0000, rang -)
 *
 * QARORLAR (hujjatlashtirilgan):
 *  - Raqib raqami — real TRF fayllardagidek O'NGGA TEKIS, BO'SH JOY bilan
 *    to'ldiriladi ("   4"); raqib yo'q holatlarda (bye/juftlanmagan)
 *    literal "0000" (Swiss-Manager/JaVaFo odati).
 *  - DOUBLE_FORFEIT — ikkala tomonga ham "-" (forfeit mag'lubiyat).
 *  - UNPLAYED (natija hali kiritilmagan) — "0000 - -" (juftlanmagan bilan
 *    teng): yakunlanmagan natijani taxmin qilmaymiz.
 *  - Reytingsiz o'yinchi — "   0" (parser'lar butun son kutadi);
 *    FIDE raqami / tug'ilgan sana noma'lum — bo'sh qoladi.
 *  - NM (milliy unvon) — FIDE unvoni EMAS, TRF unvon ustuni bo'sh qoladi
 *    (PGN'da esa WhiteTitle/BlackTitle sifatida chiqadi).
 *  - Header sanalari YYYY/MM/DD (TRF16 spec); noma'lum — qator qiymati bo'sh.
 *
 * Chiqish deterministik: o'yinchilar startRank, turlar raqam bo'yicha
 * saralanadi (kirish tartibidan mustaqil).
 */

/** FIDE unvonlari — TRF unvon ustuniga chiqadiganlar (NM chiqmaydi). */
const FIDE_TITLES = ['GM', 'IM', 'FM', 'CM', 'WGM', 'WIM', 'WFM', 'WCM'] as const;

export function writeSectionTrf(data: SectionExportData): string {
  const players = [...data.players].sort((a, b) => a.startRank - b.startRank);
  const rounds = [...data.rounds].sort((a, b) => a.number - b.number);

  const lines: string[] = [
    `012 ${data.tournamentName} - ${data.sectionName}`,
    `022 ${data.city ?? ''}`,
    `032 ${data.federation ?? ''}`,
    `042 ${trfDate(data.startDate)}`,
    `052 ${trfDate(data.endDate)}`,
    `062 ${String(players.length)}`,
    `072 ${String(players.filter((p) => p.rating !== null).length)}`,
    `092 ${data.tournamentType ?? ''}`,
  ];
  if (data.chiefArbiter !== null) {
    lines.push(`102 ${data.chiefArbiter}`);
  }

  const startRankById = new Map<string, number>(
    players.map((p) => [p.registrationId, p.startRank]),
  );
  for (const player of players) {
    lines.push(playerLine(player, rounds, startRankById));
  }

  return `${lines.map((line) => line.trimEnd()).join('\n')}\n`;
}

// --- 001 qator -------------------------------------------------------------------

function playerLine(
  player: ExportPlayer,
  rounds: readonly ExportRound[],
  startRankById: ReadonlyMap<string, number>,
): string {
  // Maydonlar orasidagi bitta bo'sh joy ustun pozitsiyalarini beradi —
  // header'dagi jadval bilan solishtiring (spec fayl pozitsiyalarni tekshiradi).
  const parts = [
    '001',
    fixed(String(player.startRank), 4, 'right'),
    sexChar(player.gender) + fixed(trfTitle(player.title), 3, 'right'),
    fixed(`${player.lastName}, ${player.firstName}`, 33, 'left'),
    fixed(String(player.rating ?? 0), 4, 'right'),
    fixed(player.federation ?? '', 3, 'left'),
    fixed(player.fideId ?? '', 11, 'right'),
    fixed(player.birthDate === null ? '' : player.birthDate.replaceAll('-', '/'), 10, 'left'),
    fixed(player.points.toFixed(1), 4, 'right'),
    fixed(player.rank === null ? '' : String(player.rank), 4, 'right'),
  ];

  const blocks = rounds.map((round) => roundBlock(player, round, startRankById));
  return parts.join(' ') + blocks.join('');
}

/**
 * Bir o'yinchining bir turdagi 10 belgilik bloki: "  OOOO C R"
 * (2 bo'sh joy + raqib 4 + bo'sh joy + rang + bo'sh joy + natija).
 */
function roundBlock(
  player: ExportPlayer,
  round: ExportRound,
  startRankById: ReadonlyMap<string, number>,
): string {
  const pairing = findPairing(player.registrationId, round);
  // Juftlanmagan YOKI natijasi hali kiritilmagan — "0000 - -": raqib
  // raqamini yozib natijani "-" qilish forfeit mag'lubiyat deb o'qiladi,
  // taxmin qilmaymiz (header qarori).
  if (pairing === null || pairing.result === 'UNPLAYED') {
    return '  0000 - -';
  }

  const isWhite = pairing.whiteRegistrationId === player.registrationId;
  const opponentId = isWhite ? pairing.blackRegistrationId : pairing.whiteRegistrationId;
  const opponentRank = opponentId === null ? null : (startRankById.get(opponentId) ?? null);
  const opponent = opponentRank === null ? '0000' : fixed(String(opponentRank), 4, 'right');

  const { colorChar, resultChar } = sideOutcome(pairing.result, isWhite);
  return `  ${opponent} ${colorChar} ${resultChar}`;
}

/** Natija + tomon → TRF rang va natija belgilari (header jadvali). */
function sideOutcome(
  result: Exclude<ExportPairingResult, 'UNPLAYED'>,
  isWhite: boolean,
): { colorChar: string; resultChar: string } {
  const color = isWhite ? 'w' : 'b';
  switch (result) {
    case 'WHITE_WIN':
      return { colorChar: color, resultChar: isWhite ? '1' : '0' };
    case 'BLACK_WIN':
      return { colorChar: color, resultChar: isWhite ? '0' : '1' };
    case 'DRAW':
      return { colorChar: color, resultChar: '=' };
    case 'WHITE_WIN_FORFEIT':
      return { colorChar: color, resultChar: isWhite ? '+' : '-' };
    case 'BLACK_WIN_FORFEIT':
      return { colorChar: color, resultChar: isWhite ? '-' : '+' };
    case 'DOUBLE_FORFEIT':
      return { colorChar: color, resultChar: '-' };
    case 'BYE_FULL':
      return { colorChar: '-', resultChar: 'U' };
    case 'BYE_HALF':
      return { colorChar: '-', resultChar: 'H' };
    case 'BYE_ZERO':
      return { colorChar: '-', resultChar: 'Z' };
  }
}

// --- Yordamchilar ----------------------------------------------------------------

/**
 * Belgilangan kenglikdagi maydon: to'ldirish bo'sh joy bilan, sig'masa
 * KESILADI (TRF — qat'iy ustunli format, siljish butun qatorni buzadi).
 */
export function fixed(value: string, width: number, align: 'left' | 'right'): string {
  const cut = value.length > width ? value.slice(0, width) : value;
  return align === 'left' ? cut.padEnd(width, ' ') : cut.padStart(width, ' ');
}

function findPairing(registrationId: string, round: ExportRound): ExportPairing | null {
  for (const pairing of round.pairings) {
    if (
      pairing.whiteRegistrationId === registrationId ||
      pairing.blackRegistrationId === registrationId
    ) {
      return pairing;
    }
  }
  return null;
}

/** TRF jins ustuni: m / w, noma'lum — bo'sh joy. */
function sexChar(gender: 'MALE' | 'FEMALE' | null): string {
  if (gender === 'MALE') {
    return 'm';
  }
  if (gender === 'FEMALE') {
    return 'w';
  }
  return ' ';
}

/** Faqat FIDE unvonlari TRF'ga chiqadi (header qarori: NM — bo'sh). */
function trfTitle(title: string | null): string {
  return title !== null && (FIDE_TITLES as readonly string[]).includes(title) ? title : '';
}

/** ISO "YYYY-MM-DD" → TRF "YYYY/MM/DD"; null → bo'sh. */
function trfDate(isoDate: string | null): string {
  return isoDate === null ? '' : isoDate.replaceAll('-', '/');
}
