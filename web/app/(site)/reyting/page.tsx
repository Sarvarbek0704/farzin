import type { Metadata } from 'next';
import Link from 'next/link';

import { listRatings, type RatingRow } from '@/lib/api';
import { fullName } from '@/lib/format';
import { EmptyState, ErrorState, PageHeader, TitleTag } from '@/components/ui';
import { getTranslator } from '@/lib/i18n.server';
import type { MessageKey } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t('ratings.title') };
}

/**
 * Milliy reyting ro'yxati — KATEGORIYALAR bo'yicha (dizayn brifi §6.8).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  UCH HALOLLIK QARORI KO'RINIB TURADI
 *
 *   1. RD (ishonch oralig'i) OCHIQ — "2403 ± 54". Reyting nuqta emas,
 *      taqsimot; uni yashirish mavjud bo'lmagan aniqlik tuyg'usini
 *      yaratadi (docs/14 Faza 3).
 *
 *   2. Ro'yxatda faqat ESTABLISHED o'yinchilar — backend
 *      provisional'larni filtrlaydi. Ro'yxat bo'sh bo'lsa SABAB
 *      aytiladi, aks holda "tizim buzuq" deb o'ylanadi.
 *
 *   3. Kategoriyalar ARALASHMAYDI (docs/06 §5): OTB va onlayn alohida
 *      reyting. Tab'lar shu ajratishni KO'RSATADI — bitta "reyting"
 *      degan yolg'on raqam yo'q.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Tab tanlovi URL'da (`?kategoriya=`): havola ulashilsa aynan o'sha
 *  ro'yxat ochiladi va sahifa server komponenti bo'lib qoladi.
 */

interface Category {
  readonly slug: string;
  readonly environment: string;
  readonly timeCategory: string;
  readonly labelKey: MessageKey;
}

const CATEGORIES: readonly Category[] = [
  {
    slug: 'otb-klassik',
    environment: 'OTB',
    timeCategory: 'CLASSICAL',
    labelKey: 'ratings.tabOtbClassical',
  },
  { slug: 'otb-rapid', environment: 'OTB', timeCategory: 'RAPID', labelKey: 'ratings.tabOtbRapid' },
  { slug: 'otb-blits', environment: 'OTB', timeCategory: 'BLITZ', labelKey: 'ratings.tabOtbBlitz' },
  {
    slug: 'onlayn-blits',
    environment: 'ONLINE',
    timeCategory: 'BLITZ',
    labelKey: 'ratings.tabOnlineBlitz',
  },
  {
    slug: 'onlayn-bullet',
    environment: 'ONLINE',
    timeCategory: 'BULLET',
    labelKey: 'ratings.tabOnlineBullet',
  },
];

export default async function RatingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslator();
  const params = await searchParams;
  const slug = typeof params.kategoriya === 'string' ? params.kategoriya : CATEGORIES[0]?.slug;
  const active = CATEGORIES.find((c) => c.slug === slug) ?? CATEGORIES[0];
  if (active === undefined) {
    throw new Error('kategoriya ro`yxati bo`sh bo`lishi mumkin emas');
  }

  let rows: RatingRow[] = [];
  let error: string | null = null;
  try {
    rows = (
      await listRatings({ environment: active.environment, timeCategory: active.timeCategory })
    ).items;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Noma`lum xato';
  }

  return (
    <>
      <PageHeader
        kicker={t('nav.ratings')}
        title={t('ratings.title')}
        subtitle={t('ratings.subtitle')}
      />

      {/* Kategoriya tab'lari — havola, ya'ni server komponenti qoladi. */}
      <nav className="tabs" aria-label={t('ratings.title')}>
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/reyting?kategoriya=${c.slug}`}
            aria-current={c.slug === active.slug ? 'page' : undefined}
          >
            {t(c.labelKey)}
          </Link>
        ))}
      </nav>

      <p className="muted small" style={{ marginTop: 12, marginBottom: 22 }}>
        {t('ratings.separate')}
      </p>

      {error !== null ? (
        <ErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState glyph="♛" title={t('ratings.empty')} hint={t('ratings.emptyHint')} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num" style={{ width: 64 }}>
                  #
                </th>
                <th>{t('table.player')}</th>
                <th className="num">{t('table.rating')}</th>
                <th className="num">{t('table.deviation')}</th>
                <th className="num">{t('table.games')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.playerId}>
                  {/* Birinchi uchlik — oltin (brif §6.8 "rank medals in gilt"). */}
                  <td className={index < 3 ? 'num tabular rank-medal' : 'num tabular'}>
                    {index + 1}
                  </td>
                  <td>
                    <TitleTag title={row.title} />
                    <Link href={`/oyinchi/${row.playerId}`} style={{ fontWeight: 500 }}>
                      {fullName(row.firstName, row.lastName)}
                    </Link>
                  </td>
                  <td className="num tabular" style={{ fontWeight: 600 }}>
                    {row.rating}
                  </td>
                  {/* RD alohida ustunda — saralash va solishtirish uchun. */}
                  <td className="num tabular muted">±{row.deviation}</td>
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
