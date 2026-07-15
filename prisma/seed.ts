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
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

  // --- TODO(Faza 0): quyidagilar IdentityModule tayyor bo'lgach ------------
  //
  //  - Har rol uchun test hisobi (SUPER_ADMIN, ARBITER, CLUB_ADMIN, PLAYER...)
  //    ⚠️  Parollar Argon2id bilan hash qilinadi (ADR-0004).
  //    ⚠️  Test paroli faqat dev uchun — prod seed'da HECH QACHON hisob yaratilmaydi.
  //
  //  - ~50 test o'yinchisi, turli reyting va yosh toifasi
  //  - 3 ta test klubi
  //  - 1 ta tugagan turnir (to'liq natijalar bilan) — pairing/rating testi uchun
  //  - 1 ta ochiq turnir (ro'yxat ochiq)
  //
  //  docs/03-data-model.md §8

  console.log('Seed tugadi.');
}

main()
  .catch((e: unknown) => {
    console.error('Seed xatosi:', e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
