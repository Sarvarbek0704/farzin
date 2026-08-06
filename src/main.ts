import 'reflect-metadata';

import {
  BadRequestException,
  ValidationPipe,
  type ValidationError,
  VersioningType,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { type AppConfig, NodeEnv } from './config/configuration';
import { RedisIoAdapter } from './shared/redis/redis-io.adapter';
import { ConfigService } from '@nestjs/config';

/**
 * BigInt JSON serializatsiyasi.
 *
 * `JSON.stringify(1n)` xato tashlaydi. Pul `bigint` sifatida saqlanadi
 * (ADR-0006), shuning uchun bu global patch MAJBURIY.
 *
 * Pul API'da STRING sifatida qaytadi — JS `Number` 2^53 dan katta butun
 * sonni yo'qotadi va bu pul uchun qabul qilinmaydi.
 */
declare global {
  interface BigInt {
    toJSON(): string;
  }
}
BigInt.prototype.toJSON = function (this: bigint): string {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<AppConfig, true>);
  const nodeEnv = config.get('nodeEnv', { infer: true });
  const port = config.get('port', { infer: true });
  const apiPrefix = config.get('apiPrefix', { infer: true });
  const corsOrigins = config.get('corsOrigins', { infer: true });
  const isProduction = nodeEnv === NodeEnv.Production;

  // --- Xavfsizlik (docs/10-security.md §11) --------------------------------
  app.use(
    helmet({
      // Dev'da CSP o'chiriladi — Swagger UI inline script ishlatadi.
      // Prod'da helmet'ning default CSP'si qoladi.
      // (`exactOptionalPropertyTypes` sababli shartli spread ishlatiladi:
      //  `undefined` ni ochiq uzatib bo'lmaydi.)
      ...(isProduction ? {} : { contentSecurityPolicy: false as const }),
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());

  app.enableCors({
    origin: corsOrigins,
    // Refresh token httpOnly cookie'da keladi — credentials shart.
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'Accept-Language'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
  });

  // --- API (docs/04-api-spec.md §2.1) --------------------------------------
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health', 'health/live', 'health/ready'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // --- Validatsiya (docs/10-security.md §6, docs/04-api-spec.md §2.5) ------
  app.useGlobalPipes(
    new ValidationPipe({
      // Faqat DTO'da e'lon qilingan maydonlar o'tadi.
      whitelist: true,
      // Ortiqcha maydon bo'lsa — 400. Mass assignment himoyasi.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Prod'da validatsiya xatosi ichki detalni ochmasin.
      disableErrorMessages: false,
      // Maydon darajasidagi tuzilmali xato — ProblemDetailsFilter buni
      // RFC 9457 `errors[]` ro'yxatiga aylantiradi.
      exceptionFactory: (validationErrors: ValidationError[]): BadRequestException =>
        new BadRequestException({
          code: 'VALIDATION_FAILED',
          errors: validationErrors.flatMap((e) =>
            Object.entries(e.constraints ?? {}).map(([constraint, message]) => ({
              field: e.property,
              code: constraint.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(),
              message,
            })),
          ),
        }),
    }),
  );

  // --- OpenAPI (docs/04-api-spec.md §10) -----------------------------------
  // Prod'da Swagger UI ochiq QOLDIRILMAYDI — API sirtini oshkor qiladi.
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Farzin API')
      .setDescription(
        "O'zbekiston shaxmatining raqamli infratuzilmasi.\n\n" +
          'Texnik topshiriq: https://github.com/Sarvarbek0704/farzin/tree/main/docs',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addServer(`http://localhost:${String(port)}`, 'Local')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // --- Socket.IO Redis adapter (docs/07-realtime-and-clock.md §10.1) -------
  // Ko'p instance orasida room broadcast. Pub/sub uchun ikkita ALOHIDA
  // ioredis ulanishi ochiladi (shared REDIS tokeni ishlatilmaydi —
  // subscribe holatidagi klient boshqa buyruq yubora olmaydi).
  const redisCfg = config.get('redis', { infer: true });
  const ioAdapter = new RedisIoAdapter(app);
  await ioAdapter.connectToRedis({
    host: redisCfg.host,
    port: redisCfg.port,
    ...(redisCfg.password !== undefined && { password: redisCfg.password }),
    db: redisCfg.db,
  });
  app.useWebSocketAdapter(ioAdapter);

  // Kubernetes SIGTERM yuboradi — ochiq so'rovlar tugashi kerak.
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
