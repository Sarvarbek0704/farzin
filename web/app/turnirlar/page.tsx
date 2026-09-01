import Link from 'next/link';

import { listTournaments, type Tournament } from '@/lib/api';
import { formatDateRange, formatSom, statusView } from '@/lib/format';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui';

export const metadata = { title: 'Turnirlar' };

/**
 * Turnir kalendari — ommaviy.
 *
 * Bu Chess-Results ning asosiy qiymati bo'lgan ekran: havolani ochib
 * turnirni ko'rish. docs/00-vision-and-market.md buni "butun loyihani
 * bloklovchi" bozor xavfi bilan bog'laydi — hakam mahsulotni ISHLAB
 * TURGAN holda ko'rmasa, Swiss-Manager'dan ko'chmaydi.
 */
export default async function TournamentsPage() {
  let tournaments: Tournament[] = [];
  let error: string | null = null;

  try {
    tournaments = (await listTournaments()).items;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Noma`lum xato';
  }

  return (
    <>
      <PageHeader
        title="Turnirlar"
        subtitle="Ommaviy kalendar. Turnirni ochib ishtirokchilar ro'yxati va jonli jadvalni ko'ring."
      />

      {error !== null ? (
        <ErrorState message={error} />
      ) : tournaments.length === 0 ? (
        <EmptyState
          title="Hozircha turnir yo`q"
          hint="Tashkilotchilar turnir e`lon qilgach, u shu yerda ko`rinadi."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Turnir</th>
                <th>Sana</th>
                <th>Joy</th>
                <th>Start puli</th>
                <th>Holat</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((t) => {
                const status = statusView(t.status);
                return (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/turnirlar/${t.id}`} style={{ fontWeight: 500 }}>
                        {t.name}
                      </Link>
                      {t.isNationallyRated && (
                        <div className="muted small">Milliy reytingga hisoblanadi</div>
                      )}
                    </td>
                    <td className="tabular" style={{ whiteSpace: 'nowrap' }}>
                      {formatDateRange(t.startDate, t.endDate)}
                    </td>
                    <td className="muted">{t.venueName ?? '—'}</td>
                    <td className="tabular" style={{ whiteSpace: 'nowrap' }}>
                      {formatSom(t.entryFeeAmount)}
                    </td>
                    <td>
                      <span className={status.className}>{status.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
