import { SecretBox } from './secret-box';

describe('SecretBox (AES-256-GCM)', () => {
  const key = 'a'.repeat(64);
  const box = new SecretBox(key);

  it('round-trip: encrypt → decrypt asl matnni qaytaradi', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    expect(box.decrypt(box.encrypt(secret))).toBe(secret);
  });

  it('har shifrlash boshqa natija beradi (tasodifiy nonce)', () => {
    expect(box.encrypt('x')).not.toBe(box.encrypt('x'));
  });

  it("o'zgartirilgan ciphertext ochilMAYDI — jimgina buzuq qiymat yo'q", () => {
    const boxed = box.encrypt('sir');
    const parts = boxed.split('.');
    const tampered = `${parts[0] ?? ''}.${'A'.repeat((parts[1] ?? '').length)}.${parts[2] ?? ''}`;
    expect(() => box.decrypt(tampered)).toThrow();
  });

  it('boshqa kalit bilan ochilmaydi', () => {
    const other = new SecretBox('b'.repeat(64));
    const boxed = box.encrypt('sir');
    expect(() => other.decrypt(boxed)).toThrow();
  });

  it('yaroqsiz kalit rad etiladi', () => {
    expect(() => new SecretBox('qisqa')).toThrow();
    expect(() => new SecretBox('z'.repeat(64))).toThrow();
  });

  it('buzilgan format rad etiladi', () => {
    expect(() => box.decrypt('formatsiz')).toThrow();
  });
});
