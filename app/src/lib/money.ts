// USDC on Arc's ERC-20 interface has 6 decimals.
export const DECIMALS = 6;
const UNIT = 10n ** BigInt(DECIMALS);

/** "12.5" -> 12500000n. Throws on anything that isn't a plain non-negative amount. */
export function toUnits(amount: string | number): bigint {
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Not an amount: ${amount}`);
  const [whole, frac = ""] = s.split(".");
  if (frac.length > DECIMALS) throw new Error(`Too many decimals: ${amount}`);
  return BigInt(whole) * UNIT + BigInt(frac.padEnd(DECIMALS, "0"));
}

/** 12500000n -> "12.50" (at least two decimals, trailing zeros trimmed after that). */
export function fromUnits(units: bigint | string | number): string {
  const n = BigInt(units);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / UNIT;
  let frac = (abs % UNIT).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

export const usd = (units: bigint | string | number) => `$${fromUnits(units)}`;
