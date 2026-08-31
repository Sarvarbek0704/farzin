import { Color, FloatDirection } from '../../core/pairing/pairing.types';
import type { PairingHistoryEntry, ParticipantSeed } from './arbiter.types';
import { buildPairingStates } from './pairing-state.builder';

/**
 * Juftliklar tarixi → PlayerPairingState testlari — kichik fixture bilan
 * (docs/05-pairing-engine.md §2 dagi holat maydonlari semantikasi).
 */

function seed(
  registrationId: string,
  pairingNumber: number,
  overrides: Partial<ParticipantSeed> = {},
): ParticipantSeed {
  return {
    registrationId,
    pairingNumber,
    ratingAtEntry: null,
    isWithdrawn: false,
    joinedAtRound: null,
    ...overrides,
  };
}

describe('buildPairingStates', () => {
  /**
   * 3 o'yinchi, 2 tur o'tgan:
   *   R1: A(oq) 1-0 B;  C — BYE_FULL
   *   R2: C(oq) ½-½ A;  B — BYE_FULL
   */
  const history: PairingHistoryEntry[] = [
    { roundNumber: 1, whiteRegistrationId: 'A', blackRegistrationId: 'B', result: 'WHITE_WIN' },
    { roundNumber: 1, whiteRegistrationId: 'C', blackRegistrationId: null, result: 'BYE_FULL' },
    { roundNumber: 2, whiteRegistrationId: 'C', blackRegistrationId: 'A', result: 'DRAW' },
    { roundNumber: 2, whiteRegistrationId: 'B', blackRegistrationId: null, result: 'BYE_FULL' },
  ];

  const participants = [
    seed('A', 1, { ratingAtEntry: 2000 }),
    seed('B', 2, { ratingAtEntry: 1800 }),
    seed('C', 3),
  ];

  const states = buildPairingStates(participants, history);
  const byId = new Map(states.map((s) => [String(s.playerId), s]));

  it("ochkolar natijalardan yig'iladi (bye ham kiradi)", () => {
    expect(byId.get('A')?.points).toBe(1.5); // 1 + 0.5
    expect(byId.get('B')?.points).toBe(1); // 0 + bye
    expect(byId.get('C')?.points).toBe(1.5); // bye + 0.5
  });

  it('opponentIds — faqat real raqiblar, bye kirmaydi', () => {
    expect([...(byId.get('A')?.opponentIds ?? [])].sort()).toEqual(['B', 'C']);
    expect([...(byId.get('B')?.opponentIds ?? [])]).toEqual(['A']);
    expect([...(byId.get('C')?.opponentIds ?? [])]).toEqual(['A']);
  });

  it("colorHistory — taxtada o'ynalgan partiyalar, tur tartibida", () => {
    expect(byId.get('A')?.colorHistory).toEqual([Color.White, Color.Black]);
    expect(byId.get('B')?.colorHistory).toEqual([Color.Black]); // bye'da element YO'Q
    expect(byId.get('C')?.colorHistory).toEqual([Color.White]);
  });

  it("hasReceivedBye — o'tmishdagi BYE_FULL dan", () => {
    expect(byId.get('A')?.hasReceivedBye).toBe(false);
    expect(byId.get('B')?.hasReceivedBye).toBe(true);
    expect(byId.get('C')?.hasReceivedBye).toBe(true);
  });

  it('pairingNumber, rating va default maydonlar', () => {
    const a = byId.get('A');
    expect(a?.pairingNumber).toBe(1);
    expect(a?.rating).toBe(2000);
    expect(a?.isWithdrawn).toBe(false);
    expect(a?.joinedAtRound).toBe(1); // null → 1
    expect(byId.get('C')?.rating).toBe(0); // reytingsiz → 0
  });

  it('floatHistory — har yakunlangan tur uchun bitta element (FIDE 1.4)', () => {
    // R1: A(0)–B(0) teng ochko → float yo'q; C BYE_FULL → Down (1.4.3).
    // R2: C(1.0)–A(1.0) teng → float yo'q; B BYE_FULL → Down.
    expect(byId.get('A')?.floatHistory).toEqual([FloatDirection.None, FloatDirection.None]);
    expect(byId.get('B')?.floatHistory).toEqual([FloatDirection.None, FloatDirection.Down]);
    expect(byId.get('C')?.floatHistory).toEqual([FloatDirection.Down, FloatDirection.None]);
  });

  it('isWithdrawn va joinedAtRound uzatiladi', () => {
    const [state] = buildPairingStates([seed('X', 5, { isWithdrawn: true, joinedAtRound: 3 })], []);
    expect(state?.isWithdrawn).toBe(true);
    expect(state?.joinedAtRound).toBe(3);
  });

  it("UNPLAYED juftlik: raqib ro'yxatga kiradi, ochko va rang kirmaydi", () => {
    const [state] = buildPairingStates(
      [seed('A', 1)],
      [
        {
          roundNumber: 3,
          whiteRegistrationId: 'A',
          blackRegistrationId: 'B',
          result: 'UNPLAYED',
        },
      ],
    );
    expect([...(state?.opponentIds ?? [])]).toEqual(['B']); // juftlik berilgan — FIDE C1
    expect(state?.points).toBe(0);
    expect(state?.colorHistory).toEqual([]);
  });

  it("bo'sh tarix — toza boshlang'ich holat", () => {
    const [state] = buildPairingStates([seed('A', 1)], []);
    expect(state).toMatchObject({
      points: 0,
      hasReceivedBye: false,
      colorHistory: [],
      floatHistory: [],
    });
    expect(state?.opponentIds.size).toBe(0);
  });

  describe('Swiss uchun float va C2 semantikasi', () => {
    it("turli ochkolilar o'ynasa: yuqorisi Down, pastkisi Up (1.4.2)", () => {
      // R1: A g'alaba (1.0), B mag'lub (0). R2: A–B emas — A(1.0) vs C(0).
      const states = buildPairingStates(
        [seed('A', 1), seed('B', 2), seed('C', 3)],
        [
          {
            roundNumber: 1,
            whiteRegistrationId: 'A',
            blackRegistrationId: 'B',
            result: 'WHITE_WIN',
          },
          {
            roundNumber: 1,
            whiteRegistrationId: 'C',
            blackRegistrationId: null,
            result: 'BYE_ZERO',
          },
          { roundNumber: 2, whiteRegistrationId: 'C', blackRegistrationId: 'A', result: 'DRAW' },
        ],
      );
      const byIdLocal = new Map(states.map((s) => [String(s.playerId), s]));
      // R2 boshida: A=1.0, C=0 → A Down, C Up.
      expect(byIdLocal.get('A')?.floatHistory).toEqual([FloatDirection.None, FloatDirection.Down]);
      expect(byIdLocal.get('C')?.floatHistory).toEqual([FloatDirection.None, FloatDirection.Up]);
      // BYE_ZERO — float emas (1.4.4).
      expect(byIdLocal.get('B')?.floatHistory).toEqual([FloatDirection.None, FloatDirection.None]);
    });

    it("forfeit g'alaba: C2 blokeri (hasReceivedBye) va Down float (1.4.3)", () => {
      const states = buildPairingStates(
        [seed('A', 1), seed('B', 2)],
        [
          {
            roundNumber: 1,
            whiteRegistrationId: 'A',
            blackRegistrationId: 'B',
            result: 'WHITE_WIN_FORFEIT',
          },
        ],
      );
      const byIdLocal = new Map(states.map((s) => [String(s.playerId), s]));
      const a = byIdLocal.get('A');
      expect(a?.hasReceivedBye).toBe(true); // o'ynamasdan g'alaba → PAB mumkin emas
      expect(a?.floatHistory).toEqual([FloatDirection.Down]);
      expect(a?.colorHistory).toEqual([]); // taxtada o'ynalmagan
      const b = byIdLocal.get('B');
      expect(b?.hasReceivedBye).toBe(false);
      expect(b?.floatHistory).toEqual([FloatDirection.None]);
    });

    it('BYE_HALF: Down float (0.5 > 0, 1.4.3), lekin C2 blokeri EMAS', () => {
      const states = buildPairingStates(
        [seed('A', 1)],
        [
          {
            roundNumber: 1,
            whiteRegistrationId: 'A',
            blackRegistrationId: null,
            result: 'BYE_HALF',
          },
        ],
      );
      expect(states[0]?.floatHistory).toEqual([FloatDirection.Down]);
      expect(states[0]?.hasReceivedBye).toBe(false); // yarim ochko — g'alaba emas
    });
  });
});
