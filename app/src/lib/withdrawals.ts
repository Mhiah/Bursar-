import { getAddress, parseAbiItem, parseEventLogs, type Address, type Hex } from "viem";
import { network } from "@/lib/arc";
import { publicClient } from "@/lib/chain";
import { one, q } from "@/lib/db";
import type { Business } from "@/lib/session";

const withdrawn = parseAbiItem("event Withdrawn(address indexed to, uint256 amount)");
const CHUNK = 10_000n;
/** Older withdrawals are read a bit at a time, so a long history never holds anything up. */
const BACK_CHUNKS_PER_RUN = 40;
/** No vault is older than the day the vault factory went live, so reading backwards stops there. */
const OLDEST = network === "mainnet" ? Date.UTC(2026, 9, 13) : 0;

type Scan = { wd_fwd_block: string | null; wd_back_block: string | null; wd_back_done: boolean };

async function save(businessId: string, l: { transactionHash: Hex | null; logIndex: number | null; blockNumber: bigint | null; args: { to?: Address; amount?: bigint } }) {
  const block = await publicClient.getBlock({ blockNumber: l.blockNumber! });
  await q(
    `INSERT INTO withdrawals (tx_hash, log_index, business_id, to_address, amount, block_number, at)
     VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7)) ON CONFLICT (tx_hash, log_index) DO NOTHING`,
    [l.transactionHash, l.logIndex, businessId, getAddress(l.args.to!), l.args.amount!.toString(), l.blockNumber!.toString(), Number(block.timestamp)],
  );
}

/** Read the vault's withdrawals from the chain: everything new, then some of the older history. */
export async function syncWithdrawals(b: Business) {
  if (!b.vault_address) return;
  const vault = getAddress(b.vault_address) as Address;
  const s = (await one<Scan>("SELECT wd_fwd_block::text, wd_back_block::text, wd_back_done FROM businesses WHERE id = $1", [b.id]))!;
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
  const read = async (from: bigint, to: bigint) => {
    for (const l of await publicClient.getLogs({ address: vault, event: withdrawn, fromBlock: from, toBlock: to })) await save(b.id, l);
  };

  // Forwards: from where the last run stopped up to now. The first run starts at "now" and leaves the past to the backwards read.
  let from = s.wd_fwd_block == null ? latest + 1n : BigInt(s.wd_fwd_block) + 1n;
  while (from <= latest) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    await read(from, to);
    await q("UPDATE businesses SET wd_fwd_block = $1 WHERE id = $2", [to.toString(), b.id]);
    from = to + 1n;
  }
  if (s.wd_fwd_block == null) await q("UPDATE businesses SET wd_fwd_block = $1 WHERE id = $2", [latest.toString(), b.id]);

  // Backwards: older withdrawals, a limited number of blocks each run, until the factory's first day.
  if (s.wd_back_done) return;
  let top = s.wd_back_block == null ? latest : BigInt(s.wd_back_block);
  for (let i = 0; i < BACK_CHUNKS_PER_RUN && top >= 0n; i++) {
    const low = top >= CHUNK ? top - CHUNK + 1n : 0n;
    await read(low, top);
    top = low - 1n;
    const done = low === 0n || Number((await publicClient.getBlock({ blockNumber: low })).timestamp) * 1000 < OLDEST;
    await q("UPDATE businesses SET wd_back_block = $1, wd_back_done = $2 WHERE id = $3", [(top < 0n ? 0n : top).toString(), done, b.id]);
    if (done) return;
  }
}

/** A withdrawal just made on the site: saved straight from its receipt, so it shows in the list at once. */
export async function recordWithdrawal(b: Business, txHash: Hex) {
  if (!b.vault_address) return false;
  const vault = getAddress(b.vault_address);
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt || receipt.status !== "success") return false;
  const logs = parseEventLogs({ abi: [withdrawn], logs: receipt.logs }).filter((l) => getAddress(l.address) === vault);
  for (const l of logs) await save(b.id, l);
  return logs.length > 0;
}
