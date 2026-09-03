'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * JUFTLIK MA'LUMOTLARI — hakamning "nega bu juftlik?" savoliga javob.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  HALOLLIK: BU DVIGATEL QARORINING IZI EMAS
 *
 *  Dizayn brifi §5.13 buni "arbiter's killer feature" deb ataydi va
 *  "tapping ? explains which FIDE criteria produced the pairing"
 *  deydi. Lekin `Pairing` modelida (prisma/schema.prisma:725) sabab
 *  SAQLANMAYDI — dvigatel qaror izini yozib qo'ymaydi.
 *
 *  Shuning uchun bu panel qaror sababini DA'VO QILMAYDI. U hakam
 *  tekshirishi uchun kerak bo'lgan FAKTLARNI ko'rsatadi: ikkalasining
 *  ochkosi, rang tarixi va float tarixi. Amalda o'yinchining
 *  "nega yana qora?" degan savoliga javob aynan shu.
 *
 *  To'liq sabab izi uchun backend `Pairing` ga rationale maydonini
 *  qo'shishi kerak — bu docs/AUDIT.md ga topilma sifatida yozilgan.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface PlayerFacts {
  name: string;
  points: string;
  /** 'WHITE' | 'BLACK' ketma-ketligi — oxirgisi eng yangi. */
  colorHistory: string[];
  /** 'UP' | 'DOWN' | 'NONE' — ochko guruhidan siljish. */
  floatHistory: string[];
}

export function PairingWhy({ white, black }: { white: PlayerFacts; black: PlayerFacts }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  /**
   * Panel PORTAL orqali `body` ga chiziladi.
   *
   * Sabab jonli tekshiruvda ko'rindi: jadval konteyneri
   * `overflow-x: auto` bilan (keng jadval o'zini suradi) va u QIRQISH
   * konteksti yaratadi — absolyut joylashgan panel pastdan kesilardi.
   * Bundan tashqari panel `.tabular` katak ichida edi va mono
   * shriftni MEROS olardi.
   *
   * Portal ikkala muammoni ham yechadi: qirqish yo'q, meros yo'q.
   */
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect === undefined) {
      return;
    }
    const width = Math.min(380, window.innerWidth - 32);
    // O'ng chekkadan chiqib ketmasin.
    const left = Math.min(rect.left, window.innerWidth - width - 16);
    setPos({ top: rect.bottom + 8, left: Math.max(16, left) });
  }, [open]);

  // Tashqariga bosilsa va Escape'da yopiladi — modal emas, popover.
  useEffect(() => {
    if (!open) {
      return;
    }
    function onDown(e: MouseEvent): void {
      const target = e.target as Node;
      // Panel PORTAL'da, ya'ni u `boxRef` ichida EMAS — ikkalasini
      // ham tekshirmasak, panel ichiga bosish uni yopib yuborardi.
      const inside =
        boxRef.current?.contains(target) === true || popRef.current?.contains(target) === true;
      if (!inside) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sameGroup = white.points === black.points;

  return (
    <span className="why-wrap" ref={boxRef}>
      <button
        ref={buttonRef}
        type="button"
        className="why-button"
        aria-expanded={open}
        aria-label="Juftlik ma'lumotlari"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        ?
      </button>

      {open &&
        pos !== null &&
        createPortal(
          <div
            className="why-pop"
            role="dialog"
            aria-label="Juftlik ma'lumotlari"
            ref={popRef}
            style={{ top: pos.top, left: pos.left }}
          >
          <p className="why-lead">
            {sameGroup ? (
              <>
                Ikkalasi ham <strong>{white.points}</strong> ochkoda — bir xil ochko guruhi.
              </>
            ) : (
              <>
                Ochkolar farq qiladi: <strong>{white.points}</strong> va{' '}
                <strong>{black.points}</strong> — demak float bo'lgan.
              </>
            )}
          </p>

          <table className="why-table">
            <thead>
              <tr>
                <th />
                <th>Oq</th>
                <th>Qora</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">O`yinchi</th>
                <td>{white.name}</td>
                <td>{black.name}</td>
              </tr>
              <tr>
                <th scope="row">Ochko</th>
                <td className="tabular">{white.points}</td>
                <td className="tabular">{black.points}</td>
              </tr>
              <tr>
                <th scope="row">Rang tarixi</th>
                <td>
                  <ColorRun history={white.colorHistory} />
                </td>
                <td>
                  <ColorRun history={black.colorHistory} />
                </td>
              </tr>
              <tr>
                <th scope="row">Float</th>
                <td>{floatSummary(white.floatHistory)}</td>
                <td>{floatSummary(black.floatHistory)}</td>
              </tr>
            </tbody>
          </table>

            <p className="why-note">
              Bu — juftlashtirish paytidagi FAKTLAR. Dvigatel qaror izini saqlamaydi,
              shuning uchun panel sababni da`vo qilmaydi: C1–C3 kriteriylarini shu
              ma`lumot bo`yicha o`zingiz tekshirasiz.
            </p>
          </div>,
          document.body,
        )}
    </span>
  );
}

/** Rang ketma-ketligi — O/Q harflari bilan, oxirgisi ajratilgan. */
function ColorRun({ history }: { history: string[] }) {
  if (history.length === 0) {
    return <span className="muted">—</span>;
  }
  return (
    <span className="color-run">
      {history.map((c, i) => (
        <span
          key={`${c}-${String(i)}`}
          className={c === 'WHITE' ? 'cr cr-w' : 'cr cr-b'}
          title={c === 'WHITE' ? 'Oq' : 'Qora'}
        >
          {c === 'WHITE' ? 'O' : 'Q'}
        </span>
      ))}
    </span>
  );
}

/** Float xulosasi — "2 marta yuqoriga" ko'rinishida. */
function floatSummary(history: string[]): string {
  const up = history.filter((f) => f === 'UP').length;
  const down = history.filter((f) => f === 'DOWN').length;
  if (up === 0 && down === 0) {
    return 'yo`q';
  }
  const parts: string[] = [];
  if (up > 0) {
    parts.push(`${String(up)}× yuqoriga`);
  }
  if (down > 0) {
    parts.push(`${String(down)}× pastga`);
  }
  return parts.join(' · ');
}
