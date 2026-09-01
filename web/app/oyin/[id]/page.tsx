import { notFound } from 'next/navigation';

import { ApiError, getGame } from '@/lib/api';
import { TIME_CATEGORY_LABEL, formatTimeControl } from '@/lib/format';
import { ChessBoard } from '@/components/board';
import { BackLink, Card, PageHeader, TitleTag } from '@/components/ui';

/**
 * O'yin ko'rinishi — TOMOSHABIN uchun, ommaviy.
 *
 * ⚠️  Bu KO'RISH sahifasi, o'ynash EMAS. Yurish qilish server-authoritative
 *     taymer va Socket.IO gateway'i bilan ishlaydi (docs/07) — u alohida
 *     interaktiv bo'lak sifatida qo'shiladi. Bu yerda taxta joriy FEN'ni
 *     ko'rsatadi va yurishlar ro'yxati beriladi.
 *
 *     Nega shunday bo'lingan: taxtani ko'rsatish uchun WebSocket kerak
 *     emas, va u LITSENZIYA savolini yopadigan birinchi qadam
 *     (components/board.tsx izohi).
 */

/** Soat: ms → `m:ss`. Manba serverda, bu faqat ko'rsatish. */
function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

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

  // Yurishlar juftlik bo'lib ko'rsatiladi: "1. e4 e5".
  const movePairs: { number: number; white: string; black: string | null }[] = [];
  for (let i = 0; i < game.moves.length; i += 2) {
    movePairs.push({
      number: i / 2 + 1,
      white: game.moves[i] ?? '',
      black: game.moves[i + 1] ?? null,
    });
  }

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

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <ChessBoard fen={game.fen} />

        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <Card>
            <PlayerLine
              player={game.black}
              clockMs={game.clock.blackMs}
              active={game.clock.running === 'b'}
            />
            <div className="board-rule" style={{ margin: '12px 0' }} />
            <PlayerLine
              player={game.white}
              clockMs={game.clock.whiteMs}
              active={game.clock.running === 'w'}
            />
          </Card>

          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Yurishlar</h3>
            {movePairs.length === 0 ? (
              <p className="muted small">Hali yurish qilinmagan.</p>
            ) : (
              <ol
                className="tabular small"
                style={{
                  margin: 0,
                  paddingLeft: 26,
                  maxHeight: 320,
                  overflowY: 'auto',
                }}
              >
                {movePairs.map((pair) => (
                  <li key={pair.number}>
                    {pair.white}
                    {pair.black !== null && ` ${pair.black}`}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      <p className="muted small" style={{ marginTop: 24 }}>
        Bu tomoshabin ko`rinishi — jonli yangilanish va yurish qilish keyingi bo`lakda.
      </p>
    </>
  );
}

function PlayerLine({
  player,
  clockMs,
  active,
}: {
  player: { firstName: string; lastName: string; title: string | null; rating: number };
  clockMs: number;
  active: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span>
        <TitleTag title={player.title} />
        {player.lastName} {player.firstName}{' '}
        <span className="muted small tabular">{Math.round(player.rating)}</span>
      </span>
      <span
        className="tabular"
        style={{
          fontWeight: 600,
          // Soati yurayotgan tomon ajralib tursin.
          color: active ? 'var(--accent)' : 'var(--ink-secondary)',
        }}
      >
        {formatClock(clockMs)}
      </span>
    </div>
  );
}
