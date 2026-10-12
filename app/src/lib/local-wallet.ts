// A wallet that lives only in this browser. The recovery phrase is encrypted with the
// owner's password and kept in localStorage; it never leaves the device. Bursar can't
// read it or recover it.
import { english, generateMnemonic, mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import type { LocalAccount, Hex } from "viem";

const KEY = "bursar.wallet.v1";

type Stored = { address: string; salt: string; iv: string; data: string; kind: "phrase" | "key" };

const b64 = (u: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(u)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function accountFrom(secret: string): { account: LocalAccount; kind: Stored["kind"] } {
  const s = secret.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(s)) return { account: privateKeyToAccount((s.startsWith("0x") ? s : `0x${s}`) as Hex), kind: "key" };
  const words = s.toLowerCase().split(/\s+/);
  if (![12, 15, 18, 21, 24].includes(words.length)) throw new Error("Enter a 12 or 24 word recovery phrase, or a private key.");
  return { account: mnemonicToAccount(words.join(" ")), kind: "phrase" };
}

async function save(secret: string, password: string) {
  if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
  const { account, kind } = accountFrom(secret);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret.trim()));
  const stored: Stored = { address: account.address, salt: b64(salt), iv: b64(iv), data: b64(data), kind };
  localStorage.setItem(KEY, JSON.stringify(stored));
  return account;
}

/** Make a brand-new wallet. Returns the recovery phrase so the owner can write it down. */
export async function createLocalWallet(password: string) {
  const phrase = generateMnemonic(english);
  const account = await save(phrase, password);
  return { account, phrase };
}

export async function importLocalWallet(secret: string, password: string) {
  return save(secret, password);
}

export function storedLocalAddress(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored).address : null;
  } catch {
    return null;
  }
}

export async function unlockLocalWallet(password: string): Promise<LocalAccount> {
  const raw = localStorage.getItem(KEY);
  if (!raw) throw new Error("No wallet saved in this browser.");
  const s = JSON.parse(raw) as Stored;
  try {
    const key = await deriveKey(password, unb64(s.salt));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(s.iv) }, key, unb64(s.data));
    return accountFrom(new TextDecoder().decode(plain)).account;
  } catch {
    throw new Error("Wrong password.");
  }
}

export function forgetLocalWallet() {
  localStorage.removeItem(KEY);
}
