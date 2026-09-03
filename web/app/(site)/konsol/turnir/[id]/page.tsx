'use client';

import { use, useCallback, useEffect, useState } from 'react';

import type { Registration, Section, Standing, Tournament, TournamentStatus } from '@/lib/api';
import { ResultEntry } from '@/components/result-entry';
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
            className="btn"
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
  /**
   * Jadval — "nega bu juftlik?" paneli uchun (brif §5.13).
   *
   * ⚠️  OCHIQ turda jadval juftlashtirish paytidagi holatni ko'rsatadi,
   *     chunki natijalar hali kiritilmagan. Aynan shu payt hakamdan
   *     "nega?" deb so'raladi, ya'ni bu to'g'ri ma'lumot.
   */
  const [standings, setStandings] = useState<Standing[]>([]);
  const [openRound, setOpenRound] = useState<Round | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await readJson<Round[]>(await authFetch(`/api/v1/sections/${section.id}/rounds`));
      const regs = await readJson<Registration[]>(
        await authFetch(`/api/v1/sections/${section.id}/registrations`),
      );
      // Jadval bo'lmasligi NORMAL (birinchi turgacha) — panel shunda
      // ko'rsatilmaydi, xato emas.
      const table = await readJson<Standing[]>(
        await authFetch(`/api/v1/sections/${section.id}/standings`),
      ).catch(() => [] as Standing[]);
      setRounds(r);
      setRegistrations(regs);
      setStandings(table);

      // Jadval — "nega bu juftlik?" paneli uchun (ochko, rang, float).
      // Birinchi turgacha u BO'SH bo'ladi va panel ko'rsatilmaydi:
      // hali tekshiradigan tarix yo'q.
      try {
        setStandings(
          await readJson<Standing[]>(
            await authFetch(`/api/v1/sections/${section.id}/standings`),
          ),
        );
      } catch {
        // Jadval yo'qligi turnirni boshqarishga to'sqinlik qilmaydi.
        setStandings([]);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Xato');
    }
  }, [authFetch, section.id, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Juftlashtirish faktlari — jadvaldan; yo'q bo'lsa undefined. */
  const factsOf = useCallback(
    (registrationId: string | null) => {
      if (registrationId === null) {
        return undefined;
      }
      const row = standings.find((x) => x.registrationId === registrationId);
      const reg = registrations.find((r) => r.id === registrationId);
      if (row === undefined || reg === undefined) {
        return undefined;
      }
      return {
        name: fullName(reg.firstName, reg.lastName),
        points: row.points,
        colorHistory: row.colorHistory,
        floatHistory: row.floatHistory,
      };
    },
    [standings, registrations],
  );

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
          className="btn"
        >
          {busy ? 'Generatsiya…' : 'Keyingi turni generatsiya qilish'}
        </button>

        {/* PDF — offline degradatsiya (docs/11 §12.4). Yangi oynada. */}
        <a
          className="btn"
          href={`/api/v1/sections/${section.id}/export/standings/pdf`}
          target="_blank"
          rel="noreferrer"
        >
          Jadval PDF
        </a>
        <a
          className="btn"
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
        <ResultEntry
          pairings={[...openRound.pairings]
            .sort((a, b) => a.boardNumber - b.boardNumber)
            .map((p) => {
              const wf = factsOf(p.whiteRegistrationId);
              const bf = factsOf(p.blackRegistrationId);
              return {
                id: p.id,
                boardNumber: p.boardNumber,
                whiteName: nameOf(p.whiteRegistrationId),
                blackName: p.blackRegistrationId === null ? null : nameOf(p.blackRegistrationId),
                result: p.result,
                ...(wf === undefined ? {} : { whiteFacts: wf }),
                ...(bf === undefined ? {} : { blackFacts: bf }),
              };
            })}
          onSet={setResult}
          disabled={openRound.status === 'COMPLETED'}
        />
      )}

      {openRound !== null && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <a
            className="btn"
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
              className="btn"
            >
              Turni yopish
            </button>
          )}
        </div>
      )}
    </section>
  );
}
