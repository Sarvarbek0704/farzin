/**
 * Fair-play yorliqlari.
 *
 * ⚠️  Alohida modulda, sahifa faylida EMAS: Next.js `app/**\/page.tsx`
 *     dan `default` va bir nechta maxsus eksportdan boshqasiga ruxsat
 *     bermaydi ("does not satisfy the constraint '{ [x: string]: never }'").
 *     Bu build vaqtida chiqdi va shundan keyin ajratildi.
 */

export const CASE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Ochiq',
  UNDER_REVIEW: "Ko'rib chiqilmoqda",
  CLOSED_NO_ACTION: 'Yopildi — chora yo`q',
  CLOSED_WARNING: 'Yopildi — ogohlantirish',
  CLOSED_SANCTION: 'Yopildi — sanksiya',
};

export function caseStatusClass(status: string): string {
  if (status === 'OPEN' || status === 'UNDER_REVIEW') return 'badge badge-open';
  if (status === 'CLOSED_SANCTION') return 'badge badge-cancelled';
  return 'badge badge-done';
}

export const SIGNAL_LABEL: Record<string, string> = {
  ENGINE_CORRELATION: 'Dvigatel korrelyatsiyasi',
  TIMING_PATTERN: 'Vaqt naqshi',
  MULTI_ACCOUNT: "Ko'p hisob",
  MANUAL_REPORT: 'Qo`lda shikoyat',
};

/** docs/08 §4: yozma asos kamida shuncha belgi. Backend ham tekshiradi. */
export const MIN_RATIONALE = 20;
