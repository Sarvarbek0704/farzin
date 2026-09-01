import Link from 'next/link';

import { listRatings, type RatingRow } from '@/lib/api';
import { formatRating, fullName } from '@/lib/format';
import { EmptyState, ErrorState, PageHeader, TitleTag } from '@/components/ui';

export const metadata = { title: 'Reyting' };

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
  let rows: RatingRow[] = [];
  let error: string | null = null;

  try {
    rows = (await listRatings({ environment: 'OTB', timeCategory: 'CLASSICAL' })).items;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Noma`lum xato';
  }

  return (
    <>
      <PageHeader
        title="Milliy reyting"
        subtitle="Glicko-2, klassik vaqt nazorati, taxta ortidagi (OTB) o'yinlar. Reyting ishonch oralig'i (RD) bilan birga beriladi — bu son emas, taqsimot."
      />

      {error !== null ? (
        <ErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Ro`yxat hozircha bo`sh"
          hint="Reytingga faqat yetarli o`yin o`ynagan (established) o`yinchilar kiradi. Boshlang`ich davrda RD yuqori bo`ladi va o`yinchi ro`yxatda ko`rinmaydi."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">#</th>
                <th>O`yinchi</th>
                <th className="num">Reyting</th>
                <th className="num">O`yin</th>
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
