// Deploys both factories (vault and savings) in one go.
// Without DEPLOY=yes it only prints what the deploy would cost, so you can fund the wallet with the exact amount first.
// Usage: npm run cost:mainnet   then   npm run deploy:all:mainnet
const { ethers, network } = require("hardhat");

// USDC's ERC-20 interface on Arc (same address on testnet and mainnet).
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const NAMES = ["BursarFactory", "BursarSavingsFactory"];

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deploy key. Set DEPLOYER_PRIVATE_KEY first.");
  console.log(`Network: ${network.name}  Deployer: ${deployer.address}`);

  // Gas on Arc is paid in USDC, so the cost below is in USDC.
  const fee = await ethers.provider.getFeeData();
  const price = fee.maxFeePerGas ?? fee.gasPrice;
  let gas = 0n;
  for (const name of NAMES) {
    const tx = await (await ethers.getContractFactory(name)).getDeployTransaction(ARC_USDC);
    gas += await ethers.provider.estimateGas({ ...tx, from: deployer.address });
  }
  const cost = gas * price;
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Both deploys: about ${ethers.formatEther(cost)} USDC (${gas} gas). Wallet has ${ethers.formatEther(balance)} USDC.`);
  if (balance < cost) {
    console.log(`Send at least ${ethers.formatEther(cost - balance)} more USDC to ${deployer.address}, plus a little extra in case the price moves.`);
    return;
  }
  if (process.env.DEPLOY !== "yes") return console.log("Enough to deploy. Run npm run deploy:all:mainnet to do it.");

  for (const name of NAMES) {
    const c = await (await ethers.getContractFactory(name)).deploy(ARC_USDC);
    await c.waitForDeployment();
    console.log(`${name}: ${await c.getAddress()}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
