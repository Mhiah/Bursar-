// Runs once when the server starts. Node only: the agent's timer needs the database.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAgentTimer } = await import("./agent-timer");
    startAgentTimer();
  }
}
