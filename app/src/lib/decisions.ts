import { keccak256, toHex } from "viem";
import { newId, q, transaction } from "./db";

export type DecisionKind =
  | "pay" | "early_pay" | "hold" | "approval" | "block" | "reserve" | "release"
  | "chase" | "instalment" | "screen" | "match" | "save" | "note" | "attention";

/**
 * Append to a business's decision log. Each entry's hash covers the previous entry's hash,
 * so editing or removing any entry breaks every hash after it. The latest hash is
 * anchored onchain by the agent (see agent/run.ts), which fixes the whole log up to then.
 */
// One write at a time per business in this process, so two entries never take the same "previous" entry.
const queues = new Map<string, Promise<unknown>>();

export function logDecision(
  businessId: string,
  kind: DecisionKind,
  summary: string,
  reasoning: string,
  data: Record<string, unknown> = {},
): Promise<{ id: string; hash: string }> {
  const prevWrite = queues.get(businessId) ?? Promise.resolve();
  const write = prevWrite.catch(() => {}).then(() => append(businessId, kind, summary, reasoning, data));
  const tail = write.catch(() => {});
  queues.set(businessId, tail);
  tail.then(() => {
    if (queues.get(businessId) === tail) queues.delete(businessId);
  });
  return write;
}

async function append(businessId: string, kind: DecisionKind, summary: string, reasoning: string, data: Record<string, unknown>) {
  // In one transaction with the business row locked, so writers in other processes queue up too.
  return transaction(async (t) => {
    await t.q("SELECT id FROM businesses WHERE id = $1 FOR UPDATE", [businessId]);
    const prev = await t.one<{ hash: string }>("SELECT hash FROM decisions WHERE business_id = $1 ORDER BY seq DESC LIMIT 1", [businessId]);
    const id = newId();
    const createdAt = new Date().toISOString();
    const body = JSON.stringify({ id, businessId, kind, summary, reasoning, data, createdAt, prev: prev?.hash ?? null }, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    const hash = keccak256(toHex(body));
    await t.q(
      `INSERT INTO decisions (id, business_id, kind, summary, reasoning, data, body, hash, prev_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, businessId, kind, summary, reasoning, JSON.parse(body).data, body, hash, prev?.hash ?? null, createdAt],
    );
    return { id, hash };
  });
}

/** How far back a "previous" entry may be when two entries were written at the same moment (before writes queued up). */
const SAME_MOMENT = 5;

/**
 * Recompute every hash in a business's log and report the first entry that doesn't match.
 * An entry whose text was edited, or whose previous entry was removed, breaks the check.
 * Two entries written at the same moment before writes queued up both point at the same
 * earlier entry: that is allowed (and counted), as long as that entry is one of the last few.
 */
export async function verifyLog(businessId: string) {
  const rows = await q<{ id: string; body: string; hash: string; prev_hash: string | null }>(
    "SELECT id, body, hash, prev_hash FROM decisions WHERE business_id = $1 ORDER BY seq",
    [businessId],
  );
  const recent: string[] = [];
  let sameMoment = 0;
  for (const r of rows) {
    const parsed = JSON.parse(r.body) as { prev: string | null };
    const last = recent[recent.length - 1] ?? null;
    let linked = parsed.prev === last;
    if (!linked && parsed.prev && recent.slice(-SAME_MOMENT - 1, -1).includes(parsed.prev)) {
      linked = true;
      sameMoment++;
    }
    if (keccak256(toHex(r.body)) !== r.hash || r.prev_hash !== parsed.prev || !linked)
      return { ok: false as const, brokenAt: r.id, count: rows.length };
    recent.push(r.hash);
  }
  return { ok: true as const, count: rows.length, head: recent[recent.length - 1] ?? null, sameMoment };
}
