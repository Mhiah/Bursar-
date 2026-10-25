/**
 * Bursar canonical demo: "One approval. The limit didn't move."
 *
 * Runs the real BursarVault contract on Hardhat's in-process chain and walks one fixed
 * story: the agent acts alone inside the owner's rules, the vault refuses what is outside
 * them, one exact exception is approved once, and the rules stay exactly where they were.
 *
 *   cd contracts && npm run demo
 *
 * Every step asserts its outcome. If the contract ever behaves differently from the story,
 * this script exits non-zero (CI runs it), so the README's demo table can't drift from the code.
 * Only tokens on a local test chain move. Nothing here touches Arc.
 */
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

const usd = (n) => ethers.parseUnits(String(n), 6);
const fmt = (n) => `$${Number(ethers.formatUnits(n, 6)).toLocaleString("en-US")}`;
const cat = (s) => ethers.encodeBytes32String(s);
const ref = (s) => ethers.id(s);

/** The vault error a call would hit, by name, or null if it would go through. */
async function wouldRevertWith(vault, call) {
  try {
    await call();
    return null;
  } catch (e) {
    const data = e.data ?? e.info?.error?.data ?? e.error?.data;
    const parsed = data ? vault.interface.parseError(data) : null;
    if (parsed) return parsed.name;
    throw e; // not a vault error: a real problem, don't hide it
  }
}

async function main() {
  const [owner, agent, acme, stranger] = await ethers.getSigners();

  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  const factory = await (await ethers.getContractFactory("BursarFactory")).deploy(usdc);
  // The owner's rules: the agent may pay at most $100 at once, and the vault always keeps $50.
  await factory.createVault(agent.address, usd(100), usd(50));
  const [vaultAddress] = await factory.vaultsOf(owner.address);
  const vault = await ethers.getContractAt("BursarVault", vaultAddress);
  await usdc.mint(vaultAddress, usd(1000));
  await vault.setBudget(cat("suppliers"), usd(300)); // $300 a month for suppliers
  await vault.setPayee(acme.address, true); // Acme is the only wallet the owner approved

  const rules = async () => ({ maxPerPayment: await vault.maxPerPayment(), cashFloor: await vault.cashFloor() });
  const before = await rules();

  const rows = [];
  const step = (who, action, result, note) => rows.push({ n: rows.length + 1, who, action, result, note });

  // 1. Inside the rules: the agent acts alone, nobody is asked.
  await vault.connect(agent).agentPay(acme.address, usd(80), cat("suppliers"), ref("acme-001"));
  assert.equal(await usdc.balanceOf(acme.address), usd(80));
  step("agent", `Pay Acme ${fmt(usd(80))} (limit ${fmt(before.maxPerPayment)})`, "ALLOW", "Paid, no approval asked");

  // 2. Over the limit: the vault refuses. The dry run and the real call agree.
  const big = usd(250);
  const dry = await vault.check(acme.address, big, cat("suppliers"), ref("acme-002"));
  const overLimit = await wouldRevertWith(vault, () =>
    vault.connect(agent).agentPay.staticCall(acme.address, big, cat("suppliers"), ref("acme-002")),
  );
  assert.equal(overLimit, "OverPaymentLimit");
  assert.equal(dry, vault.interface.getError("OverPaymentLimit").selector);
  step("agent", `Pay Acme ${fmt(big)}`, "REFUSE", "OverPaymentLimit");

  // 3. The agent files one exact request for the owner. No money moves.
  const acmeBefore = await usdc.balanceOf(acme.address);
  await vault.connect(agent).requestApproval(acme.address, big, cat("suppliers"), ref("acme-002"), ref("why: late fee waived"));
  assert.equal(await usdc.balanceOf(acme.address), acmeBefore);
  assert.equal((await vault.pending(0)).amount, big);
  step("agent", `Ask the owner to approve exactly ${fmt(big)} to Acme`, "PENDING", "ApprovalRequested #0, nothing paid yet");

  // 4. The owner approves that one payment. The limit is untouched.
  await vault.approve(0);
  assert.equal(await usdc.balanceOf(acme.address), acmeBefore + big);
  const after = await rules();
  assert.deepEqual(after, before);
  step("owner", "Approve request #0", "ALLOW", `Paid ${fmt(big)}. Limit ${fmt(before.maxPerPayment)} before and after`);

  // 5. Replay: neither the bill nor the approval can be used again.
  const replay = await wouldRevertWith(vault, () =>
    vault.connect(agent).agentPay.staticCall(acme.address, usd(10), cat("suppliers"), ref("acme-002")),
  );
  assert.equal(replay, "AlreadyPaid");
  step("agent", "Pay the same bill again", "REFUSE", "AlreadyPaid");
  const reuse = await wouldRevertWith(vault, () => vault.approve.staticCall(0));
  assert.equal(reuse, "NotOpen");
  step("owner", "Approve request #0 a second time", "REFUSE", "NotOpen (one approval, one use)");

  // 6. A wallet the owner never approved: refused, however small.
  const scam = await wouldRevertWith(vault, () =>
    vault.connect(agent).agentPay.staticCall(stranger.address, usd(5), cat("suppliers"), ref("scam-001")),
  );
  assert.equal(scam, "PayeeNotApproved");
  step("agent", `Pay an unapproved wallet ${fmt(usd(5))}`, "REFUSE", "PayeeNotApproved");

  // 7. The approved $250 still counted toward the $300 budget, so the agent has nothing left to spend.
  const budget = await wouldRevertWith(vault, () =>
    vault.connect(agent).agentPay.staticCall(acme.address, usd(30), cat("suppliers"), ref("acme-003")),
  );
  assert.equal(budget, "OverBudget");
  step("agent", `Pay Acme ${fmt(usd(30))} (suppliers budget ${fmt(usd(300))}, ${fmt(usd(80) + big)} already spent)`, "REFUSE", "OverBudget");

  // 8. The owner pauses the agent: everything stops.
  await vault.setPaused(true);
  const paused = await wouldRevertWith(vault, () =>
    vault.connect(agent).agentPay.staticCall(acme.address, usd(1), cat("suppliers"), ref("acme-004")),
  );
  assert.equal(paused, "IsPaused");
  step("owner", "Pause the agent", "OK", "");
  step("agent", `Pay Acme ${fmt(usd(1))}`, "REFUSE", "IsPaused");

  // The point, stated once more and proved by the assertions above.
  assert.deepEqual(await rules(), before);

  const pad = (s, n) => String(s).padEnd(n);
  const w = { who: 5, action: 66, result: 7 };
  console.log("\nBursar canonical demo (local chain, test tokens)\n");
  console.log(`${pad("#", 3)}${pad("Who", w.who + 2)}${pad("Action", w.action + 2)}${pad("Result", w.result + 2)}Note`);
  for (const r of rows) {
    console.log(`${pad(r.n, 3)}${pad(r.who, w.who + 2)}${pad(r.action, w.action + 2)}${pad(r.result, w.result + 2)}${r.note}`);
  }
  console.log(`\nOne approval, one payment. The per-payment limit stayed ${fmt(before.maxPerPayment)} and the cash floor ${fmt(before.cashFloor)} throughout.`);
  console.log(`All ${rows.length} outcomes matched the contract.`);
}

main().catch((e) => {
  console.error("\nDEMO FAILED:", e);
  process.exit(1);
});
