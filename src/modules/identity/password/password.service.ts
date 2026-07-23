import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import type { AppConfig } from '../../../config/configuration';

/**
 * Parol xizmati — Argon2id. bcrypt EMAS (ADR-0004).
 *
 * Parametrlar konfiguratsiyadan olinadi va PROD MASHINASIDA O'LCHANISHI
 * SHART (maqsad: ~250-500 ms). Ko'chirib qo'yilgan-u hech qachon
 * o'lchanmagan parametr — xavfsizlik qarori emas. docs/10-security.md §2.1
 *
 * MUHIM XUSUSIYATLAR:
 *  - `verify` parametrlarni SAQLANGAN HASHDAN o'qiydi — parametr oshirilsa
 *    eski foydalanuvchilar qulflanib qolmaydi.
 *  - `needsRehash` — eski (kuchsizroq) parametrli hash aniqlansa, login
 *    paytida shaffof qayta-hash qilinadi (auth.service.ts).
 *  - DUMMY_HASH — mavjud bo'lmagan foydalanuvchi uchun ham hash tekshiriladi,
 *    javob vaqti bir xil bo'ladi (user enumeration himoyasi, timing).
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  private readonly options: argon2.Options;

  /**
   * Mavjud bo'lmagan foydalanuvchi yo'lida ishlatiladigan haqiqiy hash.
   * Boot paytida joriy parametrlar bilan generatsiya qilinadi.
   */
  private dummyHash = '';

  constructor(config: ConfigService<AppConfig, true>) {
    const { memoryCost, timeCost, parallelism } = config.get('argon2', { infer: true });
    this.options = {
      type: argon2.argon2id,
      memoryCost,
      timeCost,
      parallelism,
    };
  }

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash('farzin-dummy-password-for-timing-safety');
  }

  async hash(plain: string): Promise<string> {
    return await argon2.hash(plain, this.options);
  }

  /**
   * Tekshirish. Buzilgan/yaroqsiz hash — "noto'g'ri parol" deb o'qiladi,
   * HECH QACHON 500 emas.
   */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /**
   * Mavjud bo'lmagan foydalanuvchi uchun ham xuddi shu narxdagi hisob —
   * login javob vaqti foydalanuvchi bor-yo'qligini oshkor qilmaydi.
   */
  async verifyDummy(plain: string): Promise<void> {
    await argon2.verify(this.dummyHash, plain).catch(() => false);
  }

  /** Saqlangan hash joriy siyosatdan kuchsiz parametrlarda yaratilganmi. */
  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, this.options);
  }
}
