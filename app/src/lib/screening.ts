import { getAddress, parseAbiItem, type Address } from "viem";
import { publicClient } from "./chain";
import { USDC } from "./arc";
import { one, q } from "./db";

export type Reason = { code: string; detail: string };
export type Screening = { status: "clear" | "review" | "blocked"; reasons: Reason[]; checkedAt: string };

const DAY = 24 * 3600 * 1000;

/** Chainalysis free sanctions API. Returns the listed identifications, or null if the check couldn't run. */
async function chainalysis(addr: Address): Promise<{ name: string; category: string }[] | null> {
  const key = process.env.CHAINALYSIS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://public.chainalysis.com/api/v1/address/${addr}`, {
      headers: { "X-API-Key": key, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { identifications?: { name?: string; category?: string }[] };
    return (body.identifications ?? []).map((i) => ({ name: i.name ?? "unknown", category: i.category ?? "sanctions" }));
  } catch {
    return null;
  }
}

const blacklistAbi = [
  { type: "function", name: "isBlacklisted", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

/** Circle's own USDC blocklist. A blocklisted wallet can't send or receive USDC. */
async function usdcBlocklisted(addr: Address): Promise<boolean | null> {
  try {
    return await publicClient.readContract({ address: USDC, abi: blacklistAbi, functionName: "isBlacklisted", args: [addr] });
  } catch {
    return null;
  }
}

/** Sanctions and blocklist only, cached for a day. */
export async function sanctionsCheck(address: string, { fresh = false } = {}): Promise<Screening> {
  const addr = getAddress(address);
  if (!fresh) {
    const cached = await one<{ result: Screening; checked_at: string }>("SELECT * FROM screenings WHERE address = $1", [addr]);
    if (cached && Date.now() - new Date(cached.checked_at).getTime() < DAY) return cached.result;
  }
  const reasons: Reason[] = [];
  let status: Screening["status"] = "clear";

  const [ids, blocked] = await Promise.all([chainalysis(addr), usdcBlocklisted(addr)]);
  if (ids === null) {
    reasons.push({ code: "sanctions_unchecked", detail: "The sanctions list couldn't be checked just now." });
    status = "review";
  } else if (ids.length) {
    reasons.push({ code: "sanctioned", detail: `On a sanctions list: ${ids.map((i) => i.name).join(", ")}.` });
    status = "blocked";
  }
  if (blocked) {
    reasons.push({ code: "usdc_blocklisted", detail: "Circle has blocked this wallet from using USDC." });
    status = "blocked";
  }

  const result: Screening = { status, reasons, checkedAt: new Date().toISOString() };
  // Only cache a full result, so a failed lookup is retried next time.
  if (ids !== null) {
    await q(
      `INSERT INTO screenings (address, result, checked_at) VALUES ($1, $2, now())
       ON CONFLICT (address) DO UPDATE SET result = EXCLUDED.result, checked_at = now()`,
      [addr, JSON.stringify(result)],
    );
  }
  return result;
}

/** Two different addresses that share the first and last characters people glance at. */
export function looksAlike(a: string, b: string) {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x !== y && x.slice(2, 6) === y.slice(2, 6) && x.slice(-4) === y.slice(-4);
}

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/** Wallets that recently sent USDC to `addr`, newest first. Bounded so it stays cheap. */
async function recentSenders(addr: Address, blocks = 50_000n, max = 15): Promise<Address[]> {
  try {
    const latest = await publicClient.getBlockNumber();
    const logs = await publicClient.getLogs({
      address: USDC,
      event: transferEvent,
      args: { to: addr },
      fromBlock: latest > blocks ? latest - blocks : 0n,
      toBlock: latest,
    });
    const seen = new Set<Address>();
    for (const l of logs.reverse()) {
      if (l.args.from) seen.add(getAddress(l.args.from));
      if (seen.size >= max) break;
    }
    return [...seen];
  } catch {
    return [];
  }
}

/**
 * Full check before paying a wallet: sanctions, Circle's blocklist, a brand-new wallet,
 * a lookalike of a wallet the business already knows, a recent wallet change,
 * and whether the wallet has been receiving money from sanctioned wallets.
 */
export async function screenPayee(
  address: string,
  ctx: { knownAddresses: string[]; walletChangedAt?: string | null; previousWallet?: string | null },
): Promise<Screening> {
  const addr = getAddress(address);
  const base = await sanctionsCheck(addr);
  const reasons = [...base.reasons];
  let status = base.status;
  const raise = (s: Screening["status"]) => {
    if (status === "blocked" || s === "clear") return;
    status = s;
  };

  const twin = ctx.knownAddresses.find((k) => looksAlike(k, addr));
  if (twin) {
    reasons.push({ code: "lookalike", detail: `Looks like another wallet you pay (${twin}) but isn't the same. This is a common scam.` });
    raise("review");
  }

  if (ctx.walletChangedAt && Date.now() - new Date(ctx.walletChangedAt).getTime() < 30 * DAY) {
    reasons.push({
      code: "wallet_changed",
      detail: `This supplier's wallet changed recently${ctx.previousWallet ? ` (was ${ctx.previousWallet})` : ""}. Confirm the change with them another way.`,
    });
    raise("review");
  }

  try {
    const [nonce, code] = await Promise.all([publicClient.getTransactionCount({ address: addr }), publicClient.getCode({ address: addr })]);
    if (nonce === 0 && !code) {
      reasons.push({ code: "new_wallet", detail: "This wallet has never sent a transaction." });
      raise("review");
    }
  } catch {
    /* RPC hiccup: not a reason to block */
  }

  const senders = await recentSenders(addr);
  for (const s of senders) {
    const r = await sanctionsCheck(s);
    if (r.status === "blocked") {
      reasons.push({ code: "tainted_funds", detail: `Recently received money from a blocked wallet (${s}).` });
      raise("review");
      break;
    }
  }

  return { status, reasons, checkedAt: new Date().toISOString() };
}

/** Check a wallet that paid the business. */
export async function screenPayer(address: string): Promise<Screening> {
  return sanctionsCheck(address);
}
