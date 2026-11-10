// End-to-end check of the website's server code and the agent against a local chain.
// Needs `npx hardhat node` running in ../contracts. Run: npm run test:e2e
// The decisions are scripted here instead of coming from Claude, so every tool and
// every check runs for real without an API key.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, parseUnits, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

// Hardhat's well-known test keys. Never use these anywhere real.
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
] as const;
const [deployer, owner, agent, supplier, customer] = KEYS.map((k) => privateKeyToAccount(k));
const SANCTIONED = "0x000000000000000000000000000000000000dEaD";

const artifact = (name: string, file = `contracts/${name}.sol/${name}.json`) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "contracts", "artifacts", file), "utf8"));

const pub = createPublicClient({ chain: hardhat, transport: http() });
const walletFor = (account: ReturnType<typeof privateKeyToAccount>) => createWalletClient({ account, chain: hardhat, transport: http() });
const usd = (n: number | string) => parseUnits(String(n), 6);

async function deploy(name: string, args: unknown[], file?: string) {
  const a = artifact(name, file);
  const hash = await walletFor(deployer).deployContract({ abi: a.abi, bytecode: a.bytecode as Hex, args });
  const r = await pub.waitForTransactionReceipt({ hash });
  return { address: r.contractAddress as Address, abi: a.abi };
}

