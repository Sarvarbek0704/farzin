import { notFound } from 'next/navigation';

import { ApiError, getGame } from '@/lib/api';
import { TIME_CATEGORY_LABEL, formatTimeControl } from '@/lib/format';
import { LiveGame } from './live-game';
import { BackLink, PageHeader } from '@/components/ui';

/**
 * O'yin ko'rinishi — TOMOSHABIN uchun, ommaviy.
 *
 * Server komponenti boshlang'ich holatni beradi — birinchi chizish tez
 * bo'lsin va sahifa JavaScript'siz ham mazmunli bo'lsin. Keyin
 * `LiveGame` (klient) Socket.IO bilan jonli holatga o'tadi.
 *
 * ⚠️  Bu yo'l TOMOSHABIN sifatida ulanadi (token yo'q): taxta yangilanadi,
 *     lekin yurish qilinmaydi. O'ynash uchun o'yinchi tokeni kerak —
 *     live-game.tsx dagi `token` propi.
 */

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Davom etmoqda',
  CHECKMATE: 'Mat',
  RESIGNATION: 'Taslim',
  TIMEOUT: 'Vaqt tugadi',
  TIMEOUT_VS_INSUFFICIENT_MATERIAL: "Vaqt tugadi — material yetarli emas (durang)",
  DRAW_AGREED: 'Kelishuv bilan durang',
  STALEMATE: 'Pat',
  THREEFOLD_REPETITION: 'Uch marta takror',
  FIFTY_MOVE_RULE: '50 yurish qoidasi',
  INSUFFICIENT_MATERIAL: 'Material yetarli emas',
  ABORTED: 'Bekor qilindi',
  ABANDONED: "Tashlab ketildi",
};

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const game = await getGame(id).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) {
      notFound();
    }
    throw e;
  });

  return (
    <>
      <BackLink href="/turnirlar">Turnirlar</BackLink>

      <PageHeader title="O'yin">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <span className={game.status === 'ACTIVE' ? 'badge badge-live' : 'badge'}>
            {STATUS_LABEL[game.status] ?? game.status}
          </span>
          <span className="badge">
            {TIME_CATEGORY_LABEL[game.timeCategory] ?? game.timeCategory}{' '}
            {formatTimeControl(game.baseTimeSeconds, game.incrementSeconds)}
          </span>
          {game.isRated && <span className="badge">Reytingli</span>}
        </div>
      </PageHeader>

      {/*
        Server komponenti boshlang'ich holatni beradi (SEO va tez
        birinchi chizish), keyin klient Socket.IO bilan JONLI holatga
        o'tadi. Token yo'q — tomoshabin: taxta faqat ko'rish uchun.
      */}
      <LiveGame initial={game} token={null} />

      <p className="muted small" style={{ marginTop: 24 }}>
        Tomoshabin ko`rinishi: taxta jonli yangilanadi, lekin yurish qilish uchun
        o`yinchi sifatida kirish kerak.
      </p>
    </>
  );
}
