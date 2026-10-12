// Runs the agent for every business on a timer. Start with `npm run agent`
// (or `npm run agent:once` for a single pass). Needs DATABASE_URL so it can
// share the database with the website.
import { runAll } from "./run";

const once = process.argv.includes("--once");
const every = Number(process.env.AGENT_INTERVAL_SECONDS || 120) * 1000;

async function tick() {
  const started = new Date().toISOString();
  try {
    const result = await runAll();
    console.log(started, JSON.stringify(result));
  } catch (e) {
    console.error(started, e);
  }
}

(async () => {
  await tick();
  if (once) process.exit(0);
  for (;;) {
    await new Promise((r) => setTimeout(r, every));
    await tick();
  }
})();
