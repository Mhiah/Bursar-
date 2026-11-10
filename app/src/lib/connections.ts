import { createHash, randomBytes } from "node:crypto";
import { newId, one, q } from "./db";
import type { Business } from "./session";

const hash = (key: string) => createHash("sha256").update(key).digest("hex");
export const MAX_CONNECTIONS = 10;

/** A new secret key. It's returned once and only its hash is kept. */
export async function createConnection(businessId: string, name: string) {
  const live = await one<{ n: string }>("SELECT count(*)::text AS n FROM connections WHERE business_id = $1 AND revoked_at IS NULL", [businessId]);
  if (Number(live?.n ?? 0) >= MAX_CONNECTIONS) throw new Error(`You can have ${MAX_CONNECTIONS} connections at most. Remove one first.`);
  const key = "bsk_" + randomBytes(24).toString("base64url");
  const id = newId();
  await q("INSERT INTO connections (id, business_id, name, key_hash, last4) VALUES ($1,$2,$3,$4,$5)", [id, businessId, name, hash(key), key.slice(-4)]);
  return { id, key };
}

export async function listConnections(businessId: string) {
  return q<{ id: string; name: string; last4: string; created_at: string; last_used_at: string | null }>(
    "SELECT id, name, last4, created_at, last_used_at FROM connections WHERE business_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC",
    [businessId],
  );
}

export async function revokeConnection(businessId: string, id: string) {
  return !!(await one("UPDATE connections SET revoked_at = now() WHERE id = $1 AND business_id = $2 AND revoked_at IS NULL RETURNING id", [id, businessId]));
}

/** The business a key belongs to, or null if it's unknown or removed. */
export async function businessForKey(key: string): Promise<{ business: Business; connection: { id: string; name: string } } | null> {
  if (!/^bsk_[A-Za-z0-9_-]{32}$/.test(key)) return null;
  const c = await one<{ id: string; name: string; business_id: string }>(
    "UPDATE connections SET last_used_at = now() WHERE key_hash = $1 AND revoked_at IS NULL RETURNING id, name, business_id",
    [hash(key)],
  );
  if (!c) return null;
  const business = await one<Business>("SELECT * FROM businesses WHERE id = $1", [c.business_id]);
  return business ? { business, connection: { id: c.id, name: c.name } } : null;
}
