import PDFDocument from 'pdfkit';

import type { ExportPairing, ExportPlayer, SectionExportData } from './export.types';

/**
 * PDF eksport — juftlik varaqasi va jadval.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA BU KERAK (docs/14-roadmap.md Faza 1 "Eksport")
 *
 *  "PDF: juftliklar, jadval, natijalar — bu OFFLINE DEGRADATSIYA
 *  rejasining bir qismi" (docs/11-infrastructure.md §12.4).
 *
 *  Real turnir zalida internet uzilishi ODATIY hol. Swiss-Manager
 *  raqobatchi sifatida aynan shu bilan kuchli: hakam qog'ozga chiqarib
 *  ishlashda davom etadi. PDF'siz Farzin'da internet uzilsa hakam
 *  ISHSIZ qoladi (docs/AUDIT.md KICHIK-5 va §6 raqobat tahlili).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  SOF QATLAM: bu fayl `core/` da va NestJS/Prisma/HTTP ni BILMAYDI
 *  (ADR-0001, `core-must-stay-pure`). pdfkit — sof render kutubxonasi,
 *  `chess.js` ning core'dagi pretsedenti bilan bir xil maqomda.
 *
 *  Kirish — `SectionExportData`, ya'ni PGN va TRF yozuvchilari bilan
 *  AYNAN bir xil kontrakt. Prisma qatorlaridan bu shaklga o'tkazish
 *  arbiter modulida (export-mapping.ts).
 */

/** A4 nuqtalarda (72 dpi). */
const PAGE_MARGIN = 42;

/** Standart PDF shriftlari — qo'shimcha shrift fayli kerak emas. */
const FONT = { regular: 'Helvetica', bold: 'Helvetica-Bold' } as const;

export interface PdfOptions {
  /**
   * Siqish. Prod'da `true` (fayl kichik). Testda `false` — matn kontent
   * oqimida OCHIQ qoladi va uni tekshirib bo'ladi. Boshqa hech narsa
   * o'zgarmaydi: joylashuv kodi bir xil.
   */
  readonly compress?: boolean;
}

/**
 * Matnni PDF standart shriftlari (WinAnsi) uchun xavfsiz qiladi.
 *
 * ⚠️  NEGA KERAK: o'zbek lotin alifbosidagi `oʻ`/`gʻ` da U+02BB (MODIFIER
 *     LETTER TURNED COMMA) va U+02BC ishlatiladi — ular WinAnsi'da YO'Q
 *     va Helvetica bilan buzuq chiqadi. Loyihaning o'zi hamma joyda
 *     ASCII apostrof (U+0027) ishlatadi, lekin foydalanuvchi kiritgan
 *     ism boshqacha bo'lishi mumkin.
 *
 *     Yechim — ASCII ekvivalentga keltirish. Muqobil (TTF shriftini
 *     repoga qo'shish) hujjat ko'rinishini yaxshilardi, lekin ~700 KB
 *     fayl va litsenziya masalasini keltiradi; alohida qaror sifatida
 *     ochiq qoldirildi (docs/AUDIT.md tuzatish rejasi).
 */
export function toPdfSafeText(value: string): string {
  return value
    .replace(/[ʻʼ‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-');
}

/** Natija ustuni matni. UNPLAYED — bo'sh (hakam qo'lda to'ldiradi). */
function resultLabel(result: ExportPairing['result']): string {
  switch (result) {
    case 'WHITE_WIN':
      return '1 - 0';
    case 'BLACK_WIN':
      return '0 - 1';
    case 'DRAW':
      return '0.5 - 0.5';
    case 'WHITE_WIN_FORFEIT':
      return '+ / -';
    case 'BLACK_WIN_FORFEIT':
      return '- / +';
    case 'DOUBLE_FORFEIT':
      return '- / -';
    case 'BYE_FULL':
      return 'BYE (1)';
    case 'BYE_HALF':
      return 'BYE (0.5)';
    case 'BYE_ZERO':
      return 'BYE (0)';
    case 'UNPLAYED':
      return '';
  }
}

/** "Unvon Familiya, Ism (reyting)" — bo'sh maydonlar tashlab ketiladi. */
function playerLabel(player: ExportPlayer | undefined): string {
  if (player === undefined) {
    return '?';
  }
  const title = player.title === null ? '' : `${player.title} `;
  const rating = player.rating === null ? '' : ` (${String(player.rating)})`;
  return toPdfSafeText(`${title}${player.lastName}, ${player.firstName}${rating}`);
}

function createDocument(options: PdfOptions): PDFKit.PDFDocument {
  return new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    compress: options.compress ?? true,
    // Bosib chiqarishda hujjat nomi ko'rinadi; sana ATAYLAB qo'yilmaydi
    // (pdfkit o'zi qo'yadi) — bu yerda sirlar yo'q.
    info: { Creator: 'Farzin', Producer: 'Farzin' },
  });
}

/** Hujjatni Buffer'ga yig'ish — fayl tizimiga YOZILMAYDI (core sof). */
async function render(doc: PDFKit.PDFDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });
  doc.end();
  return await done;
}

