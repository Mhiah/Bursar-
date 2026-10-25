require("./scripts/dns-fallback");
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

// Read contracts/.env if present, so keys never have to be typed into a shell.
const envFile = path.join(__dirname, ".env");
if (require("fs").existsSync(envFile)) {
  for (const line of require("fs").readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SOLC_VERSION = "0.8.28";

// Use the solc-js compiler bundled in node_modules, so compiling works
// without downloading a compiler binary.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === SOLC_VERSION) {
    const compilerPath = path.join(__dirname, "node_modules", "solc", "soljson.js");
    return { compilerPath, isSolcJs: true, version: args.solcVersion, longVersion: args.solcVersion };
  }
  return runSuper();
});

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

module.exports = {
  solidity: {
    version: SOLC_VERSION,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    arcTestnet: { url: process.env.ARC_TESTNET_RPC || "https://rpc.testnet.arc.io", chainId: 5042002, accounts },
    arcMainnet: { url: process.env.ARC_MAINNET_RPC || "https://rpc.mainnet.arc.io", chainId: 5042, accounts },
  },
};
