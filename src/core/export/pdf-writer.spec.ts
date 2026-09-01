import type { SectionExportData } from './export.types';
import { toPdfSafeText, writePairingSheetPdf, writeStandingsPdf } from './pdf-writer';

/**
 * PDF eksport — juftlik varaqasi va jadval.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  docs/14-roadmap.md Faza 1 "Eksport": "PDF: juftliklar, jadval,
 *  natijalar — bu OFFLINE DEGRADATSIYA rejasining bir qismi".
 *
 *  Auditgacha PDF eksport UMUMAN YO'Q edi (docs/AUDIT.md KICHIK-5):
 *  `src/core/export/` da faqat PGN va TRF bor edi. Real turnir zalida
 *  internet uzilsa hakam ishsiz qolardi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  TEST USULI: hujjat `compress: false` bilan quriladi — shunda matn
 *  kontent oqimida OCHIQ qoladi va uni izlash mumkin. Joylashuv kodi
 *  prod bilan AYNAN bir xil, faqat siqish bayrog'i farq qiladi.
 */

/**
 * Siqilmagan PDF'dan matnni ajratib olish.
 *
 * ⚠️  pdfkit matnni OCHIQ yozmaydi: u kerning massivi ichida HEX satr
 *     sifatida chiqaradi, masalan
 *       [<54> 80 <6f73686b656e74> 10 <2d2041> 0] TJ
 *     Shuning uchun oddiy `buffer.includes('Toshkent')` HAR DOIM false
 *     beradi — matnni topish uchun hex bo'laklarni dekodlash kerak.
 *
 *     Bu testning o'zi uchun qilingan ish, prod kodiga tegmaydi.
 */
function extractPdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const parts: string[] = [];

  // Massiv AYNAN hex bo'laklar va kerning sonlaridan iborat bo'lishi
  // shart — aks holda `/MediaBox [...]` kabi begona qavslar ham mos
  // kelib, dangasa `.*?` ular orasidagi hamma narsani yutib yuborardi.
  for (const match of raw.matchAll(/\[((?:<[0-9a-fA-F]*>|\s|-?[\d.]+)*)\]\s*TJ/g)) {
    for (const hex of (match[1] ?? '').matchAll(/<([0-9a-fA-F]*)>/g)) {
      parts.push(Buffer.from(hex[1] ?? '', 'hex').toString('latin1'));
    }
    // Har operator — bitta katak. Ajratgichsiz qo'shni kataklar
    // qo'shilib ketib YOLG'ON moslik berardi.
    parts.push('\n');
  }

  return parts.join('');
}

/** Matn PDF ichida bormi (bitta katak ichida). */
function containsText(pdf: Buffer, needle: string): boolean {
  return extractPdfText(pdf).includes(needle);
}

const RAW: PdfTestData = {
  tournamentName: 'Toshkent ochiq turniri',
  sectionName: 'A',
  site: 'Shaxmat saroyi, Tashkent UZB',
  city: 'Tashkent',
  federation: 'UZB',
  startDate: '2026-10-01',
  endDate: '2026-10-05',
  tournamentType: 'Individual: Swiss-System',
  chiefArbiter: 'Karimov, Alisher',
  players: [
    {
      registrationId: 'r1',
      startRank: 1,
      lastName: 'Abdusattorov',
      firstName: 'Nodirbek',
      gender: 'MALE',
      title: 'GM',
      rating: 2760,
      federation: 'UZB',
      fideId: '14204118',
      birthDate: '2004-09-18',
      points: 2.5,
      rank: 1,
    },
    {
      registrationId: 'r2',
      startRank: 2,
      lastName: 'Sindarov',
      firstName: 'Javokhir',
      gender: 'MALE',
      title: 'GM',
      rating: 2700,
      federation: 'UZB',
      fideId: '14205000',
      birthDate: '2005-12-08',
      points: 1.5,
      rank: 2,
    },
    {
      registrationId: 'r3',
      startRank: 3,
      lastName: 'Reytingsiz',
      firstName: 'Yosh',
      gender: null,
      title: null,
      rating: null,
      federation: null,
      fideId: null,
      birthDate: null,
      points: 1,
      rank: 3,
    },
  ],
  rounds: [
    {
      number: 1,
      date: '2026-10-01',
      pairings: [
        {
          boardNumber: 1,
          whiteRegistrationId: 'r1',
          blackRegistrationId: 'r2',
          result: 'WHITE_WIN',
          pgn: null,
        },
        {
          boardNumber: 2,
          whiteRegistrationId: 'r3',
          blackRegistrationId: null,
          result: 'BYE_FULL',
          pgn: null,
        },
      ],
    },
    {
      number: 2,
      date: null,
      pairings: [
        {
          boardNumber: 1,
          whiteRegistrationId: 'r2',
          blackRegistrationId: 'r3',
          result: 'UNPLAYED',
          pgn: null,
        },
      ],
    },
  ],
};

type PdfTestData = SectionExportData;

const OPTS = { compress: false } as const;

describe('toPdfSafeText', () => {
  it("o'zbek modifikator apostroflari ASCII ga keltiriladi", () => {
    // U+02BB / U+02BC — WinAnsi'da YO'Q, Helvetica bilan buzuq chiqardi.
    expect(toPdfSafeText('Gʻafur Oʻgʻli')).toBe("G'afur O'g'li");
  });

  it('tipografik tirnoq va uzun tire ham almashtiriladi', () => {
    expect(toPdfSafeText('“matn” – izoh')).toBe('"matn" - izoh');
  });

  it("oddiy ASCII matn O'ZGARMAYDI", () => {
    expect(toPdfSafeText("Qoraqalpog'iston")).toBe("Qoraqalpog'iston");
  });
});

