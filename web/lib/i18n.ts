/**
 * Ko'p tillilik.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA KUTUBXONA EMAS, O'Z LUG'ATIMIZ
 *
 *  Ilova kichik (10 route) va matnlar soni yuzlab emas, o'nlab.
 *  `next-intl` kabi kutubxona URL prefiksli marshrutlashni (`/ru/...`)
 *  olib keladi — bu butun `app/` ni qayta tuzishni talab qiladi va
 *  mavjud havolalarni buzadi. Bu yerda cookie asosidagi yechim yetarli.
 *
 *  ⚠️  MA'LUM CHEKLOV — SEO. Cookie bilan Google faqat BITTA versiyani
 *      indekslaydi. docs/14-roadmap.md Faza 1 turnir kalendari uchun SEO
 *      ni tilga oladi, ya'ni ommaviy qism o'sganda URL prefiksli
 *      lokalizatsiyaga (`/uz`, `/ru`, ...) o'tish kerak bo'ladi. Bu
 *      ONGLI kechiktirish, unutilgan narsa emas.
 *
 *  Lug'at TO'LIQLIGI testda majburlanadi (i18n.spec.ts): har kalit har
 *  tilda bo'lishi shart — backend'dagi notification `templates.spec.ts`
 *  bilan bir xil naqsh.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Tarjimalar dizayn tizimidagi LOCALES jadvalidan olingan (Turnirlar →
 *  Турнирлар → Турниры → Tournaments) — ular kanonik, o'ylab topilmagan.
 */

