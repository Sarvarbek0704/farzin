import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';

import { DomainError } from '../../core/errors/domain.error';

/**
 * RFC 9457 (Problem Details) javobi.
 *
 * @see docs/04-api-spec.md §2.5
 */
interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance: string;
  traceId: string;
  /** Validatsiya xatolarida maydon darajasidagi ro'yxat. */
  errors?: readonly { field: string; code: string; message: string }[];
  [key: string]: unknown;
}

/** `PAIRING_IMPOSSIBLE` → `pairing-impossible` */
function toKebab(code: string): string {
  return code.toLowerCase().replace(/_/g, '-');
}

/**
 * Global xato filtri — HAMMA xato bitta formatda chiqadi.
 *
 * Uch toifa, uch xil munosabat:
 *
 *  1. DomainError      — kutilgan biznes xatosi. 4xx, to'liq ma'lumot.
 *  2. HttpException    — framework xatosi (validatsiya, 404, throttle). 4xx.
 *  3. Boshqa hamma     — bug yoki infratuzilma. 500, va ICHKI DETAL
 *                        HECH QACHON chiqmaydi — foydalanuvchi faqat
 *                        traceId ko'radi, to'liq stack log'da.
 *
 * @see docs/02-architecture.md §11
 * @see docs/04-api-spec.md §2.5
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  constructor(private readonly cls: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    // ClsService tipi string deydi, lekin middleware'siz kontekstda
    // runtime'da undefined bo'lishi mumkin.
    const traceId = (this.cls.getId() as string | undefined) ?? 'unknown';
    const instance = request.originalUrl;

    let problem: ProblemDetails;

    if (exception instanceof DomainError) {
      problem = {
        type: `https://farzin.uz/errors/${toKebab(exception.code)}`,
        title: exception.message,
        status: exception.httpStatus,
        code: exception.code,
        instance,
        traceId,
        ...exception.meta,
      };
    } else if (exception instanceof ThrottlerException) {
      problem = {
        type: 'https://farzin.uz/errors/rate-limited',
        title: "So'rovlar chegarasi oshdi",
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        detail: "Keyinroq qayta urinib ko'ring",
        instance,
        traceId,
      };
    } else if (exception instanceof HttpException) {
      problem = this.fromHttpException(exception, instance, traceId);
    } else {
      // Kutilmagan xato — bug. Foydalanuvchiga FAQAT traceId.
      // docs/10-security.md: stack, SQL, fayl yo'li hech qachon chiqmaydi.
      this.logger.error(
        { err: exception, traceId, path: instance },
        exception instanceof Error ? exception.stack : String(exception),
      );
      problem = {
        type: 'https://farzin.uz/errors/internal',
        title: 'Ichki xatolik',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        detail: `Xatolik kuzatuv tizimiga yozildi. Murojaat uchun traceId: ${traceId}`,
        instance,
        traceId,
      };
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .header('X-Request-Id', traceId)
      .json(problem);
  }

  /**
   * NestJS HttpException → Problem Details.
   *
   * ValidationPipe `exceptionFactory` (main.ts) allaqachon tuzilmali
   * payload beradi — u to'g'ridan-to'g'ri o'tkaziladi.
   */
  private fromHttpException(
    exception: HttpException,
    instance: string,
    traceId: string,
  ): ProblemDetails {
    const status = exception.getStatus();
    const raw = exception.getResponse();

    // ValidationPipe'dan kelgan tuzilmali xato (main.ts exceptionFactory)
    if (typeof raw === 'object' && 'code' in raw && 'errors' in raw) {
      const payload = raw as { code: string; errors: ProblemDetails['errors'] };
      return {
        type: `https://farzin.uz/errors/${toKebab(payload.code)}`,
        title: 'Validatsiya xatosi',
        status,
        code: payload.code,
        instance,
        traceId,
        ...(payload.errors !== undefined && { errors: payload.errors }),
      };
    }

    const message = extractMessage(raw, exception.message);
    const code = STATUS_CODE_MAP[status] ?? 'HTTP_ERROR';

    return {
      type: `https://farzin.uz/errors/${toKebab(code)}`,
      title: message,
      status,
      code,
      instance,
      traceId,
    };
  }
}

function extractMessage(raw: string | object, fallback: string): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if ('message' in raw) {
    const message: unknown = raw.message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && typeof message[0] === 'string') {
      return message[0];
    }
  }
  return fallback;
}

/** HTTP status → barqaror mashina kodi. */
const STATUS_CODE_MAP: Readonly<Record<number, string>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};
