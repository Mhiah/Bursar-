// End-to-end check of the website's server code and the agent against a local chain.
// Needs `npx hardhat node` running in ../contracts. Run: npm run test:e2e
// The decisions are scripted here instead of coming from Claude, so every tool and
// every check runs for real without an API key.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseUnits, type Address, type Hex } from "viem";
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
  await tx(customer, usdc.address, usdc.abi, "transfer", [vault, usd(500)]);

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
    await call("chase_customer", { request_id: late, channels: ["email", "telegram"], subject: "Invoice INV-2", message: "Hi Ada, a reminder.", reason: "Overdue." });
    await call("chase_customer", { request_id: late, channels: ["email"], subject: "Again", message: "Again.", reason: "Overdue." });
    await call("offer_instalments", { request_id: late, plan: [{ amount_usdc: "100", due_date: "2026-11-01" }], channels: ["email"], message: "x", reason: "x" });
    await call("offer_instalments", {
      request_id: late,
      plan: [{ amount_usdc: "150", due_date: "2026-11-01" }, { amount_usdc: "150", due_date: "2026-11-20" }],
      channels: ["email"], message: "You can pay in two parts.", reason: "Overdue and chased.",
    });
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
  assert.match(r(8), /email: skipped \(Email isn't set up\); telegram: skipped/);
  const chases = await q("SELECT channel, status FROM chases WHERE request_id = $1", [late]);
  assert.ok(chases.length >= 2);
  assert.match(r(10), /2 to 3 parts/, "a one-part plan is refused");
  assert.match(r(11), /Plan saved/);

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

  // Decision log is intact and its head was written onchain.
  const integrity = await verifyLog(bid);
  assert.ok(integrity.ok, "decision log hashes check out");
  const head = await one<{ hash: string; anchor_tx: string | null }>("SELECT hash, anchor_tx FROM decisions WHERE anchor_tx IS NOT NULL ORDER BY seq DESC LIMIT 1");
  assert.ok(head?.anchor_tx, "log head anchored onchain");
  const receipt = await pub.getTransactionReceipt({ hash: head!.anchor_tx as Hex });
  const [dec] = parseEventLogs({ abi: bursarVaultAbi, logs: receipt.logs, eventName: "Decision" });
  assert.equal(dec.args.logHash, head!.hash);

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
