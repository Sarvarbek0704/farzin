'use client';

import { Chessboard } from 'react-chessboard';

/**
 * Shaxmat taxtasi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  LITSENZIYA — NEGA chessground EMAS
 *
 *  docs/12-frontend-spec.md `chessground` ni ko'rsatadi, lekin
 *  docs/README.md uni **BLOKLOVCHI ochiq savol** deb belgilaydi:
 *  "chessground GPL-3.0 litsenziyasi tijorat mahsulotga mos keladimi —
 *  Yurist". GPL-3.0 copyleft: kutubxonani bog'lagan mahsulot ham
 *  GPL-3.0 ostida tarqatilishi talab qilinishi mumkin. Farzin esa
 *  B2B/B2G modelida sotiladi (docs/00 [CANON 2]).
 *
 *  Bu yerda `react-chessboard` (MIT) ishlatiladi — savol shu bilan
 *  YOPILADI, yurist javobini kutish shart emas. Frontend bog'liqlik
 *  daraxtida GPL oilasidan (GPL/AGPL/SSPL/CC-BY-NC) hech narsa yo'qligi
 *  tekshirilgan: 289 paket, hammasi MIT/ISC/Apache-2.0/BSD/MPL-2.0.
 *
 *  ⚠️  Yangi bog'liqlik qo'shilganda litsenziya QAYTA tekshirilsin —
 *      copyleft tranzitiv bog'liqlik orqali ham kirib keladi.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Dizayn tizimidagi "Ivory & Emerald" (standart turnir vinili) taxta
 *  temasi qo'llanadi — globals.css dagi `--board-light` / `--board-dark`
 *  bilan bir xil qiymatlar.
 */

/** Dizayn tizimi §02: "Ivory & Emerald", standart. */
const LIGHT_SQUARE = '#ECE3C9';
const DARK_SQUARE = '#4F7454';

export function ChessBoard({
  fen,
  orientation = 'white',
  onMove,
}: {
  fen: string;
  /** Qora o'yinchi taxtani o'z tomonidan ko'radi. */
  orientation?: 'white' | 'black';
  /**
   * Yurish so'rovi. Berilmasa taxta FAQAT KO'RISH uchun.
   *
   * ⚠️  HAR DOIM `false` qaytaradi: taxta optimistik yangilanmaydi.
   *     Yurish qonuniyligini SERVER hal qiladi va natija
   *     `game:move_made` bilan keladi. Noto'g'ri yurish bir lahza
   *     to'g'ri ko'rinib, keyin orqaga sakrashi — eng chalg'ituvchi xulq.
   */
  onMove?: (from: string, to: string) => boolean;
}) {
  return (
    // `.board-frame` — joyni OLDINDAN band qiladi (aspect-ratio 1/1).
    // Dizayn tizimi §4.3: "board sizing is a CLS rule, not a nicety".
    // Taxta klient komponenti bo'lgani uchun server HTML'ida yo'q;
    // ramkasiz sahifa gidratatsiya lahzasida sakrardi. Mobilda shu
    // ramka chekkadan chekkaga cho'ziladi (full-bleed).
    <div className="board-frame">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: onMove !== undefined,
          ...(onMove === undefined
            ? {}
            : {
                onPieceDrop: ({
                  sourceSquare,
                  targetSquare,
                }: {
                  sourceSquare: string;
                  targetSquare: string | null;
                }) => (targetSquare === null ? false : onMove(sourceSquare, targetSquare)),
              }),
          darkSquareStyle: { backgroundColor: DARK_SQUARE },
          lightSquareStyle: { backgroundColor: LIGHT_SQUARE },
          // Burchak radiusi ramkada — mobilda u 0 ga tushadi va
          // taxta chekkaga tekis yopishadi.
          boardStyle: { width: '100%', height: '100%' },
        }}
      />
    </div>
  );
}
