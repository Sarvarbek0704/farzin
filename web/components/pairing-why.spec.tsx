import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PairingWhy, type PlayerFacts } from './pairing-why';

/**
 * "Nega bu juftlik?" paneli.
 *
 * Eng muhim tekshiruv — panel sababni DA'VO QILMASLIGI. Dvigatel
 * qaror izini saqlamaydi (prisma/schema.prisma:725), shuning uchun
 * panel faqat FAKTLARNI ko'rsatadi. Kimdir keyinchalik "shu sababli
 * juftlashdi" degan matn qo'shsa — bu test yiqilishi kerak.
 */

const WHITE: PlayerFacts = {
  name: 'Abdusattorov Nodirbek',
  points: '2.0',
  colorHistory: ['BLACK', 'BLACK'],
  floatHistory: ['NONE', 'UP'],
};

const BLACK: PlayerFacts = {
  name: 'Sindarov Javokhir',
  points: '2.0',
  colorHistory: ['WHITE', 'BLACK'],
  floatHistory: ['NONE', 'NONE'],
};

describe('PairingWhy', () => {
  it('yopiq holatda faqat tugma ko`rinadi', () => {
    render(<PairingWhy white={WHITE} black={BLACK} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('bosilganda faktlar ochiladi', async () => {
    const user = userEvent.setup();
    render(<PairingWhy white={WHITE} black={BLACK} />);
    await user.click(screen.getByRole('button'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Abdusattorov Nodirbek')).toBeInTheDocument();
    expect(screen.getByText('Sindarov Javokhir')).toBeInTheDocument();
  });

  it('bir xil ochkoda — «bir xil ochko guruhi» deyiladi', async () => {
    const user = userEvent.setup();
    render(<PairingWhy white={WHITE} black={BLACK} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText(/bir xil ochko guruhi/)).toBeInTheDocument();
  });

  it('ochkolar farq qilsa — FLOAT bo`lgani aytiladi', async () => {
    const user = userEvent.setup();
    render(<PairingWhy white={WHITE} black={{ ...BLACK, points: '1.5' }} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText(/float bo/i)).toBeInTheDocument();
  });

  it('rang tarixi O/Q harflari bilan ko`rsatiladi', async () => {
    const user = userEvent.setup();
    render(<PairingWhy white={WHITE} black={BLACK} />);
    await user.click(screen.getByRole('button'));

    // Oq o'yinchi ikki marta qora o'ynagan — «nega yana qora?»
    // savoliga javob shu yerda.
    const blacks = screen.getAllByTitle('Qora');
    expect(blacks.length).toBeGreaterThanOrEqual(3);
  });

  it('float xulosasi hisoblanadi', async () => {
    const user = userEvent.setup();
    render(<PairingWhy white={WHITE} black={BLACK} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText(/1× yuqoriga/)).toBeInTheDocument();
  });

  it('SABABNI DA`VO QILMAYDI — cheklov ochiq yoziladi', async () => {
    const user = userEvent.setup();
    render(<PairingWhy white={WHITE} black={BLACK} />);
    await user.click(screen.getByRole('button'));

    // Panel dvigatel qarorining izi emas va buni O'ZI aytadi.
    expect(screen.getByText(/qaror izini saqlamaydi/)).toBeInTheDocument();
  });

  it('Escape bilan yopiladi', async () => {
    const user = userEvent.setup();
    render(<PairingWhy white={WHITE} black={BLACK} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
