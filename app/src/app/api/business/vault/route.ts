import { getAddress, parseEventLogs, type Hex } from "viem";
import { z } from "zod";
import { body, handler, HttpError, requireBusiness } from "@/lib/api";
import { FACTORY } from "@/lib/arc";
import { bursarFactoryAbi } from "@/lib/abi/BursarFactory";
import { publicClient } from "@/lib/chain";
import { q } from "@/lib/db";
import { logDecision } from "@/lib/decisions";

const Input = z.union([
  z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }),
  z.object({ vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }),
]);

/** Record the vault the owner just created (or created earlier). Read from the chain, never trusted from the browser. */
export const POST = handler(async (req: Request) => {
  const b = await requireBusiness();
  if (b.vault_address) throw new HttpError(409, "This business already has a vault.");
  const input = await body(req, Input);
  let vault: string;
  let block: bigint;
  let tx: string | undefined;
  if ("txHash" in input) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: input.txHash as Hex });
    const events = parseEventLogs({ abi: bursarFactoryAbi, logs: receipt.logs, eventName: "VaultCreated" }).filter(
      (e) => getAddress(e.address) === getAddress(FACTORY) && getAddress(e.args.owner) === getAddress(b.owner_address),
    );
    if (!events.length) throw new HttpError(400, "That transaction didn't create a Bursar vault for your wallet.");
    vault = getAddress(events[0].args.vault);
    block = receipt.blockNumber;
    tx = input.txHash;
  } else {
    const mine = await publicClient.readContract({ address: FACTORY, abi: bursarFactoryAbi, functionName: "vaultsOf", args: [getAddress(b.owner_address)] });
    vault = getAddress(input.vault);
    if (!mine.some((v) => getAddress(v) === vault)) throw new HttpError(400, "That vault wasn't created by your wallet.");
    block = await publicClient.getBlockNumber();
  }
  await q("UPDATE businesses SET vault_address = $1, last_block = $2 WHERE id = $3", [vault, block.toString(), b.id]);
  await logDecision(b.id, "note", "Business vault created", `Vault ${vault} is owned by your wallet ${b.owner_address}. Bursar's agent can only act inside its rules.`, {
    vault,
    tx,
  });
  return { vault };
});
