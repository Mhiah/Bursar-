import { handler, HttpError, requireBusiness } from "@/lib/api";
import { runBusiness } from "@/agent/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Run the agent for the signed-in business now, instead of waiting for the next scheduled run. */
export const POST = handler(async () => {
  const b = await requireBusiness();
  if (!b.vault_address) throw new HttpError(400, "Create your vault first.");
  return runBusiness(b.id);
});
