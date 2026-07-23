/**
 * Cursor-based pagination — docs/04-api-spec.md §3.
 *
 * OFFSET ATAYLAB ISHLATILMAYDI: `OFFSET 100000` PostgreSQL'da sekin,
 * va yozuv qo'shilsa sahifalar siljiydi. UUID v7 vaqt bo'yicha
 * tartiblangani uchun `WHERE id > cursor ORDER BY id` to'g'ri ishlaydi.
 *
 * Cursor = base64url(JSON {id}) — shaffof emas, klient parse qilmasin.
 */

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface Page<T> {
  items: T[];
  pageInfo: PageInfo;
}

/** TZ default belgilamagan (ochiq savol) — qabul qilingan: 20, max 100. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id }), 'utf8').toString('base64url');
}

/** Yaroqsiz cursor — null (400 emas: bo'sh sahifa qaytadi, sir oshkor bo'lmaydi). */
export function decodeCursor(cursor: string): string | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      id?: unknown;
    };
    return typeof parsed.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}

/**
 * `first + 1` qator so'ralgan natijadan sahifa yasash:
 * ortiqcha qator bor = keyingi sahifa bor.
 */
export function toPage<T extends { id: string }>(rows: T[], first: number): Page<T> {
  const hasNextPage = rows.length > first;
  const items = hasNextPage ? rows.slice(0, first) : rows;
  const last = items[items.length - 1];
  return {
    items,
    pageInfo: {
      hasNextPage,
      endCursor: last !== undefined ? encodeCursor(last.id) : null,
    },
  };
}