export const LOCALES = ['uz-Latn', 'uz-Cyrl', 'ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'uz-Latn';

/** Til almashtirgichdagi yorliqlar — HAR DOIM o'z tilida yoziladi. */
export const LOCALE_LABEL: Record<Locale, string> = {
  'uz-Latn': "O'zbekcha",
  'uz-Cyrl': 'Ўзбекча',
  ru: 'Русский',
  en: 'English',
};

/** Cookie nomi — server komponentlari shundan tilni o'qiydi. */
export const LOCALE_COOKIE = 'farzin_locale';

/**
 * Lug'at.
 *
 * Kalitlar `bo'lim.nom` ko'rinishida — matnning O'ZI kalit sifatida
 * ishlatilmaydi: matn o'zgarsa kalit ham o'zgarib, boshqa tillar
 * jimgina eskirib qolardi.
 */
const DICTIONARY = {
  'nav.tournaments': {
    'uz-Latn': 'Turnirlar',
    'uz-Cyrl': 'Турнирлар',
    ru: 'Турниры',
    en: 'Tournaments',
  },
  'nav.play': {
    'uz-Latn': "O'ynash",
    'uz-Cyrl': 'Ўйнаш',
    ru: 'Играть',
    en: 'Play',
  },
  'nav.ratings': {
    'uz-Latn': 'Reyting',
    'uz-Cyrl': 'Рейтинг',
    ru: 'Рейтинг',
    en: 'Ratings',
  },
  'nav.console': {
    'uz-Latn': 'Konsol',
    'uz-Cyrl': 'Консол',
    ru: 'Консоль',
    en: 'Console',
  },

  'home.title': {
    'uz-Latn': "O'zbekiston shaxmatining raqamli infratuzilmasi",
    'uz-Cyrl': 'Ўзбекистон шахматининг рақамли инфратузилмаси',
    ru: 'Цифровая инфраструктура шахмат Узбекистана',
    en: 'The digital chess infrastructure of Uzbekistan',
  },
  'home.subtitle': {
    'uz-Latn':
      "Turnir kalendari, jonli jadval va milliy Glicko-2 reyting — ochiq va tekshirib bo'ladigan ma'lumot.",
    'uz-Cyrl':
      'Турнир календари, жонли жадвал ва миллий Glicko-2 рейтинг — очиқ ва текшириб бўладиган маълумот.',
    ru: 'Календарь турниров, живая таблица и национальный рейтинг Glicko-2 — открытые и проверяемые данные.',
    en: 'Tournament calendar, live standings and the national Glicko-2 rating — open, auditable data.',
  },
  'home.now': { 'uz-Latn': 'Hozir', 'uz-Cyrl': 'Ҳозир', ru: 'Сейчас', en: 'Now' },
  'home.noActive': {
    'uz-Latn': "Ayni paytda faol turnir yo'q.",
    'uz-Cyrl': 'Айни пайтда фаол турнир йўқ.',
    ru: 'Сейчас нет активных турниров.',
    en: 'No active tournaments right now.',
  },
  'home.tournamentsCard': {
    'uz-Latn': 'Kalendar, ishtirokchilar, tur-ma-tur jadval va tie-break.',
    'uz-Cyrl': 'Календар, иштирокчилар, тур-ма-тур жадвал ва tie-break.',
    ru: 'Календарь, участники, таблица по турам и тай-брейки.',
    en: 'Calendar, participants, round-by-round standings and tie-breaks.',
  },
  'home.ratingsCard': {
    'uz-Latn': "Glicko-2. Reyting ishonch oralig'i (RD) bilan birga ko'rsatiladi.",
    'uz-Cyrl': 'Glicko-2. Рейтинг ишонч оралиғи (RD) билан бирга кўрсатилади.',
    ru: 'Glicko-2. Рейтинг показывается вместе с доверительным интервалом (RD).',
    en: 'Glicko-2. Ratings are shown together with their deviation (RD).',
  },

  'tournaments.title': {
    'uz-Latn': 'Turnirlar',
    'uz-Cyrl': 'Турнирлар',
    ru: 'Турниры',
    en: 'Tournaments',
  },
  'tournaments.subtitle': {
    'uz-Latn':
      "Ommaviy kalendar. Turnirni ochib ishtirokchilar ro'yxati va jonli jadvalni ko'ring.",
    'uz-Cyrl': 'Оммавий календар. Турнирни очиб иштирокчилар рўйхати ва жонли жадвални кўринг.',
    ru: 'Публичный календарь. Откройте турнир, чтобы увидеть участников и живую таблицу.',
    en: 'Public calendar. Open a tournament to see participants and live standings.',
  },
  'tournaments.empty': {
    'uz-Latn': "Hozircha turnir yo'q",
    'uz-Cyrl': 'Ҳозирча турнир йўқ',
    ru: 'Пока нет турниров',
    en: 'No tournaments yet',
  },
  'tournaments.emptyHint': {
    'uz-Latn': "Tashkilotchilar turnir e'lon qilgach, u shu yerda ko'rinadi.",
    'uz-Cyrl': 'Ташкилотчилар турнир эълон қилгач, у шу ерда кўринади.',
    ru: 'Как только организаторы объявят турнир, он появится здесь.',
    en: 'Once organisers announce a tournament, it will appear here.',
  },
  'tournaments.nationallyRated': {
    'uz-Latn': 'Milliy reytingga hisoblanadi',
    'uz-Cyrl': 'Миллий рейтингга ҳисобланади',
    ru: 'Идёт в национальный рейтинг',
    en: 'Counts toward the national rating',
  },

  'ratings.title': {
    'uz-Latn': 'Milliy reyting',
    'uz-Cyrl': 'Миллий рейтинг',
    ru: 'Национальный рейтинг',
    en: 'National rating',
  },
  'ratings.subtitle': {
    'uz-Latn':
      "Glicko-2, klassik vaqt nazorati, taxta ortidagi (OTB) o'yinlar. Reyting ishonch oralig'i (RD) bilan birga beriladi — bu son emas, taqsimot.",
    'uz-Cyrl':
      'Glicko-2, классик вақт назорати, тахта ортидаги (OTB) ўйинлар. Рейтинг ишонч оралиғи (RD) билан бирга берилади — бу сон эмас, тақсимот.',
    ru: 'Glicko-2, классический контроль, игры за доской (OTB). Рейтинг даётся вместе с RD — это не число, а распределение.',
    en: 'Glicko-2, classical time control, over-the-board games. The rating comes with its deviation — it is a distribution, not a point.',
  },
  'ratings.empty': {
    'uz-Latn': "Ro'yxat hozircha bo'sh",
    'uz-Cyrl': 'Рўйхат ҳозирча бўш',
    ru: 'Список пока пуст',
    en: 'The list is empty for now',
  },
  'ratings.emptyHint': {
    'uz-Latn':
      "Reytingga faqat yetarli o'yin o'ynagan (established) o'yinchilar kiradi. Boshlang'ich davrda RD yuqori bo'ladi va o'yinchi ro'yxatda ko'rinmaydi.",
    'uz-Cyrl':
      'Рейтингга фақат етарли ўйин ўйнаган (established) ўйинчилар киради. Бошланғич даврда RD юқори бўлади ва ўйинчи рўйхатда кўринмайди.',
    ru: 'В рейтинг попадают только игроки с устоявшимся (established) рейтингом. В начале RD высок, и игрок в списке не показывается.',
    en: 'Only players with an established rating appear. Early on the deviation is high and the player stays out of the list.',
  },

  'table.player': {
    'uz-Latn': "O'yinchi",
    'uz-Cyrl': 'Ўйинчи',
    ru: 'Игрок',
    en: 'Player',
  },
  'table.date': { 'uz-Latn': 'Sana', 'uz-Cyrl': 'Сана', ru: 'Даты', en: 'Dates' },
  'table.venue': { 'uz-Latn': 'Joy', 'uz-Cyrl': 'Жой', ru: 'Место', en: 'Venue' },
  'table.entryFee': {
    'uz-Latn': 'Start puli',
    'uz-Cyrl': 'Старт пули',
    ru: 'Взнос',
    en: 'Entry fee',
  },
  'table.status': { 'uz-Latn': 'Holat', 'uz-Cyrl': 'Ҳолат', ru: 'Статус', en: 'Status' },
  'table.points': { 'uz-Latn': 'Ochko', 'uz-Cyrl': 'Очко', ru: 'Очки', en: 'Points' },
  'table.games': { 'uz-Latn': "O'yin", 'uz-Cyrl': 'Ўйин', ru: 'Партии', en: 'Games' },
  'table.rating': { 'uz-Latn': 'Reyting', 'uz-Cyrl': 'Рейтинг', ru: 'Рейтинг', en: 'Rating' },
  'table.tournament': {
    'uz-Latn': 'Turnir',
    'uz-Cyrl': 'Турнир',
    ru: 'Турнир',
    en: 'Tournament',
  },

  'error.title': {
    'uz-Latn': "Ma'lumotni olishning iloji bo'lmadi",
    'uz-Cyrl': 'Маълумотни олишнинг иложи бўлмади',
    ru: 'Не удалось получить данные',
    en: 'Could not load the data',
  },

  'footer.note': {
    'uz-Latn': "Ommaviy ma'lumotlar · Hakam konsoli va onlayn o'yin ishlab chiqilmoqda",
    'uz-Cyrl': 'Оммавий маълумотлар · Ҳакам консоли ва онлайн ўйин ишлаб чиқилмоқда',
    ru: 'Открытые данные · Консоль судьи и онлайн-игра в разработке',
    en: 'Open data · Arbiter console and online play in development',
  },
} as const satisfies Record<string, Record<Locale, string>>;

export type MessageKey = keyof typeof DICTIONARY;

/** Barcha kalitlar — test va to'liqlik tekshiruvi uchun. */
export const MESSAGE_KEYS = Object.keys(DICTIONARY) as MessageKey[];

/** Noma'lum qiymatni qo'llab-quvvatlanadigan tilga keltirish. */
export function normalizeLocale(value: string | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? '')
    ? (value as Locale)
    : DEFAULT_LOCALE;
}

/** Tarjima. Kalit lug'atda bo'lishi TIP darajasida majburlanadi. */
export function translate(locale: Locale, key: MessageKey): string {
  return DICTIONARY[key][locale];
}

/*
 * ⚠️  SERVER QISMI BU YERDA EMAS — `i18n.server.ts` da.
 *
 *     Sabab: `next/headers` FAQAT server komponentida ishlaydi, bu fayl
 *     esa til almashtirgich (klient komponenti) tomonidan ham import
 *     qilinadi. Ikkalasi bir faylda bo'lsa build YIQILADI:
 *     "You're importing a component that needs next/headers".
 */
