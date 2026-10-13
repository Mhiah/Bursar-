// Deploys BursarSavingsFactory to the chosen network.
// Usage: npm run deploy:savings:mainnet (with DEPLOYER_PRIVATE_KEY set, as for the vault factory)
const { ethers, network } = require("hardhat");

// USDC's ERC-20 interface on Arc (same address on testnet and mainnet).
const ARC_USDC = "0x3600000000000000000000000000000000000000";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deploy key. Set DEPLOYER_PRIVATE_KEY first.");
  console.log(`Network: ${network.name}  Deployer: ${deployer.address}`);
  const factory = await (await ethers.getContractFactory("BursarSavingsFactory")).deploy(ARC_USDC);
  await factory.waitForDeployment();
  console.log(`BursarSavingsFactory: ${await factory.getAddress()}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
