import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Komponent testlari uchun umumiy tayyorgarlik.
 *
 * `jest-dom` matcher'lari (`toBeDisabled`, `toBeVisible`, ...) — ular
 * "tugma o'chiq" degan niyatni to'g'ridan-to'g'ri ifodalaydi;
 * `expect(el.disabled).toBe(true)` bilan solishtirganda xato xabari
 * ancha aniq bo'ladi.
 *
 * `cleanup` — har testdan keyin DOM'ni bo'shatadi. Aks holda oldingi
 * testdan qolgan tugma `getByRole` da topilib, test YOLG'ON yashil
 * bo'lishi mumkin.
 */
afterEach(() => {
  cleanup();
});
