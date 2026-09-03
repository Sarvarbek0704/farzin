/**
 * STATIK TAXTA — donalar bilan, serverda chiziladi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA `react-chessboard` EMAS
 *
 *  Bosh sahifadagi taxta — brend belgisi, o'yin emas. Interaktiv
 *  kutubxonani yuklash uchun bu yerda hech qanday sabab yo'q: u
 *  klient bundle'ini kattalashtiradi va sahifa gidratatsiyagacha
 *  BO'SH turadi (brif §4.3 buni aynan CLS xavfi deb ataydi).
 *
 *  Bu komponent sof SVG va SERVER komponenti: HTML kelishi bilanoq
 *  taxta joyida turadi. Dizayn brifi §6.1 "one beautiful board".
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Ranglar `--sq-light` / `--sq-dark` tokenlaridan — taxta temasi
 *  brend rangidan ALOHIDA (brif §4.1) va almashtiriladigan bo'lishi
 *  kerak.
 */

/** Unicode dona belgilari — Playfair/Inter'da mavjud, alohida shrift kerak emas. */
const GLYPH: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
  P: '♙',
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

/** FEN'ning faqat pozitsiya qismini 8×8 massivga ochish. */
function expand(fen: string): (string | null)[][] {
  const board: (string | null)[][] = [];
  for (const row of fen.split(' ')[0]?.split('/') ?? []) {
    const cells: (string | null)[] = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        cells.push(...Array<null>(Number(ch)).fill(null));
      } else {
        cells.push(ch);
      }
    }
    board.push(cells);
  }
  return board;
}

/**
 * Ruy Lopez ochilishi — tinch, tanilgan va vizual muvozanatli
 * pozitsiya. Bo'sh boshlang'ich taxtadan ko'ra "o'yin ketyapti"
 * hissini beradi.
 */
export const SHOWCASE_FEN = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';

export function StaticBoard({
  fen = SHOWCASE_FEN,
  className = '',
}: {
  fen?: string;
  className?: string;
}) {
  const rows = expand(fen);

  return (
    <div className={`board-frame static-board ${className}`.trim()} aria-hidden="true">
      {rows.map((cells, r) =>
        cells.map((piece, c) => (
          <div
            key={`${String(r)}-${String(c)}`}
            className={(r + c) % 2 === 0 ? 'sq sq-light' : 'sq sq-dark'}
          >
            {piece !== null && (
              <span className={piece === piece.toUpperCase() ? 'piece piece-w' : 'piece piece-b'}>
                {GLYPH[piece]}
              </span>
            )}
          </div>
        )),
      )}
    </div>
  );
}
