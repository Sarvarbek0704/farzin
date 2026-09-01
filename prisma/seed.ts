/**
 * Dev muhit uchun boshlang'ich ma'lumot.
 *
 * ⚠️  IDEMPOTENT bo'lishi shart — `upsert` ishlatiladi.
 *     Ikki marta ishga tushirilsa dublikat yaratmasligi kerak.
 *
 * Ishga tushirish: pnpm db:seed
 *
 * @see docs/03-data-model.md §8
 */
import {
  ClockType,
  PairingSystem,
  PrismaClient,
  Role,
  TimeCategory,
  TournamentStatus,
  UserStatus,
} from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();

/**
 * ⚠️  DEV PAROLI — HAMMAGA MA'LUM VA SHUNDAY BO'LISHI KERAK.
 *
 *  Bu sir emas: yangi dasturchi `docker compose up` dan keyin darhol
 *  kira olishi uchun. Prod'da seed'ning hisob yaratadigan qismi umuman
 *  ishlamaydi (main() ichidagi NODE_ENV qorovuli).
 *
 *  Uzunlik ≥ 8 — RegisterDto siyosati bilan bir xil.
 */
const DEV_PASSWORD = 'farzin-dev-2026';
const ADMIN_EMAIL = 'admin@farzin.local';
const DEMO_SLUG = 'farzin-demo-turniri';

/**
 * Argon2 parametrlari config default'lari bilan bir xil
 * (configuration.ts ARGON2_*): seed'dagi hash login paytida qayta
 * hash'lanmasin (`needsRehash`).
 */
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** Demo o'yinchilar — TOQ son (5), har turda aynan bitta bye chiqadi. */
const DEMO_PLAYERS: readonly (readonly [string, string])[] = [
  ['Nodirbek', 'Abdusattorov'],
  ['Javokhir', 'Sindarov'],
  ['Jakhongir', 'Vakhidov'],
  ['Shamsiddin', 'Vokhidov'],
  ['Ortik', 'Nigmatov'],
];

/**
 * O'zbekiston ma'muriy-hududiy birliklari: 12 viloyat + Toshkent shahri
 * + Qoraqalpog'iston Respublikasi = 14.
 *
 * ⚠️  SOATO kodlari bu yerda ATAYLAB yozilmagan — ular rasmiy
 *     klassifikatordan olinishi kerak. Taxminiy kod yozish
 *     keyinchalik ma'lumot integratsiyasini buzadi.
 *     docs/03-data-model.md §9
 */
const REGIONS = [
  "Qoraqalpog'iston Respublikasi",
  'Andijon viloyati',
  'Buxoro viloyati',
  "Farg'ona viloyati",
  'Jizzax viloyati',
  'Xorazm viloyati',
  'Namangan viloyati',
  'Navoiy viloyati',
  'Qashqadaryo viloyati',
  'Samarqand viloyati',
  'Sirdaryo viloyati',
  'Surxondaryo viloyati',
  'Toshkent viloyati',
  'Toshkent shahri',
] as const;

