// Deploys BursarFactory to the chosen network.
// Usage: DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/deploy.js --network arcTestnet
const { ethers, network } = require("hardhat");

// USDC's ERC-20 interface on Arc (same address on testnet and mainnet).
const ARC_USDC = "0x3600000000000000000000000000000000000000";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${network.name}  Deployer: ${deployer.address}`);
  const factory = await (await ethers.getContractFactory("BursarFactory")).deploy(ARC_USDC);
  await factory.waitForDeployment();
  console.log(`BursarFactory: ${await factory.getAddress()}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