/** Sarlavha bloki — ikkala hujjatda bir xil. */
function drawHeader(doc: PDFKit.PDFDocument, data: SectionExportData, subtitle: string): void {
  doc
    .font(FONT.bold)
    .fontSize(16)
    .text(toPdfSafeText(`${data.tournamentName} - ${data.sectionName}`), { align: 'center' });

  doc.moveDown(0.3);
  doc.font(FONT.bold).fontSize(12).text(toPdfSafeText(subtitle), { align: 'center' });

  const meta = [
    data.city === null ? null : toPdfSafeText(data.city),
    data.startDate === null
      ? null
      : `${data.startDate}${data.endDate === null ? '' : ` - ${data.endDate}`}`,
    data.chiefArbiter === null ? null : `Bosh hakam: ${toPdfSafeText(data.chiefArbiter)}`,
  ].filter((part): part is string => part !== null);

  if (meta.length > 0) {
    doc.moveDown(0.2);
    doc.font(FONT.regular).fontSize(9).text(meta.join('  |  '), { align: 'center' });
  }
  doc.moveDown(0.8);
}

/**
 * Bitta jadval qatori. `widths` ustun kengliklari (nuqtada), `bold`
 * sarlavha qatori uchun.
 */
function drawRow(
  doc: PDFKit.PDFDocument,
  cells: readonly string[],
  widths: readonly number[],
  bold: boolean,
): void {
  const top = doc.y;
  let x = PAGE_MARGIN;

  doc.font(bold ? FONT.bold : FONT.regular).fontSize(9);
  for (const [index, cell] of cells.entries()) {
    const width = widths[index] ?? 60;
    doc.text(cell, x, top, { width, ellipsis: true, lineBreak: false });
    x += width;
  }

  // Qator balandligi qat'iy: `lineBreak: false` bilan hamma katak bir
  // qatorda qoladi, ya'ni keyingi qator joyi oldindan ma'lum.
  doc.y = top + 14;
}

/**
 * Sahifa oxiriga yetganda yangi sahifa ochadi va sarlavhani takrorlaydi.
 * Bosib chiqarilgan varaqda ustun nomlari HAR sahifada bo'lishi kerak —
 * aks holda 2-varaqdagi raqamlar nimani anglatishini bilib bo'lmaydi.
 */
function ensureSpace(
  doc: PDFKit.PDFDocument,
  header: readonly string[],
  widths: readonly number[],
): void {
  const bottom = doc.page.height - PAGE_MARGIN - 20;
  if (doc.y > bottom) {
    doc.addPage();
    drawRow(doc, header, widths, true);
  }
}

/**
 * JUFTLIK VARAQASI — bir tur uchun.
 *
 * Hakam zalda shu varaqni osib qo'yadi yoki taxtalarga tarqatadi.
 * Natija ustuni ATAYLAB bo'sh qoldiriladi (UNPLAYED) — hakam qo'lda
 * to'ldiradi va keyin tizimga kiritadi. Bu offline oqimning mohiyati.
 *
 * @throws Error tur topilmasa — jimgina bo'sh hujjat qaytarish hakamni
 *         chalg'itardi.
 */
export async function writePairingSheetPdf(
  data: SectionExportData,
  roundNumber: number,
  options: PdfOptions = {},
): Promise<Buffer> {
  const round = data.rounds.find((r) => r.number === roundNumber);
  if (round === undefined) {
    throw new Error(`Tur topilmadi: ${String(roundNumber)}`);
  }

  const byId = new Map(data.players.map((p) => [p.registrationId, p]));
  const doc = createDocument(options);

  const dateSuffix = round.date === null ? '' : ` (${round.date})`;
  drawHeader(doc, data, `${String(round.number)}-tur juftliklari${dateSuffix}`);

  const header = ['Taxta', 'Oq', 'Qora', 'Natija'] as const;
  const widths = [40, 200, 200, 71] as const;
  drawRow(doc, header, widths, true);

  const sorted = [...round.pairings].sort((a, b) => a.boardNumber - b.boardNumber);
  for (const pairing of sorted) {
    ensureSpace(doc, header, widths);
    drawRow(
      doc,
      [
        String(pairing.boardNumber),
        playerLabel(byId.get(pairing.whiteRegistrationId)),
        pairing.blackRegistrationId === null
          ? '-'
          : playerLabel(byId.get(pairing.blackRegistrationId)),
        resultLabel(pairing.result),
      ],
      widths,
      false,
    );
  }

  return await render(doc);
}

/**
 * JADVAL (standings) — joriy holat.
 *
 * Tartib: o'rin bo'yicha (`rank`), o'rin hali hisoblanmagan bo'lsa —
 * ochko kamayishi, so'ng boshlang'ich raqam bo'yicha. Bu tartib
 * BARQAROR: bir xil ma'lumot har doim bir xil hujjat beradi.
 */
export async function writeStandingsPdf(
  data: SectionExportData,
  options: PdfOptions = {},
): Promise<Buffer> {
  const doc = createDocument(options);
  drawHeader(doc, data, 'Yakuniy jadval');

  const header = ['O.', '#', "O'yinchi", 'Fed', 'Reyting', 'Ochko'] as const;
  const widths = [30, 30, 240, 40, 60, 111] as const;
  drawRow(doc, header, widths, true);

  const sorted = [...data.players].sort((a, b) => {
    if (a.rank !== null && b.rank !== null && a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    if (a.points !== b.points) {
      return b.points - a.points;
    }
    return a.startRank - b.startRank;
  });

  for (const player of sorted) {
    ensureSpace(doc, header, widths);
    drawRow(
      doc,
      [
        player.rank === null ? '-' : String(player.rank),
        String(player.startRank),
        playerLabel(player),
        player.federation === null ? '' : toPdfSafeText(player.federation),
        player.rating === null ? '' : String(player.rating),
        // Ochko yarim bilan: 3 emas, 3.0 — bosma varaqda aniqroq.
        player.points.toFixed(1),
      ],
      widths,
      false,
    );
  }

  return await render(doc);
}
