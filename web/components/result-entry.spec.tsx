import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResultEntry, type PairingRow } from './result-entry';

/**
 * Natija kiritish — KLAVIATURA oqimi.
 *
 * Bu hakamning asosiy vositasi (brif §6.12): 50 taxtali turnirda
 * har qatorga sichqoncha bilan borish daqiqalarni yeydi. Shuning
 * uchun klaviatura yo'li testda majburlanadi — u tasodifan
 * buzilmasin.
 */

const BOARD_1: PairingRow = {
  id: 'p1',
  boardNumber: 1,
  whiteName: 'Oq Bir',
  blackName: 'Qora Bir',
  result: 'UNPLAYED',
};
const BOARD_2: PairingRow = {
  id: 'p2',
  boardNumber: 2,
  whiteName: 'Oq Ikki',
  blackName: 'Qora Ikki',
  result: 'UNPLAYED',
};
/** Bye — qora yo'q, natija avtomatik. */
const BOARD_3: PairingRow = {
  id: 'p3',
  boardNumber: 3,
  whiteName: 'Oq Uch',
  blackName: null,
  result: 'BYE',
};

const ROWS: PairingRow[] = [BOARD_1, BOARD_2, BOARD_3];

describe('ResultEntry', () => {
  // Tip aniq: `vi.fn()` ning umumiy tipi ResultEntry propiga tushmaydi.
  let onSet: ReturnType<typeof vi.fn<(id: string, result: string) => Promise<void>>>;

  beforeEach(() => {
    onSet = vi.fn<(id: string, result: string) => Promise<void>>().mockResolvedValue(undefined);
  });

  function setup(rows: PairingRow[] = ROWS) {
    render(<ResultEntry pairings={rows} onSet={onSet} />);
  }

  it('«1» oq g`alabasini yozadi', async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard('1');
    expect(onSet).toHaveBeenCalledWith('p1', 'WHITE_WIN');
  });

  it('«0» qora g`alabasini yozadi', async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard('0');
    expect(onSet).toHaveBeenCalledWith('p1', 'BLACK_WIN');
  });

  it('«=» va «5» — durang (ikkala klavish ham)', async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard('=');
    expect(onSet).toHaveBeenCalledWith('p1', 'DRAW');

    onSet.mockClear();
    await user.keyboard('5');
    expect(onSet).toHaveBeenCalledWith('p2', 'DRAW');
  });

  it('kiritishdan keyin KEYINGI qatorga o`tadi', async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard('1');
    expect(onSet).toHaveBeenCalledWith('p1', 'WHITE_WIN');

    onSet.mockClear();
    await user.keyboard('1');
    // Avtomatik ikkinchi taxtaga o'tdi — hakam qo'lda ko'chirmaydi.
    expect(onSet).toHaveBeenCalledWith('p2', 'WHITE_WIN');
  });

  it('↓ va ↑ qator almashtiradi', async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('1');
    expect(onSet).toHaveBeenCalledWith('p2', 'WHITE_WIN');

    onSet.mockClear();
    await user.keyboard('{ArrowUp}');
    await user.keyboard('0');
    expect(onSet).toHaveBeenCalledWith('p1', 'BLACK_WIN');
  });

  it('BYE qatoriga natija kiritilmaydi', async () => {
    const user = userEvent.setup();
    setup();
    // Uchinchi qator bye — pastga ikki marta tushsak ham unga yetmaymiz.
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    await user.keyboard('1');
    expect(onSet).not.toHaveBeenCalledWith('p3', expect.anything());
  });

  it('sichqoncha uchun ham tugmalar bor (klaviatura YAGONA yo`l emas)', async () => {
    const user = userEvent.setup();
    setup();
    const drawButtons = screen.getAllByTitle(/Durang/);
    await user.click(drawButtons[0] as HTMLElement);
    expect(onSet).toHaveBeenCalledWith('p1', 'DRAW');
  });

  it('kiritilgan natija tugmada BELGILANADI', () => {
    setup([{ ...BOARD_1, result: 'DRAW' }]);
    const [drawButton] = screen.getAllByTitle(/Durang/);
    expect(drawButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('UNPLAYED — kiritilmagan deb hisoblanadi (backend enum qiymati)', () => {
    setup();
    // Uchinchi qator bye, ya'ni hisobga kirmaydi: 0 / 2.
    expect(screen.getByText('0 / 2')).toBeInTheDocument();
  });

  it('progress kiritilganlar sonini ko`rsatadi', () => {
    setup([{ ...BOARD_1, result: 'WHITE_WIN' }, BOARD_2, BOARD_3]);
    // Bye qatori hisobga KIRMAYDI — unga natija kiritilmaydi.
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('tur yopilgan bo`lsa hech narsa kiritilmaydi', async () => {
    const user = userEvent.setup();
    render(<ResultEntry pairings={ROWS} onSet={onSet} disabled />);
    await user.keyboard('1');
    expect(onSet).not.toHaveBeenCalled();
  });

  it('yozuv ketayotganda qator BAND — ikki marta yuborilmaydi', async () => {
    let resolve: (() => void) | null = null;
    onSet = vi.fn<(id: string, result: string) => Promise<void>>().mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const user = userEvent.setup();
    setup();

    await user.keyboard('1');
    expect(onSet).toHaveBeenCalledTimes(1);
    // Ikkinchi bosish — birinchisi tugamaguncha e'tiborsiz.
    await user.keyboard('1');
    expect(onSet).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve?.();
    });
  });
});
