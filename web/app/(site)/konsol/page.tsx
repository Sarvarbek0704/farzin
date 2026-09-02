'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type { Page, Tournament } from '@/lib/api';
import { EmptyState, PageHeader } from '@/components/ui';
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
      <PageHeader
        kicker="Boshqaruv"
        title="Hakam konsoli"
        subtitle="Turnirni ochib seksiya qo'shing, tur generatsiya qiling va natija kiriting."
      />

      {error !== null && (
        <p role="alert" style={{ color: 'var(--burgundy)' }}>
          {error}
        </p>
      )}

      {items === null ? (
        <div className="skeleton" style={{ height: 220 }} />
      ) : items.length === 0 ? (
        <EmptyState
          glyph="♜"
          title="Turnir yo'q"
          hint="Tashkilotchi turnir e'lon qilgach, u shu yerda ko'rinadi."
        />
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
