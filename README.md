# Crypto-scam-detection
# TraceX
TraceX is a blockchain investigation prototype for tracing cryptocurrency wallets involved in suspected fraud cases.

The project takes a victim-reported Ethereum wallet address and analyzes its blockchain activity to discover connected wallets and visualize the movement of funds.

## What We Built

- Ethereum wallet address input
- Wallet address validation
- Etherscan API V2 integration
- Normal ETH transaction retrieval
- Internal transaction retrieval
- IN/OUT transaction detection
- Counterparty wallet identification
- Multi-hop wallet tracing
- Transaction deduplication
- Transaction hash, amount and timestamp tracking
- NetworkX-based wallet relationship graph
- Interactive wallet graph using Vis Network
- Separate graph page for visualizing connections
- Basic exchange-address identification structure

## How It Works

Reported Wallet
↓
Ethereum Transactions
↓
IN / OUT Detection
↓
Counterparty Wallets
↓
Multi-Hop Tracing
↓
NetworkX Graph
↓
Interactive Wallet Network

## Tech Stack

- Python
- Flask
- HTML
- CSS
- JavaScript
- Etherscan API V2
- NetworkX
- Vis Network
- python-dotenv

## Project Structure

183/
│
├── templates/
│   ├── x.html
│   └── graph.html
│
├── wallettracer.py
├── package.json
├── package-lock.json
├── .env
├── .gitignore
└── venv/


## Current Tracing

The current prototype traces up to 3 hops and a maximum of 20 wallets to keep the analysis reasonably fast.

Example:

Reported Wallet
↓
Wallet A
↓
Wallet B
↓
Wallet C

## Future Work

- Curated cryptocurrency exchange wallet dataset
- Better exchange identification
- Suspicious transaction pattern detection
- Explainable risk indicators
- ERC-20 token tracing
- Investigation report generation
- Better investigator dashboard
- Multi-chain blockchain support

TraceX is an investigative assistance prototype. A connection between wallets or an interaction with an exchange does not by itself prove that a wallet is fraudulent. Findings should be supported by verifiable blockchain transaction evidence.

