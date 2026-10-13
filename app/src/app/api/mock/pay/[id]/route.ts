import { z } from "zod";
import { createWalletClient, getAddress, http, parseAbi, parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { body, handler, HttpError } from "@/lib/api";
import { chain, USDC } from "@/lib/arc";
import { publicClient } from "@/lib/chain";
import { one } from "@/lib/db";
import { MOCK, MOCK_CUSTOMER_KEY, MOCK_MINTER_KEY } from "@/lib/mock";
import type { Business } from "@/lib/session";
import { syncIncoming } from "@/agent/incoming";

const usdc = parseAbi(["function mint(address to, uint256 amount)", "function transfer(address to, uint256 amount) returns (bool)"]);

/** Test mode only: a test customer pays this invoice with fake USDC, then the vault picks it up. */
export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  if (!MOCK) throw new HttpError(404, "Not found");
  const { amount } = await body(req, z.object({ amount: z.string().regex(/^\d+(\.\d{1,6})?$/) }));
  const r = await one<{ business_id: string }>("SELECT business_id FROM payment_requests WHERE id = $1", [params.id]);
  if (!r) throw new HttpError(404, "This payment link isn't valid.");
  const b = await one<Business>("SELECT * FROM businesses WHERE id = $1", [r.business_id]);
  if (!b?.vault_address) throw new HttpError(400, "This business has no vault yet.");
  const units = parseUnits(amount, 6);
  const transport = http(process.env.ARC_RPC_URL);
  const minter = createWalletClient({ account: privateKeyToAccount(MOCK_MINTER_KEY), chain, transport });
  const customer = createWalletClient({ account: privateKeyToAccount(MOCK_CUSTOMER_KEY), chain, transport });
  await publicClient.waitForTransactionReceipt({ hash: await minter.writeContract({ address: USDC, abi: usdc, functionName: "mint", args: [customer.account.address, units] }) });
  const hash = await customer.writeContract({ address: USDC, abi: usdc, functionName: "transfer", args: [getAddress(b.vault_address) as Address, units] });
  await publicClient.waitForTransactionReceipt({ hash });
  // Pick it up now, as the agent would on its next run.
  await syncIncoming(b);
  return { txHash: hash };
});
