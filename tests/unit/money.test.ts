import { describe, it, expect } from "vitest";
import { allocate, dollarsToCents, formatMoney } from "../../src/domain/money";
describe("M1 A-SPL-1 money", () => {
  it("parses lexically", () => {
    expect(dollarsToCents("0.29")).toBe("29");
    expect(dollarsToCents("12.3")).toBe("1230");
    expect(formatMoney("1001")).toBe("$10.01");
    for (const v of ["1.001", "1e3", "-1", "NaN", "01.00", "1000000.01"])
      expect(() => dollarsToCents(v)).toThrow();
  });
  it("allocates deterministic remainder", () => {
    expect(
      allocate(1000n, [
        { id: "A", weight: 1n },
        { id: "B", weight: 1n },
        { id: "C", weight: 1n },
      ]),
    ).toEqual({ A: 334n, B: 333n, C: 333n });
    expect(
      allocate(1001n, [
        { id: "A", weight: 1n },
        { id: "B", weight: 2n },
      ]),
    ).toEqual({ A: 334n, B: 667n });
  });
  it("matches exhaustive small reference cases", () => {
    for (let amount = 0n; amount < 50n; amount++)
      for (let a = 1n; a <= 5n; a++)
        for (let b = 1n; b <= 5n; b++) {
          const got = allocate(amount, [
            { id: "A", weight: a },
            { id: "B", weight: b },
          ]);
          const total = a + b;
          // Independently enumerate all integer splits and minimize deviation from ideal.
          let best: bigint[] | null = null;
          let score: bigint | null = null;
          for (let x = 0n; x <= amount; x++) {
            const err =
              (x * total - amount * a) ** 2n +
              ((amount - x) * total - amount * b) ** 2n;
            if (
              score === null ||
              err < score ||
              (err === score && x > best![0])
            ) {
              score = err;
              best = [x, amount - x];
            }
          }
          expect([got.A, got.B]).toEqual(best);
        }
  });
});
