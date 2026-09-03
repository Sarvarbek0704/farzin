'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { PairingWhy, type PlayerFacts } from './pairing-why';

/**
 * NATIJA KIRITISH — hakamning asosiy vositasi (dizayn brifi §6.12).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  KLAVIATURA BIRINCHI O'RINDA
 *
 *  Brif buni aynan shunday ta'riflaydi: "keyboard-driven: board № →
 *  1/0/= → Enter → next". Sabab amaliy: hakam turnir zalida 50 ta
 *  taxta natijasini ketma-ket kiritadi. Har qatorda sichqonchani
 *  ochiladigan ro'yxatga olib borish — bir necha daqiqa yo'qotish va
 *  xato manbai.
 *
 *  Bosish sxemasi:
 *    1  → oq yutdi        0 → qora yutdi        = yoki 5 → durang
 *    ↑ ↓ → qator almashtirish
 *    Har kiritishdan keyin fokus KEYINGI natijasiz qatorga o'tadi.
 *
 *  Sichqoncha uchun ham har qatorda uchta tugma bor — klaviatura
 *  YAGONA yo'l emas (WCAG: bir usul boshqasini almashtirmaydi).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  OPTIMISTIK EMAS: natija serverga yozilgandan KEYIN ko'rsatiladi.
 *  Turnir natijasi — reytingga kiradigan ma'lumot; "yozildi" deb
 *  ko'rsatib, keyin yiqilgani ma'lum bo'lishi hakamni aldash bo'lardi.
 *  Buning o'rniga qator yozilayotganda "band" holatida turadi.
 */

export interface PairingRow {
  id: string;
  boardNumber: number;
  whiteName: string;
  blackName: string | null;
  result: string;
  /**
   * Juftlashtirish faktlari — "nega bu juftlik?" paneli uchun
   * (brif §5.13). Jadval ma'lumoti yo'q bo'lsa (birinchi tur)
   * berilmaydi va panel ko'rsatilmaydi.
   */
  whiteFacts?: PlayerFacts;
  blackFacts?: PlayerFacts;
}

/** Uchta asosiy natija — qolganlari (forfeit) kamdan-kam, ular menyuda. */
const QUICK = [
  { value: 'WHITE_WIN', label: '1', title: 'Oq yutdi (1)' },
  { value: 'DRAW', label: '½', title: 'Durang (= yoki 5)' },
  { value: 'BLACK_WIN', label: '0', title: 'Qora yutdi (0)' },
] as const;

/**
 * Natija KIRITILMAGAN qiymatlar. Backend `PairingResult` enum'i
 * (prisma/schema.prisma:117) o'ynalmagan juftlikni `UNPLAYED` deb
 * belgilaydi — bo'sh satr emas. Buni bilmasdan progress hisobi
 * "2 / 2" ko'rsatardi, holbuki hech narsa kiritilmagan edi.
 */
const EMPTY_RESULTS = new Set(['', 'PENDING', 'UNPLAYED']);

const RARE = [
  { value: 'WHITE_WIN_FORFEIT', label: '+/−' },
  { value: 'BLACK_WIN_FORFEIT', label: '−/+' },
  { value: 'DOUBLE_FORFEIT', label: '−/−' },
] as const;

