import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAddress, type Address } from "viem";
import { one } from "./db";

const COOKIE = "bursar_session";
const MAX_AGE = 7 * 24 * 3600;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (16+ characters)");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** Sign-in message the owner's wallet signs. It carries a nonce and an expiry, both checked on verify. */
export function loginMessage(host: string) {
  const nonce = randomBytes(12).toString("hex");
  const expires = Date.now() + 10 * 60 * 1000;
  const body = `Sign in to Bursar at ${host}\n\nThis only proves you own this wallet. It does not move money.\n\nNonce: ${nonce}\nExpires: ${new Date(expires).toISOString()}`;
  return { message: body, token: `${nonce}.${expires}.${sign(`${nonce}.${expires}.${host}`)}` };
}

export async function checkLoginToken(token: string, message: string, host: string) {
  const [nonce, expires, mac] = token.split(".");
  if (!nonce || !expires || !mac) return false;
  if (Date.now() > Number(expires)) return false;
  if (!safeEqual(mac, sign(`${nonce}.${expires}.${host}`))) return false;
  if (!(message.includes(`Nonce: ${nonce}`) && message.includes(`at ${host}\n`))) return false;
  // Each sign-in message works once.
  const fresh = await one("INSERT INTO used_nonces (nonce) VALUES ($1) ON CONFLICT DO NOTHING RETURNING nonce", [nonce]);
  return !!fresh;
}

export async function setSession(address: Address) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${getAddress(address)}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function sessionAddress(): Promise<Address | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [addr, exp, mac] = raw.split(".");
  if (!addr || !exp || !mac) return null;
  if (!safeEqual(mac, sign(`${addr}.${exp}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return addr as Address;
}

export type Business = {
  id: string;
  owner_address: string;
  name: string;
  email: string | null;
  vault_address: string | null;
  savings_address: string | null;
  savings_plans: SavingsPlans;
  settings: BusinessSettings;
  last_block: string | null;
  created_at: string;
};

export type SavingsPlans = {
  /** Save a share of every customer payment. `since` keeps older payments out. */
  whenPaid?: { pot: number; percent: number; since: string } | null;
};

export type BusinessSettings = {
  /** Days of upcoming bills to keep as operating cash before moving surplus to reserve. */
  operatingDays?: number;
  /** Most instalments the agent may offer on one invoice. 0 turns instalments off. */
  maxInstalments?: number;
  /** Longest an instalment plan may run, in days. */
  maxInstalmentDays?: number;
  /** Smallest invoice the agent may split. */
  minInstalmentAmount?: number;
  /** Channels the agent may chase on. */
  chaseChannels?: ("email" | "telegram" | "whatsapp")[];
  /** Days between reminders to the same customer. */
  chaseEveryDays?: number;
  /** Pay early when there's spare cash and the bill is due within this many days. */
  earlyPayDays?: number;
};

export const defaultSettings: Required<BusinessSettings> = {
  operatingDays: 30,
  maxInstalments: 3,
  maxInstalmentDays: 60,
  minInstalmentAmount: 0,
  chaseChannels: ["email", "telegram", "whatsapp"],
  chaseEveryDays: 3,
  earlyPayDays: 7,
};

export async function currentBusiness(): Promise<Business | null> {
  const addr = await sessionAddress();
  if (!addr) return null;
  return (await one<Business>("SELECT * FROM businesses WHERE owner_address = $1", [addr])) ?? null;
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