async function main(): Promise<void> {
  console.log('Seed boshlandi...');

  // --- Federatsiya --------------------------------------------------------
  const federation = await prisma.federation.upsert({
    where: { countryCode: 'UZB' },
    update: {},
    create: {
      name: "O'zbekiston Shaxmat Federatsiyasi",
      shortName: 'UzChess',
      countryCode: 'UZB',
    },
  });
  console.log(`  Federatsiya: ${federation.shortName}`);

  // --- Viloyatlar ---------------------------------------------------------
  for (const name of REGIONS) {
    await prisma.region.upsert({
      // soatoCode hali yo'q — nom bo'yicha topamiz.
      // TODO: SOATO kodlari qo'shilgandan keyin `where: { soatoCode }` ga o'tish.
      where: {
        id:
          (await prisma.region.findFirst({ where: { name } }))?.id ??
          '00000000-0000-0000-0000-000000000000',
      },
      update: {},
      create: { name, federationId: federation.id },
    });
  }
  console.log(`  Viloyatlar: ${String(REGIONS.length)} ta`);

  // --- Dev hisoblari ------------------------------------------------------
  //
  //  ⚠️  PROD'DA HECH QACHON ISHLAMAYDI — quyidagi qorovul buni majburlaydi.
  //      Seed sirlarsiz hisob yaratadi va parol hammaga ma'lum.
  if (process.env.NODE_ENV === 'production') {
    console.log('  Dev hisoblari O`TKAZIB YUBORILDI (NODE_ENV=production)');
    console.log('Seed tugadi.');
    return;
  }

  const admin = await upsertUser({
    email: ADMIN_EMAIL,
    firstName: 'Bosh',
    lastName: 'Administrator',
    role: Role.SUPER_ADMIN,
  });
  console.log(`  Admin: ${ADMIN_EMAIL} / ${DEV_PASSWORD}`);

  const players = [];
  for (const [index, name] of DEMO_PLAYERS.entries()) {
    players.push(
      await upsertUser({
        email: `oyinchi${String(index + 1)}@farzin.local`,
        firstName: name[0],
        lastName: name[1],
        role: Role.PLAYER,
      }),
    );
  }
  console.log(`  O'yinchilar: ${String(players.length)} ta (parol: ${DEV_PASSWORD})`);

  // --- Demo turnir: TOQ sonli Swiss, ro'yxat ochiq ------------------------
  //
  //  Nega TOQ (5): har turda aynan bitta bye chiqadi, ya'ni yangi
  //  dasturchi darhol bye va float xulqini ko'radi (FIDE C.04.3 1.4.3).
  const tournament = await prisma.tournament.upsert({
    where: { slug: DEMO_SLUG },
    update: {},
    create: {
      name: 'Farzin demo turniri',
      slug: DEMO_SLUG,
      description:
        "Seed yaratgan namunaviy turnir. Ro'yxat OCHIQ — hakam paneli va " +
        'juftlashtirishni sinash uchun.',
      federationId: federation.id,
      organizerId: admin.id,
      status: TournamentStatus.REGISTRATION_OPEN,
      startDate: daysFromNow(7),
      endDate: daysFromNow(9),
      venueName: 'Toshkent shaxmat markazi',
      isPublic: true,
    },
  });

  const section = await prisma.tournamentSection.upsert({
    where: { tournamentId_name: { tournamentId: tournament.id, name: 'A' } },
    update: {},
    create: {
      tournamentId: tournament.id,
      name: 'A',
      pairingSystem: PairingSystem.SWISS_DUTCH,
      timeCategory: TimeCategory.CLASSICAL,
      totalRounds: 5,
      clockType: ClockType.FISCHER_INCREMENT,
      baseTimeSeconds: 5400,
      incrementSeconds: 30,
    },
  });

  for (const player of players) {
    const profile = await prisma.player.findUniqueOrThrow({ where: { userId: player.id } });
    await prisma.registration.upsert({
      where: { sectionId_playerId: { sectionId: section.id, playerId: profile.id } },
      update: {},
      create: { sectionId: section.id, playerId: profile.id, isConfirmed: true },
    });
  }
  console.log(
    `  Demo turnir: /${DEMO_SLUG} (A seksiyasi, 5 tur, ${String(players.length)} ishtirokchi)`,
  );

  console.log('Seed tugadi.');
  console.log('');
  console.log('  Kirish:  POST /api/v1/auth/login');
  console.log(`           { "email": "${ADMIN_EMAIL}", "password": "${DEV_PASSWORD}" }`);
}

/**
 * Foydalanuvchi + Player profili + rol — idempotent.
 *
 * Parol Argon2id bilan hash qilinadi (ADR-0004) — seed'da ham xom parol
 * saqlanmaydi. `emailVerified: true`: dev'da tasdiqlash halqasidan
 * o'tishga majburlash foydasiz ishqalanish.
 */
async function upsertUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}): Promise<{ id: string }> {
  const passwordHash = await hash(DEV_PASSWORD, ARGON2_OPTIONS);

  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {},
    create: {
      email: input.email,
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      locale: 'uz-Latn',
      player: { create: { firstName: input.firstName, lastName: input.lastName } },
    },
  });

  // Rol alohida: `@@unique([userId, role, scopeType, scopeId])` bo'yicha
  // upsert qilib bo'lmaydi (NULL scope teng deb qaralmaydi).
  const existingRole = await prisma.userRole.findFirst({
    where: { userId: user.id, role: input.role, scopeType: null, scopeId: null },
  });
  if (existingRole === null) {
    await prisma.userRole.create({ data: { userId: user.id, role: input.role } });
  }

  return user;
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

main()
  .catch((e: unknown) => {
    console.error('Seed xatosi:', e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