async function main() {
  // ---------------------------------------------------------------- chain setup
  const usdc = await deploy("MockUSDC", [], "contracts/test/MockUSDC.sol/MockUSDC.json");
  const factory = await deploy("BursarFactory", [usdc.address]);
  const tx = async (who: typeof owner, address: Address, abi: any, functionName: string, args: unknown[]) => {
    const h = await walletFor(who).writeContract({ address, abi, functionName, args } as any);
    const r = await pub.waitForTransactionReceipt({ hash: h });
    assert.equal(r.status, "success", `${functionName} failed`);
    return r;
  };
  await tx(deployer, usdc.address, usdc.abi, "mint", [customer.address, usd(10_000)]);

  // ---------------------------------------------------------------- app config, set before the app's modules load
  Object.assign(process.env, {
    NEXT_PUBLIC_BURSAR_NETWORK: "local",
    NEXT_PUBLIC_LOCAL_USDC: usdc.address,
    NEXT_PUBLIC_FACTORY_ADDRESS: factory.address,
    NEXT_PUBLIC_AGENT_ADDRESS: agent.address,
    AGENT_PRIVATE_KEY: KEYS[2],
    ARC_RPC_URL: "http://127.0.0.1:8545",
    CHAINALYSIS_API_KEY: "test",
    BURSAR_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "bursar-e2e-")),
  });
  // Stand-in for the Chainalysis API: one sanctioned address, everyone else clean.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url);
    if (u.startsWith("https://public.chainalysis.com/api/v1/address/")) {
      const hit = u.toLowerCase().endsWith(SANCTIONED.toLowerCase());
      return new Response(JSON.stringify({ identifications: hit ? [{ category: "sanctions", name: "Test SDN" }] : [] }), { status: 200 });
    }
    return realFetch(url, init);
  }) as typeof fetch;

  const { q, one, newId } = await import("../src/lib/db");
  const { logDecision, verifyLog } = await import("../src/lib/decisions");
  const { billRef, billChecks, categoryKey } = await import("../src/lib/bills");
  const { screenPayee, looksAlike } = await import("../src/lib/screening");
  const { runBusiness } = await import("../src/agent/run");
  const { bursarVaultAbi } = await import("../src/lib/abi/BursarVault");
  const { bursarFactoryAbi } = await import("../src/lib/abi/BursarFactory");
  const { bursarSavingsAbi } = await import("../src/lib/abi/BursarSavings");
  const { bursarSavingsFactoryAbi } = await import("../src/lib/abi/BursarSavingsFactory");
  const { parseEventLogs } = await import("viem");

  // ---------------------------------------------------------------- owner sets up a vault
  const created = await tx(owner, factory.address, bursarFactoryAbi, "createVault", [agent.address, usd(100), usd(50)]);
  const [ev] = parseEventLogs({ abi: bursarFactoryAbi, logs: created.logs, eventName: "VaultCreated" });
  const vault = ev.args.vault as Address;
  await tx(owner, vault, bursarVaultAbi, "setBudget", [categoryKey("suppliers"), usd(400)]);
  await tx(owner, vault, bursarVaultAbi, "setPayee", [supplier.address, true]);
  // The supplier has used its wallet before, so it isn't "new".
  await walletFor(supplier).sendTransaction({ to: deployer.address, value: 1n });

  const bid = newId();
  const block = await pub.getBlockNumber();
  await q("INSERT INTO businesses (id, owner_address, name, vault_address, last_block) VALUES ($1,$2,$3,$4,$5)", [
    bid, owner.address, "Test Bakery", vault, (block - 1n).toString(),
  ]);
  await logDecision(bid, "note", "Business vault created", "test");

  // ---------------------------------------------------------------- savings: an account, a pot and Save when paid
  const savingsFactory = await deploy("BursarSavingsFactory", [usdc.address]);
  await tx(owner, savingsFactory.address, bursarSavingsFactoryAbi, "createSavings", [agent.address]);
  const [savings] = (await pub.readContract({ address: savingsFactory.address, abi: bursarSavingsFactoryAbi, functionName: "savingsOf", args: [owner.address] })) as Address[];
  await tx(owner, savings, bursarSavingsAbi, "createPot", ["Rainy day", 0, 0n, 0n]);
  // The owner's one approval on the vault: savings may be paid, up to 60 a month.
  await tx(owner, vault, bursarVaultAbi, "multicall", [[
    encodeFunctionData({ abi: bursarVaultAbi, functionName: "setPayee", args: [savings, true] }),
    encodeFunctionData({ abi: bursarVaultAbi, functionName: "setBudget", args: [categoryKey("savings"), usd(60)] }),
  ]]);
  const since = new Date(Date.now() - 1000).toISOString();
  await q("UPDATE businesses SET savings_address = $1, savings_plans = $2 WHERE id = $3", [
    savings,
    JSON.stringify({ whenPaid: { pot: 0, percent: 10, since } }),
    bid,
  ]);

  // ---------------------------------------------------------------- a customer pays an invoice
  const cid = newId();
  await q("INSERT INTO customers (id, business_id, name, email) VALUES ($1,$2,$3,$4)", [cid, bid, "Ada", "ada@example.com"]);
  const rid = newId();
  await q("INSERT INTO payment_requests (id, business_id, customer_id, invoice_no, amount, due_date) VALUES ($1,$2,$3,$4,$5,$6)", [
    rid, bid, cid, "INV-1", usd(500).toString(), "2026-01-01",
  ]);
  const late = newId();
  await q("INSERT INTO payment_requests (id, business_id, customer_id, invoice_no, amount, due_date) VALUES ($1,$2,$3,$4,$5,$6)", [
    late, bid, cid, "INV-2", usd(300).toString(), "2026-01-15",
  ]);
  const paid1 = await tx(customer, usdc.address, usdc.abi, "transfer", [vault, usd(500)]);
  // The pay page reports which invoice this transaction paid: the invoice reference.
  await q("INSERT INTO pay_claims (tx_hash, request_id, sender) VALUES ($1,$2,$3)", [paid1.transactionHash, rid, customer.address]);

  // ---------------------------------------------------------------- supplier bills
  const sid = newId();
  await q("INSERT INTO suppliers (id, business_id, name, wallet_address, category) VALUES ($1,$2,$3,$4,$5)", [sid, bid, "Flour Co", supplier.address, "suppliers"]);
  const addBill = async (invoice: string, amount: number, extra: Record<string, unknown> = {}, supplierId = sid) => {
    const id = newId();
    await q(
      "INSERT INTO bills (id, business_id, supplier_id, invoice_no, amount, expected_amount, category, due_date, ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id, bid, supplierId, invoice, usd(amount).toString(), (extra.expected as any) ?? null, "suppliers", "2026-01-10", billRef(bid, supplierId, invoice)],
    );
    return id;
  };
  const small = await addBill("F-001", 80);
  const big = await addBill("F-002", 250);
  const mismatch = await addBill("F-003", 60, { expected: usd(50).toString() });

  // The same invoice typed differently gets the same onchain reference.
  assert.equal(billRef(bid, sid, "F-001"), billRef(bid, sid, "f 001"));
  await assert.rejects(addBill("f 001", 80), /duplicate|unique/i, "a re-typed duplicate invoice is refused");

  // A lookalike of the supplier's wallet, and a sanctioned wallet, as other suppliers.
  const twin = (supplier.address.slice(0, 6) + "0".repeat(32) + supplier.address.slice(-4)) as Address;
  assert.ok(looksAlike(twin, supplier.address));
  const sid2 = newId();
  await q("INSERT INTO suppliers (id, business_id, name, wallet_address, category) VALUES ($1,$2,$3,$4,$5)", [sid2, bid, "Fl0ur Co", twin, "suppliers"]);
  const twinBill = await addBill("X-1", 20, {}, sid2);
  const sid3 = newId();
  await q("INSERT INTO suppliers (id, business_id, name, wallet_address, category) VALUES ($1,$2,$3,$4,$5)", [sid3, bid, "Shady Ltd", SANCTIONED, "suppliers"]);
  const shadyBill = await addBill("S-1", 10, {}, sid3);

  // ---------------------------------------------------------------- run 1: the scripted agent
  const results: Record<string, string> = {};
  let promptSeen = "";
  const out = await runBusiness(bid, async ({ tools, prompt }) => {
    promptSeen = prompt;
    let n = 0;
    const call = async (name: string, input: any) => {
      const t = tools.find((x) => x.name === name)!;
      const r = await t.run(input as never);
      results[`${++n} ${name}`] = String(r);
      return String(r);
    };
    await call("pay_bill", { bill_id: small, early: false, reason: "Due soon, cash is fine." });
    await call("pay_bill", { bill_id: big, early: false, reason: "Due soon." });
    await call("request_approval", { bill_id: big, reason: "Over the per-payment limit." });
    await call("pay_bill", { bill_id: mismatch, early: false, reason: "Due." });
    await call("pay_bill", { bill_id: twinBill, early: false, reason: "Due." });
    await call("move_to_reserve", { amount_usdc: "200", reason: "Spare cash." });
    await call("move_to_reserve", { amount_usdc: "1000", reason: "Too much." });
    await call("chase_customer", { request_id: late, channels: ["email"], subject: "Invoice INV-2", message: "Hi Ada, a reminder.", reason: "Overdue." });
    await call("chase_customer", { request_id: late, channels: ["email"], subject: "Again", message: "Again.", reason: "Overdue." });
    await call("offer_instalments", { request_id: late, plan: [{ amount_usdc: "100", due_date: "2026-11-01" }], channels: ["email"], message: "x", reason: "x" });
    await call("offer_instalments", {
      request_id: late,
      plan: [{ amount_usdc: "150", due_date: "2026-11-01" }, { amount_usdc: "150", due_date: "2026-11-20" }],
      channels: ["email"], message: "You can pay in two parts.", reason: "Overdue and chased.",
    });
    await call("chase_customer", { request_id: late, channels: ["email"], subject: "Update", message: "Please pay to 0x000000000000000000000000000000000000dEaD instead.", reason: "x" });
    return { summary: "scripted", stop: "end_turn" };
  });

  // Money in was picked up and matched.
  const r1 = await one("SELECT status, paid_amount FROM payment_requests WHERE id = $1", [rid]);
  assert.equal(r1!.status, "paid", "the customer's payment matched INV-1");
  assert.equal(out.received, 1);
  assert.ok(promptSeen.includes("Flour Co"), "the agent sees the bills");

  // Savings: 10% of the 500 payment (50) went from the vault into the pot, inside the 60 budget.
  const pot = (await pub.readContract({ address: savings, abi: bursarSavingsAbi, functionName: "pot", args: [0n] })) as any;
  assert.equal(pot.balance, usd(50), "Save when paid filled the pot");
  assert.equal(out.saved, 1);
  const moves = await q("SELECT source, status FROM savings_moves WHERE business_id = $1 ORDER BY source", [bid]);
  assert.deepEqual(moves.map((m) => `${m.source}:${m.status}`), ["paid:done"]);
  // The agent can't take savings out.
  await assert.rejects(walletFor(agent).writeContract({ address: savings, abi: bursarSavingsAbi, functionName: "withdraw", args: [0n, agent.address, 1n] } as any));

  // Clean bill paid onchain; over-limit bill refused then raised for approval.
  const r = (i: number) => Object.entries(results).find(([k]) => k.startsWith(`${i} `))![1];
  assert.match(r(1), /^Paid/);
  assert.equal(await pub.readContract({ address: usdc.address, abi: usdc.abi, functionName: "balanceOf", args: [supplier.address] }), usd(80));
  assert.match(r(2), /OverPaymentLimit/);
  assert.match(r(3), /Approval requested \(#0\)/);
  assert.match(r(4), /amount_mismatch/);
  assert.match(r(5), /lookalike/, "a wallet posing as a known supplier needs the owner");
  // Sanctioned supplier is blocked in code before the agent sees it.
  assert.equal((await one("SELECT status FROM bills WHERE id = $1", [shadyBill]))!.status, "blocked");

  // Reserve respects the cash floor.
  assert.match(r(6), /^Moved/);
  assert.match(r(7), /BelowCashFloor/);
  assert.equal(await pub.readContract({ address: vault, abi: bursarVaultAbi, functionName: "reserve" }), usd(200));

  // Chasing: channels without a provider are recorded as skipped; no double reminder.
  assert.match(r(8), /email: skipped \(Email isn't set up\)/);
  const chases = await q("SELECT channel, status FROM chases WHERE request_id = $1", [late]);
  assert.ok(chases.length >= 1);
  assert.match(r(10), /2 to 3 parts/, "a one-part plan is refused");
  assert.match(r(11), /already tried in the last day/, "no second message to the same customer on the same day");
  assert.match(r(12), /can't contain wallet addresses or links/, "a planted wallet address never reaches a customer");

  // Owner approves the held payment with their own wallet; the app catches up.
  await tx(owner, vault, bursarVaultAbi, "approve", [0n]);
  const { syncApprovals } = await import("../src/lib/approvals");
  await syncApprovals(bid, vault);
  assert.equal((await one("SELECT status FROM bills WHERE id = $1", [big]))!.status, "paid");

  // ---------------------------------------------------------------- run 2: stop chasing, overpayment, the agent's record
  // INV-2 has had three reminders: the agent stops and tells the owner, once.
  for (let i = 0; i < 3; i++)
    await q("INSERT INTO chases (id, business_id, request_id, channel, message, status, created_at) VALUES ($1,$2,$3,'email','x','sent', now() - interval '30 days')", [newId(), bid, late]);
  const over = newId();
  await q("INSERT INTO payment_requests (id, business_id, customer_id, invoice_no, amount, due_date) VALUES ($1,$2,$3,$4,$5,$6)", [
    over, bid, cid, "INV-3", usd(7).toString(), "2026-12-01",
  ]);
  await tx(customer, usdc.address, usdc.abi, "transfer", [vault, usd(9)]);
  const run2: string[] = [];
  const decide2 = async ({ tools, prompt }: any) => {
    const sit = JSON.parse(prompt.slice(prompt.indexOf("{")));
    const call = async (name: string, input: any) => run2.push(String(await tools.find((x: any) => x.name === name)!.run(input)));
    await call("chase_customer", { request_id: late, channels: ["email"], subject: "Again", message: "Again.", reason: "Overdue." });
    const pay = sit.unmatched_payments.find((p: any) => Number(p.amount_usdc) === 9);
    await call("match_payment", { payment_id: pay.id, request_id: over, reason: "Ada's wallet, close to INV-3." });
    return { summary: "scripted 2", stop: "end_turn" };
  };
  await runBusiness(bid, decide2);
  assert.match(run2[0], /already reminded 3 times/);
  await runBusiness(bid, async ({ tools }) => {
    run2.push(String(await tools.find((x) => x.name === "chase_customer")!.run({ request_id: late, channels: ["email"], subject: "x", message: "x", reason: "x" } as never)));
    return { summary: "scripted 3", stop: "end_turn" };
  });
  const attention = await q<{ summary: string }>("SELECT summary FROM decisions WHERE business_id = $1 AND kind = 'attention' ORDER BY seq", [bid]);
  assert.equal(attention.filter((a) => /Stopped chasing Ada about invoice INV-2/.test(a.summary)).length, 1, "the owner is told once");
  assert.ok(attention.some((a) => /INV-3 was overpaid by 2(\.00)? USDC/.test(a.summary)), "an overpayment is flagged");

  // Ada pays INV-1 a second time, with nothing else open: the owner is told it's a possible duplicate.
  await q("UPDATE payment_requests SET status = 'cancelled' WHERE customer_id = $1 AND status IN ('open','part_paid')", [cid]);
  await tx(customer, usdc.address, usdc.abi, "transfer", [vault, usd(500)]);
  await runBusiness(bid, async () => ({ summary: "scripted dup", stop: "end_turn" }));
  const dupAttention = await q<{ summary: string }>("SELECT summary FROM decisions WHERE business_id = $1 AND kind = 'attention' AND summary LIKE 'Possible duplicate%'", [bid]);
  assert.equal(dupAttention.length, 1, "a second payment of an already-paid invoice is flagged once");
  assert.match(dupAttention[0].summary, /500(\.00)? USDC.*INV-1 is already paid/);

  // ---------------------------------------------------------------- matching: an amount alone never decides
  const { processPayments, claimPayment, applyPayment } = await import("../src/agent/incoming");
  const { runSavings } = await import("../src/agent/savings");
  const biz = async () => (await one<any>("SELECT * FROM businesses WHERE id = $1", [bid]))!;
  const stranger = privateKeyToAccount(KEYS[3]); // a wallet no customer has paid from
  await tx(deployer, usdc.address, usdc.abi, "mint", [stranger.address, usd(1_000)]);
  const bob = newId();
  await q("INSERT INTO customers (id, business_id, name) VALUES ($1,$2,'Bob')", [bob, bid]);
  const bobInv = newId();
  await q("INSERT INTO payment_requests (id, business_id, customer_id, invoice_no, amount, due_date) VALUES ($1,$2,$3,'INV-B1',$4,'2026-12-01')", [
    bobInv, bid, bob, usd(200).toString(),
  ]);
  const strangerPay = await tx(stranger, usdc.address, usdc.abi, "transfer", [vault, usd(200)]);
  const { syncIncoming } = await import("../src/agent/incoming");
  await syncIncoming(await biz());
  const sp = (await one<any>("SELECT * FROM payments_in WHERE tx_hash = $1", [strangerPay.transactionHash]))!;
  assert.equal(sp.request_id, null, "the only invoice for this amount is not matched on amount alone");
  assert.equal(sp.processed_at, null, "it waits a little for the pay page's invoice reference");
  // The agent can't match it either.
  assert.match(await applyPayment(bid, sp.id, bobInv, "Same amount."), /Leave it for the owner/);
  // Ten minutes on, still no reference: the owner is asked.
  await q("UPDATE payments_in SET created_at = now() - interval '11 minutes' WHERE id = $1", [sp.id]);
  await processPayments(await biz());
  const needs = await q<{ summary: string }>("SELECT summary FROM decisions WHERE business_id = $1 AND kind = 'attention' AND data->>'paymentId' = $2", [bid, sp.id]);
  assert.equal(needs.length, 1);
  assert.match(needs[0].summary, /Couldn't tell which invoice 200(\.00)? USDC/);
  await q("UPDATE payments_in SET created_at = now() WHERE id = $1", [sp.id]);
  // Then the pay page's reference arrives: now it is certain.
  assert.deepEqual(await claimPayment(bobInv, strangerPay.transactionHash), { ok: true });
  assert.equal((await one("SELECT status FROM payment_requests WHERE id = $1", [bobInv]))!.status, "paid", "matched by the invoice reference");
  // A reference for a transaction that didn't pay this business is refused.
  const elsewhere = await tx(stranger, usdc.address, usdc.abi, "transfer", [deployer.address, 1n]);
  assert.equal((await claimPayment(bobInv, elsewhere.transactionHash)).ok, false);

  // ---------------------------------------------------------------- matching: one payment counts once, even when two matches race
  const inv5a = newId();
  const inv5b = newId();
  for (const [id, no] of [[inv5a, "INV-B2"], [inv5b, "INV-B3"]])
    await q("INSERT INTO payment_requests (id, business_id, customer_id, invoice_no, amount, due_date) VALUES ($1,$2,$3,$4,$5,'2026-12-01')", [id, bid, bob, no, usd(5).toString()]);
  const five = await tx(stranger, usdc.address, usdc.abi, "transfer", [vault, usd(5)]);
  await syncIncoming(await biz());
  const fp = (await one<any>("SELECT id, request_id FROM payments_in WHERE tx_hash = $1", [five.transactionHash]))!;
  assert.equal(fp.request_id, null, "two open invoices of this amount: not matched");
  const both = await Promise.all([applyPayment(bid, fp.id, inv5a, "x", "owner"), applyPayment(bid, fp.id, inv5b, "x", "owner")]);
  assert.equal(both.filter((m) => m.startsWith("Matched")).length, 1, "only one match wins");
  const sums = await q<{ paid_amount: string }>("SELECT paid_amount FROM payment_requests WHERE id IN ($1,$2)", [inv5a, inv5b]);
  assert.equal(sums.reduce((a, r) => a + BigInt(r.paid_amount), 0n), usd(5), "the 5 USDC is credited once");

  // ---------------------------------------------------------------- savings: a failed move is retried, a cut-off one is finished once
  // Bob's 200 is matched; 10% is 20, but only 10 of the 60 savings budget is left: it waits and retries.
  await runSavings(await biz(), vault);
  const retry = (await one<any>("SELECT * FROM savings_moves WHERE payment_id = $1", [sp.id]))!;
  assert.equal(retry.status, "retry");
  assert.equal(retry.error, "OverBudget");
  assert.equal(retry.attempts, 1);
  // The owner raises the budget; when the wait is over it goes through.
  await tx(owner, vault, bursarVaultAbi, "setBudget", [categoryKey("savings"), usd(200)]);
  await q("UPDATE savings_moves SET next_try_at = now() WHERE id = $1", [retry.id]);
  await runSavings(await biz(), vault);
  assert.equal((await one<any>("SELECT status FROM savings_moves WHERE id = $1", [retry.id]))!.status, "done", "the retried save went through");
  // A run is cut off right after the vault paid savings: the next run sees the vault's record and finishes it, without paying again.
  const extra = await tx(customer, usdc.address, usdc.abi, "transfer", [vault, usd(30)]);
  await syncIncoming(await biz());
  const ep = (await one<any>("SELECT id FROM payments_in WHERE tx_hash = $1", [extra.transactionHash]))!;
  const ref = keccak256(toHex(`paid:${ep.id}`));
  await q("INSERT INTO savings_moves (id, business_id, pot, amount, source, payment_id, status, ref, updated_at) VALUES ($1,$2,0,$3,'paid',$4,'sending',$5, now() - interval '1 hour')", [
    newId(), bid, usd(3).toString(), ep.id, ref,
  ]);
  await tx(agent, vault, bursarVaultAbi, "agentPay", [savings, usd(3), categoryKey("savings"), ref]);
  const potBefore = ((await pub.readContract({ address: savings, abi: bursarSavingsAbi, functionName: "pot", args: [0n] })) as any).balance;
  const vaultBefore = await pub.readContract({ address: usdc.address, abi: usdc.abi, functionName: "balanceOf", args: [vault] });
  await runSavings(await biz(), vault);
  assert.equal((await one<any>("SELECT status FROM savings_moves WHERE payment_id = $1", [ep.id]))!.status, "done");
  assert.equal(((await pub.readContract({ address: savings, abi: bursarSavingsAbi, functionName: "pot", args: [0n] })) as any).balance, potBefore + usd(3));
  assert.equal(await pub.readContract({ address: usdc.address, abi: usdc.abi, functionName: "balanceOf", args: [vault] }), vaultBefore, "not paid a second time");

  // Decision log is intact and its head was written onchain.
  const integrity = await verifyLog(bid);
  assert.ok(integrity.ok, "decision log hashes check out");
  const head = await one<{ hash: string; anchor_tx: string | null }>("SELECT hash, anchor_tx FROM decisions WHERE anchor_tx IS NOT NULL ORDER BY seq DESC LIMIT 1");
  assert.ok(head?.anchor_tx, "log head anchored onchain");
  const receipt = await pub.getTransactionReceipt({ hash: head!.anchor_tx as Hex });
  const [dec] = parseEventLogs({ abi: bursarVaultAbi, logs: receipt.logs, eventName: "Decision" });
  assert.equal(dec.args.logHash, head!.hash);

  // Many entries written at once still form one unbroken chain.
  await Promise.all(Array.from({ length: 12 }, (_, i) => logDecision(bid, "note", `At once ${i}`, "test")));
  const together = await verifyLog(bid);
  assert.ok(together.ok, "entries written at the same moment don't break the log");
  assert.equal((together as any).sameMoment, 0, "they queue up instead of sharing a previous entry");
  // An old split from two entries written at the same moment (before writes queued up) isn't called tampering.
  const head2 = await one<{ hash: string; prev_hash: string }>("SELECT hash, prev_hash FROM decisions WHERE business_id = $1 ORDER BY seq DESC LIMIT 1", [bid]);
  {
    const { keccak256, toHex } = await import("viem");
    const id = newId();
    const createdAt = new Date().toISOString();
    const body = JSON.stringify({ id, businessId: bid, kind: "note", summary: "Written at the same moment", reasoning: "test", data: {}, createdAt, prev: head2!.prev_hash });
    await q("INSERT INTO decisions (id, business_id, kind, summary, reasoning, data, body, hash, prev_hash, created_at) VALUES ($1,$2,'note','Written at the same moment','test','{}',$3,$4,$5,$6)", [
      id, bid, body, keccak256(toHex(body)), head2!.prev_hash, createdAt,
    ]);
  }
  const split = await verifyLog(bid);
  assert.ok(split.ok, "a same-moment split is allowed");
  assert.equal((split as any).sameMoment, 1);
  await logDecision(bid, "note", "After the split", "test");
  assert.ok((await verifyLog(bid)).ok, "the log carries on after a split");
  // Removing an entry is still caught.
  const second = await one<{ id: string }>("SELECT id FROM decisions WHERE business_id = $1 AND summary = 'At once 5'", [bid]);
  const saved = await one<any>("SELECT * FROM decisions WHERE id = $1", [second!.id]);
  await q("DELETE FROM decisions WHERE id = $1", [second!.id]);
  assert.equal((await verifyLog(bid)).ok, false, "a removed entry breaks the log");
  await q("INSERT INTO decisions (id, seq, business_id, kind, summary, reasoning, data, body, hash, prev_hash, anchor_tx, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", [
    saved.id, saved.seq, saved.business_id, saved.kind, saved.summary, saved.reasoning, saved.data, saved.body, saved.hash, saved.prev_hash, saved.anchor_tx, saved.created_at,
  ]);
  assert.ok((await verifyLog(bid)).ok);

  // Tampering with any entry is detected.
  await q("UPDATE decisions SET body = replace(body, 'Paid', 'Payd') WHERE kind = 'pay'");
  assert.equal((await verifyLog(bid)).ok, false, "an edited entry breaks the log");

  // Bill checks on their own: duplicates by amount.
  const dupe = await addBill("F-009", 80);
  const flags = await billChecks({ id: dupe, business_id: bid, supplier_id: sid, invoice_no: "F-009", amount: usd(80) });
  assert.ok(flags.some((f) => f.code === "possible_duplicate"));

  // A brand-new wallet is flagged for review.
  const fresh = privateKeyToAccount("0x" + "11".repeat(32) as Hex).address;
  const s = await screenPayee(fresh, { knownAddresses: [] });
  assert.equal(s.status, "review");
  assert.ok(s.reasons.some((r) => r.code === "new_wallet"));

  console.log("All end-to-end checks passed.");
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
