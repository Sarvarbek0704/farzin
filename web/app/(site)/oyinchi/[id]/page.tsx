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

  // Har kategoriya bo'yicha ENG SO'NGGI yozuv — joriy reyting.
  const latest = new Map<string, RatingHistoryRow>();
  for (const row of history) {
    const key = `${row.environment}-${row.timeCategory}`;
    const seen = latest.get(key);
    if (seen === undefined || new Date(row.createdAt) > new Date(seen.createdAt)) {
      latest.set(key, row);
    }
  }
  const current = [...latest.values()].sort((a, b) => b.ratingAfter - a.ratingAfter);

  // Oddiy tilda: eng ko'p o'ynagan kategoriyadagi umumiy o'zgarish.
  const summary = summarise(history);

  return (
    <>
      <BackLink href="/reyting">Reyting</BackLink>

      <PageHeader kicker="O'yinchi" title={fullName(player.firstName, player.lastName)}>
        <div className="row" style={{ marginTop: 14 }}>
          {player.title !== null && (
            <span className="badge">
              <TitleTag title={player.title} />
            </span>
          )}
          {player.birthDate !== null && (
            <span className="badge tabular">{formatDate(player.birthDate)}</span>
          )}
          {player.fideId !== null && (
            <span className="badge tabular" title="FIDE identifikatori — REYTING emas">
              FIDE ID: {player.fideId}
            </span>
          )}
        </div>
      </PageHeader>

      {/*
        JORIY REYTINGLAR — kategoriya bo'yicha alohida nishon
        (dizayn brifi §5.6: uchta reyting hech qachon aralashmaydi).

        Qiymatlar TARIXNING oxirgi yozuvidan olinadi — bu aynan o'sha
        ma'lumot, chunki `ratingAfter` davr yakunidagi reyting.
        Alohida "joriy reyting" endpointi yo'q; bo'lganda shu blok
        undan oladi.
      */}
      {current.length > 0 && (
        <section className="rating-badges">
          {current.map((r) => (
            <div key={`${r.environment}-${r.timeCategory}`} className="rating-badge">
              <span className="rating-badge-label">
                {r.environment === 'OTB' ? 'OTB' : 'Onlayn'} ·{' '}
                {TIME_CATEGORY_LABEL[r.timeCategory] ?? r.timeCategory}
              </span>
              <span className="rating-badge-value tabular">{Math.round(r.ratingAfter)}</span>
              <span className="rating-badge-rd tabular">±{Math.round(r.deviationAfter)}</span>
            </div>
          ))}
        </section>
      )}

      {/*
        Oddiy tilda o'zgarish (brif §6.9: "a plain-language delta").
        Raqamlar jadvalini o'qimasdan ham holatni tushunish uchun.
      */}
      {summary !== null && <p className="lead" style={{ marginTop: 22 }}>{summary}</p>}

      <h2 style={{ marginTop: 34, marginBottom: 14 }}>Reyting tarixi</h2>

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
                      <td className="tabular muted">{formatDate(row.createdAt)}</td>
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

/**
 * "So'nggi N davrda +47" — jadval o'qimasdan tushunarli xulosa.
 *
 * Faqat BITTA kategoriya olinadi (eng ko'p yozuvi bori): bir nechta
 * kategoriyani bitta jumlaga qo'shish reytinglarni aralashtirish
 * bo'lardi, bu esa qat'iy taqiqlangan (docs/06 §5).
 */
function summarise(history: readonly RatingHistoryRow[]): string | null {
  if (history.length === 0) {
    return null;
  }
  const byCategory = new Map<string, RatingHistoryRow[]>();
  for (const row of history) {
    const key = `${row.environment}-${row.timeCategory}`;
    byCategory.set(key, [...(byCategory.get(key) ?? []), row]);
  }
  const [rows] = [...byCategory.values()].sort((a, b) => b.length - a.length);
  if (rows === undefined || rows.length === 0) {
    return null;
  }
  const sorted = [...rows].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }
  const delta = Math.round(last.ratingAfter - first.ratingBefore);
  const label = TIME_CATEGORY_LABEL[last.timeCategory] ?? last.timeCategory;
  const scope = last.environment === 'OTB' ? 'OTB' : 'onlayn';
  const periods = sorted.length;
  const sign = delta >= 0 ? '+' : '';
  return `So'nggi ${String(periods)} davrda ${scope} ${label.toLowerCase()} reytingi ${sign}${String(delta)}.`;
}
