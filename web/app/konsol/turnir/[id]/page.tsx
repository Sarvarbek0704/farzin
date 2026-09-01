'use client';

import { use, useCallback, useEffect, useState } from 'react';

import type { Registration, Section, Tournament, TournamentStatus } from '@/lib/api';
import { readJson, useAuth } from '@/lib/auth';
import {
  PAIRING_SYSTEM_LABEL,
  TIME_CATEGORY_LABEL,
  formatTimeControl,
  fullName,
  statusView,
} from '@/lib/format';
import { BackLink } from '@/components/ui';

interface Round {
  id: string;
  number: number;
  status: 'PAIRED' | 'IN_PROGRESS' | 'COMPLETED';
  pairings?: Pairing[];
}

interface Pairing {
  id: string;
  boardNumber: number;
  whiteRegistrationId: string;
  blackRegistrationId: string | null;
  result: string;
}

/** Hakam kiritishi mumkin bo'lgan natijalar (bye qatorlari bundan tashqari). */
const RESULTS = [
  { value: 'WHITE_WIN', label: '1 - 0' },
  { value: 'DRAW', label: '½ - ½' },
  { value: 'BLACK_WIN', label: '0 - 1' },
  { value: 'WHITE_WIN_FORFEIT', label: '+ / -' },
  { value: 'BLACK_WIN_FORFEIT', label: '- / +' },
  { value: 'DOUBLE_FORFEIT', label: '- / -' },
] as const;

/** Holat o'tishlari — tournament-status.machine.ts bilan mos. */
const NEXT_STATUS: Partial<Record<TournamentStatus, TournamentStatus[]>> = {
  DRAFT: ['REGISTRATION_OPEN'],
  REGISTRATION_OPEN: ['REGISTRATION_CLOSED'],
  REGISTRATION_CLOSED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
};

export default function ManageTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { authFetch } = useAuth();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const t = await readJson<Tournament>(await authFetch(`/api/v1/tournaments/${id}`));
      const s = await readJson<Section[]>(await authFetch(`/api/v1/tournaments/${id}/sections`));
      setTournament(t);
      setSections(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xato');
    }
  }, [authFetch, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: TournamentStatus): Promise<void> {
    try {
      const res = await authFetch(`/api/v1/tournaments/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await readJson(res);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xato');
    }
  }

  if (error !== null && tournament === null) {
    return (
      <>
        <BackLink href="/konsol">Konsol</BackLink>
        <p role="alert" style={{ color: 'var(--burgundy)' }}>
          {error}
        </p>
      </>
    );
  }

  if (tournament === null) {
    return <p className="muted">Yuklanmoqda…</p>;
  }

  const status = statusView(tournament.status);
  const transitions = NEXT_STATUS[tournament.status] ?? [];

  return (
    <>
      <BackLink href="/konsol">Konsol</BackLink>

      <h1 style={{ fontSize: 30, marginBottom: 10 }}>{tournament.name}</h1>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className={status.className}>{status.label}</span>
        {transitions.map((next) => (
          <button
            key={next}
            type="button"
            className="badge"
            style={{ cursor: 'pointer', background: 'transparent' }}
            onClick={() => void changeStatus(next)}
          >
            → {statusView(next).label}
          </button>
        ))}
      </div>

      {error !== null && (
        <p role="alert" className="small" style={{ color: 'var(--burgundy)' }}>
          {error}
        </p>
      )}

      {sections.length === 0 ? (
        <p className="muted" style={{ marginTop: 24 }}>
          Seksiya yo`q.
        </p>
      ) : (
        sections.map((section) => (
          <SectionManager key={section.id} section={section} onError={setError} />
        ))
      )}
    </>
  );
}

