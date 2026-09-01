import type { Metadata } from 'next';
import Link from 'next/link';

import { listRatings, type RatingRow } from '@/lib/api';
import { formatRating, fullName } from '@/lib/format';
import { EmptyState, ErrorState, PageHeader, TitleTag } from '@/components/ui';
import { getTranslator } from '@/lib/i18n.server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t('ratings.title') };
}

/**
 * Milliy reyting ro'yxati.
 *
 * ⚠️  IKKI HALOLLIK QARORI KO'RINIB TURADI (docs/14-roadmap.md Faza 3):
 *
 *   1. RD (ishonch oralig'i) OCHIQ ko'rsatiladi — "1650 ± 45".
 *      Reyting nuqta emas, taqsimot; uni yashirish mavjud bo'lmagan
 *      aniqlik tuyg'usini yaratadi.
 *
 *   2. Ro'yxatda faqat ESTABLISHED o'yinchilar bo'ladi — backend
 *      provisional'larni filtrlaydi. Ro'yxat bo'sh bo'lsa sabab
 *      AYTILADI, aks holda "tizim buzuq" deb o'ylanadi.
 */
export default async function RatingsPage() {
  const t = await getTranslator();
  let rows: RatingRow[] = [];
  let error: string | null = null;

  try {
    rows = (await listRatings({ environment: 'OTB', timeCategory: 'CLASSICAL' })).items;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Noma`lum xato';
  }

  return (
    <>
      <PageHeader title={t('ratings.title')} subtitle={t('ratings.subtitle')} />

      {error !== null ? (
        <ErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('ratings.empty')} hint={t('ratings.emptyHint')} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                <th>{t('table.player')}</th>
                <th className="num">{t('table.rating')}</th>
                <th className="num">{t('table.games')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.playerId}>
                  <td className="num tabular">{index + 1}</td>
                  <td>
                    <TitleTag title={row.title} />
                    <Link href={`/oyinchi/${row.playerId}`}>
                      {fullName(row.firstName, row.lastName)}
                    </Link>
                  </td>
                  <td className="num tabular" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatRating(row.rating, row.deviation)}
                  </td>
                  <td className="num tabular muted">{row.gamesPlayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
