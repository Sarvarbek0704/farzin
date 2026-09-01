import { Money } from '../../core/money/money';
import {
  DEFAULT_NOTIFICATION_LOCALE,
  NOTIFICATION_LOCALES,
  type NotificationLocale,
  type TemplateKey,
} from './notification.types';

/**
 * Shablon registry — templateKey → har til uchun subject/body funksiyalari.
 *
 * Notification.templateKey "i18n kaliti, matn EMAS" (prisma/schema.prisma):
 * DB'da faqat kalit + payload saqlanadi, matn yetkazish paytida (email) yoki
 * client tomonda (IN_APP) render qilinadi. Server tomonda render qilish
 * FAQAT tashqi kanallar uchun (email/SMS) — shu fayl.
 *
 * Tillar: uz-Latn (default), uz-Cyrl, ru, en — User.locale sharhi bilan mos.
 * Yo'q til → uz-Latn fallback (docs/01-product-spec.md ko'p tillilik talabi).
 *
 * SOF modul: side-effect yo'q, faqat string yasaydi — unit test to'g'ridan-
 * to'g'ri chaqiradi (templates.spec.ts).
 */

export interface RenderedTemplate {
  subject: string;
  body: string;
}

type TemplateRenderer = (payload: Record<string, unknown>) => RenderedTemplate;

type LocaleTable = Record<NotificationLocale, TemplateRenderer>;

/** Payload maydonini xavfsiz string sifatida olish — yo'q bo'lsa placeholder. */
function s(payload: Record<string, unknown>, key: string, fallback = '—'): string {
  const value = payload[key];
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return fallback;
}

/** Notification tili → Intl locale (Money.format uchun). */
const INTL_LOCALE: Record<NotificationLocale, string> = {
  'uz-Latn': 'uz-UZ',
  'uz-Cyrl': 'uz-Cyrl-UZ',
  ru: 'ru-RU',
  en: 'en-US',
};

/**
 * Tiyin (string) → ko'rsatish summasi. Pul HECH QACHON number emas
 * (ADR-0006) — payload'da string keladi (billing outbox payload'lari
 * `amountTiyin: payment.amount.toString()`).
 *
 * Noma'lum valyuta yoki buzuq qiymat → xom `"<tiyin> <valyuta>"` fallback:
 * shablon render HECH QACHON yiqilmasligi kerak (xabar chiqmay qolishidan
 * ko'ra xunuk chiqqani yaxshi).
 */
export function formatAmountTiyin(
  amountTiyin: unknown,
  currency: unknown,
  locale: NotificationLocale,
): string {
  const raw = typeof amountTiyin === 'string' ? amountTiyin : '';
  const cur = typeof currency === 'string' ? currency : '';
  if (cur === 'UZS' || cur === 'USD' || cur === 'EUR') {
    try {
      return Money.fromMinor(BigInt(raw), cur).format(INTL_LOCALE[locale]);
    } catch {
      // BigInt parse xatosi yoki Intl muammosi — fallback quyida.
    }
  }
  return `${raw !== '' ? raw : '?'} ${cur !== '' ? cur : '?'}`.trim();
}

/**
 * Registry. Har kalit uchun BARCHA 4 til majburiy (LocaleTable) —
 * templates.spec.ts har katakni render qilib tekshiradi.
 */
