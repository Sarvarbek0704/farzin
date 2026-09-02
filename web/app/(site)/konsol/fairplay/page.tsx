'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { readJson, useAuth } from '@/lib/auth';
import { EmptyState, PageHeader } from '@/components/ui';
import { CASE_STATUS_LABEL, caseStatusClass } from '@/lib/fairplay';

/**
 * Fair-play komissiya paneli — ishlar ro'yxati.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU YO'L HECH QACHON JAZOLAMAYDI (docs/08 §4.1, CANON §7.5)
 *
 *  Tahlil FAQAT o'lchaydi va ish OCHADI. Sanksiya faqat ODAM qarori
 *  bilan, yozma asos majburiy (kamida 20 belgi) va doimiy ban YO'Q —
 *  muddat majburiy (docs/08 §4.3).
 *
 *  Panel shu qoidalarni KO'RSATADI: qaror tugmasi asossiz bosilmaydi,
 *  sanksiya sanasiz yuborilmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface CaseRow {
  id: string;
  playerId: string;
  status: string;
  aggregateScore: number | null;
  decisionRationale: string | null;
  sanctionUntil: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export default function FairplayCasesPage() {
  const { authFetch } = useAuth();
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await authFetch('/api/v1/fairplay/cases?first=50');
      const page = await readJson<{ items: CaseRow[] }>(res);
      setCases(page.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xato');
    }
  }, [authFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        kicker="Komissiya"
        title="Fair-play ishlari"
        subtitle="Tahlil ish ochadi, lekin hech qachon jazolamaydi. Har qaror odam tomonidan, yozma asos bilan chiqariladi va audit logga tushadi."
      />

      {error !== null && (
        <p role="alert" style={{ color: 'var(--burgundy)' }}>
          {error}
        </p>
      )}

      {cases === null ? (
        <div className="skeleton" style={{ height: 180 }} />
      ) : cases.length === 0 ? (
        <EmptyState
          title="Ochiq ish yo`q"
          hint="Ish faqat tahlil chegaradan oshganda yoki shikoyat kelganda ochiladi. Bo`sh ro`yxat — yaxshi holat."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ish</th>
                <th>Holat</th>
                <th className="num">Skor</th>
                <th>Ochilgan</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/konsol/fairplay/${c.id}`} style={{ fontWeight: 500 }}>
                      {c.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td>
                    <span className={caseStatusClass(c.status)}>
                      {CASE_STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="num tabular">
                    {/*
                      Skor — EHTIMOLLIK, isbot emas (docs/08). Shuning
                      uchun u "84%" emas, xom qiymat sifatida beriladi.
                    */}
                    {c.aggregateScore === null ? '—' : c.aggregateScore.toFixed(2)}
                  </td>
                  <td className="tabular muted small">{c.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
