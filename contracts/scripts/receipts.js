/**
 * Bursar receipts: turns on-chain events into a Markdown table of explorer links.
 *
 * Reads the factory's VaultCreated events, then each vault's Paid, ApprovalRequested and
 * Decision events, and prints the most recent ones as transaction links. Paste the output
 * into the README's "Receipts" section so every claim has a transaction behind it.
 *
 *   cd contracts
 *   npm run receipts                          # Arc mainnet, the factory in the README
 *   FROM_BLOCK=1234567 npm run receipts       # start later: much faster on a long chain
 *   VAULTS=0xabc...,0xdef... npm run receipts   # only these vaults
 *
 * Environment (all optional):
 *   FACTORY         BursarFactory address (default: the Arc mainnet factory in the README)
 *   VAULTS          comma-separated vault addresses; skips the factory scan
 *   FROM_BLOCK      first block to scan (default 0)
 *   CHUNK           blocks per log query (default 20000; halves itself if the RPC refuses)
 *   LIMIT           most recent rows per table (default 15)
 *   EXPLORER_TX_URL transaction link prefix (default https://explorer.arc.io/tx/)
 *   EXPLORER_ADDR_URL address link prefix (default https://explorer.arc.io/address/)
 *
 * With no network flag it runs against Hardhat's in-process chain and, if no FACTORY is
 * given, first makes a few test events so the output can be checked offline: `npm run receipts:selftest`.
 */
require("./dns-fallback");
const { ethers, network } = require("hardhat");

const MAINNET_FACTORY = "0x1d872C07C1935fe5E3a28a9df0690C2caf7B5709";
const TX = process.env.EXPLORER_TX_URL || "https://explorer.arc.io/tx/";
const ADDR = process.env.EXPLORER_ADDR_URL || "https://explorer.arc.io/address/";
const LIMIT = Number(process.env.LIMIT || 15);
const CHUNK = Number(process.env.CHUNK || 20000);

const short = (h) => `${h.slice(0, 8)}…${h.slice(-6)}`;
const txLink = (h) => `[${short(h)}](${TX}${h})`;
const addrLink = (a) => `[${short(a)}](${ADDR}${a})`;
const usdc = (n) => `${Number(ethers.formatUnits(n, 6)).toLocaleString("en-US")} USDC`;

/** queryFilter in block chunks; halves the chunk when the RPC rejects a range. */
async function events(contract, filter, from, to) {
  const out = [];
  for (let start = from; start <= to; ) {
    let size = CHUNK;
    for (;;) {
      const end = Math.min(start + size - 1, to);
      try {
        out.push(...(await contract.queryFilter(filter, start, end)));
        start = end + 1;
        break;
      } catch (e) {
        if (size <= 100) throw e;
        size = Math.floor(size / 2);
      }
    }
  }
  return out;
}

async function selfTest() {
  const [owner, agent, acme] = await ethers.getSigners();
  const usd = (n) => ethers.parseUnits(String(n), 6);
  const cat = ethers.encodeBytes32String("suppliers");
  const usdcToken = await (await ethers.getContractFactory("MockUSDC")).deploy();
  const factory = await (await ethers.getContractFactory("BursarFactory")).deploy(usdcToken);
  await factory.createVault(agent.address, usd(100), usd(50));
  const [addr] = await factory.vaultsOf(owner.address);
  const vault = await ethers.getContractAt("BursarVault", addr);
  await usdcToken.mint(addr, usd(1000));
  await vault.setBudget(cat, usd(500));
  await vault.setPayee(acme.address, true);
  await vault.connect(agent).agentPay(acme.address, usd(80), cat, ethers.id("inv-1"));
  await vault.connect(agent).requestApproval(acme.address, usd(250), cat, ethers.id("inv-2"), ethers.id("why"));
  await vault.approve(0);
  await vault.connect(agent).recordDecision(ethers.id("log-1"));
  return await factory.getAddress();
}

