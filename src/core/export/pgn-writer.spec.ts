import type { ExportPairing, ExportPlayer, SectionExportData } from './export.types';
import { writeSectionPgn } from './pgn-writer';

/**
 * PGN yozuvchi — testlar.
 *
 * GOLDEN: 4 o'yinchilik to'liq round-robin (3 tur) — durang, forfeit,
 * double forfeit, saqlangan movetext va sana fallback holatlari bilan.
 * Kutilgan matn TO'LIQ, belgima-belgi tekshiriladi (docs/14-roadmap.md
 * Faza 1 DoD: "PGN eksport Swiss-Manager'da ochiladi" — format og'ishiga
 * joy yo'q).
 */

function player(
  registrationId: string,
  startRank: number,
  lastName: string,
  firstName: string,
  overrides: Partial<ExportPlayer> = {},
): ExportPlayer {
  return {
    registrationId,
    startRank,
    lastName,
    firstName,
    gender: null,
    title: null,
    rating: null,
    federation: 'UZB',
    fideId: null,
    birthDate: null,
    points: 0,
    rank: null,
    ...overrides,
  };
}

function pairing(
  boardNumber: number,
  whiteRegistrationId: string,
  blackRegistrationId: string | null,
  result: ExportPairing['result'],
  pgn: string | null = null,
): ExportPairing {
  return { boardNumber, whiteRegistrationId, blackRegistrationId, result, pgn };
}

/**
 * GOLDEN fixture — 4 o'yinchi, 3 tur, to'liq round-robin:
 *   R1: Aliyev 1-0 Yusupova (movetext saqlangan), Karimova ½-½ Rustamov
 *   R2: Rustamov 0-1 Aliyev, Yusupova 0-1(forfeit) Karimova
 *   R3 (sanasi yo'q → turnir boshlanish sanasi): Aliyev ½-½ Karimova,
 *       Rustamov —(double forfeit) Yusupova
 */
function goldenData(): SectionExportData {
  return {
    tournamentName: 'Toshkent Ochiq Turniri',
    sectionName: 'A guruh',
    site: 'Shaxmat saroyi, Tashkent UZB',
    city: 'Tashkent',
    federation: 'UZB',
    startDate: '2026-07-20',
    endDate: '2026-07-22',
    tournamentType: 'Individual: Round-Robin',
    chiefArbiter: null,
    players: [
      player('r1', 1, 'Aliyev', 'Bobur', {
        gender: 'MALE',
        title: 'IM',
        rating: 2100,
        fideId: '14200001',
        birthDate: '1995-03-12',
      }),
      player('r2', 2, 'Karimova', 'Nilufar', {
        gender: 'FEMALE',
        title: 'WFM',
        rating: 1950,
        fideId: '14200002',
      }),
      player('r3', 3, 'Rustamov', 'Jasur', { gender: 'MALE', rating: 1800 }),
      player('r4', 4, 'Yusupova', 'Malika', { gender: 'FEMALE', fideId: '14200004' }),
    ],
    rounds: [
      {
        number: 1,
        date: '2026-07-20',
        pairings: [
          pairing(1, 'r1', 'r4', 'WHITE_WIN', '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'),
          pairing(2, 'r2', 'r3', 'DRAW'),
        ],
      },
      {
        number: 2,
        date: '2026-07-21',
        pairings: [
          pairing(1, 'r3', 'r1', 'BLACK_WIN'),
          pairing(2, 'r4', 'r2', 'BLACK_WIN_FORFEIT'),
        ],
      },
      {
        number: 3,
        date: null,
        pairings: [pairing(1, 'r1', 'r2', 'DRAW'), pairing(2, 'r3', 'r4', 'DOUBLE_FORFEIT')],
      },
    ],
  };
}

