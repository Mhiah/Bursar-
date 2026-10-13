import { getAddress, parseEventLogs, type Address, type Hex } from "viem";
import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { bursarVaultAbi } from "@/lib/abi/BursarVault";
import { publicClient } from "@/lib/chain";
import { newId, one, q } from "@/lib/db";
import { runSavings } from "@/agent/savings";

const Input = z.object({ pot: z.number().int().min(0), txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

export const maxDuration = 300;

/**
 * The owner moved money from the vault to savings (one transaction they signed).
 * Check that on the chain, then have the agent put it into the pot they chose.
 */
export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  if (!b.vault_address || !b.savings_address) throw new HttpError(400, "Open your savings account first.");
  const { pot, txHash } = await body(req, Input);
  if (await one("SELECT 1 FROM savings_moves WHERE tx_hash = $1", [txHash])) throw new HttpError(409, "That transfer is already recorded.");
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
  const sent = parseEventLogs({ abi: bursarVaultAbi, logs: receipt.logs, eventName: "Withdrawn" }).find(
    (e) => getAddress(e.address) === getAddress(b.vault_address!) && getAddress(e.args.to) === getAddress(b.savings_address!),
  );
  if (!sent) throw new HttpError(400, "That transaction didn't move money from your vault to your savings.");
  await q("INSERT INTO savings_moves (id, business_id, pot, amount, source, status, tx_hash) VALUES ($1,$2,$3,$4,'owner','pending',$5)", [
    newId(),
    b.id,
    pot,
    sent.args.amount.toString(),
    txHash,
  ]);
  // Put it into the pot straight away rather than waiting for the next agent run.
  await runSavings({ ...b, savings_plans: {} }, getAddress(b.vault_address) as Address);
  return { ok: true };
});
