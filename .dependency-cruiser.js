/**
 * FARZIN — arxitektura chegaralari.
 *
 * Bu fayl ADR-0001 (modular monolith) ni MAJBURLAYDI.
 * Modul chegarasi niyat bilan emas, CI bilan saqlanadi.
 *
 * `pnpm arch:check` — CI'da har PR'da ishlaydi.
 * Bu job yiqilsa — chegara buzilgan, PR merge qilinmaydi.
 *
 * Batafsil: docs/adr/0001-modular-monolith.md
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // -----------------------------------------------------------------------
    //  ENG MUHIM QOIDA
    //  core/ — sof domen mantiqi: pairing engine, Glicko-2, chess rules.
    //  U NestJS'ni ham, Prisma'ni ham, HTTP'ni ham BILMAYDI.
    //
    //  Sabab: bu kod eng qimmatli va eng uzoq yashaydi. Uni ORM
    //  almashgani uchun qayta yozish ahmoqlik. Va uni test qilish
    //  uchun DB ko'tarish shart emas.
    // -----------------------------------------------------------------------
    {
      name: 'core-must-stay-pure',
      severity: 'error',
      comment:
        "core/ sof TypeScript bo'lishi shart — framework va infratuzilma bog'liqligi yo'q. " +
        'docs/02-architecture.md §4',
      from: { path: '^src/core' },
      to: {
        path: [
          '^src/modules',
          '^src/shared/infrastructure',
          'node_modules/@nestjs',
          'node_modules/@prisma',
          'node_modules/prisma',
          'node_modules/express',
          'node_modules/socket.io',
          'node_modules/bullmq',
          'node_modules/ioredis',
        ],
      },
    },

    // -----------------------------------------------------------------------
    //  Modul boshqa modulning ICHIGA kira olmaydi.
    //  Faqat public port (*.port.ts) va public tiplar orqali.
    // -----------------------------------------------------------------------
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        "Modul boshqa modulning ichki kodiga murojaat qilmaydi. Faqat *.port.ts orqali. " +
        'docs/02-architecture.md §6.1',
      from: { path: '^src/modules/([^/]+)/.+' },
      to: {
        path: '^src/modules/([^/]+)/.+',
        pathNot: [
          // O'z moduli ichida — ruxsat
          '^src/modules/$1/.+',
          // Boshqa modulning public porti — ruxsat
          '^src/modules/[^/]+/[^/]+\\.port\\.ts$',
          // Boshqa modulning public tiplari — ruxsat
          '^src/modules/[^/]+/[^/]+\\.types\\.ts$',
          // Boshqa modulning module fayli (import uchun) — ruxsat
          '^src/modules/[^/]+/[^/]+\\.module\\.ts$',
        ],
      },
    },

    // -----------------------------------------------------------------------
    //  Domen qatlami HTTP haqida bilmaydi.
    // -----------------------------------------------------------------------
    {
      name: 'domain-knows-no-http',
      severity: 'error',
      comment:
        "Domen qatlami (domain/) HTTP, WebSocket yoki queue haqida bilmaydi. " +
        'docs/02-architecture.md §4',
      from: { path: 'domain/.+\\.ts$' },
      to: {
        path: [
          'node_modules/express',
          'node_modules/socket.io',
          '\\.controller\\.ts$',
          '\\.gateway\\.ts$',
        ],
      },
    },

    // -----------------------------------------------------------------------
    //  Prisma faqat infratuzilma qatlamida.
    //  Service to'g'ridan-to'g'ri Prisma ishlatmaydi — repository orqali.
    // -----------------------------------------------------------------------
    {
      name: 'prisma-only-in-infrastructure',
      severity: 'error',
      comment:
        "PrismaClient faqat repository/infrastructure qatlamida. " +
        "Service repository interfeysini ishlatadi. docs/02-architecture.md §4",
      from: {
        path: '^src/modules/[^/]+/.+',
        pathNot: [
          '\\.repository\\.ts$',
          'infrastructure/',
          '\\.module\\.ts$',
        ],
      },
      to: { path: 'node_modules/@prisma/client' },
    },

    // --- Umumiy sog'liq qoidalari -------------------------------------------
    {
      name: 'no-circular',
      severity: 'error',
      comment: "Aylanma bog'liqlik — dizayn muammosi alomati",
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Hech kim ishlatmaydigan fayl — o\'chirilishi kerakmi?',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$',
          '(^|/)tsconfig\\.json$',
          '(^|/)(main|worker)\\.ts$',
        ],
      },
      to: {},
    },
    {
      name: 'no-deprecated-core',
      severity: 'error',
      comment: "Node.js'ning eskirgan moduli",
      from: {},
      to: { dependencyTypes: ['core'], path: '^(punycode|domain|sys)$' },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Prod kodi devDependency ishlatmaydi',
      from: { path: '^src', pathNot: '\\.(spec|test)\\.ts$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'no-test-in-prod',
      severity: 'error',
      comment: 'Prod kodi test kodini import qilmaydi',
      from: { path: '^src', pathNot: '\\.(spec|test)\\.ts$' },
      to: { path: '(\\.(spec|test)\\.ts$|^test/)' },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.(spec|test)\\.ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['main', 'types'],
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/(?:@[^/]+/[^/]+|[^/]+)' },
      archi: {
        collapsePattern:
          '^(?:src/core|src/modules/[^/]+|src/shared/[^/]+|node_modules/(?:@[^/]+/[^/]+|[^/]+))',
      },
    },
  },
};
