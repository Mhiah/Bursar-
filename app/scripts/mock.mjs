// Test mode: `npm run mock`. Runs Bursar on this computer against a local test chain with
// fake USDC and a built-in test wallet. Nothing touches Arc, nothing real is signed, no gas is paid.
// Every run starts fresh. Stop it with Ctrl+C.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contracts = path.resolve(app, "../contracts");
const RPC = "http://127.0.0.1:8545";
const PORT = process.env.MOCK_PORT || "3001";
// Hardhat's public test keys (local chain only).
const MINTER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const AGENT = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const run = (cmd, cwd, opts = {}) => spawn(cmd, { cwd, shell: true, stdio: opts.stdio ?? "inherit", env: { ...process.env, ...opts.env } });
const done = (p) => new Promise((ok, no) => p.on("exit", (c) => (c === 0 ? ok() : no(new Error(`exit ${c}`)))));
const children = [];
const stop = () => {
  for (const c of children) try { c.kill(); } catch {}
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

console.log("1/4 Getting the contracts ready…");
if (!fs.existsSync(path.join(contracts, "node_modules"))) await done(run("npm install", contracts));
await done(run("npx hardhat compile --quiet", contracts));

console.log("2/4 Starting the test chain…");
const node = run("npx hardhat node", contracts, { stdio: "ignore" });
children.push(node);
const pub = createPublicClient({ chain: hardhat, transport: http(RPC) });
for (let i = 0; ; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    if (i > 60) throw new Error("The test chain didn't start. Is something else using port 8545?");
    await new Promise((r) => setTimeout(r, 1000));
  }
}

console.log("3/4 Putting the contracts on the test chain…");
const art = (f) => JSON.parse(fs.readFileSync(path.join(contracts, "artifacts/contracts", f), "utf8"));
const w = createWalletClient({ account: privateKeyToAccount(MINTER), chain: hardhat, transport: http(RPC) });
const deploy = async (a, args) => (await pub.waitForTransactionReceipt({ hash: await w.deployContract({ abi: a.abi, bytecode: a.bytecode, args }) })).contractAddress;
const usdc = await deploy(art("test/MockUSDC.sol/MockUSDC.json"), []);
const factory = await deploy(art("BursarFactory.sol/BursarFactory.json"), [usdc]);
const savings = await deploy(art("BursarSavingsFactory.sol/BursarSavingsFactory.json"), [usdc]);

console.log("4/4 Starting the app (the first page can take a minute to load)…");
const data = path.join(app, ".data", "mock");
fs.rmSync(data, { recursive: true, force: true });
const env = {
  NEXT_PUBLIC_BURSAR_NETWORK: "local",
  NEXT_PUBLIC_LOCAL_USDC: usdc,
  NEXT_PUBLIC_FACTORY_ADDRESS: factory,
  NEXT_PUBLIC_SAVINGS_FACTORY_ADDRESS: savings,
  NEXT_PUBLIC_AGENT_ADDRESS: privateKeyToAccount(AGENT).address,
  AGENT_SIGNER: "local",
  AGENT_PRIVATE_KEY: AGENT,
  ARC_RPC_URL: RPC,
  BURSAR_DATA_DIR: data,
  DATABASE_URL: "",
  CHAINALYSIS_API_KEY: "",
  SESSION_SECRET: "bursar-test-mode-only-not-a-real-secret",
  NEXT_DIST_DIR: ".next-mock",
};
const web = run(`npx next dev -p ${PORT}`, app, { env });
children.push(web);
console.log(`\nTest mode is starting. Open http://localhost:${PORT} in your browser. Press Ctrl+C here to stop.\n`);
web.on("exit", stop);
