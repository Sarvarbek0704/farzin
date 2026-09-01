import type { Metadata } from 'next';
import Link from 'next/link';

import { listTournaments, type Tournament } from '@/lib/api';
import { formatDateRange, formatSom, statusView } from '@/lib/format';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui';
import { getTranslator } from '@/lib/i18n.server';

/**
 * Sahifa sarlavhasi ham tarjima qilinadi — brauzer yorlig'i va qidiruv
 * natijasi foydalanuvchi tilida bo'lishi kerak. Statik `metadata` buni
 * qila olmaydi, chunki til cookie'dan (so'rovdan) keladi.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t('tournaments.title') };
}

/**
 * Turnir kalendari — ommaviy.
 *
 * Bu Chess-Results ning asosiy qiymati bo'lgan ekran: havolani ochib
 * turnirni ko'rish. docs/00-vision-and-market.md buni "butun loyihani
 * bloklovchi" bozor xavfi bilan bog'laydi — hakam mahsulotni ISHLAB
 * TURGAN holda ko'rmasa, Swiss-Manager'dan ko'chmaydi.
 */
export default async function TournamentsPage() {
  const t = await getTranslator();
  let tournaments: Tournament[] = [];
  let error: string | null = null;

  try {
    tournaments = (await listTournaments()).items;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Noma`lum xato';
  }

  return (
    <>
      <PageHeader title={t('tournaments.title')} subtitle={t('tournaments.subtitle')} />

      {error !== null ? (
        <ErrorState message={error} />
      ) : tournaments.length === 0 ? (
        <EmptyState title={t('tournaments.empty')} hint={t('tournaments.emptyHint')} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('table.tournament')}</th>
                <th>{t('table.date')}</th>
                <th>{t('table.venue')}</th>
                <th>{t('table.entryFee')}</th>
                <th>{t('table.status')}</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((item) => {
                const status = statusView(item.status);
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/turnirlar/${item.id}`} style={{ fontWeight: 500 }}>
                        {item.name}
                      </Link>
                      {item.isNationallyRated && (
                        <div className="muted small">{t('tournaments.nationallyRated')}</div>
                      )}
                    </td>
                    <td className="tabular" style={{ whiteSpace: 'nowrap' }}>
                      {formatDateRange(item.startDate, item.endDate)}
                    </td>
                    <td className="muted">{item.venueName ?? '—'}</td>
                    <td className="tabular" style={{ whiteSpace: 'nowrap' }}>
                      {formatSom(item.entryFeeAmount)}
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