describe('writePairingSheetPdf', () => {
  it('yaroqli PDF hujjati qaytaradi', async () => {
    const pdf = await writePairingSheetPdf(RAW, 1, OPTS);

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('%%EOF');
    expect(pdf.length).toBeGreaterThan(800);
  });

  it('sarlavhada turnir, seksiya va tur raqami bor', async () => {
    const pdf = await writePairingSheetPdf(RAW, 1, OPTS);

    expect(containsText(pdf, 'Toshkent ochiq turniri - A')).toBe(true);
    expect(containsText(pdf, '1-tur juftliklari')).toBe(true);
    expect(containsText(pdf, 'Bosh hakam: Karimov, Alisher')).toBe(true);
  });

  it("o'yinchilar unvon va reyting bilan chiqadi", async () => {
    const pdf = await writePairingSheetPdf(RAW, 1, OPTS);

    expect(containsText(pdf, 'GM Abdusattorov, Nodirbek (2760)')).toBe(true);
    expect(containsText(pdf, 'GM Sindarov, Javokhir (2700)')).toBe(true);
  });

  it('bye qatorida qora ustuni chiziqcha, natija BYE', async () => {
    const pdf = await writePairingSheetPdf(RAW, 1, OPTS);

    expect(containsText(pdf, 'BYE (1)')).toBe(true);
  });

  it("O'YNALMAGAN tur: natija ustuni BO'SH — hakam qo'lda to'ldiradi", async () => {
    // Offline oqimning mohiyati: varaq bosiladi, natija qalam bilan
    // yoziladi. Shuning uchun UNPLAYED uchun hech narsa chizilmaydi.
    const pdf = await writePairingSheetPdf(RAW, 2, OPTS);

    expect(containsText(pdf, '2-tur juftliklari')).toBe(true);
    expect(containsText(pdf, '1 - 0')).toBe(false);
    expect(containsText(pdf, '0.5 - 0.5')).toBe(false);
  });

  it("sanasi yo'q tur uchun sarlavhada qavs YO'Q", async () => {
    const pdf = await writePairingSheetPdf(RAW, 2, OPTS);
    expect(containsText(pdf, '2-tur juftliklari (')).toBe(false);
  });

  it("mavjud bo'lmagan tur → xato (jimgina bo'sh varaq CHIQMAYDI)", async () => {
    await expect(writePairingSheetPdf(RAW, 99, OPTS)).rejects.toThrow('Tur topilmadi: 99');
  });

  it("ko'p taxtali tur bir necha sahifaga bo'linadi va sarlavha takrorlanadi", async () => {
    // 60 taxta bitta A4 varaqqa sig'maydi — 2-sahifada ham ustun
    // nomlari bo'lishi SHART, aks holda raqamlar ma'nosiz.
    const many: SectionExportData = {
      ...RAW,
      players: Array.from({ length: 120 }, (_, i) => ({
        registrationId: `p${String(i)}`,
        startRank: i + 1,
        lastName: `Familiya${String(i)}`,
        firstName: 'Ism',
        gender: null,
        title: null,
        rating: null,
        federation: null,
        fideId: null,
        birthDate: null,
        points: 0,
        rank: null,
      })),
      rounds: [
        {
          number: 1,
          date: null,
          pairings: Array.from({ length: 60 }, (_, i) => ({
            boardNumber: i + 1,
            whiteRegistrationId: `p${String(i * 2)}`,
            blackRegistrationId: `p${String(i * 2 + 1)}`,
            result: 'UNPLAYED' as const,
            pgn: null,
          })),
        },
      ],
    };

    const pdf = await writePairingSheetPdf(many, 1, OPTS);
    const text = extractPdfText(pdf);
    // "Taxta" sarlavhasi kamida ikki marta — har sahifada bittadan.
    expect(text.split('Taxta').length - 1).toBeGreaterThanOrEqual(2);
  });
});

describe('writeStandingsPdf', () => {
  it('yaroqli PDF va jadval sarlavhasi', async () => {
    const pdf = await writeStandingsPdf(RAW, OPTS);

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(containsText(pdf, 'Yakuniy jadval')).toBe(true);
  });

  it('ochko bir kasr xonasi bilan — bosma varaqda aniqroq', async () => {
    const pdf = await writeStandingsPdf(RAW, OPTS);

    expect(containsText(pdf, '2.5')).toBe(true);
    // 1 emas, 1.0
    expect(containsText(pdf, '1.0')).toBe(true);
  });

  it("reytingsiz va federatsiyasiz o'yinchi ham chiqadi (bo'sh katak)", async () => {
    const pdf = await writeStandingsPdf(RAW, OPTS);

    expect(containsText(pdf, 'Reytingsiz, Yosh')).toBe(true);
  });

  it("tartib BARQAROR: rank yo'q bo'lsa ochko, keyin boshlang'ich raqam", async () => {
    const unranked: SectionExportData = {
      ...RAW,
      players: RAW.players.map((p) => ({ ...p, rank: null })),
    };

    const a = await writeStandingsPdf(unranked, OPTS);
    const b = await writeStandingsPdf(
      { ...unranked, players: [...unranked.players].reverse() },
      OPTS,
    );

    // Kirish tartibi teskari bo'lsa ham natija bir xil: yozuvchi o'zi
    // saralaydi (pgn/trf yozuvchilari bilan bir xil kelishuv).
    const positionOf = (pdf: Buffer, name: string): number => extractPdfText(pdf).indexOf(name);
    expect(positionOf(a, 'Abdusattorov')).toBeLessThan(positionOf(a, 'Sindarov'));
    expect(positionOf(b, 'Abdusattorov')).toBeLessThan(positionOf(b, 'Sindarov'));
  });
});
