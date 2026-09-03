'use client';

import { useId, useState } from 'react';

/**
 * Forma bo'laklari.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEGA ALOHIDA KOMPONENT
 *
 *  Ilgari har sahifa o'z `<input>` ini yozardi: yorliq `<span>` da,
 *  xato yo'q, parolni ko'rish imkoni yo'q, `aria-invalid` yo'q. Bir
 *  joyda tuzatilgan narsa boshqasida eskirib qolardi.
 *
 *  Bu yerda yorliq–maydon–xato uchligi BOG'LANGAN (`htmlFor` / `id` /
 *  `aria-describedby`), ya'ni skrinrider xatoni maydon bilan birga
 *  o'qiydi (WCAG 3.3.1).
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email';
  autoComplete?: string;
  required?: boolean;
  /** Xato matni — bo'lsa maydon qizil ramka va `aria-invalid` oladi. */
  error?: string | null;
  hint?: string;
  autoFocus?: boolean;
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required = false,
  error = null,
  hint,
  autoFocus = false,
}: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const described = [error !== null ? errorId : null, hint !== undefined ? hintId : null]
    .filter((x): x is string => x !== null)
    .join(' ');

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        className="field"
        value={value}
        required={required}
        autoFocus={autoFocus}
        aria-invalid={error !== null}
        {...(described !== '' ? { 'aria-describedby': described } : {})}
        {...(autoComplete !== undefined ? { autoComplete } : {})}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
      <FieldFoot error={error} errorId={errorId} hint={hint} hintId={hintId} />
    </div>
  );
}

/**
 * Parol maydoni — KO'RISH tugmasi bilan.
 *
 * Nega kerak: telefonda uzun parolni ko'rmasdan terish xatoga olib
 * keladi va odam qayta-qayta urinadi. Ko'rsatish tugmasi standart
 * kutilma; uning yo'qligi xato edi.
 *
 * Tugma `tabindex` dan chiqarilmaydi (klaviatura bilan ham kerak),
 * lekin `aria-pressed` bilan holati e'lon qilinadi.
 */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete = 'current-password',
  error = null,
  hint,
  showLabel,
  hideLabel,
}: Omit<FieldProps, 'type'> & { showLabel: string; hideLabel: string }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [visible, setVisible] = useState(false);
  const described = [error !== null ? errorId : null, hint !== undefined ? hintId : null]
    .filter((x): x is string => x !== null)
    .join(' ');

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="field-wrap">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="field"
          value={value}
          required
          autoComplete={autoComplete}
          aria-invalid={error !== null}
          {...(described !== '' ? { 'aria-describedby': described } : {})}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
        <button
          type="button"
          className="field-action"
          aria-pressed={visible}
          aria-label={visible ? hideLabel : showLabel}
          title={visible ? hideLabel : showLabel}
          onClick={() => {
            setVisible((v) => !v);
          }}
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
      <FieldFoot error={error} errorId={errorId} hint={hint} hintId={hintId} />
    </div>
  );
}

function FieldFoot({
  error,
  errorId,
  hint,
  hintId,
}: {
  error: string | null;
  errorId: string;
  hint: string | undefined;
  hintId: string;
}) {
  if (error !== null) {
    return (
      <p id={errorId} className="field-error" role="alert">
        {error}
      </p>
    );
  }
  if (hint !== undefined) {
    return (
      <p id={hintId} className="field-hint">
        {hint}
      </p>
    );
  }
  return null;
}

/* Ikonalar — 1.5px chiziqli (dizayn brifi §4.3). */

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 4l16 16M9.9 5.7A9.9 9.9 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.2 4M6.6 7.9A17 17 0 0 0 2 12s3.6 6.5 10 6.5a9.7 9.7 0 0 0 3.6-.66"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.9 10.2a2.75 2.75 0 0 0 3.9 3.86"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
