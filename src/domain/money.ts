import { AppError } from "./errors";
export const MAX_CENTS = 100_000_000n;
export function cents(value: string): bigint {
  if (value.length > 9 || !/^(0|[1-9]\d*)$/.test(value))
    throw new AppError("INVALID_MONEY");
  const n = BigInt(value);
  if (n > MAX_CENTS) throw new AppError("AMOUNT_TOO_LARGE");
  return n;
}
export function dollarsToCents(value: string): string {
  if (value.length > 12) throw new AppError("INVALID_MONEY");
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match)
    throw new AppError(
      "INVALID_MONEY",
      422,
      "Use dollars with at most two decimal places.",
    );
  const n = BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0"));
  cents(n.toString());
  return n.toString();
}
export function formatMoney(value: string | bigint): string {
  const n = typeof value === "bigint" ? value : BigInt(value);
  return (
    "$" + (n / 100n).toString() + "." + (n % 100n).toString().padStart(2, "0")
  );
}
export function allocate(
  amount: bigint,
  weights: { id: string; weight: bigint }[],
): Record<string, bigint> {
  if (
    amount < 0n ||
    new Set(weights.map((w) => w.id)).size !== weights.length ||
    weights.some((w) => w.weight < 0n)
  )
    throw new AppError(
      "INVALID_WEIGHTS",
      422,
      "Use distinct participants and positive integer weights.",
      [{ path: "assignments", code: "INVALID_WEIGHTS" }],
    );
  const total = weights.reduce((s, w) => s + w.weight, 0n);
  if (!total) {
    if (amount !== 0n)
      throw new AppError(
        "ZERO_ELIGIBLE_VALUE",
        422,
        "Choose eligible items with a positive net value for this adjustment.",
        [{ path: "adjustments", code: "ZERO_ELIGIBLE_VALUE" }],
      );
    return Object.fromEntries(weights.map((w) => [w.id, 0n]));
  }
  const rows = weights.map((w) => ({
    id: w.id,
    q: (amount * w.weight) / total,
    r: (amount * w.weight) % total,
  }));
  let rest = amount - rows.reduce((s, w) => s + w.q, 0n);
  rows.sort((a, b) =>
    a.r === b.r ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.r > b.r ? -1 : 1,
  );
  for (const row of rows) {
    if (rest > 0n) {
      row.q++;
      rest--;
    }
  }
  return Object.fromEntries(rows.map((w) => [w.id, w.q]));
}
