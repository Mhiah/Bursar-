// Makes a fresh wallet for Bursar's agent and writes it into ../app/.env.local.
// The private key is written to the file only, never printed.
const fs = require("fs");
const path = require("path");
const { Wallet } = require("ethers");

const file = path.join(__dirname, "..", "..", "app", ".env.local");
let env = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
if (/^AGENT_PRIVATE_KEY=0x[0-9a-fA-F]{64}/m.test(env)) {
  console.log("app/.env.local already has an agent key. Delete that line first if you really want a new one.");
  process.exit(1);
}
const w = Wallet.createRandom();
const set = (k, v) => {
  const re = new RegExp(`^${k}=.*$`, "m");
  env = re.test(env) ? env.replace(re, `${k}=${v}`) : `${env.replace(/\n?$/, "\n")}${k}=${v}\n`;
};
set("NEXT_PUBLIC_AGENT_ADDRESS", w.address);
set("AGENT_PRIVATE_KEY", w.privateKey);
fs.writeFileSync(file, env);
console.log(`Agent wallet: ${w.address}`);
console.log("Saved to app/.env.local. Send it a little USDC on Arc for fees.");
