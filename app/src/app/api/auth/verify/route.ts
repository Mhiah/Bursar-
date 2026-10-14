import { headers } from "next/headers";
import { getAddress, isAddress, type Hex } from "viem";
import { z } from "zod";
import { body, handler, HttpError } from "@/lib/api";
import { publicClient } from "@/lib/chain";
import { one } from "@/lib/db";
import { checkLoginToken, setSession } from "@/lib/session";

const Input = z.object({ address: z.string().refine(isAddress), message: z.string(), signature: z.string(), token: z.string() });

export const POST = handler(async (req: Request) => {
  const { address, message, signature, token } = await body(req, Input);
  const host = (await headers()).get("host") ?? "bursar";
  if (!(await checkLoginToken(token, message, host))) throw new HttpError(400, "Sign-in message expired. Try again.");
  // verifyMessage also handles smart-contract wallets (ERC-1271 / ERC-6492).
  const ok = await publicClient.verifyMessage({ address: getAddress(address), message, signature: signature as Hex });
  if (!ok) throw new HttpError(401, "Signature doesn't match this wallet.");
  await setSession(getAddress(address));
  const business = await one("SELECT id, name, vault_address FROM businesses WHERE owner_address = $1", [getAddress(address)]);
  return { business: business ?? null };
});
