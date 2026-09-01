import { notFound } from 'next/navigation';

import { ApiError, getPlayer, getRatingHistory, type RatingHistoryRow } from '@/lib/api';
import { TIME_CATEGORY_LABEL, formatDate, formatRating, fullName } from '@/lib/format';
import { BackLink, Card, EmptyState, PageHeader, TitleTag } from '@/components/ui';

/**
 * O'yinchi profili — ommaviy ko'rinish.
 *
 * ⚠️  MILLIY reyting va FIDE Elo — IKKI ALOHIDA raqam, aralashtirilmaydi
 *     (docs/14-roadmap.md Faza 3, xavflar jadvali: "FIDE Elo bilan
 *     chalkashlik" ehtimolligi YUQORI deb baholangan). Shuning uchun
 *     FIDE ID alohida qatorda va u REYTING emas, IDENTIFIKATOR ekani
 *     ko'rinib turadi.
 */
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const player = await getPlayer(id).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) {
      notFound();
    }
    throw e;
  });

  // Reyting tarixi bo'lmasligi NORMAL (hali davr hisoblanmagan) —
  // butun sahifani yiqitmaydi.
  let history: RatingHistoryRow[] = [];
  try {
    history = (await getRatingHistory(id)).items;
  } catch {
    history = [];
  }

  return (
    <>
      <BackLink href="/reyting">Reyting</BackLink>

      <PageHeader title={fullName(player.firstName, player.lastName)}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {player.title !== null && (
            <span className="badge">
              <TitleTag title={player.title} />
            </span>
          )}
          {player.birthDate !== null && (
            <span className="badge tabular">{formatDate(player.birthDate)}</span>
          )}
          {player.fideId !== null && (
            <span className="badge tabular" title="FIDE identifikatori (reyting EMAS)">
              FIDE ID: {player.fideId}
            </span>
          )}
        </div>
      </PageHeader>

      <h2 style={{ marginBottom: 12 }}>Reyting tarixi</h2>

      {history.length === 0 ? (
        <EmptyState
          title="Reyting tarixi hali yo`q"
          hint="Reyting DAVR yakunida bir yo`la hisoblanadi — har o`yindan keyin emas. Birinchi davr yopilgach shu yerda paydo bo`ladi."
        />
      ) : (
        <Card>
          <div className="table-wrap" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Davr</th>
                  <th>Kategoriya</th>
                  <th className="num">Oldin</th>
                  <th className="num">Keyin</th>
                  <th className="num">O`yin</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const delta = row.ratingAfter - row.ratingBefore;
                  return (
                    <tr key={row.periodId}>
                      <td className="tabular muted">{formatDate(row.computedAt)}</td>
                      <td className="muted">
                        {TIME_CATEGORY_LABEL[row.timeCategory] ?? row.timeCategory} ·{' '}
                        {row.environment}
                      </td>
                      <td className="num tabular muted">{Math.round(row.ratingBefore)}</td>
                      <td className="num tabular" style={{ fontWeight: 600 }}>
                        {formatRating(row.ratingAfter, row.deviationAfter)}{' '}
                        <span
                          className="small"
                          style={{
                            color: delta >= 0 ? 'var(--emerald-bright)' : 'var(--burgundy)',
                          }}
                        >
                          {delta >= 0 ? '+' : ''}
                          {Math.round(delta)}
                        </span>
                      </td>
                      <td className="num tabular muted">{row.gamesInPeriod}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
