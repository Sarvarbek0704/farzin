import Link from 'next/link';

import { listTournaments, type Tournament } from '@/lib/api';
import { formatDateRange, statusView } from '@/lib/format';
import { PageHeader } from '@/components/ui';
import { getTranslator } from '@/lib/i18n.server';

/**
 * Bosh sahifa.
 *
 * Maqsad — bitta ekranda "bu nima va hozir nima bo'lyapti" savoliga
 * javob berish. Dizayn brifi: taxta motivi qahramon, qolgani jim.
 */
export default async function HomePage() {
  const t = await getTranslator();
  let live: Tournament[] = [];
  let failed = false;

  try {
    const page = await listTournaments();
    // Faol turnirlar — hakam va tomoshabin uchun eng dolzarb.
    live = page.items
      .filter((t) => t.status === 'IN_PROGRESS' || t.status === 'REGISTRATION_OPEN')
      .slice(0, 4);
  } catch {
    // Backend ko'tarilmagan bo'lsa ham bosh sahifa OCHILADI — faqat
    // dinamik blok tushib qoladi. Butun sahifani yiqitish mantiqsiz.
    failed = true;
  }

  return (
    <>
      <PageHeader title={t('home.title')} subtitle={t('home.subtitle')} />

      <section style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr', marginBottom: 36 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/turnirlar" className="card" style={{ flex: '1 1 240px', color: 'inherit' }}>
            <h3 style={{ marginBottom: 6 }}>{t('nav.tournaments')}</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {t('home.tournamentsCard')}
            </p>
          </Link>

          <Link href="/reyting" className="card" style={{ flex: '1 1 240px', color: 'inherit' }}>
            <h3 style={{ marginBottom: 6 }}>{t('ratings.title')}</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {t('home.ratingsCard')}
            </p>
          </Link>
        </div>
      </section>

      <section>
        <h2 style={{ marginBottom: 14 }}>{t('home.now')}</h2>

        {failed ? (
          <p className="muted small">{t('error.title')}</p>
        ) : live.length === 0 ? (
          <p className="muted small">{t('home.noActive')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {live.map((item) => {
              const status = statusView(item.status);
              return (
                <Link
                  key={item.id}
                  href={`/turnirlar/${item.id}`}
                  className="card"
                  style={{ color: 'inherit', display: 'block' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <strong>{item.name}</strong>
                    <span className={status.className}>{status.label}</span>
                  </div>
                  <div className="muted small tabular" style={{ marginTop: 4 }}>
                    {formatDateRange(item.startDate, item.endDate)}
                    {item.venueName !== null && ` · ${item.venueName}`}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
