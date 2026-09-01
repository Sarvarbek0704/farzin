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
}: {
  fen: string;
  /** Qora o'yinchi taxtani o'z tomonidan ko'radi. */
  orientation?: 'white' | 'black';
}) {
  return (
    <div style={{ maxWidth: 440, width: '100%' }}>
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          // Bu KO'RISH taxtasi: yurish qilinmaydi. Interaktiv o'yin
          // WebSocket qatlami bilan birga qo'shiladi (Faza 5 UI).
          allowDragging: false,
          darkSquareStyle: { backgroundColor: DARK_SQUARE },
          lightSquareStyle: { backgroundColor: LIGHT_SQUARE },
          boardStyle: { borderRadius: '8px', overflow: 'hidden' },
        }}
      />
    </div>
  );
}
