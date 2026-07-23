import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Kichik sirlarni (TOTP secret kabi) DB'da saqlash uchun simmetrik
 * shifrlash — AES-256-GCM.
 *
 * Format: base64url(iv) . base64url(ciphertext) . base64url(authTag)
 *
 * Nega GCM: authenticated encryption — shifrlangan matn o'zgartirilsa
 * ochish YIQILADI (jimgina buzuq qiymat qaytarmaydi).
 *
 * ⚠️  Bu PAROL uchun EMAS — parol HASH qilinadi (Argon2id), shifrlanmaydi.
 *     Bu qayta o'qilishi SHART bo'lgan sirlar uchun (TOTP secret).
 *     docs/10-security.md §2.5
 */
export class SecretBox {
  private readonly key: Buffer;

  /** @param hexKey 64 hex belgi (32 bayt). Generatsiya: openssl rand -hex 32 */
  constructor(hexKey: string) {
    if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
      throw new Error('SecretBox kaliti aynan 64 hex belgi (32 bayt) bo\'lishi kerak');
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12); // GCM uchun 96-bit nonce — standart
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${authTag.toString('base64url')}`;
  }

  /** @throws buzilgan/o'zgartirilgan qiymatda — jimgina noto'g'ri natija YO'Q */
  decrypt(boxed: string): string {
    const [ivPart, dataPart, tagPart] = boxed.split('.');
    if (ivPart === undefined || dataPart === undefined || tagPart === undefined) {
      throw new Error('SecretBox: format buzilgan');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
