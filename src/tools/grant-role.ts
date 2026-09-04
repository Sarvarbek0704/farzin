import { PrismaClient, type Role } from '@prisma/client';

/**
 * BIRINCHI SUPERADMINNI TAYINLASH — deploy uchun zaruriy vosita.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  TOVUQ VA TUXUM MUAMMOSI
 *
 *  Rol berish uchun SUPER_ADMIN kerak (`/admin/users/:id/roles`), lekin
 *  toza bazada birorta superadmin yo'q. Seed faqat DEV uchun
 *  (`prisma/seed.ts` demo ma'lumot bilan keladi) va production'da
 *  ishlatilmaydi.
 *
 *  Shu tugun aynan shu yerda kesiladi va FAQAT shu yerda: bu yagona
 *  kod yo'li bo'lib, u serverga kira oladigan odamdan boshqa hech kimga
 *  ochiq emas.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  NEGA PAROL SO'RAMAYDI
 *
 *  Vosita foydalanuvchi YARATMAYDI — mavjudini ko'taradi. Ya'ni siz
 *  avval ilovada odatdagidek ro'yxatdan o'tasiz, keyin serverda shu
 *  buyruqni bajarasiz. Sabab: parolni env yoki buyruq satriga qo'yish
 *  uni shell tarixiga, `ps` chiqishiga va konteyner inspeksiyasiga
 *  chiqarardi.
 *
 *  Ishga tushirish (konteyner ichida):
 *
 *    node dist/tools/grant-role.js <email> [ROL]
 *    node dist/tools/grant-role.js admin@farzin.uz SUPER_ADMIN
 *
 *  ROL berilmasa — SUPER_ADMIN. Amal IDEMPOTENT: rol allaqachon
 *  bo'lsa hech narsa o'zgarmaydi.
 *
 *  ⚠️  AUDIT: yozuv `actorUserId: null` bilan tushadi — bu TIZIM
 *      harakati, chunki uni odam UI orqali qilmagan. Audit jadvalidagi
 *      `reason` esa buyruq ekanini aytadi.
 */

const DEFAULT_ROLE: Role = 'SUPER_ADMIN';

async function main(): Promise<void> {
  const [email, roleArg] = process.argv.slice(2);

  if (email === undefined || email.trim() === '') {
    console.error('Foydalanish: node dist/tools/grant-role.js <email> [ROL]');
    process.exit(2);
  }

  const role = (roleArg ?? DEFAULT_ROLE) as Role;

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), deletedAt: null },
      select: { id: true, email: true, status: true },
    });

    if (user === null) {
      console.error(
        `Foydalanuvchi topilmadi: ${email}\n` +
          'Avval ilovada ro`yxatdan o`ting, keyin shu buyruqni takrorlang.',
      );
      process.exit(1);
    }

    // Rol GLOBAL beriladi (scopeType = null): superadmin butun
    // platforma bo'yicha ishlaydi.
    const existing = await prisma.userRole.findFirst({
      where: { userId: user.id, role, scopeType: null, scopeId: null },
    });

    if (existing !== null) {
      console.log(`Rol allaqachon bor: ${email} → ${role}. Hech narsa o'zgarmadi.`);
      return;
    }

    await prisma.$transaction(async (tx) => {
      const created = await tx.userRole.create({
        data: { userId: user.id, role, scopeType: null, scopeId: null },
      });
      // Audit — `AuditService` siz, chunki bu Nest konteksti tashqarisi.
      // Shakl AYNAN o'sha: keyinchalik `/admin/audit-logs` da ko'rinadi.
      await tx.auditLog.create({
        data: {
          action: 'role.granted',
          actorUserId: null,
          resourceType: 'UserRole',
          resourceId: created.id,
          after: {
            userId: user.id,
            role,
            scopeType: null,
            scopeId: null,
            reason: 'Serverda grant-role vositasi bilan berildi (bootstrap)',
          },
        },
      });
    });

    // Foydalanuvchi ALLAQACHON kirgan bo'lsa, uning authz keshi
    // (60s TTL) eski rollarni saqlab turadi. Bu yerdan Redis'ga
    // ulanmaymiz — bir daqiqa kutish yetarli va ortiqcha bog'liqlik
    // kiritmaydi.
    console.log(
      `Berildi: ${email} → ${role} (global).\n` +
        "Agar hozir kirgan bo'lsangiz — 1 daqiqadan keyin kuchga kiradi (authz keshi).",
    );

    if (user.status !== 'ACTIVE') {
      console.warn(
        `⚠️  Hisob holati: ${user.status}. Kirish uchun u ACTIVE bo'lishi kerak ` +
          '(emailni tasdiqlang).',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e: unknown) => {
  console.error(`Xato: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
