# Bursar

Bursar is an AI agent that runs a small business's money in USDC on [Arc](https://arc.io). It collects what customers owe, chases late payers, pays bills, keeps a cash reserve, and checks every wallet before money goes out.

The agent decides; the contract has the final say. Spending rules live in a smart contract the business owns, so the agent can never pay outside them, even if it gets something wrong.

Built for the Tameion Agents Hackathon (Canteen x Circle x Arc).

## How it works

- **The business owns its wallet.** Owners connect, import or create an EVM wallet. Bursar never holds their keys.
- **The vault holds the business's USDC.** `BursarVault` is a contract owned by the business's wallet. It enforces:
  - a monthly budget per spending category,
  - a maximum per payment (larger payments wait for the owner),
  - a cash floor the agent can't go below,
  - payments only to wallets the owner approved,
  - each bill paid once, never twice,
  - a pause switch and a way to remove the agent at any time.
- **The agent gets a limited key.** It can pay within the rules, ask the owner to approve, move cash to and from the reserve, and anchor each decision-log entry onchain. Only the owner can change rules, approve wallets or withdraw.
- **Claude makes the calls.** Each run, the agent picks up payments that arrived, matches them to invoices, screens wallets, and checks every bill for duplicates and mismatches in code. Claude then decides what to pay, hold, pay early, send for approval, move to reserve, and who to chase and how. Every action is re-checked in code and by the vault before it happens.
- **Customers pay how they like.** The pay page takes USDC on Arc, swaps EURC to USDC (Circle App Kit), or bridges USDC from other chains (CCTP via App Kit, with Circle's forwarder so the customer needs no Arc gas). Money goes straight into the vault.
- **Every decision is written down.** Each log entry is hashed together with the one before it, and the latest hash is written to the vault, so the log can't be quietly edited.

## Repository layout

| Folder | What's in it |
| --- | --- |
| `contracts/` | `BursarVault` and `BursarFactory` (Solidity), tests, deploy script |
| `app/` | The website (Next.js), its API, and the agent (`app/src/agent`) |

## Contracts

```bash
cd contracts
npm install
npm test
```

Deploy the factory to Arc testnet:

```bash
DEPLOYER_PRIVATE_KEY=0x... npm run deploy:testnet
```

Arc testnet: chain ID `5042002`, RPC `https://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io`. USDC's ERC-20 interface is at `0x3600000000000000000000000000000000000000` (6 decimals).

## Website and agent

```bash
cd app
npm install --legacy-peer-deps
cp .env.example .env.local   # then fill it in
npm run dev                  # website on http://localhost:3000
npm run agent                # agent worker, runs every AGENT_INTERVAL_SECONDS
```

What to put in `.env.local`:

- `NEXT_PUBLIC_FACTORY_ADDRESS`: the factory you deployed.
- `NEXT_PUBLIC_AGENT_ADDRESS` and `AGENT_PRIVATE_KEY`: a fresh wallet just for the agent. Give it a little USDC for gas. It can only act inside each vault's rules.
- `ANTHROPIC_API_KEY`: for Claude's decisions.
- `SESSION_SECRET`: any long random string.
- `DATABASE_URL`: a Postgres URL. Without it the site uses a local file database, which only one process can open, so use the dashboard's "Run the agent now" button instead of `npm run agent`.
- `CHAINALYSIS_API_KEY`: free sanctions screening key. Without it, every payment goes to the owner for approval.
- `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`: the chasing channels. Any that are missing are skipped and recorded as such.

The agent uses `claude-opus-5-5` with server-side fallbacks turned on, so a declined request is retried on another model.

### Tests

```bash
cd contracts && npx hardhat node          # in one terminal
cd app && npm run test:e2e                # in another
```

The end-to-end test deploys the contracts to the local chain and runs the website's server code and every agent tool for real: matching a payment, paying a bill, refusing one over the limit and sending it for approval, the owner approving, catching a mismatched invoice, a lookalike wallet and a sanctioned one, the reserve and cash floor, chasing, instalment limits, and the decision log's tamper check. Only Claude's choices are scripted.
