import {
  canAccept,
  canBlock,
  canDecline,
  canRemove,
  canRequest,
  canUnblock,
  otherSide,
  type FriendshipView,
} from './friendship.rules';

/**
 * Do'stlik qoidalari — XAVFSIZLIK chegarasi.
 *
 * Bu yerdagi har bir "yo'q" — suiiste'molning oldini oladi:
 * o'z so'rovini o'zi qabul qilish, begona odamning blokini ochish,
 * bloklangan odamning qayta so'rov yuborishi.
 */

const A = 'player-a';
const B = 'player-b';
const C = 'player-c';

function row(over: Partial<FriendshipView> = {}): FriendshipView {
  return {
    requesterId: A,
    addresseeId: B,
    status: 'PENDING',
    blockedById: null,
    ...over,
  };
}

describe('canRequest', () => {
  it("o'ziga so'rov yuborib bo'lmaydi", () => {
    expect(canRequest(A, A, null)).toEqual({ ok: false, reason: 'SELF_FRIENDSHIP' });
  });

  it('qator yo`q — ruxsat', () => {
    expect(canRequest(A, B, null)).toEqual({ ok: true });
  });

  it('allaqachon do`st — takror so`rov yo`q', () => {
    expect(canRequest(A, B, row({ status: 'ACCEPTED' }))).toEqual({
      ok: false,
      reason: 'ALREADY_FRIENDS',
    });
  });

  it('o`z so`rovim kutilmoqda', () => {
    expect(canRequest(A, B, row())).toEqual({ ok: false, reason: 'REQUEST_PENDING' });
  });

  it('KELAYOTGAN so`rov bor — yangi yuborish emas, QABUL qilish kerak', () => {
    // Bu farq muhim: UI "qabul qiling" deb aytishi kerak, "xato" emas.
    expect(canRequest(B, A, row())).toEqual({ ok: false, reason: 'INCOMING_REQUEST_PENDING' });
  });

  it('BLOKLANGAN — kim bloklagani AYTILMAYDI', () => {
    // Ikkala yo'nalishda ham bir xil sabab: blok signal bo'lib
    // qolmasligi kerak.
    const blocked = row({ status: 'BLOCKED', blockedById: B });
    expect(canRequest(A, B, blocked)).toEqual({ ok: false, reason: 'BLOCKED' });
    expect(canRequest(B, A, blocked)).toEqual({ ok: false, reason: 'BLOCKED' });
  });
});

describe('canAccept', () => {
  it('so`rov KELGAN tomon qabul qiladi', () => {
    expect(canAccept(B, row())).toEqual({ ok: true });
  });

  it("SO'ROVCHI o'z so'rovini QABUL QILOLMAYDI", () => {
    // Eng ochiq suiiste'mol yo'li — alohida qo'riqlanadi.
    expect(canAccept(A, row())).toEqual({ ok: false, reason: 'NOT_ADDRESSEE' });
  });

  it('begona odam qabul qilolmaydi', () => {
    expect(canAccept(C, row())).toEqual({ ok: false, reason: 'NOT_ADDRESSEE' });
  });

  it('allaqachon qabul qilingan — takror yo`q', () => {
    expect(canAccept(B, row({ status: 'ACCEPTED' }))).toEqual({
      ok: false,
      reason: 'NOT_PENDING',
    });
  });
});

describe('canDecline', () => {
  it('kelgan tomon rad etadi', () => {
    expect(canDecline(B, row())).toEqual({ ok: true });
  });

  it('so`rovchi O`Z so`rovini bekor qila oladi', () => {
    expect(canDecline(A, row())).toEqual({ ok: true });
  });

  it('begona odam aralasha olmaydi', () => {
    expect(canDecline(C, row())).toEqual({ ok: false, reason: 'NOT_MEMBER' });
  });

  it('faqat PENDING holatda', () => {
    expect(canDecline(B, row({ status: 'ACCEPTED' }))).toEqual({
      ok: false,
      reason: 'NOT_PENDING',
    });
  });
});

describe('canRemove', () => {
  it('ikkala tomon ham do`stlikni bekor qila oladi', () => {
    const friends = row({ status: 'ACCEPTED' });
    expect(canRemove(A, friends)).toEqual({ ok: true });
    expect(canRemove(B, friends)).toEqual({ ok: true });
  });

  it('begona odam bekor qilolmaydi', () => {
    expect(canRemove(C, row({ status: 'ACCEPTED' }))).toEqual({
      ok: false,
      reason: 'NOT_MEMBER',
    });
  });

  it("BLOKNI 'do'stlikdan chiqarish' bilan ochib bo'lmaydi", () => {
    // Aks holda bloklangan odam shu yo'l bilan blokdan qutulardi.
    expect(canRemove(A, row({ status: 'BLOCKED', blockedById: B }))).toEqual({
      ok: false,
      reason: 'BLOCKED',
    });
  });
});

describe('canBlock', () => {
  it('begona odamni ham bloklash mumkin (qator shart emas)', () => {
    expect(canBlock(A, C)).toEqual({ ok: true });
  });

  it("o'zini bloklab bo'lmaydi", () => {
    expect(canBlock(A, A)).toEqual({ ok: false, reason: 'SELF_FRIENDSHIP' });
  });
});

describe('canUnblock', () => {
  it('faqat BLOKLAGAN odam ocha oladi', () => {
    expect(canUnblock(B, row({ status: 'BLOCKED', blockedById: B }))).toEqual({ ok: true });
  });

  it("BLOKLANGAN odam O'ZI ocha OLMAYDI", () => {
    // Bu shart bo'lmasa butun blok himoyasi ma'nosiz.
    expect(canUnblock(A, row({ status: 'BLOCKED', blockedById: B }))).toEqual({
      ok: false,
      reason: 'NOT_BLOCKER',
    });
  });

  it('bloklanmagan juftlikni ochib bo`lmaydi', () => {
    expect(canUnblock(A, row())).toEqual({ ok: false, reason: 'NOT_BLOCKED' });
  });
});

describe('otherSide', () => {
  it('juftlikdagi ikkinchi o`yinchini beradi', () => {
    expect(otherSide(A, row())).toBe(B);
    expect(otherSide(B, row())).toBe(A);
  });
});
