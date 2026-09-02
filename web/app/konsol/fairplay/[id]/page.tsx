'use client';

import { use, useCallback, useEffect, useState } from 'react';

import { readJson, useAuth } from '@/lib/auth';
import { BackLink, Card } from '@/components/ui';
import { CASE_STATUS_LABEL, MIN_RATIONALE, SIGNAL_LABEL } from '@/lib/fairplay';

/**
 * Bitta fair-play ishi — dalillar va QAROR.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⚠️  BU EKRAN ODAMNING KARYERASIGA TEGADI (docs/08).
 *
 *  Shuning uchun UI ataylab "qulay" emas:
 *   - qaror tugmasi asos yozilmaguncha O'CHIQ (backend ham 422 beradi,
 *     lekin foydalanuvchi buni yuborishdan OLDIN bilishi kerak);
 *   - sanksiya tanlansa muddat MAJBURIY — doimiy ban yo'q (§4.3);
 *   - skor "ehtimollik, isbot emas" degan eslatma doim ko'rinib turadi.
 *
 *  Bu ishqalanish — xato emas, dizayn.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface CaseDetail {
  case: {
    id: string;
    playerId: string;
    status: string;
    aggregateScore: number | null;
    decisionRationale: string | null;
    sanctionUntil: string | null;
    createdAt: string;
    reviewedAt: string | null;
  };
  signals: { id: string; type: string; strength: number; createdAt: string }[];
  reports: { id: string; gameId: string; suspicionScore: number | null }[];
  appeals: { id: string; status: string; reason: string; createdAt: string }[];
}

const DECISIONS = [
  { value: 'CLOSED_NO_ACTION', label: 'Chora yo`q — ish yopiladi' },
  { value: 'CLOSED_WARNING', label: 'Ogohlantirish' },
  { value: 'CLOSED_SANCTION', label: 'Sanksiya (muddat majburiy)' },
] as const;

export default function FairplayCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { authFetch } = useAuth();

  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<string>('CLOSED_NO_ACTION');
  const [rationale, setRationale] = useState('');
  const [sanctionUntil, setSanctionUntil] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setDetail(await readJson<CaseDetail>(await authFetch(`/api/v1/fairplay/cases/${id}`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xato');
    }
  }, [authFetch, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const needsSanctionDate = decision === 'CLOSED_SANCTION';
  const canSubmit =
    rationale.trim().length >= MIN_RATIONALE && (!needsSanctionDate || sanctionUntil !== '');

  async function decide(): Promise<void> {
    setBusy(true);
    try {
      const res = await authFetch(`/api/v1/fairplay/cases/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          rationale: rationale.trim(),
          // Sana FAQAT sanksiya bilan yuboriladi — aks holda backend
          // 422 beradi (SANCTION_WITHOUT_SANCTION_DECISION).
          ...(needsSanctionDate
            ? { sanctionUntil: new Date(sanctionUntil).toISOString() }
            : {}),
        }),
      });
      await readJson(res);
      setRationale('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xato');
    } finally {
      setBusy(false);
    }
  }

  if (error !== null && detail === null) {
    return (
      <>
        <BackLink href="/konsol/fairplay">Fair-play ishlari</BackLink>
        <p role="alert" style={{ color: 'var(--burgundy)' }}>
          {error}
        </p>
      </>
    );
  }

  if (detail === null) {
    return <p className="muted">Yuklanmoqda…</p>;
  }

  const decided = detail.case.status.startsWith('CLOSED');

  return (
    <>
      <BackLink href="/konsol/fairplay">Fair-play ishlari</BackLink>

      <h1 style={{ fontSize: 26, marginBottom: 10 }}>Ish {detail.case.id.slice(0, 8)}…</h1>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <span className="badge">{CASE_STATUS_LABEL[detail.case.status] ?? detail.case.status}</span>
        <span className="badge tabular">
          Skor: {detail.case.aggregateScore?.toFixed(2) ?? '—'}
        </span>
        <span className="badge tabular">{detail.case.createdAt.slice(0, 10)}</span>
      </div>

      <p
        className="small"
        style={{
          maxWidth: '68ch',
          padding: '10px 12px',
          border: '1px solid var(--hairline)',
          borderRadius: 8,
          color: 'var(--ink-secondary)',
        }}
      >
        Skor — <strong>ehtimollik, isbot emas</strong>. Kuchli o`yinchi dvigatel bilan
        tabiiy ravishda yuqori mos keladi. Qaror faqat inson bahosi bilan chiqariladi
        va u qaytarib bo`lmaydigan oqibatlarga ega bo`lishi mumkin.
      </p>

      <h2 style={{ marginTop: 24, marginBottom: 10 }}>Signallar</h2>
      {detail.signals.length === 0 ? (
        <p className="muted small">Signal yo`q.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tur</th>
                <th className="num">Kuch</th>
                <th>Sana</th>
              </tr>
            </thead>
            <tbody>
              {detail.signals.map((s) => (
                <tr key={s.id}>
                  <td>{SIGNAL_LABEL[s.type] ?? s.type}</td>
                  <td className="num tabular">{s.strength.toFixed(2)}</td>
                  <td className="tabular muted small">{s.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail.appeals.length > 0 && (
        <>
          <h2 style={{ marginTop: 24, marginBottom: 10 }}>Apellyatsiyalar</h2>
          {detail.appeals.map((a) => (
            <Card key={a.id}>
              <div className="small muted">
                {a.status} · {a.createdAt.slice(0, 10)}
              </div>
              <p style={{ margin: '6px 0 0' }}>{a.reason}</p>
            </Card>
          ))}
        </>
      )}

      <h2 style={{ marginTop: 24, marginBottom: 10 }}>Qaror</h2>

      {decided ? (
        <Card>
          <div className="small muted">
            Qaror chiqarilgan{detail.case.reviewedAt !== null && ` · ${detail.case.reviewedAt.slice(0, 10)}`}
          </div>
          <p style={{ margin: '8px 0 0' }}>{detail.case.decisionRationale ?? '—'}</p>
          {detail.case.sanctionUntil !== null && (
            <p className="small" style={{ marginBottom: 0, color: 'var(--burgundy)' }}>
              Sanksiya muddati: {detail.case.sanctionUntil.slice(0, 10)}
            </p>
          )}
          <p className="muted small" style={{ marginBottom: 0, marginTop: 10 }}>
            Qaror BIR MARTA chiqariladi — o`zgartirish uchun apellyatsiya oqimi bor.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="stack" style={{ gap: 12 }}>
            <label className="stack" style={{ gap: 6 }}>
              <span className="small">Qaror</span>
              <select
                value={decision}
                onChange={(e) => {
                  setDecision(e.target.value);
                }}
                className="field"
              >
                {DECISIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            {needsSanctionDate && (
              <label className="stack" style={{ gap: 6 }}>
                <span className="small">
                  Sanksiya tugash sanasi — <strong>doimiy ban YO`Q</strong>
                </span>
                <input
                  type="date"
                  value={sanctionUntil}
                  onChange={(e) => {
                    setSanctionUntil(e.target.value);
                  }}
                  className="field"
                />
              </label>
            )}

            <label className="stack" style={{ gap: 6 }}>
              <span className="small">
                Yozma asos (kamida {MIN_RATIONALE} belgi) — audit logga tushadi
              </span>
              <textarea
                rows={4}
                value={rationale}
                onChange={(e) => {
                  setRationale(e.target.value);
                }}
                className="field"
                style={{ resize: 'vertical' }}
              />
              <span className="small muted tabular">
                {rationale.trim().length} / {MIN_RATIONALE}
              </span>
            </label>

            {error !== null && (
              <p role="alert" className="small" style={{ color: 'var(--burgundy)', margin: 0 }}>
                {error}
              </p>
            )}

            <button
              type="button"
              disabled={!canSubmit || busy}
              onClick={() => void decide()}
              // Faol bo'lganda asosiy tugma, aks holda oddiy: qaror
              // chiqarish tugmasi tasodifan "bosiladigan" ko'rinmasin.
              className={canSubmit ? 'btn btn-primary' : 'btn'}
            >
              {busy ? 'Yuborilmoqda…' : 'Qarorni chiqarish'}
            </button>
          </div>
        </Card>
      )}
    </>
  );
}