const TEMPLATES: Record<TemplateKey, LocaleTable> = {
  // docs/01-product-spec.md §3.1: tur yakuni → o'yinchilarga xabar;
  // docs/02-architecture.md §6.2: notification RoundCompleted tinglaydi.
  'round.completed': {
    'uz-Latn': (p) => ({
      subject: `${s(p, 'roundNumber')}-tur yakunlandi`,
      body:
        `${s(p, 'tournamentName')} — ${s(p, 'sectionName')}: ` +
        `${s(p, 'roundNumber')}-tur yakunlandi. Natijalar va keyingi tur ` +
        `juftliklarini platformada kuzating.`,
    }),
    'uz-Cyrl': (p) => ({
      subject: `${s(p, 'roundNumber')}-тур якунланди`,
      body:
        `${s(p, 'tournamentName')} — ${s(p, 'sectionName')}: ` +
        `${s(p, 'roundNumber')}-тур якунланди. Натижалар ва кейинги тур ` +
        `жуфтликларини платформада кузатинг.`,
    }),
    ru: (p) => ({
      subject: `Тур ${s(p, 'roundNumber')} завершён`,
      body:
        `${s(p, 'tournamentName')} — ${s(p, 'sectionName')}: тур ` +
        `${s(p, 'roundNumber')} завершён. Результаты и жеребьёвка ` +
        `следующего тура — на платформе.`,
    }),
    en: (p) => ({
      subject: `Round ${s(p, 'roundNumber')} completed`,
      body:
        `${s(p, 'tournamentName')} — ${s(p, 'sectionName')}: round ` +
        `${s(p, 'roundNumber')} is complete. See results and next-round ` +
        `pairings on the platform.`,
    }),
  },

  // docs/09-payments-and-billing.md §7.3: to'lov tasdig'i → to'lovchiga.
  'payment.completed': {
    'uz-Latn': (p) => ({
      subject: `To'lov qabul qilindi`,
      body:
        `${s(p, 'invoiceNumber')} invoysi bo'yicha ` +
        `${formatAmountTiyin(p.amountTiyin, p.currency, 'uz-Latn')} ` +
        `to'lovingiz muvaffaqiyatli qabul qilindi.`,
    }),
    'uz-Cyrl': (p) => ({
      subject: `Тўлов қабул қилинди`,
      body:
        `${s(p, 'invoiceNumber')} инвойси бўйича ` +
        `${formatAmountTiyin(p.amountTiyin, p.currency, 'uz-Cyrl')} ` +
        `тўловингиз муваффақиятли қабул қилинди.`,
    }),
    ru: (p) => ({
      subject: `Платёж получен`,
      body:
        `Платёж на сумму ` +
        `${formatAmountTiyin(p.amountTiyin, p.currency, 'ru')} ` +
        `по счёту ${s(p, 'invoiceNumber')} успешно получен.`,
    }),
    en: (p) => ({
      subject: `Payment received`,
      body:
        `Your payment of ` +
        `${formatAmountTiyin(p.amountTiyin, p.currency, 'en')} ` +
        `for invoice ${s(p, 'invoiceNumber')} was received.`,
    }),
  },

  // docs/09-payments-and-billing.md §8: refund → to'lovchiga, sabab bilan.
  'refund.issued': {
    'uz-Latn': (p) => ({
      subject: `To'lov qaytarildi`,
      body:
        `${s(p, 'invoiceNumber')} invoysi bo'yicha ` +
        `${formatAmountTiyin(p.amountTiyin, p.currency, 'uz-Latn')} ` +
        `qaytarildi. Sabab: ${s(p, 'reason')}.`,
    }),
    'uz-Cyrl': (p) => ({
      subject: `Тўлов қайтарилди`,
      body:
        `${s(p, 'invoiceNumber')} инвойси бўйича ` +
        `${formatAmountTiyin(p.amountTiyin, p.currency, 'uz-Cyrl')} ` +
        `қайтарилди. Сабаб: ${s(p, 'reason')}.`,
    }),
    ru: (p) => ({
      subject: `Возврат средств`,
      body:
        `По счёту ${s(p, 'invoiceNumber')} возвращено ` +
        `${formatAmountTiyin(p.amountTiyin, p.currency, 'ru')}. ` +
        `Причина: ${s(p, 'reason')}.`,
    }),
    en: (p) => ({
      subject: `Refund issued`,
      body:
        `A refund of ` +
        `${formatAmountTiyin(p.amountTiyin, p.currency, 'en')} ` +
        `was issued for invoice ${s(p, 'invoiceNumber')}. ` +
        `Reason: ${s(p, 'reason')}.`,
    }),
  },

  // docs/08-fair-play.md §6.3: FAQAT komissiya (SUPER_ADMIN) ko'radi,
  // o'yinchi bu bosqichda HECH NARSA bilmaydi (§4.1 3-band). IN_APP only.
  'fairplay.case_opened': {
    'uz-Latn': (p) => ({
      subject: `Yangi fair-play ishi`,
      body:
        `Yangi fair-play ishi ochildi (ish: ${s(p, 'caseId')}). ` +
        `Komissiya panelida ko'rib chiqing.`,
    }),
    'uz-Cyrl': (p) => ({
      subject: `Янги fair-play иши`,
      body:
        `Янги fair-play иши очилди (иш: ${s(p, 'caseId')}). ` + `Комиссия панелида кўриб чиқинг.`,
    }),
    ru: (p) => ({
      subject: `Новое дело fair-play`,
      body:
        `Открыто новое дело fair-play (дело: ${s(p, 'caseId')}). ` +
        `Рассмотрите его в панели комиссии.`,
    }),
    en: (p) => ({
      subject: `New fair-play case`,
      body:
        `A new fair-play case has been opened (case: ${s(p, 'caseId')}). ` +
        `Review it in the commission panel.`,
    }),
  },

  // Ixtiyoriy IN_APP xabar — play.game.finished (oddiy EventEmitter2,
  // outbox EMAS — ADR-0008 mezoni bo'yicha kritik emas).
  'game.finished': {
    'uz-Latn': () => ({
      subject: `O'yin yakunlandi`,
      body: `Onlayn o'yiningiz yakunlandi. Natijani profilingizda ko'ring.`,
    }),
    'uz-Cyrl': () => ({
      subject: `Ўйин якунланди`,
      body: `Онлайн ўйинингиз якунланди. Натижани профилингизда кўринг.`,
    }),
    ru: () => ({
      subject: `Партия завершена`,
      body: `Ваша онлайн-партия завершена. Результат — в вашем профиле.`,
    }),
    en: () => ({
      subject: `Game finished`,
      body: `Your online game has finished. See the result in your profile.`,
    }),
  },

  // --- Tranzaksion (auth) ----------------------------------------------------
  //  docs/14-roadmap.md Faza 0: "Email tasdiqlash (mailhog orqali dev'da)".
  //  Havola `verifyUrl` payload'da to'liq keladi (APP_URL + token) — shablon
  //  URL yasamaydi, chunki u konfiguratsiyani bilmasligi kerak (sof modul).
  //
  //  ⚠️  Matnda muddat OCHIQ aytiladi: tasdiqlanmagan havola 24 soatdan
  //      keyin ishlamaydi va foydalanuvchi nega ishlamayotganini bilishi
  //      kerak (EMAIL_VERIFY_TTL_SECONDS bilan mos bo'lsin).
  'auth.verify_email': {
    'uz-Latn': (p) => ({
      subject: `Farzin — elektron pochtangizni tasdiqlang`,
      body:
        `Assalomu alaykum!\n\n` +
        `Farzin'da ro'yxatdan o'tganingiz uchun rahmat. Manzilingizni ` +
        `tasdiqlash uchun quyidagi havolaga o'ting:\n\n${s(p, 'verifyUrl')}\n\n` +
        `Havola 24 soat amal qiladi.\n\n` +
        `Agar siz ro'yxatdan o'tmagan bo'lsangiz — bu xatni e'tiborsiz qoldiring.`,
    }),
    'uz-Cyrl': (p) => ({
      subject: `Farzin — электрон почтангизни тасдиқланг`,
      body:
        `Ассалому алайкум!\n\n` +
        `Farzin'да рўйхатдан ўтганингиз учун раҳмат. Манзилингизни ` +
        `тасдиқлаш учун қуйидаги ҳаволага ўтинг:\n\n${s(p, 'verifyUrl')}\n\n` +
        `Ҳавола 24 соат амал қилади.\n\n` +
        `Агар сиз рўйхатдан ўтмаган бўлсангиз — бу хатни эътиборсиз қолдиринг.`,
    }),
    ru: (p) => ({
      subject: `Farzin — подтвердите электронную почту`,
      body:
        `Здравствуйте!\n\n` +
        `Спасибо за регистрацию в Farzin. Чтобы подтвердить адрес, ` +
        `перейдите по ссылке:\n\n${s(p, 'verifyUrl')}\n\n` +
        `Ссылка действительна 24 часа.\n\n` +
        `Если вы не регистрировались — просто проигнорируйте это письмо.`,
    }),
    en: (p) => ({
      subject: `Farzin — confirm your email address`,
      body:
        `Hello,\n\n` +
        `Thanks for signing up to Farzin. Confirm your address by opening ` +
        `this link:\n\n${s(p, 'verifyUrl')}\n\n` +
        `The link is valid for 24 hours.\n\n` +
        `If you did not sign up, simply ignore this email.`,
    }),
  },

  //  docs/10-security.md §7.1: POST /auth/password/forgot.
  //
  //  ⚠️  MATNDA HISOB HAQIDA HECH NARSA AYTILMAYDI. Xat faqat so'rov
  //      bo'lganini bildiradi — "sizda hisob bor" degan tasdiq emas.
  //      Sabab: forgot endpointi mavjud bo'lmagan email uchun ham 204
  //      qaytaradi (user enumeration himoyasi), demak xat matni ham
  //      shu qoidani buzmasligi kerak.
  //
  //  Muddat 1 soat — tasdiqlashdan (24 soat) QISQAROQ, chunki bu token
  //  hisobni to'liq egallash imkonini beradi.
  'auth.password_reset': {
    'uz-Latn': (p) => ({
      subject: `Farzin — parolni tiklash`,
      body:
        `Assalomu alaykum!\n\n` +
        `Farzin hisobingiz uchun parolni tiklash so'raldi. Yangi parol ` +
        `o'rnatish uchun quyidagi havolaga o'ting:\n\n${s(p, 'resetUrl')}\n\n` +
        `Havola 1 soat amal qiladi va faqat BIR MARTA ishlaydi.\n\n` +
        `Agar bu so'rovni siz yubormagan bo'lsangiz — hech narsa qilmang, ` +
        `parolingiz o'zgarmaydi.`,
    }),
    'uz-Cyrl': (p) => ({
      subject: `Farzin — паролни тиклаш`,
      body:
        `Ассалому алайкум!\n\n` +
        `Farzin ҳисобингиз учун паролни тиклаш сўралди. Янги парол ` +
        `ўрнатиш учун қуйидаги ҳаволага ўтинг:\n\n${s(p, 'resetUrl')}\n\n` +
        `Ҳавола 1 соат амал қилади ва фақат БИР МАРТА ишлайди.\n\n` +
        `Агар бу сўровни сиз юбормаган бўлсангиз — ҳеч нарса қилманг, ` +
        `паролингиз ўзгармайди.`,
    }),
    ru: (p) => ({
      subject: `Farzin — восстановление пароля`,
      body:
        `Здравствуйте!\n\n` +
        `Запрошено восстановление пароля для вашей учётной записи Farzin. ` +
        `Чтобы задать новый пароль, перейдите по ссылке:\n\n${s(p, 'resetUrl')}\n\n` +
        `Ссылка действительна 1 час и срабатывает ТОЛЬКО ОДИН РАЗ.\n\n` +
        `Если запрос отправляли не вы — ничего не делайте, пароль ` +
        `останется прежним.`,
    }),
    en: (p) => ({
      subject: `Farzin — password reset`,
      body:
        `Hello,\n\n` +
        `A password reset was requested for your Farzin account. Set a new ` +
        `password using this link:\n\n${s(p, 'resetUrl')}\n\n` +
        `The link is valid for 1 hour and works ONLY ONCE.\n\n` +
        `If you did not request this, do nothing — your password stays ` +
        `unchanged.`,
    }),
  },
};

/** User.locale (erkin string) → qo'llab-quvvatlanadigan til; boshqa → uz-Latn. */
export function normalizeLocale(locale: string): NotificationLocale {
  return (NOTIFICATION_LOCALES as readonly string[]).includes(locale)
    ? (locale as NotificationLocale)
    : DEFAULT_NOTIFICATION_LOCALE;
}

function isTemplateKey(key: string): key is TemplateKey {
  return Object.hasOwn(TEMPLATES, key);
}

/**
 * Render — noma'lum kalit uchun null (chaqiruvchi hal qiladi), noma'lum
 * til uz-Latn'ga tushadi. Render funksiyalari sof va throw qilmaydi.
 */
export function renderTemplate(
  templateKey: string,
  locale: string,
  payload: Record<string, unknown>,
): RenderedTemplate | null {
  if (!isTemplateKey(templateKey)) {
    return null;
  }
  const table = TEMPLATES[templateKey];
  return table[normalizeLocale(locale)](payload);
}
