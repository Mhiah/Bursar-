import { keccak256, toHex } from "viem";
import { newId, one, q } from "./db";

export type DecisionKind =
  | "pay" | "early_pay" | "hold" | "approval" | "block" | "reserve" | "release"
  | "chase" | "instalment" | "screen" | "match" | "save" | "note" | "attention";

/**
 * Append to a business's decision log. Each entry's hash covers the previous entry's hash,
 * so editing or removing any entry breaks every hash after it. The latest hash is
 * anchored onchain by the agent (see agent/run.ts), which fixes the whole log up to then.
 */
export async function logDecision(
  businessId: string,
  kind: DecisionKind,
  summary: string,
  reasoning: string,
  data: Record<string, unknown> = {},
) {
  const prev = await one<{ hash: string }>(
    "SELECT hash FROM decisions WHERE business_id = $1 ORDER BY seq DESC LIMIT 1",
    [businessId],
  );
  const id = newId();
  const createdAt = new Date().toISOString();
  const body = JSON.stringify({ id, businessId, kind, summary, reasoning, data, createdAt, prev: prev?.hash ?? null }, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  const hash = keccak256(toHex(body));
  await q(
    `INSERT INTO decisions (id, business_id, kind, summary, reasoning, data, body, hash, prev_hash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, businessId, kind, summary, reasoning, JSON.parse(body).data, body, hash, prev?.hash ?? null, createdAt],
  );
  return { id, hash };
}

/** Recompute every hash in a business's log and report the first entry that doesn't match. */
export async function verifyLog(businessId: string) {
  const rows = await q<{ id: string; body: string; hash: string; prev_hash: string | null }>(
    "SELECT id, body, hash, prev_hash FROM decisions WHERE business_id = $1 ORDER BY seq",
    [businessId],
  );
  let prev: string | null = null;
  for (const r of rows) {
    const parsed = JSON.parse(r.body) as { prev: string | null };
    if (keccak256(toHex(r.body)) !== r.hash || parsed.prev !== prev || r.prev_hash !== prev)
      return { ok: false as const, brokenAt: r.id, count: rows.length };
    prev = r.hash;
  }
  return { ok: true as const, count: rows.length, head: prev };
}