/** Kutilgan to'liq PGN — qatorlar ro'yxati (bo'sh element = bo'sh qator). */
const GOLDEN_EXPECTED = [
  // --- R1 taxta 1: saqlangan movetext o'tkaziladi -------------------------
  '[Event "Toshkent Ochiq Turniri - A guruh"]',
  '[Site "Shaxmat saroyi, Tashkent UZB"]',
  '[Date "2026.07.20"]',
  '[Round "1"]',
  '[White "Aliyev, Bobur"]',
  '[Black "Yusupova, Malika"]',
  '[Result "1-0"]',
  '[WhiteTitle "IM"]',
  '[WhiteElo "2100"]',
  '[WhiteFideId "14200001"]',
  '[BlackFideId "14200004"]',
  '',
  '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
  '',
  // --- R1 taxta 2: result-only durang -------------------------------------
  '[Event "Toshkent Ochiq Turniri - A guruh"]',
  '[Site "Shaxmat saroyi, Tashkent UZB"]',
  '[Date "2026.07.20"]',
  '[Round "1"]',
  '[White "Karimova, Nilufar"]',
  '[Black "Rustamov, Jasur"]',
  '[Result "1/2-1/2"]',
  '[WhiteTitle "WFM"]',
  '[WhiteElo "1950"]',
  '[BlackElo "1800"]',
  '[WhiteFideId "14200002"]',
  '',
  '1/2-1/2',
  '',
  // --- R2 taxta 1 -----------------------------------------------------------
  '[Event "Toshkent Ochiq Turniri - A guruh"]',
  '[Site "Shaxmat saroyi, Tashkent UZB"]',
  '[Date "2026.07.21"]',
  '[Round "2"]',
  '[White "Rustamov, Jasur"]',
  '[Black "Aliyev, Bobur"]',
  '[Result "0-1"]',
  '[BlackTitle "IM"]',
  '[WhiteElo "1800"]',
  '[BlackElo "2100"]',
  '[BlackFideId "14200001"]',
  '',
  '0-1',
  '',
  // --- R2 taxta 2: forfeit — Result oddiy, Termination "forfeit" ------------
  '[Event "Toshkent Ochiq Turniri - A guruh"]',
  '[Site "Shaxmat saroyi, Tashkent UZB"]',
  '[Date "2026.07.21"]',
  '[Round "2"]',
  '[White "Yusupova, Malika"]',
  '[Black "Karimova, Nilufar"]',
  '[Result "0-1"]',
  '[BlackTitle "WFM"]',
  '[BlackElo "1950"]',
  '[WhiteFideId "14200004"]',
  '[BlackFideId "14200002"]',
  '[Termination "forfeit"]',
  '',
  '0-1',
  '',
  // --- R3 taxta 1: tur sanasi yo'q → turnir boshlanish sanasi ---------------
  '[Event "Toshkent Ochiq Turniri - A guruh"]',
  '[Site "Shaxmat saroyi, Tashkent UZB"]',
  '[Date "2026.07.20"]',
  '[Round "3"]',
  '[White "Aliyev, Bobur"]',
  '[Black "Karimova, Nilufar"]',
  '[Result "1/2-1/2"]',
  '[WhiteTitle "IM"]',
  '[BlackTitle "WFM"]',
  '[WhiteElo "2100"]',
  '[BlackElo "1950"]',
  '[WhiteFideId "14200001"]',
  '[BlackFideId "14200002"]',
  '',
  '1/2-1/2',
  '',
  // --- R3 taxta 2: double forfeit — PGN'da "*" + Termination "forfeit" ------
  // (PGN spec §8.2.6 faqat 1-0 / 0-1 / 1/2-1/2 / * tokenlarini biladi,
  //  "0-0" nostandart — pgn-writer.ts header qarori)
  '[Event "Toshkent Ochiq Turniri - A guruh"]',
  '[Site "Shaxmat saroyi, Tashkent UZB"]',
  '[Date "2026.07.20"]',
  '[Round "3"]',
  '[White "Rustamov, Jasur"]',
  '[Black "Yusupova, Malika"]',
  '[Result "*"]',
  '[WhiteElo "1800"]',
  '[BlackFideId "14200004"]',
  '[Termination "forfeit"]',
  '',
  '*',
  '',
].join('\n');

