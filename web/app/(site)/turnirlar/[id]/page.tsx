import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  ApiError,
  getTournament,
  listRegistrations,
  listSections,
  listStandings,
  type Registration,
  type Section,
  type Standing,
} from '@/lib/api';
import {
  PAIRING_SYSTEM_LABEL,
  TIME_CATEGORY_LABEL,
  formatDateRange,
  formatSom,
  formatTimeControl,
  fullName,
  statusView,
} from '@/lib/format';
import { BackLink, Card, EmptyState, PageHeader, TitleTag } from '@/components/ui';

/** Bitta seksiya: jadval bo'lsa jadval, bo'lmasa ishtirokchilar. */
interface SectionView {
  section: Section;
  registrations: Registration[];
  standings: Standing[];
}

/** Tie-break kalitlari — jadval ustuni sarlavhalari uchun qisqa nom. */
const TIE_BREAK_LABEL: Record<string, string> = {
  BUCHHOLZ: 'Bch',
  BUCHHOLZ_CUT1: 'Bch-1',
  SONNEBORN_BERGER: 'SB',
  DIRECT_ENCOUNTER: 'DE',
  WINS: 'G',
};

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tournament = await getTournament(id).catch((e: unknown) => {
    // 404 — turnir yo'q YOKI yopiq/DRAFT (backend ataylab farq
    // bildirmaydi). Ikkalasida ham foydalanuvchi uchun natija bir xil.
    if (e instanceof ApiError && e.status === 404) {
      notFound();
    }
    throw e;
  });

  const sections = await listSections(id);

  const views: SectionView[] = await Promise.all(
    sections.map(async (section) => ({
      section,
      registrations: await listRegistrations(section.id),
      standings: await listStandings(section.id),
    })),
  );

  const status = statusView(tournament.status);

  return (
    <>
      <BackLink href="/turnirlar">Turnirlar</BackLink>

      <PageHeader title={tournament.name}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <span className={status.className}>{status.label}</span>
          <span className="badge tabular">
            {formatDateRange(tournament.startDate, tournament.endDate)}
          </span>
          {tournament.venueName !== null && <span className="badge">{tournament.venueName}</span>}
          <span className={formatSom(tournament.entryFeeAmount) === 'Bepul' ? 'badge' : 'badge tabular'}>
            {formatSom(tournament.entryFeeAmount)}
          </span>
          {tournament.isNationallyRated && <span className="badge">Milliy reyting</span>}
          {tournament.isFideRated && <span className="badge">FIDE reyting</span>}
        </div>

        {tournament.description !== null && (
          <p className="muted" style={{ marginTop: 14, maxWidth: '68ch' }}>
            {tournament.description}
          </p>
        )}
      </PageHeader>

      {views.length === 0 ? (
        <EmptyState
          title="Seksiya hali qo`shilmagan"
          hint="Tashkilotchi seksiya qo`shgach, ishtirokchilar va jadval shu yerda ko`rinadi."
        />
      ) : (
        views.map((view) => <SectionBlock key={view.section.id} view={view} />)
      )}
    </>
  );
}

function SectionBlock({ view }: { view: SectionView }) {
  const { section, registrations, standings } = view;

  // Jadval `registrationId` bilan keladi, ismlar esa ro'yxatda —
  // ikkalasini shu yerda birlashtiramiz.
  const byRegistration = new Map(registrations.map((r) => [r.id, r]));

  const ordered = [...standings].sort((a, b) => a.rank - b.rank);

  // Tie-break ustunlari — seksiyada AMALDA ishlatilganlari bo'yicha.
  // Barcha 10 kalitni ko'rsatish jadvalni o'qib bo'lmaydigan qiladi.
  const tieBreakKeys = [
    ...new Set(ordered.flatMap((s) => Object.keys(s.tieBreakValues))),
  ].slice(0, 4);

  return (
    <section style={{ marginBottom: 32 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <h2>{section.name} seksiyasi</h2>
        <span className="muted small">
          {PAIRING_SYSTEM_LABEL[section.pairingSystem] ?? section.pairingSystem} ·{' '}
          {TIME_CATEGORY_LABEL[section.timeCategory] ?? section.timeCategory}{' '}
          {formatTimeControl(section.baseTimeSeconds, section.incrementSeconds)} ·{' '}
          {section.totalRounds} tur
        </span>
      </div>

      {ordered.length === 0 ? (
        registrations.length === 0 ? (
          <EmptyState title="Ishtirokchilar hali ro`yxatdan o`tmagan" />
        ) : (
          <Card>
            <h3 style={{ marginBottom: 10 }}>Ishtirokchilar ({registrations.length})</h3>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {registrations.map((r) => (
                <li key={r.id}>
                  <TitleTag title={r.title} />
                  <Link href={`/oyinchi/${r.playerId}`}>{fullName(r.firstName, r.lastName)}</Link>
                </li>
              ))}
            </ul>
            <p className="muted small" style={{ marginBottom: 0, marginTop: 12 }}>
              Jadval birinchi tur yakunlangach paydo bo`ladi.
            </p>
          </Card>
        )
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                <th>O`yinchi</th>
                <th className="num">Ochko</th>
                <th className="num">O`yin</th>
                <th className="num">+/=/-</th>
                {tieBreakKeys.map((key) => (
                  <th key={key} className="num" title={key}>
                    {TIE_BREAK_LABEL[key] ?? key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.map((s) => {
                const player = byRegistration.get(s.registrationId);
                return (
                  <tr key={s.registrationId}>
                    <td className="num tabular">{s.rank}</td>
                    <td>
                      {player === undefined ? (
                        <span className="muted">—</span>
                      ) : (
                        <>
                          <TitleTag title={player.title} />
                          <Link href={`/oyinchi/${player.playerId}`}>
                            {fullName(player.firstName, player.lastName)}
                          </Link>
                        </>
                      )}
                    </td>
                    <td className="num tabular" style={{ fontWeight: 600 }}>
                      {s.points}
                    </td>
                    <td className="num tabular">{s.gamesPlayed}</td>
                    <td className="num tabular muted">
                      {s.wins}/{s.draws}/{s.losses}
                    </td>
                    {tieBreakKeys.map((key) => (
                      <td key={key} className="num tabular muted">
                        {s.tieBreakValues[key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