function SectionManager({
  section,
  onError,
}: {
  section: Section;
  onError: (message: string) => void;
}) {
  const { authFetch } = useAuth();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [openRound, setOpenRound] = useState<Round | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await readJson<Round[]>(await authFetch(`/api/v1/sections/${section.id}/rounds`));
      const regs = await readJson<Registration[]>(
        await authFetch(`/api/v1/sections/${section.id}/registrations`),
      );
      setRounds(r);
      setRegistrations(regs);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Xato');
    }
  }, [authFetch, section.id, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = useCallback(
    (registrationId: string | null): string => {
      if (registrationId === null) {
        return '— (bye)';
      }
      const reg = registrations.find((r) => r.id === registrationId);
      return reg === undefined ? '?' : fullName(reg.firstName, reg.lastName);
    },
    [registrations],
  );

  async function generateRound(): Promise<void> {
    setBusy(true);
    try {
      const res = await authFetch(`/api/v1/sections/${section.id}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const round = await readJson<Round>(res);
      await load();
      setOpenRound(round);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Xato');
    } finally {
      setBusy(false);
    }
  }

  async function showRound(roundId: string): Promise<void> {
    try {
      setOpenRound(await readJson<Round>(await authFetch(`/api/v1/rounds/${roundId}`)));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Xato');
    }
  }

  async function setResult(pairingId: string, result: string): Promise<void> {
    try {
      const res = await authFetch(`/api/v1/pairings/${pairingId}/result`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
      await readJson(res);
      if (openRound !== null) {
        await showRound(openRound.id);
      }
    } catch (e) {
      // Mavjud natijani o'zgartirish SABAB talab qiladi (422) — backend
      // shuni aytadi va biz xabarni o'zgartirmaymiz.
      onError(e instanceof Error ? e.message : 'Xato');
    }
  }

  async function completeRound(roundId: string): Promise<void> {
    try {
      await readJson(
        await authFetch(`/api/v1/rounds/${roundId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
      );
      await load();
      await showRound(roundId);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Xato');
    }
  }

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h2>{section.name} seksiyasi</h2>
        <span className="muted small">
          {PAIRING_SYSTEM_LABEL[section.pairingSystem] ?? section.pairingSystem} ·{' '}
          {TIME_CATEGORY_LABEL[section.timeCategory] ?? section.timeCategory}{' '}
          {formatTimeControl(section.baseTimeSeconds, section.incrementSeconds)} ·{' '}
          {rounds.length}/{section.totalRounds} tur · {registrations.length} ishtirokchi
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        <button
          type="button"
          onClick={() => void generateRound()}
          disabled={busy}
          className="badge"
          style={{ cursor: 'pointer', background: 'transparent' }}
        >
          {busy ? 'Generatsiya…' : 'Keyingi turni generatsiya qilish'}
        </button>

        {/* PDF — offline degradatsiya (docs/11 §12.4). Yangi oynada. */}
        <a
          className="badge"
          href={`/api/v1/sections/${section.id}/export/standings/pdf`}
          target="_blank"
          rel="noreferrer"
        >
          Jadval PDF
        </a>
        <a
          className="badge"
          href={`/api/v1/sections/${section.id}/export/trf`}
          target="_blank"
          rel="noreferrer"
        >
          TRF16
        </a>
      </div>

      {rounds.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {rounds.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => void showRound(r.id)}
              className={openRound?.id === r.id ? 'badge badge-open' : 'badge'}
              style={{ cursor: 'pointer', background: 'transparent' }}
            >
              {r.number}-tur {r.status === 'COMPLETED' ? '✓' : ''}
            </button>
          ))}
        </div>
      )}

      {openRound?.pairings !== undefined && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">Taxta</th>
                <th>Oq</th>
                <th>Qora</th>
                <th>Natija</th>
              </tr>
            </thead>
            <tbody>
              {[...openRound.pairings]
                .sort((a, b) => a.boardNumber - b.boardNumber)
                .map((p) => (
                  <tr key={p.id}>
                    <td className="num tabular">{p.boardNumber}</td>
                    <td>{nameOf(p.whiteRegistrationId)}</td>
                    <td>{nameOf(p.blackRegistrationId)}</td>
                    <td>
                      {p.blackRegistrationId === null ? (
                        <span className="muted small">{p.result}</span>
                      ) : (
                        <select
                          value={RESULTS.some((r) => r.value === p.result) ? p.result : ''}
                          onChange={(e) => void setResult(p.id, e.target.value)}
                          style={{
                            background: 'var(--bg)',
                            color: 'var(--ink)',
                            border: '1px solid var(--hairline)',
                            borderRadius: 6,
                            padding: '4px 6px',
                            font: 'inherit',
                            fontSize: 13,
                          }}
                        >
                          <option value="" disabled>
                            —
                          </option>
                          {RESULTS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {openRound !== null && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <a
            className="badge"
            href={`/api/v1/sections/${section.id}/export/pairings/${String(openRound.number)}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            {openRound.number}-tur juftlik varaqasi (PDF)
          </a>
          {openRound.status !== 'COMPLETED' && (
            <button
              type="button"
              onClick={() => void completeRound(openRound.id)}
              className="badge"
              style={{ cursor: 'pointer', background: 'transparent' }}
            >
              Turni yopish
            </button>
          )}
        </div>
      )}
    </section>
  );
}