describe('writeSectionPgn', () => {
  it("GOLDEN: 4 o'yinchilik round-robin — to'liq matn belgima-belgi mos", () => {
    expect(writeSectionPgn(goldenData())).toBe(GOLDEN_EXPECTED);
  });

  it("deterministik: kirish massivlari tartibi chiqishga ta'sir qilmaydi", () => {
    const data = goldenData();
    const shuffled: SectionExportData = {
      ...data,
      players: [...data.players].reverse(),
      rounds: [...data.rounds]
        .reverse()
        .map((round) => ({ ...round, pairings: [...round.pairings].reverse() })),
    };
    expect(writeSectionPgn(shuffled)).toBe(GOLDEN_EXPECTED);
    expect(writeSectionPgn(data)).toBe(writeSectionPgn(data));
  });

  it('bye va UNPLAYED juftliklar partiya sifatida chiqmaydi', () => {
    const data = goldenData();
    const withExtras: SectionExportData = {
      ...data,
      rounds: [
        ...data.rounds,
        {
          number: 4,
          date: null,
          pairings: [
            pairing(1, 'r1', 'r3', 'UNPLAYED'),
            pairing(2, 'r2', null, 'BYE_FULL'),
            pairing(3, 'r4', null, 'BYE_HALF'),
          ],
        },
      ],
    };
    const output = writeSectionPgn(withExtras);
    expect(output).toBe(GOLDEN_EXPECTED); // 4-tur hech narsa qo'shmadi
    expect(output).not.toContain('[Round "4"]');
  });

  it('teg qiymatlarida `"` va `\\` ekranlanadi (PGN spec §7)', () => {
    const data: SectionExportData = {
      ...goldenData(),
      tournamentName: 'Memorial "Chust" \\ 2026',
      rounds: [{ number: 1, date: null, pairings: [pairing(1, 'r1', 'r2', 'WHITE_WIN')] }],
    };
    const output = writeSectionPgn(data);
    expect(output).toContain('[Event "Memorial \\"Chust\\" \\\\ 2026 - A guruh"]');
  });

  it('Site yo\'q — "?", sana umuman yo\'q — "????.??.??"', () => {
    const data: SectionExportData = {
      ...goldenData(),
      site: null,
      startDate: null,
      rounds: [{ number: 1, date: null, pairings: [pairing(1, 'r1', 'r2', 'WHITE_WIN')] }],
    };
    const output = writeSectionPgn(data);
    expect(output).toContain('[Site "?"]');
    expect(output).toContain('[Date "????.??.??"]');
  });

  it("noma'lum registrationId — o'yinchi nomi \"?\" (ma'lumot buzilganda yiqilmaydi)", () => {
    const data: SectionExportData = {
      ...goldenData(),
      rounds: [{ number: 1, date: null, pairings: [pairing(1, 'r1', 'yoq-id', 'WHITE_WIN')] }],
    };
    expect(writeSectionPgn(data)).toContain('[Black "?"]');
  });

  it("saqlangan movetext natija tokeni bilan tugamasa — token qo'shiladi", () => {
    const data: SectionExportData = {
      ...goldenData(),
      rounds: [
        { number: 1, date: null, pairings: [pairing(1, 'r1', 'r2', 'DRAW', '1. d4 d5 2. c4')] },
      ],
    };
    expect(writeSectionPgn(data)).toContain('\n\n1. d4 d5 2. c4 1/2-1/2\n');
  });

  it("movetext 80 ustunda so'z chegarasida buklanadi (PGN spec §3.2)", () => {
    // 30 ta yurish — bir qatordan aniq uzun.
    const moves = Array.from({ length: 30 }, (_, i) => `${String(i + 1)}. Nf3 Nf6`).join(' ');
    const data: SectionExportData = {
      ...goldenData(),
      rounds: [{ number: 1, date: null, pairings: [pairing(1, 'r1', 'r2', 'DRAW', moves)] }],
    };
    const output = writeSectionPgn(data);
    const moveLines = output.split('\n\n')[1]?.trimEnd().split('\n') ?? [];
    expect(moveLines.length).toBeGreaterThan(1);
    for (const line of moveLines) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
    // Buklash mazmunni o'zgartirmaydi: qayta yig'ilsa asl matn + token.
    expect(moveLines.join(' ')).toBe(`${moves} 1/2-1/2`);
  });
});
