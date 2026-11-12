// The agent's timer: started once when the server starts (see instrumentation.ts). It runs the
// business by itself inside the website's own process, so it shares the same data.
import { agentEveryMinutes } from "./agent/schedule";
import { runAll } from "./agent/run";
import { mockDecider } from "./agent/mock-decider";
import { MOCK } from "./lib/mock";
import { q } from "./lib/db";
import { syncIncoming } from "./agent/incoming";
import type { Business } from "./lib/session";

/** Money that arrived is looked for every 5 minutes, on its own (no AI, so it's free): an invoice shows as paid
 * soon after the customer pays, without waiting for the agent's next run. PAYMENTS_EVERY_SECONDS changes it, 0 turns it off. */
function startPaymentsTimer() {
  const set = process.env.PAYMENTS_EVERY_SECONDS;
  const seconds = set !== undefined && set !== "" ? Math.max(0, Number(set) || 0) : MOCK ? 15 : 300;
  if (!seconds) return;
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const rows = await q<Business>("SELECT * FROM businesses WHERE vault_address IS NOT NULL");
      for (const b of rows) await syncIncoming(b).catch((e) => console.error(new Date().toISOString(), "payments check failed", b.id, e));
    } catch (e) {
      console.error(new Date().toISOString(), "payments check failed", e);
    } finally {
      running = false;
    }
  }, seconds * 1000);
}

export function startAgentTimer() {
  startPaymentsTimer();
  const minutes = agentEveryMinutes();
  if (!minutes) return;
  const tick = async () => {
    try {
      console.log(new Date().toISOString(), "agent run", JSON.stringify(await (MOCK ? runAll(mockDecider) : runAll())));
    } catch (e) {
      console.error(new Date().toISOString(), "agent run failed", e);
    }
  };
  // First run a minute after start, then on the timer.
  setTimeout(() => {
    tick();
    setInterval(tick, minutes * 60_000);
  }, 60_000);
  console.log(`The agent runs by itself every ${minutes} minute(s).`);
}
