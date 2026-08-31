import type { ExportPairing, ExportPlayer, SectionExportData } from './export.types';
import { fixed, writeSectionTrf } from './trf-writer';

/**
 * TRF16 yozuvchi — testlar.
 *
 * Eng muhim qismi — USTUN POZITSIYALARI: TRF qat'iy ustunli format,
 * bir belgiga siljish Chess-Results/Swiss-Manager importini buzadi.
 * Shuning uchun golden qatorlar ham to'liq literal, ham TRF16 spec'dagi
 * pozitsiyalar bo'yicha substring assert'lari bilan tekshiriladi
 * (1-indeksli pozitsiya P → 0-indeksli slice(P-1, ...)).
 *
 * Fixture: 5 o'yinchi (toq — har turda bye), 5 turdan 2 tasi o'ynalgan
 * (qisman turnir) — U (PAB), H (half bye), forfeit +/- holatlari bilan.
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
): ExportPairing {
  return { boardNumber, whiteRegistrationId, blackRegistrationId, result, pgn: null };
}

/**
 * GOLDEN fixture:
 *   R1: Aliyev 1-0 Yusupova, Karimova ½-½ Rustamov, Toshmatov — PAB (U)
 *   R2: Yusupova −/+ Karimova (forfeit), Toshmatov 0-1 Rustamov,
 *       Aliyev — half bye (H)
 * Ochkolar: Aliyev 1.5, Karimova 1.5, Rustamov 1.5, Toshmatov 1.0,
 * Yusupova 0.0.
 */
function goldenData(): SectionExportData {
  return {
    tournamentName: 'Toshkent Ochiq Turniri',
    sectionName: 'A guruh',
    site: 'Shaxmat saroyi, Tashkent UZB',
    city: 'Tashkent',
    federation: 'UZB',
    startDate: '2026-07-20',
    endDate: '2026-07-24',
    tournamentType: 'Individual: Round-Robin',
    chiefArbiter: 'Akmal Salimov',
    players: [
      player('r1', 1, 'Aliyev', 'Bobur', {
        gender: 'MALE',
        title: 'IM',
        rating: 2400,
        fideId: '14200001',
        birthDate: '1995-03-12',
        points: 1.5,
        rank: 1,
      }),
      player('r2', 2, 'Karimova', 'Nilufar', {
        gender: 'FEMALE',
        title: 'WIM',
        rating: 2200,
        fideId: '14200002',
        birthDate: '2000-07-01',
        points: 1.5,
        rank: 2,
      }),
      player('r3', 3, 'Rustamov', 'Jasur', {
        gender: 'MALE',
        rating: 2050,
        fideId: '14200003',
        birthDate: '1988-11-30',
        points: 1.5,
        rank: 3,
      }),
      // Reytingsiz, FIDE raqamsiz, sanasiz, federatsiyasiz — bo'sh ustunlar.
      player('r4', 4, 'Yusupova', 'Malika', {
        gender: 'FEMALE',
        federation: null,
        points: 0,
        rank: 5,
      }),
      // NM — milliy unvon, TRF unvon ustuniga CHIQMAYDI (trf-writer qarori).
      player('r5', 5, 'Toshmatov', 'Aziz', {
        gender: 'MALE',
        title: 'NM',
        rating: 2100,
        fideId: '14200005',
        birthDate: '1979-01-15',
        points: 1.0,
        rank: 4,
      }),
    ],
    rounds: [
      {
        number: 1,
        date: '2026-07-20',
        pairings: [
          pairing(1, 'r1', 'r4', 'WHITE_WIN'),
          pairing(2, 'r2', 'r3', 'DRAW'),
          pairing(3, 'r5', null, 'BYE_FULL'),
        ],
      },
      {
        number: 2,
        date: '2026-07-21',
        pairings: [
          pairing(1, 'r4', 'r2', 'BLACK_WIN_FORFEIT'),
          pairing(2, 'r5', 'r3', 'BLACK_WIN'),
          pairing(3, 'r1', null, 'BYE_HALF'),
        ],
      },
    ],
  };
}

