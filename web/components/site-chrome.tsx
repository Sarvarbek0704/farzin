import Link from 'next/link';

import { LanguageSwitcher } from '@/components/language-switcher';
import { NavLinks } from '@/components/nav-links';
import { translate, type Locale } from '@/lib/i18n';

/**
 * Sayt qobig'i — sarlavha paneli va pastki qism.
 *
 * BITTA joyda: har sahifa o'z header/footerini yasamaydi, shuning
 * uchun ular sahifadan sahifaga "o'ynamaydi". Auth sahifalari bu
 * qobiqdan TASHQARIDA (app/(auth) guruhi) — kirish ekrani ilova
 * navigatsiyasini ko'rsatmasligi kerak.
 */

const NAV = [
  { href: '/turnirlar', key: 'nav.tournaments' },
  { href: '/oyin', key: 'nav.play' },
  { href: '/reyting', key: 'nav.ratings' },
  { href: '/konsol', key: 'nav.console' },
] as const;

export function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link href="/" className="wordmark">
          <span className="logo-mark" aria-hidden="true" />
          Farzin
        </Link>

        <NavLinks
          items={NAV.map((item) => ({ href: item.href, label: translate(locale, item.key) }))}
        />

        <div style={{ marginLeft: 'auto' }}>
          <LanguageSwitcher current={locale} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="site-footer diag">
      <div className="container">
        <div className="site-footer-inner">
          <div>
            <Link href="/" className="wordmark" style={{ fontSize: 20 }}>
              <span className="logo-mark" aria-hidden="true" />
              Farzin
            </Link>
            <p className="muted small" style={{ margin: '12px 0 16px', maxWidth: '36ch' }}>
              {translate(locale, 'footer.tagline')}
            </p>
            {/* To'lov usullari — brif §2: Click · Payme · Uzum (Visa/PayPal emas). */}
            <div className="row" style={{ gap: 8 }}>
              <span className="pay-chip">Click</span>
              <span className="pay-chip">Payme</span>
              <span className="pay-chip">Uzum</span>
            </div>
          </div>

          <div>
            <h4>{translate(locale, 'footer.sections')}</h4>
            <nav>
              <Link href="/turnirlar">{translate(locale, 'nav.tournaments')}</Link>
              <Link href="/oyin">{translate(locale, 'nav.play')}</Link>
              <Link href="/reyting">{translate(locale, 'nav.ratings')}</Link>
            </nav>
          </div>

          <div>
            <h4>{translate(locale, 'footer.forOrgs')}</h4>
            <nav>
              <Link href="/konsol">{translate(locale, 'nav.console')}</Link>
              <Link href="/turnirlar">{translate(locale, 'footer.calendar')}</Link>
            </nav>
          </div>
        </div>

        <div className="site-footer-bottom">
          <span>{translate(locale, 'footer.note')}</span>
          <LanguageSwitcher current={locale} />
        </div>
      </div>
    </footer>
  );
}
