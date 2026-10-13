// The agent's timer: started once when the server starts (see instrumentation.ts). It runs the
// business by itself inside the website's own process, so it shares the same data.
import { agentEveryMinutes } from "./agent/schedule";
import { runAll } from "./agent/run";
import { mockDecider } from "./agent/mock-decider";
import { MOCK } from "./lib/mock";

export function startAgentTimer() {
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
