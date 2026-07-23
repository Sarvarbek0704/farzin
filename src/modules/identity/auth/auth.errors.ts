import { DomainError } from '../../../core/errors/domain.error';

/**
 * "Email yoki parol noto'g'ri" — ATAYLAB noaniq.
 * Qaysi biri noto'g'ri ekanini aytish = foydalanuvchi bazasini
 * sanab chiqish imkoni (user enumeration). docs/10-security.md §2.1
 */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly httpStatus = 401;

  constructor() {
    super("Email yoki parol noto'g'ri");
  }
}

export class TooManyAttemptsError extends DomainError {
  readonly code = 'TOO_MANY_ATTEMPTS';
  readonly httpStatus = 429;

  constructor(retryAfterSeconds: number) {
    super("Urinishlar soni oshib ketdi. Keyinroq qayta urinib ko'ring", {
      retryAfterSeconds,
    });
  }
}

/** Hisob holati kirishga ruxsat bermaydi (SUSPENDED/BANNED/DELETED). */
export class AccountDisabledError extends DomainError {
  readonly code = 'ACCOUNT_DISABLED';
  readonly httpStatus = 403;

  constructor() {
    super('Hisob faol emas');
  }
}

export class EmailAlreadyRegisteredError extends DomainError {
  readonly code = 'EMAIL_ALREADY_REGISTERED';
  readonly httpStatus = 409;

  constructor() {
    super("Bu email allaqachon ro'yxatdan o'tgan");
  }
}

export class InvalidVerificationTokenError extends DomainError {
  readonly code = 'INVALID_VERIFICATION_TOKEN';
  readonly httpStatus = 422;

  constructor() {
    super("Tasdiqlash havolasi yaroqsiz yoki muddati o'tgan");
  }
}
