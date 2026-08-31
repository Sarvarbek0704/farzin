import {
  ACPL_REFERENCE_CP,
  DECIDED_EVAL_CP,
  ENGINE_MIN_SAMPLE,
  engineCorrelation,
  T1_BASELINE,
  type EngineMoveObservation,
} from './engine-correlation';

/**
 * Engine korrelyatsiya matematikasi — docs/08-fair-play.md §2.1.
 * Fixture'lar: mukammal engine o'yini → yuqori kuch; inson aralash
 * o'yini → past; hal bo'lgan pozitsiyalar chiqariladi; kichik namuna → null.
 */
describe('modules/fairplay/engine/engine-correlation', () => {
  function perfectMove(i: number): EngineMoveObservation {
    return {
      playedUci: 'e2e4',
      bestMoveUci: 'e2e4',
      evalBeforeCp: 20 + (i % 5),
      evalAfterCp: 20 + (i % 5), // yo'qotish 0
    };
  }

  function humanMove(i: number): EngineMoveObservation {
    const blunder = i % 6 === 0;
    return {
      playedUci: blunder ? 'a2a3' : 'e2e4',
      bestMoveUci: 'e2e4',
      evalBeforeCp: 30,
      // Og'ir dum: vaqti-vaqti bilan 200+ cp xato (§2.1 2-band tavsifi).
      evalAfterCp: blunder ? -220 : 30 - (i % 4) * 15,
    };
  }

  it("mukammal engine o'yini → T1=1, CPL=0, kuch yuqori", () => {
    const obs = Array.from({ length: 30 }, (_, i) => perfectMove(i));
    const result = engineCorrelation(obs);

    expect(result).not.toBeNull();
    expect(result!.topOneMatchRate).toBe(1);
    expect(result!.avgCentipawnLoss).toBe(0);
    expect(result!.cplStdDev).toBe(0);
    expect(result!.strength).toBeGreaterThan(0.9);
  });

  it("inson-simon aralash o'yin → sezilarli past kuch (og'ir dum bor)", () => {
    const human = engineCorrelation(Array.from({ length: 30 }, (_, i) => humanMove(i)));
    const engine = engineCorrelation(Array.from({ length: 30 }, (_, i) => perfectMove(i)));

    expect(human).not.toBeNull();
    expect(human!.topOneMatchRate).toBeLessThan(1);
    expect(human!.cplStdDev).toBeGreaterThan(50); // dum dispersiyani oshiradi
    expect(human!.strength).toBeLessThan(engine!.strength - 0.3);
  });

  it("hal bo'lgan pozitsiyalar (|eval| > 500cp) chiqariladi — §2.1 DECIDED", () => {
    const scored = Array.from({ length: ENGINE_MIN_SAMPLE }, (_, i) => perfectMove(i));
    const decided: EngineMoveObservation[] = [
      {
        playedUci: 'e2e4',
        bestMoveUci: 'e2e4',
        evalBeforeCp: DECIDED_EVAL_CP + 1,
        evalAfterCp: 600,
      },
      {
        playedUci: 'e2e4',
        bestMoveUci: 'e2e4',
        evalBeforeCp: -(DECIDED_EVAL_CP + 100),
        evalAfterCp: -700,
      },
    ];
    const result = engineCorrelation([...scored, ...decided]);

    expect(result).not.toBeNull();
    expect(result!.sampleSize).toBe(ENGINE_MIN_SAMPLE);
    expect(result!.excludedCount).toBe(2);
  });

  it('filtrdan keyin namuna < 20 → null (§9.3 minimal namuna)', () => {
    const obs = Array.from({ length: ENGINE_MIN_SAMPLE - 1 }, (_, i) => perfectMove(i));
    expect(engineCorrelation(obs)).toBeNull();

    // 25 kuzatuv, lekin 6 tasi DECIDED → 19 qoladi → null.
    const mixed = [
      ...Array.from({ length: 19 }, (_, i) => perfectMove(i)),
      ...Array.from({ length: 6 }, () => ({
        playedUci: 'e2e4',
        bestMoveUci: 'e2e4',
        evalBeforeCp: 900,
        evalAfterCp: 900,
      })),
    ];
    expect(engineCorrelation(mixed)).toBeNull();
  });

  it("CPL hech qachon manfiy emas — yaxshilangan baho 0 yo'qotish", () => {
    // O'ynalgan yurish bahoni OSHIRGAN (engine chuqurroq ko'rmagan) —
    // cpLoss 0 bo'lishi kerak, manfiy emas.
    const obs = Array.from({ length: 25 }, () => ({
      playedUci: 'g1f3',
      bestMoveUci: 'e2e4',
      evalBeforeCp: 10,
      evalAfterCp: 50,
    }));
    const result = engineCorrelation(obs);
    expect(result!.avgCentipawnLoss).toBe(0);
  });

  it("baseline'gacha T1 signal bermaydi (kuchli o'yinchi FP himoyasi, §2.1)", () => {
    // T1 aynan baseline atrofida, CPL sog'lom dumli — kuch past bo'lishi kerak.
    const n = 40;
    const t1Count = Math.floor(n * T1_BASELINE);
    const obs = Array.from({ length: n }, (_, i): EngineMoveObservation => {
      const match = i < t1Count;
      const blunder = i % 5 === 0;
      return {
        playedUci: match ? 'e2e4' : 'a2a3',
        bestMoveUci: 'e2e4',
        evalBeforeCp: 30,
        evalAfterCp: blunder ? -200 : 10,
      };
    });
    const result = engineCorrelation(obs);
    expect(result!.strength).toBeLessThan(0.35);
  });

  it('kuch har doim 0..1', () => {
    for (const acpl of [0, ACPL_REFERENCE_CP, 500]) {
      const obs = Array.from({ length: 25 }, () => ({
        playedUci: 'e2e4',
        bestMoveUci: 'e2e4',
        evalBeforeCp: 0,
        evalAfterCp: -acpl,
      }));
      const result = engineCorrelation(obs);
      expect(result!.strength).toBeGreaterThanOrEqual(0);
      expect(result!.strength).toBeLessThanOrEqual(1);
    }
  });
});
