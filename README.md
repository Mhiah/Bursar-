# Bursar

Bursar is an AI agent that runs a small business's money in USDC on [Arc](https://arc.io). It collects what customers owe, chases late payers, pays bills, keeps a reserve, saves, and checks every wallet before money moves.

The agent decides; the contract has the final say. The owner's rules live in a vault contract that only the owner's wallet owns, so the agent can't pay outside them, even if it gets something wrong or is tricked.

Built for the Tameion Agents Hackathon (Canteen x Circle x Arc), brief 04: Autonomous Business Operator.

- Demo video: _link coming_
- Live site: _link coming_

## What the agent does

The agent runs by itself on a timer (every 6 hours by default). Each run it looks at the whole business and:

- **Matches payments** that arrived to the right invoice, and flags overpayments to the owner.
- **Chases customers** by email: a heads-up before the due date, firmer reminders once late, and an instalment offer when that helps. After 3 reminders it stops and hands the customer to the owner.
- **Pays bills** that are due, inside the rules. Anything above a limit, to a new wallet, or that looks wrong goes to the owner to approve.
- **Catches duplicate and mismatched bills** before paying them.
- **Checks wallets** against the US Treasury (OFAC) sanctions list, Circle's USDC blocklist and lookalike-address tricks. Customers are checked when added, and every wallet is re-checked daily.
- **Keeps a reserve** of spare cash and **saves** a share of each customer payment into savings pots (Flex, Locked, or a Target with a date).
- **Writes every decision down** with its reason. Each entry is hashed together with the one before, and the latest hash is written to the vault, so the record can't be quietly edited.

The Overview shows "The agent's record": money in and out, bills paid on time with no human, decisions the agent made versus the ones it passed to the owner, and how often the owner agreed.

## Rules the agent can't break

`BursarVault` holds the business's USDC and enforces, onchain:

- the most per payment (larger payments wait for the owner),
- a monthly budget per spending category,
- the cash it must always keep,
- payments only to wallets the owner approved,
- each bill paid once,
- only the owner can use the reserve, change rules, approve wallets or take money out,
- a pause switch, and a way to remove the agent at any time.

`BursarSavings` holds savings pots. The agent can put money into pots but never take it out. It can't put money into a Locked pot unless the owner allowed it for that pot, and nobody, Bursar included, can open a lock early.

All rule changes go in one owner transaction (Multicall).

## Circle tools used

| Tool | How Bursar uses it |
| --- | --- |
| **USDC on Arc** | All business money, vaults and savings. |
| **Circle Agent Wallet** (Agent Stack) | The agent signs with a Circle Agent Wallet, so no agent private key lives on the server. |
| **Circle Agent Marketplace** (x402) | The agent pays for each AI decision per call, in USDC, from its own wallet. No subscription or card. A daily cap stops runaway spend. |
| **Circle App Kit** | Customers can pay in EURC (swapped to USDC on the way in) or bridge USDC from another network (CCTP), straight into the vault. |
| **USDC blocklist** | Every wallet is checked against Circle's blocklist before money moves. |

## Live on Arc mainnet

| Contract | Address |
| --- | --- |
| BursarFactory | `0x13c95c918599b33Cbae7bb32d9C4920993E4713f` |
| BursarSavingsFactory | `0x1EE09d0f5d435c38414B0e842A3f62a3842Efb70` |

## Try it without real money

Test mode runs everything on your computer against a local chain, with fake USDC, a built-in test wallet and a stand-in for the AI. Nothing is signed on Arc and no gas is paid.

```bash
cd contracts && npm install
cd ../app && npm install --legacy-peer-deps
npm run mock          # opens on http://localhost:3001
```

Click "Add 100 test USDC to my vault", add a customer and an invoice, pay it as a test customer from the invoice's pay page, then press "Run the agent now". In test mode the agent also runs by itself every 2 minutes.

## Run it for real

```bash
cd app
cp .env.example .env.local   # then fill it in
npm run build && npm start   # http://localhost:3000
```

What goes in `.env.local`:

- `NEXT_PUBLIC_FACTORY_ADDRESS`, `NEXT_PUBLIC_SAVINGS_FACTORY_ADDRESS`: the factories above, or your own (`npm run deploy:all:mainnet` in `contracts/`; `npm run cost:mainnet` prints the cost first).
- `ARC_RPC_URL`: an Arc mainnet RPC link.
- `AGENT_SIGNER=circle` and `NEXT_PUBLIC_AGENT_ADDRESS`: set up the agent's Circle Agent Wallet once from `app/`:
  ```bash
  npx circle wallet login you@example.com --type agent
  npx circle wallet list --chain ARC
  ```
- `AI_PROVIDER=blockrun`: the agent's Claude calls are bought per call through Circle's Agent Marketplace. `AI_MAX_USDC_PER_CALL` (default 0.10) and `AI_MAX_USDC_PER_DAY` (default 0.25) cap the spend. Keep a little USDC in the agent wallet. Or leave it empty and set `ANTHROPIC_API_KEY`.
- `AGENT_EVERY_MINUTES`: how often the agent runs by itself (default 360, `0` turns the timer off).
- `CHAINALYSIS_API_KEY`: optional. Without it, wallets are checked against the US Treasury (OFAC) sanctions list, refreshed daily, with a copy kept in the app.
- `RESEND_API_KEY` and `EMAIL_FROM`: email for chasing customers.
- `SESSION_SECRET`: any long random string.
- `DATABASE_URL`: a Postgres URL. Without it the site uses a local file database.

## Tests

```bash
cd contracts && npm test                  # contract tests
npx hardhat node                          # then, in another terminal:
cd app && npm run test:e2e                # end-to-end
```

The end-to-end test deploys the contracts to a local chain and runs the server code and every agent tool for real: matching a payment, paying a bill, refusing one over the limit and sending it for approval, catching a mismatched invoice and a lookalike wallet, the reserve and cash floor, chasing limits, and the decision log's tamper check. Only the AI's choices are scripted.

## Repository layout

| Folder | What's in it |
| --- | --- |
| `contracts/` | `BursarVault`, `BursarFactory`, `BursarSavings`, `BursarSavingsFactory` (Solidity), tests, deploy scripts |
| `app/` | The website (Next.js), its API, and the agent (`app/src/agent`) |

## Limits

- Bursar isn't a bank. Money sits in a contract the owner's wallet owns.
- Lost wallet keys can't be recovered by anyone.
- The vault holds USDC only. Customers can pay in EURC or from other networks, but it arrives as USDC on Arc.
- Wallet checks lower risk; they don't remove it. New wallets always go to the owner first.
- It keeps a clear record, but tax and filing are still the owner's job.
