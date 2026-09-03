-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

-- CreateTable
CREATE TABLE "friendships" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "addressee_id" UUID NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "blocked_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "friendships_requester_id_status_idx" ON "friendships"("requester_id", "status");

-- CreateIndex
CREATE INDEX "friendships_addressee_id_status_idx" ON "friendships"("addressee_id", "status");

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────
--  QO'LDA QO'SHILGAN CHEKLOVLAR (Prisma sxemasida ifodalab bo'lmaydi)
-- ─────────────────────────────────────────────────────────────────────

-- 1. TARTIBLANGAN JUFTLIK bo'yicha unikallik.
--    Oddiy UNIQUE(requester, addressee) yetarli emas: A→B va B→A
--    ikkita alohida qator bo'lib qolardi va ikkalasi ham "kutilmoqda"
--    holatida turardi. LEAST/GREATEST juftlikni tartibga soladi, ya'ni
--    yo'nalishdan qat'i nazar BITTA qator bo'ladi.
CREATE UNIQUE INDEX "friendships_pair_unique"
  ON "friendships" (LEAST("requester_id", "addressee_id"), GREATEST("requester_id", "addressee_id"));

-- 2. O'ZIGA O'ZI do'st bo'lolmaydi.
ALTER TABLE "friendships"
  ADD CONSTRAINT "friendships_not_self" CHECK ("requester_id" <> "addressee_id");

-- 3. BLOCKED holatida kim bloklagani MAJBURIY, boshqa holatlarda esa
--    bo'sh bo'lishi shart — aks holda "kim blokdan chiqara oladi?"
--    savoli javobsiz qolardi.
ALTER TABLE "friendships"
  ADD CONSTRAINT "friendships_blocked_by_consistent" CHECK (
    ("status" = 'BLOCKED' AND "blocked_by_id" IS NOT NULL)
    OR ("status" <> 'BLOCKED' AND "blocked_by_id" IS NULL)
  );

-- 4. Bloklagan odam juftlikning A'ZOSI bo'lishi kerak.
ALTER TABLE "friendships"
  ADD CONSTRAINT "friendships_blocked_by_member" CHECK (
    "blocked_by_id" IS NULL
    OR "blocked_by_id" IN ("requester_id", "addressee_id")
  );

-- 5. ACCEPTED bo'lsa qabul sanasi bo'lishi shart.
ALTER TABLE "friendships"
  ADD CONSTRAINT "friendships_accepted_at_consistent" CHECK (
    ("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL)
    OR ("status" <> 'ACCEPTED' AND "accepted_at" IS NULL)
  );
