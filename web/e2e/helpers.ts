import type { Locator } from '@playwright/test';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Element o'lchamini oladi; element yo'q bo'lsa TUSHUNARLI xato beradi.
 *
 * `locator.boundingBox()` `null` qaytarishi mumkin (element yo'q yoki
 * ko'rinmas). `!` bilan bostirish o'rniga shu yerda to'xtatamiz —
 * aks holda xato "Cannot read property 'width' of null" ko'rinishida
 * chiqib, qaysi element yo'qligi noma'lum qolardi.
 */
export async function boxOf(locator: Locator, label: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(`"${label}" elementi topilmadi yoki ko'rinmas — o'lcham olib bo'lmadi`);
  }
  return box;
}

/** Sahifa gorizontal surilishi (0 dan katta bo'lsa — muammo). */
export async function horizontalOverflow(page: {
  evaluate: <T>(fn: () => T) => Promise<T>;
}): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}
