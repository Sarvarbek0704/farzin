import Link from 'next/link';

import { listTournaments, type Tournament } from '@/lib/api';
import { formatDateRange, statusView } from '@/lib/format';
import { getTranslator } from '@/lib/i18n.server';

/**
 * Bosh sahifa — editorial hero (dizayn brifi §6.1).
 *
 * Tartib: kicker + katta serif sarlavha + ikkita CTA, yonida taxta
 * motivi. Keyin "hozir" jonli chizig'i, xizmatlar to'rtligi va B2B
 * bandi. Hammasi tinch: taxta gapiradi, qolgani jim (brif §3).
 */
export default async function HomePage() {
  const t = await getTranslator();
  let live: Tournament[] = [];
  let failed = false;

  try {
    const page = await listTournaments();
    live = page.items
      .filter((x) => x.status === 'IN_PROGRESS' || x.status === 'REGISTRATION_OPEN')
      .slice(0, 4);
  } catch {
    // Backend yotgan bo'lsa ham bosh sahifa ochiladi — faqat jonli
    // blok tushib qoladi.
    failed = true;
  }

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="hero diag">
        <div>
          <span className="kicker">{t('hero.kicker')}</span>
          <h1 className="display" style={{ margin: '14px 0 18px' }}>
            {t('home.title')}
          </h1>
          <p className="lead" style={{ maxWidth: '52ch', marginBottom: 28 }}>
            {t('home.subtitle')}
          </p>
          <div className="row">
            <Link href="/oyin" className="btn btn-primary btn-lg">
              {t('hero.play')}
            </Link>
            <Link href="/turnirlar" className="btn btn-lg">
              {t('hero.calendar')}
            </Link>
          </div>
        </div>

        {/* Taxta — brend belgisi sifatida (jonli o'yin emas, motiv). */}
        <div className="hero-board" aria-hidden="true">
          <div className="board-frame" style={{ maxWidth: 420, marginLeft: 'auto' }} />
        </div>
      </section>

      {/* ── Hozir ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 64 }}>
        <div className="spread" style={{ marginBottom: 18 }}>
          <h2>{t('home.now')}</h2>
          <Link href="/turnirlar" className="btn btn-ghost">
            {t('hero.calendar')} →
          </Link>
        </div>

        {failed || live.length === 0 ? (
          <div className="card empty">
            <span className="empty-glyph" aria-hidden="true">
              ♞
            </span>
            <p style={{ margin: 0, fontWeight: 500 }}>{t('home.noActive')}</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 14,
            }}
          >
            {live.map((item) => {
              const status = statusView(item.status);
              return (
                <Link key={item.id} href={`/turnirlar/${item.id}`} className="card">
                  <div className="spread" style={{ marginBottom: 8 }}>
                    <span className={status.className}>{status.label}</span>
                  </div>
                  <h3 style={{ fontSize: 19, marginBottom: 8 }}>{item.name}</h3>
                  <div className="muted small tabular">
                    {formatDateRange(item.startDate, item.endDate)}
                  </div>
                  {item.venueName !== null && (
                    <div className="muted small" style={{ marginTop: 2 }}>
                      {item.venueName}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Xizmatlar to'rtligi ───────────────────────────────────── */}
      <section style={{ marginBottom: 64 }}>
        <span className="kicker" style={{ marginBottom: 16 }}>
          {t('home.features')}
        </span>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 14,
            marginTop: 14,
          }}
        >
          <Link href="/oyin" className="card">
            <span className="empty-glyph" style={{ fontSize: 30, marginBottom: 10, opacity: 0.8 }}>
              ♞
            </span>
            <h3 style={{ fontSize: 18, marginBottom: 6 }}>{t('feature.play.title')}</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {t('feature.play.text')}
            </p>
          </Link>

          <Link href="/reyting" className="card">
            <span className="empty-glyph" style={{ fontSize: 30, marginBottom: 10, opacity: 0.8 }}>
              ♛
            </span>
            <h3 style={{ fontSize: 18, marginBottom: 6 }}>{t('feature.rating.title')}</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {t('feature.rating.text')}
            </p>
          </Link>

          <Link href="/turnirlar" className="card">
            <span className="empty-glyph" style={{ fontSize: 30, marginBottom: 10, opacity: 0.8 }}>
              ♜
            </span>
            <h3 style={{ fontSize: 18, marginBottom: 6 }}>{t('feature.tournaments.title')}</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {t('feature.tournaments.text')}
            </p>
          </Link>

          <div className="card" style={{ opacity: 0.75 }}>
            <span className="empty-glyph" style={{ fontSize: 30, marginBottom: 10, opacity: 0.8 }}>
              ♟
            </span>
            <div className="spread">
              <h3 style={{ fontSize: 18, marginBottom: 6 }}>{t('feature.school.title')}</h3>
              <span className="badge">{t('soon')}</span>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              {t('feature.school.text')}
            </p>
          </div>
        </div>
      </section>

      {/* ── B2B bandi ─────────────────────────────────────────────── */}
      <section className="card diag" style={{ padding: '36px 32px' }}>
        <div className="spread" style={{ gap: 24 }}>
          <div style={{ maxWidth: '58ch' }}>
            <h2 style={{ marginBottom: 10 }}>{t('home.b2b.title')}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {t('home.b2b.text')}
            </p>
          </div>
          <Link href="/konsol" className="btn btn-lg" style={{ flex: 'none' }}>
            {t('home.b2b.cta')}
          </Link>
        </div>
      </section>
    </>
  );
}
