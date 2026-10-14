import { handler, HttpError, requireBusiness } from "@/lib/api";
import { one } from "@/lib/db";
import { runBusiness } from "@/agent/run";
import { mockDecider } from "@/agent/mock-decider";
import { MOCK } from "@/lib/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Run the agent for the signed-in business now, instead of waiting for the next scheduled run. */
export const POST = handler(async () => {
  const b = await requireBusiness();
  if (!b.vault_address) throw new HttpError(400, "Create your vault first.");
  // Each real run pays for AI, so the button can't be pressed in a loop.
  if (!MOCK) {
    const ok = await one(
      "UPDATE businesses SET last_manual_run_at = now() WHERE id = $1 AND (last_manual_run_at IS NULL OR last_manual_run_at < now() - interval '5 minutes') RETURNING id",
      [b.id],
    );
    if (!ok) throw new HttpError(429, "The agent ran a moment ago. Try again in a few minutes.");
  }
  // Test mode uses a pretend AI so no real AI calls are paid for.
  return MOCK ? runBusiness(b.id, mockDecider) : runBusiness(b.id);
});
