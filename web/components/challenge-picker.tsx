'use client';

import { useState } from 'react';

import { readJson, useAuth } from '@/lib/auth';
import {
  CATEGORY_LABEL,
  PRESETS,
  categoryFor,
  presetLabel,
  type TimeControlPreset,
} from '@/lib/time-control';

/**
 * Do'stona chaqiriq — vaqt nazoratini tanlash.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BU YERDA "TAKLIF" YO'Q — O'YIN DARHOL BOSHLANADI
 *
 *  `POST /play/challenges` chaqiriq YUBORMAYDI, o'yinni O'SHA ZAHOTI
 *  yaratadi va soat ishlay boshlaydi (play.service.ts
 *  createFriendChallenge). Ya'ni "chaqiriq yuborildi, javob kutilmoqda"
 *  degan holat mavjud emas.
 *
 *  Shuning uchun tugma "Taklif yuborish" emas, "O'ynash" deyiladi va
 *  matn foydalanuvchini ogohlantiradi: bosilgan zahoti o'yin ochiladi.
 *  Aks holda odam "javobni kutaman" deb turib, vaqti ketayotganini
 *  bilmasdi.
 *
 *  Raqib esa `matchmaking:matched` WS xabarini oladi (biz uni aynan
 *  shu holat uchun qo'shdik) — /oyin sahifasi ochiq bo'lsa u
 *  avtomatik o'yinga o'tadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function ChallengePicker({
  opponentPlayerId,
  onCreated,
  onCancel,
}: {
  opponentPlayerId: string;
  onCreated: (gameId: string) => void;
  onCancel: () => void;
}) {
  const { authFetch } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(preset: TimeControlPreset): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch('/api/v1/play/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opponentPlayerId,
          // Kategoriya vaqtdan hisoblanadi — qo'lda tanlanmaydi
          // (lib/time-control.ts dagi izoh).
          timeCategory: categoryFor(preset.baseSeconds, preset.incrementSeconds),
          clockType: preset.incrementSeconds > 0 ? 'FISCHER_INCREMENT' : 'SUDDEN_DEATH',
          baseTimeSeconds: preset.baseSeconds,
          incrementSeconds: preset.incrementSeconds,
        }),
      });
      const game = await readJson<{ gameId: string }>(res);
      onCreated(game.gameId);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "O'yin ochilmadi");
    }
  }

  return (
    <div className="challenge-panel">
      <p className="muted small" style={{ margin: '0 0 10px' }}>
        Vaqt nazoratini tanlang — o&apos;yin <strong>darhol</strong> boshlanadi va soat ishga
        tushadi. Do&apos;stingiz o&apos;yin sahifasini ochib tursa, u ham shu zahoti taxtaga
        o&apos;tadi.
      </p>

      <div className="challenge-presets">
        {PRESETS.map((preset) => (
          <button
            key={presetLabel(preset)}
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void create(preset)}
          >
            <span className="tabular" style={{ fontWeight: 600 }}>
              {presetLabel(preset)}
            </span>
            <span className="muted small">
              {CATEGORY_LABEL[categoryFor(preset.baseSeconds, preset.incrementSeconds)]}
            </span>
          </button>
        ))}
      </div>

      {error !== null && (
        <p role="alert" className="small" style={{ color: 'var(--burgundy)', margin: '10px 0 0' }}>
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn btn-ghost"
        onClick={onCancel}
        disabled={busy}
        style={{ marginTop: 10 }}
      >
        Bekor qilish
      </button>
    </div>
  );
}
