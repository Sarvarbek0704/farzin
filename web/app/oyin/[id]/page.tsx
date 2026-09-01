import { notFound } from 'next/navigation';

import { ApiError, getGame } from '@/lib/api';
import { TIME_CATEGORY_LABEL, formatTimeControl } from '@/lib/format';
import { GameClient } from './game-client';
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
      <BackLink href="/oyin">O&apos;yinlar</BackLink>

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
        o'tadi.

        Token `GameClient` ichida aniqlanadi: o'yinchi shu URL bilan
        kelsa yurish qila oladi. Ilgari bu yerda `token={null}`
        qotirilgan edi — ya'ni kirgan o'yinchi ham o'z o'yinida yura
        olmasdi.

        Anonim ko'ruvchi ham JONLI holatni oladi (K-18 tuzatilgach
        gateway tokensiz ulanishni qabul qiladi) — lekin faqat
        tomoshabin sifatida.
      */}
      <GameClient initial={game} />

      <p className="muted small" style={{ marginTop: 24 }}>
        Bu sahifa hammaga ochiq: taxta jonli yangilanadi, hisobsiz ham. Yurish
        uchun o&apos;yinchi sifatida kirish kerak.
      </p>
    </>
  );
}
