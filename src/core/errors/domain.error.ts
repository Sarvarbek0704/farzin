/**
 * Domen xatolari.
 *
 * Tamoyil: domen xatosi va texnik xato ARALASHMAYDI.
 *
 *  - DomainError  → biznes qoidasi buzildi. Kutilgan holat. 4xx.
 *  - Boshqa xato  → bug yoki infratuzilma muammosi. Kutilmagan. 500.
 *
 * Global exception filter DomainError'ni RFC 9457 (Problem Details)
 * formatiga aylantiradi. Kutilmagan xatoda foydalanuvchi faqat traceId
 * ko'radi — ichki detal HECH QACHON chiqmaydi.
 *
 * Bu fayl `core/` da — ya'ni NestJS'ni bilmaydi (ADR-0001).
 * HTTP status kodi shu yerda, lekin bu HTTP bog'liqligi emas — oddiy raqam.
 *
 * @see docs/02-architecture.md §11
 * @see docs/04-api-spec.md §2.5
 */
export abstract class DomainError extends Error {
  /** Mashina uchun barqaror kod. Hech qachon o'zgarmaydi. */
  abstract readonly code: string;

  /** RFC 9457 javobidagi status. */
  abstract readonly httpStatus: number;

  /**
   * Xatolik bilan birga beriladigan tuzilmali ma'lumot.
   * Foydalanuvchiga ko'rsatiladi — sir bo'lmasligi kerak.
   */
  readonly meta: Readonly<Record<string, unknown>>;

  constructor(message: string, meta: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.meta = Object.freeze({ ...meta });

    // TypeScript'da Error'dan meros olishda prototype zanjiri buziladi.
    // Busiz `instanceof DomainError` false qaytaradi.
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, new.target);
  }
}

/** Resurs topilmadi. Ruxsat yo'qligida ham shu qaytadi — ma'lumot sizdirmaslik uchun. */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;

  constructor(resource: string, id?: string) {
    super(`${resource} topilmadi`, { resource, ...(id !== undefined && { id }) });
  }
}

/** Biznes qoidasi buzildi. Sintaksis to'g'ri, mantiq noto'g'ri. */
export class BusinessRuleError extends DomainError {
  readonly code: string;
  readonly httpStatus = 422;

  constructor(code: string, message: string, meta?: Record<string, unknown>) {
    super(message, meta);
    this.code = code;
  }
}

/** Resurs holati operatsiyaga ruxsat bermaydi. */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;
}

/** Autentifikatsiya bor, lekin ruxsat yo'q. */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;
}