describe('writeSectionTrf', () => {
  const output = writeSectionTrf(goldenData());
  const lines = output.split('\n');

  it('header qatorlari — 012/022/032/042/052/062/072/092/102', () => {
    expect(lines[0]).toBe('012 Toshkent Ochiq Turniri - A guruh');
    expect(lines[1]).toBe('022 Tashkent');
    expect(lines[2]).toBe('032 UZB');
    expect(lines[3]).toBe('042 2026/07/20');
    expect(lines[4]).toBe('052 2026/07/24');
    expect(lines[5]).toBe('062 5');
    expect(lines[6]).toBe('072 4'); // reytingsiz Yusupova sanalmaydi
    expect(lines[7]).toBe('092 Individual: Round-Robin');
    expect(lines[8]).toBe('102 Akmal Salimov');
  });

  it("GOLDEN: 1-o'yinchi qatori to'liq literal mos", () => {
    // Ruler (1-indeksli): 001□□□□1□m□IM□Aliyev, Bobur…2400□UZB□…14200001□…
    expect(lines[9]).toBe(
      '001    1 m IM Aliyev, Bobur' +
        ' '.repeat(21) + // ism 33 gacha to'ldirildi (20) + ajratuvchi (1)
        '2400 UZB    14200001 1995/03/12  1.5    1     4 w 1  0000 - H',
    );
  });

  it("GOLDEN: 4-o'yinchi (bo'sh ustunlar) qatori to'liq literal mos", () => {
    // Reytingsiz → "   0"; federatsiya/FIDE raqami/sana → bo'sh.
    expect(lines[12]).toBe(
      '001    4 w    Yusupova, Malika' +
        ' '.repeat(18) + // ism 33 gacha (17) + ajratuvchi (1)
        '   0' +
        ' '.repeat(28) + // fed(3) + fide(11) + sana(10) + 4 ajratuvchi — bo'sh
        ' 0.0    5     1 b 0     2 w -',
    );
  });

  it('USTUN POZITSIYALARI — TRF16 spec (1-indeksli) 001 qatorda aynan joyida', () => {
    const line = lines[9] ?? '';
    expect(line.slice(0, 3)).toBe('001'); // 1-3
    expect(line.slice(4, 8)).toBe('   1'); // 5-8 boshlang'ich raqam
    expect(line.charAt(9)).toBe('m'); // 10 jins
    expect(line.slice(10, 13)).toBe(' IM'); // 11-13 unvon
    expect(line.slice(14, 47)).toBe('Aliyev, Bobur'.padEnd(33, ' ')); // 15-47 ism
    expect(line.slice(48, 52)).toBe('2400'); // 49-52 reyting
    expect(line.slice(53, 56)).toBe('UZB'); // 54-56 federatsiya
    expect(line.slice(57, 68)).toBe('   14200001'); // 58-68 FIDE raqami
    expect(line.slice(69, 79)).toBe('1995/03/12'); // 70-79 tug'ilgan sana
    expect(line.slice(80, 84)).toBe(' 1.5'); // 81-84 ochko
    expect(line.slice(85, 89)).toBe('   1'); // 86-89 o'rin
    // 1-tur bloki (90-99): raqib 92-95, rang 97, natija 99.
    expect(line.slice(89, 99)).toBe('     4 w 1');
    expect(line.slice(91, 95)).toBe('   4');
    expect(line.charAt(96)).toBe('w');
    expect(line.charAt(98)).toBe('1');
    // 2-tur bloki (100-109): half bye.
    expect(line.slice(99, 109)).toBe('  0000 - H');
    expect(line.charAt(108)).toBe('H');
  });

  it('natija belgilari: 1/0/=, +/-, U/H — har tomon uchun', () => {
    // Karimova (2): R1 durang oq bilan, R2 forfeit g'alaba qora bilan.
    expect(lines[10]?.slice(89, 99)).toBe('     3 w =');
    expect(lines[10]?.slice(99, 109)).toBe('     4 b +');
    // Rustamov (3): R1 durang qora, R2 taxtada g'alaba qora.
    expect(lines[11]?.slice(89, 99)).toBe('     2 b =');
    expect(lines[11]?.slice(99, 109)).toBe('     5 b 1');
    // Yusupova (4): R1 mag'lubiyat qora, R2 forfeit mag'lubiyat oq.
    expect(lines[12]?.slice(89, 99)).toBe('     1 b 0');
    expect(lines[12]?.slice(99, 109)).toBe('     2 w -');
    // Toshmatov (5): R1 PAB (U), R2 taxtada mag'lubiyat oq.
    expect(lines[13]?.slice(89, 99)).toBe('  0000 - U');
    expect(lines[13]?.slice(99, 109)).toBe('     3 w 0');
  });

  it("Toshmatov qatori: NM unvoni TRF'ga chiqmaydi (unvon ustuni bo'sh)", () => {
    const line = lines[13] ?? '';
    expect(line.charAt(9)).toBe('m');
    expect(line.slice(10, 13)).toBe('   ');
  });

  it("deterministik: kirish tartibi chiqishga ta'sir qilmaydi", () => {
    const data = goldenData();
    const shuffled: SectionExportData = {
      ...data,
      players: [...data.players].reverse(),
      rounds: [...data.rounds]
        .reverse()
        .map((round) => ({ ...round, pairings: [...round.pairings].reverse() })),
    };
    expect(writeSectionTrf(shuffled)).toBe(output);
  });

  it("Z (nol bye), '-' (juftlanmagan) va UNPLAYED holatlari", () => {
    const data: SectionExportData = {
      ...goldenData(),
      players: [player('r1', 1, 'Aliyev', 'Bobur'), player('r2', 2, 'Karimova', 'Nilufar')],
      rounds: [
        { number: 1, date: null, pairings: [pairing(1, 'r1', null, 'BYE_ZERO')] },
        { number: 2, date: null, pairings: [pairing(1, 'r1', 'r2', 'UNPLAYED')] },
      ],
    };
    const out = writeSectionTrf(data).split('\n');
    const p1 = out.find((l) => l.startsWith('001    1')) ?? '';
    const p2 = out.find((l) => l.startsWith('001    2')) ?? '';
    expect(p1.slice(89, 99)).toBe('  0000 - Z'); // nol bye
    expect(p2.slice(89, 99)).toBe('  0000 - -'); // R1'da juftlanmagan
    expect(p1.slice(99, 109)).toBe('  0000 - -'); // UNPLAYED — natija taxmin qilinmaydi
  });

  it("DOUBLE_FORFEIT — ikkala tomonga forfeit mag'lubiyat '-'", () => {
    const data: SectionExportData = {
      ...goldenData(),
      players: [player('r1', 1, 'Aliyev', 'Bobur'), player('r2', 2, 'Karimova', 'Nilufar')],
      rounds: [{ number: 1, date: null, pairings: [pairing(1, 'r1', 'r2', 'DOUBLE_FORFEIT')] }],
    };
    const out = writeSectionTrf(data).split('\n');
    expect(out.find((l) => l.startsWith('001    1'))?.slice(89, 99)).toBe('     2 w -');
    expect(out.find((l) => l.startsWith('001    2'))?.slice(89, 99)).toBe('     1 b -');
  });

  it("noma'lum meta — header qiymatlari bo'sh, 102 yozilmaydi", () => {
    const data: SectionExportData = {
      ...goldenData(),
      city: null,
      federation: null,
      startDate: null,
      endDate: null,
      tournamentType: null,
      chiefArbiter: null,
      rounds: [],
    };
    const out = writeSectionTrf(data).split('\n');
    expect(out[1]).toBe('022');
    expect(out[3]).toBe('042');
    expect(out.some((l) => l.startsWith('102'))).toBe(false);
    expect(out[8]?.startsWith('001')).toBe(true); // 102 siz to'g'ridan-to'g'ri 001
  });

  it('chiqish yagona \\n bilan tugaydi', () => {
    expect(output.endsWith('\n')).toBe(true);
    expect(output.endsWith('\n\n')).toBe(false);
  });
});

describe('fixed', () => {
  it("chapga/o'ngga tekislash va kesish", () => {
    expect(fixed('AB', 4, 'left')).toBe('AB  ');
    expect(fixed('AB', 4, 'right')).toBe('  AB');
    expect(fixed('ABCDEF', 4, 'left')).toBe('ABCD');
    expect(fixed('ABCDEF', 4, 'right')).toBe('ABCD');
    expect(fixed('', 3, 'left')).toBe('   ');
  });
});
