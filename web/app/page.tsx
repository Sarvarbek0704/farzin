import Link from 'next/link';

import { listTournaments, type Tournament } from '@/lib/api';
import { formatDateRange, statusView } from '@/lib/format';
import { PageHeader } from '@/components/ui';

/**
 * Bosh sahifa.
 *
 * Maqsad — bitta ekranda "bu nima va hozir nima bo'lyapti" savoliga
 * javob berish. Dizayn brifi: taxta motivi qahramon, qolgani jim.
 */
export default async function HomePage() {
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
      <PageHeader
        title="O'zbekiston shaxmatining raqamli infratuzilmasi"
        subtitle="Turnir kalendari, jonli jadval va milliy Glicko-2 reyting — ochiq va tekshirib bo'ladigan ma'lumot."
      />

      <section style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr', marginBottom: 36 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/turnirlar" className="card" style={{ flex: '1 1 240px', color: 'inherit' }}>
            <h3 style={{ marginBottom: 6 }}>Turnirlar</h3>
            <p className="muted small" style={{ margin: 0 }}>
              Kalendar, ishtirokchilar, tur-ma-tur jadval va tie-break.
            </p>
          </Link>

          <Link href="/reyting" className="card" style={{ flex: '1 1 240px', color: 'inherit' }}>
            <h3 style={{ marginBottom: 6 }}>Milliy reyting</h3>
            <p className="muted small" style={{ margin: 0 }}>
              Glicko-2. Reyting ishonch oralig'i (RD) bilan birga ko'rsatiladi.
            </p>
          </Link>
        </div>
      </section>

      <section>
        <h2 style={{ marginBottom: 14 }}>Hozir</h2>

        {failed ? (
          <p className="muted small">Turnir ma`lumotini olishning iloji bo`lmadi.</p>
        ) : live.length === 0 ? (
          <p className="muted small">Ayni paytda faol turnir yo`q.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {live.map((t) => {
              const status = statusView(t.status);
              return (
                <Link
                  key={t.id}
                  href={`/turnirlar/${t.id}`}
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
                    <strong>{t.name}</strong>
                    <span className={status.className}>{status.label}</span>
                  </div>
                  <div className="muted small tabular" style={{ marginTop: 4 }}>
                    {formatDateRange(t.startDate, t.endDate)}
                    {t.venueName !== null && ` · ${t.venueName}`}
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
