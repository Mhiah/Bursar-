import { createWalletClient, getAddress, http, parseAbi, parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { handler, HttpError, requireBusiness } from "@/lib/api";
import { chain, USDC } from "@/lib/arc";
import { publicClient } from "@/lib/chain";
import { MOCK, MOCK_MINTER_KEY } from "@/lib/mock";

/** Test mode only: put 100 fake USDC into the business vault. */
export const POST = handler(async () => {
  if (!MOCK) throw new HttpError(404, "Not found");
  const b = await requireBusiness();
  if (!b.vault_address) throw new HttpError(400, "Create your vault first.");
  const w = createWalletClient({ account: privateKeyToAccount(MOCK_MINTER_KEY), chain, transport: http(process.env.ARC_RPC_URL) });
  const hash = await w.writeContract({
    address: USDC,
    abi: parseAbi(["function mint(address to, uint256 amount)"]),
    functionName: "mint",
    args: [getAddress(b.vault_address) as Address, parseUnits("100", 6)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { ok: true };
});