export function ResultEntry({
  pairings,
  onSet,
  disabled = false,
}: {
  pairings: readonly PairingRow[];
  onSet: (pairingId: string, result: string) => Promise<void>;
  disabled?: boolean;
}) {
  // Faqat natija kiritiladigan qatorlar (bye — natijasi avtomatik).
  const editable = pairings.filter((p) => p.blackName !== null);
  const [active, setActive] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  /**
   * SINXRON qulf. `busyId` — state, ya'ni u keyingi renderда yangilanadi;
   * hakam tez tergan ikkinchi klavish esa ESKI qiymatni ko'radi va
   * so'rov IKKI MARTA ketardi (komponent testi ushlagan). Ref darhol
   * o'zgaradi, shuning uchun qulf shu yerda.
   */
  const inFlight = useRef(false);
  const rowsRef = useRef<(HTMLTableRowElement | null)[]>([]);

  const done = editable.filter((p) => !EMPTY_RESULTS.has(p.result)).length;


  /** Keyingi NATIJASIZ qator — hakam bo'shliqlarni qidirmasin. */
  const nextEmpty = useCallback(
    (from: number): number => {
      for (let i = from + 1; i < editable.length; i += 1) {
        const row = editable[i];
        if (row !== undefined && EMPTY_RESULTS.has(row.result)) {
          return i;
        }
      }
      return Math.min(from + 1, editable.length - 1);
    },
    [editable],
  );

  const apply = useCallback(
    async (index: number, result: string): Promise<void> => {
      const row = editable[index];
      if (row === undefined || disabled || inFlight.current) {
        return;
      }
      inFlight.current = true;
      setBusyId(row.id);
      try {
        await onSet(row.id, result);
        setActive(nextEmpty(index));
      } finally {
        inFlight.current = false;
        setBusyId(null);
      }
    },
    [editable, onSet, nextEmpty, disabled],
  );

  // Fokusni faol qatorga ko'chirish — skrinrider ham kuzatib boradi.
  useEffect(() => {
    rowsRef.current[active]?.focus();
  }, [active]);

  function onKeyDown(event: React.KeyboardEvent<HTMLTableSectionElement>): void {
    if (disabled) {
      return;
    }
    const key = event.key;
    if (key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, editable.length - 1));
      return;
    }
    if (key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }
    const result =
      key === '1' ? 'WHITE_WIN' : key === '0' ? 'BLACK_WIN' : key === '=' || key === '5' ? 'DRAW' : null;
    if (result !== null) {
      event.preventDefault();
      void apply(active, result);
    }
  }

  return (
    <>
      <div className="spread" style={{ marginBottom: 10 }}>
        <p className="muted small" style={{ margin: 0 }}>
          Klaviatura: <kbd>1</kbd> oq · <kbd>0</kbd> qora · <kbd>=</kbd> durang ·{' '}
          <kbd>↑</kbd> <kbd>↓</kbd> qator
        </p>
        <span className="badge tabular">
          {done} / {editable.length}
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="num" style={{ width: 72 }}>
                Taxta
              </th>
              <th>Oq</th>
              <th>Qora</th>
              <th style={{ width: 220 }}>Natija</th>
            </tr>
          </thead>
          {/*
            Klaviatura hodisasi TANADA: har qatorga alohida handler
            qo'yish o'rniga bitta joyda — qator qo'shilganda unutilmaydi.
          */}
          <tbody onKeyDown={onKeyDown}>
            {pairings.map((p) => {
              const index = editable.indexOf(p);
              const isEditable = index >= 0;
              const isActive = isEditable && index === active;
              const isBusy = busyId === p.id;
              return (
                <tr
                  key={p.id}
                  ref={(el) => {
                    if (isEditable) {
                      rowsRef.current[index] = el;
                    }
                  }}
                  tabIndex={isEditable ? (isActive ? 0 : -1) : undefined}
                  aria-current={isActive ? 'true' : undefined}
                  className={isActive ? 'row-active' : undefined}
                  onFocus={() => {
                    if (isEditable) {
                      setActive(index);
                    }
                  }}
                >
                  <td className="num tabular">
                    {p.boardNumber}
                    {p.whiteFacts !== undefined && p.blackFacts !== undefined && (
                      <PairingWhy white={p.whiteFacts} black={p.blackFacts} />
                    )}
                  </td>
                  <td>{p.whiteName}</td>
                  <td>{p.blackName ?? <span className="muted">— (bye)</span>}</td>
                  <td>
                    {!isEditable ? (
                      <span className="muted small">{p.result}</span>
                    ) : (
                      <div className="result-pick">
                        {QUICK.map((q) => (
                          <button
                            key={q.value}
                            type="button"
                            title={q.title}
                            disabled={disabled || isBusy}
                            aria-pressed={p.result === q.value}
                            onClick={() => void apply(index, q.value)}
                          >
                            {q.label}
                          </button>
                        ))}
                        {/* Forfeit — kamdan-kam, shuning uchun menyuda. */}
                        <select
                          className="result-rare"
                          value={RARE.some((r) => r.value === p.result) ? p.result : ''}
                          disabled={disabled || isBusy}
                          aria-label="Boshqa natija"
                          onChange={(e) => {
                            if (e.target.value !== '') {
                              void apply(index, e.target.value);
                            }
                          }}
                        >
                          <option value="">⋯</option>
                          {RARE.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
