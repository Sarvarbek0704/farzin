'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type { Page, Tournament } from '@/lib/api';
import { readJson, useAuth } from '@/lib/auth';
import { formatDateRange, statusView } from '@/lib/format';

/**
 * Konsol boshi — turnirlar ro'yxati.
 *
 * ⚠️  Bu ro'yxat BARCHA ommaviy turnirlarni ko'rsatadi, "mening
 *     turnirlarim" emas. Backend'da hozircha owner-filtri YO'Q
 *     (tournament.service.ts `TODO(Faza 1): owner-view`). Buni
 *     yashirish o'rniga ochiq aytamiz — hakam nimani ko'rayotganini
 *     bilishi kerak.
 */
export default function ConsoleHome() {
  const { authFetch } = useAuth();
  const [items, setItems] = useState<Tournament[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await authFetch('/api/v1/tournaments?first=50');
      const page = await readJson<Page<Tournament>>(res);
      setItems(page.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xato');
    }
  }, [authFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="board-rule" style={{ width: 72, marginBottom: 14 }} />
      <h1 style={{ fontSize: 30, marginBottom: 6 }}>Hakam konsoli</h1>
      <p className="muted small" style={{ marginTop: 0, marginBottom: 22 }}>
        Turnirni ochib seksiya qo`shing, tur generatsiya qiling va natija kiriting.
      </p>

      {error !== null && (
        <p role="alert" style={{ color: 'var(--burgundy)' }}>
          {error}
        </p>
      )}

      {items === null ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : items.length === 0 ? (
        <div className="card">Turnir yo`q.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Turnir</th>
                <th>Sana</th>
                <th>Holat</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const status = statusView(t.status);
                return (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/konsol/turnir/${t.id}`} style={{ fontWeight: 500 }}>
                        {t.name}
                      </Link>
                    </td>
                    <td className="tabular" style={{ whiteSpace: 'nowrap' }}>
                      {formatDateRange(t.startDate, t.endDate)}
                    </td>
                    <td>
                      <span className={status.className}>{status.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted small" style={{ marginTop: 16 }}>
        Ro`yxatda barcha ommaviy turnirlar ko`rinadi — backend`da hozircha
        &laquo;mening turnirlarim&raquo; filtri yo`q.
      </p>
    </>
  );
}
