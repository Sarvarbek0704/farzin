import { DomainError } from '../../../core/errors/domain.error';

export class InvalidTotpCodeError extends DomainError {
  readonly code = 'INVALID_TOTP_CODE';
  readonly httpStatus = 401;

  constructor() {
    super("Tasdiqlash kodi noto'g'ri");
  }
}

/** Login: 2FA yoqilgan, lekin kod berilmagan — klient kod so'rashi kerak. */
export class TotpRequiredError extends DomainError {
  readonly code = 'TOTP_REQUIRED';
  readonly httpStatus = 401;

  constructor() {
    super('Ikki bosqichli tasdiqlash kodi talab qilinadi');
  }
}

export class TotpNotConfiguredError extends DomainError {
  readonly code = 'TOTP_NOT_CONFIGURED';
  readonly httpStatus = 422;

  constructor() {
    super('Bu hisobda 2FA yoqilmagan');
  }
}