async function main() {
  const provider = ethers.provider;
  const from = Number(process.env.FROM_BLOCK || 0);

  let factoryAddress = process.env.FACTORY;
  if (!factoryAddress && network.name === "hardhat") factoryAddress = await selfTest();
  factoryAddress = factoryAddress || MAINNET_FACTORY;
  const latest = await provider.getBlockNumber(); // after the self-test, so its events are in range

  let vaults = (process.env.VAULTS || "").split(",").map((v) => v.trim()).filter(Boolean);
  const created = [];
  if (vaults.length === 0) {
    const factory = await ethers.getContractAt("BursarFactory", factoryAddress);
    for (const e of await events(factory, factory.filters.VaultCreated(), from, latest)) {
      created.push({ vault: e.args.vault, owner: e.args.owner, tx: e.transactionHash });
    }
    vaults = created.map((c) => c.vault);
  }

  const rows = { paid: [], asked: [], anchors: [] };
  const stamps = new Map();
  const when = async (blockNumber) => {
    if (!stamps.has(blockNumber)) stamps.set(blockNumber, (await provider.getBlock(blockNumber)).timestamp);
    return new Date(stamps.get(blockNumber) * 1000).toISOString().slice(0, 16).replace("T", " ");
  };
  for (const address of vaults) {
    const vault = await ethers.getContractAt("BursarVault", address);
    for (const e of await events(vault, vault.filters.Paid(), from, latest)) {
      rows.paid.push({ b: e.blockNumber, vault: address, tx: e.transactionHash, to: e.args.to, amount: e.args.amount, owner: e.args.byOwnerApproval });
    }
    for (const e of await events(vault, vault.filters.ApprovalRequested(), from, latest)) {
      rows.asked.push({ b: e.blockNumber, vault: address, tx: e.transactionHash, id: e.args.id, to: e.args.to, amount: e.args.amount });
    }
    for (const e of await events(vault, vault.filters.Decision(), from, latest)) {
      rows.anchors.push({ b: e.blockNumber, vault: address, tx: e.transactionHash, hash: e.args.logHash });
    }
  }
  const recent = (list) => list.sort((a, b) => b.b - a.b).slice(0, LIMIT);

  const out = [];
  out.push(`<!-- Generated by contracts/scripts/receipts.js on ${new Date().toISOString().slice(0, 10)} from ${network.name}, blocks ${from} to ${latest}. -->`);
  out.push(`Factory: ${addrLink(factoryAddress)}. ${created.length ? `${created.length} vault(s) created.` : ""} Showing the ${LIMIT} most recent of each.\n`);
  if (created.length) {
    out.push("**Vaults**\n", "| Vault | Owner | Created in |", "| --- | --- | --- |");
    for (const c of created.slice(-LIMIT)) out.push(`| ${addrLink(c.vault)} | ${addrLink(c.owner)} | ${txLink(c.tx)} |`);
    out.push("");
  }
  out.push("**Payments** (the vault's `Paid` event; \"owner approved\" means the owner signed that exact payment)\n", "| When (UTC) | Vault | To | Amount | How | Transaction |", "| --- | --- | --- | --- | --- | --- |");
  for (const r of recent(rows.paid)) out.push(`| ${await when(r.b)} | ${addrLink(r.vault)} | ${addrLink(r.to)} | ${usdc(r.amount)} | ${r.owner ? "owner approved" : "agent, inside the rules"} | ${txLink(r.tx)} |`);
  out.push("", "**Approval requests** (the agent asked; nothing moved until the owner signed)\n", "| When (UTC) | Vault | Request | To | Amount | Transaction |", "| --- | --- | --- | --- | --- | --- |");
  for (const r of recent(rows.asked)) out.push(`| ${await when(r.b)} | ${addrLink(r.vault)} | #${r.id} | ${addrLink(r.to)} | ${usdc(r.amount)} | ${txLink(r.tx)} |`);
  out.push("", "**Decision-log anchors** (the hash of the agent's log, written to the vault)\n", "| When (UTC) | Vault | Log hash | Transaction |", "| --- | --- | --- | --- |");
  for (const r of recent(rows.anchors)) out.push(`| ${await when(r.b)} | ${addrLink(r.vault)} | \`${short(r.hash)}\` | ${txLink(r.tx)} |`);
  console.log(out.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
