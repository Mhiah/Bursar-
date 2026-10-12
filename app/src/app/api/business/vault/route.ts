import { getAddress, parseEventLogs, type Hex } from "viem";
import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { FACTORY } from "@/lib/arc";
import { bursarFactoryAbi } from "@/lib/abi/BursarFactory";
import { publicClient } from "@/lib/chain";
import { q } from "@/lib/db";
import { logDecision } from "@/lib/decisions";

const Input = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

/** Record the vault the owner just created. Read from the chain, never trusted from the browser. */
export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  if (b.vault_address) throw new HttpError(409, "This business already has a vault.");
  const { txHash } = await body(req, Input);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
  const events = parseEventLogs({ abi: bursarFactoryAbi, logs: receipt.logs, eventName: "VaultCreated" }).filter(
    (e) => getAddress(e.address) === getAddress(FACTORY) && getAddress(e.args.owner) === getAddress(b.owner_address),
  );
  if (!events.length) throw new HttpError(400, "That transaction didn't create a Bursar vault for your wallet.");
  const vault = getAddress(events[0].args.vault);
  await q("UPDATE businesses SET vault_address = $1, last_block = $2 WHERE id = $3", [vault, receipt.blockNumber.toString(), b.id]);
  await logDecision(b.id, "note", "Business vault created", `Vault ${vault} is owned by your wallet ${b.owner_address}. Bursar's agent can only act inside its rules.`, {
    vault,
    tx: txHash,
  });
  return { vault };
});
