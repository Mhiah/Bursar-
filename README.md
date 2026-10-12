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

## Repository layout

| Folder | What's in it |
| --- | --- |
| `contracts/` | `BursarVault` and `BursarFactory` (Solidity), tests, deploy script |

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
