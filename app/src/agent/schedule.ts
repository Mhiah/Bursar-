import { MOCK } from "@/lib/mock";

/** How often the agent runs by itself. Test mode is free (pretend AI), so it runs often;
 * with the real AI every run is paid, so the default is every 6 hours. AGENT_EVERY_MINUTES
 * changes it, and 0 turns the timer off. */
export function agentEveryMinutes() {
  const set = process.env.AGENT_EVERY_MINUTES;
  if (set !== undefined && set !== "") return Math.max(0, Number(set) || 0);
  return MOCK ? 2 : 360;
}
