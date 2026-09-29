# TraceX

TraceX is an Ethereum wallet-investigation workspace. It retrieves provider-backed blockchain activity, normalizes native ETH and ERC-20 transfers, traces bounded outgoing fund movement, calculates explainable behavioral indicators, stores investigation cases, and gives investigators tools for evidence review, monitoring, reporting, and cross-case analysis.

The active application is a MERN-style stack: Express and Node.js, MongoDB with Mongoose, and React with Vite. The repository also retains the original Flask/SQLite implementation as an archival reference. The Node server is the active runtime and does not call the Python implementation.

## Capabilities

### Wallet investigations

- Validate an Ethereum address and reject unsupported chains.
- Retrieve up to 100 transfers per visited wallet.
- Include normal/native ETH, internal, and ERC-20 transfer activity.
- Normalize Alchemy and Etherscan responses into one transaction shape with hash, sender, receiver, direction, asset, decimals, raw amount, display amount, timestamp, block, provider, and attribution fields.
- Trace outgoing counterparties with a bounded default policy of 2 hops and 8 wallets.
- Avoid tracing known exchange endpoints as further wallet hops.
- Preserve earlier evidence and return a partial-coverage warning when a later provider request fails.
- Build a typed fund-flow graph containing suspect wallets, ordinary wallets, hubs, exchanges, bridges, edges, amounts, assets, timestamps, and providers.

### Explainable intelligence

The rule engine produces a score from 0 to 100 and a LOW, MEDIUM, or HIGH level. Current signals are:

- High transaction activity: 15 points at 20 or more transactions.
- Rapid movement: 25 points when funds leave shortly after receipt, within 10 minutes.
- Fund splitting: 20 points when a wallet sends to at least three distinct counterparties.
- Fund consolidation: 20 points when a wallet receives from at least three distinct counterparties.
- Known exchange interaction: 10 points for a dataset match.
- Multi-hop movement: 10 points when a traced path reaches hop 2 or beyond.
- External reported activity: 20 points when Chainabuse is available and reports exist.

Recommendations are generated from the matched signals. Scores and indicators are investigative prioritization aids, not proof of fraud, ownership, criminal intent, or common control.

### External and entity intelligence

- Chainabuse screening for the investigated wallet.
- MongoDB caching for successful Chainabuse responses and shorter-lived failure responses.
- Exact address matching against `data/exchange_addresses.json` for potential VASP or exchange endpoints.
- Exact contract matching against `data/bridge_registry.json` for provenance-backed bridge interactions.
- Bridge provenance includes the official source, confidence, verification date, chain, contract role, transaction, asset, and provider.
- Ethereum is the only configured investigation chain. Cross-chain continuation is reported as unavailable unless destination-chain evidence is actually present; similar amounts and timestamps are never treated as proof of a cross-chain transfer.

### Network topology and cross-case intelligence

Each saved investigation is converted into a derived network index. TraceX compares cases using fixed weights:

| Signal | Points |
| --- | ---: |
| Same investigated wallet | 35 |
| Shared intermediary | 25 |
| Shared destination | 20 |
| Shared exchange/VASP | 15 |
| Shared counterparty | 10 |
| Overlapping transfer path | 10 |

Results are capped at 100, filtered by `FRAUD_NETWORK_MIN_SCORE`, sorted deterministically, and limited by `FRAUD_NETWORK_MAX_CASES`. The network graph uses typed `CASE`, `SUSPECT_WALLET`, `INTERMEDIARY`, `EXCHANGE_VASP`, and wallet nodes with `INVESTIGATES`, `TRANSFERRED_TO`, and `SHARES_INFRASTRUCTURE_WITH` edges.

Single-case topology labels are also calculated:

- `COLLECTOR_CANDIDATE`: at least 3 distinct sources and incoming transfers greater than or equal to outgoing transfers.
- `DISTRIBUTOR_CANDIDATE`: at least 3 distinct destinations and outgoing transfers greater than incoming transfers.
- `HIGH_CONNECTIVITY_INTERMEDIARY`: at least 4 directly connected addresses.

These are graph descriptions only and do not identify an owner or criminal actor.

### Case workspace

Saved investigations have an operational case layer in addition to the original trace result:

- Case reference, title, summary, status, priority, tags, investigator assignment, and timestamps.
- Controlled status transitions: `NEW`, `ACTIVE`, `UNDER_REVIEW`, `ESCALATED`, and `CLOSED`.
- Evidence snapshots with 12 supported types: transaction, wallet, traced path, risk indicator, VASP attribution, external intelligence, related-case relationship, network node, bridge interaction, alert, timeline event, and report snapshot.
- Bounded snapshots that keep only approved fields and reject empty or over-50,000-character payloads.
- SHA-256 integrity hashes, duplicate fingerprints, and an evidence verification endpoint.
- Investigator notes linked to wallets, transactions, paths, entities, evidence, alerts, or cases.
- Investigator findings that must cite evidence saved in the same case.
- Completeness tracking for blockchain analysis, risk, network, external intelligence, selected evidence, findings, optional monitoring, and optional report generation.
- Audit events for case creation, providers, tracing, risk calculation, intelligence checks, case edits, evidence, notes, findings, Copilot questions, monitoring, alerts, and reports.

### Monitoring and alerts

- Start and stop monitoring for an Ethereum wallet.
- Poll active monitors using the configured blockchain provider service.
- Establish a baseline on the first poll so existing activity does not create historical alerts.
- Detect new token activity, high activity, and rapid movement rules.
- Deduplicate alerts by wallet, transaction, and alert type.
- Acknowledge or resolve alerts while retaining the alert record and audit trail.
- Monitoring state and alerts persist in MongoDB; the in-memory baseline resets after a server restart.

### Reports, exports, and Copilot

- PDF case report containing summary, risk, paths, transactions, entity intelligence, Chainabuse status, evidence integrity, findings, notes, audit events, recommendations, and limitations.
- CSV transaction export with direction, addresses, amount, asset, token contract, block, timestamp, hash, entity, type, and provider.
- JSON export of the complete stored investigation object.
- Groq Copilot answers questions using a deliberately constructed evidence context, not arbitrary database access.
- Copilot separates observed facts, TraceX rules, external intelligence, attribution, investigator material, and hypotheses.
- The grounding guard replaces answers that invent case or record IDs, assert unsupported criminal claims, or convert unavailable external intelligence into zero reports.

## User interface

The React client uses client-side navigation and the following routes:

| Route | Purpose |
| --- | --- |
| `/investigate` | Validate a wallet and start a live investigation; also shows recent cases. |
| `/cases` | Search, filter, sort, open, and delete stored cases. |
| `/cases/:caseId` | Open a case workspace. |
| `/network` | Select a case for cross-case intelligence. |
| `/network/:caseId` | Open the case directly on network analysis. |
| `/monitoring` | Review tracked wallets, polling state, and monitoring policy. |
| `/alerts` | Review, acknowledge, and resolve evidence-triggered alerts. |
| `/reports` | Generate PDF, CSV, and JSON outputs from a stored case. |
| `/copilot` | Ask evidence-grounded questions about the active case. |
| `/system` | Review provider and internal service configuration status. |

An opened case contains these tabs:

1. **Overview**: case metadata, risk score, investigation story, asset summary, top counterparties, recommendations, and completeness context.
2. **Fund Flow**: interactive evidence graph for the current investigation.
3. **Transactions**: searchable, filterable, sortable transaction table with detail drawer and pagination.
4. **Intelligence**: bridge checks, cross-chain readiness, topology, fraud network, Chainabuse, VASP attribution, paths, and a chronological time machine.
5. **Evidence**: capture, filter, verify, and review evidence; create notes and evidence-backed findings.
6. **Activity**: persistent audit trail with event source and metadata.
7. **Copilot**: grounded questions and answers for the stored case.
8. **Report**: evidence categories and download actions.

The shell includes responsive navigation, a global case/wallet search, `Ctrl+K` focus, active-case context, alert indicators, provider readiness state, copyable identifiers, loading states, empty states, error states, and toast feedback.

## Repository structure

```text
.
├── package.json                         Root npm workspace and development scripts
├── README.md                            This documentation
├── .env / backend/.env                  Runtime configuration; do not commit secrets
├── exmenv.txt                           Legacy example note for Etherscan configuration
├── create_exchange_dataset.py           Legacy exchange dataset generator
├── wallettracer.py                      Archived Flask + SQLite implementation
├── smoke_test.py                         Archived Flask smoke test
├── test_blockchain_architecture.py       Archived Python provider tests
├── test_phase2_erc20.py                  Archived Python ERC-20 and PDF tests
├── test_phase3_monitoring.py             Archived Python monitoring tests
├── data/
│   ├── exchange_addresses.json           Address-to-exchange attribution dataset
│   └── bridge_registry.json              Verified bridge contract registry
├── templates/
│   ├── x.html                            Archived Flask dashboard
│   └── graph.html                        Archived standalone graph page
├── backend/
│   ├── package.json                      Express service scripts and dependencies
│   ├── server.js                         Express routes, Mongoose models, tracing, monitoring, reports
│   ├── services/
│   │   ├── blockchain.js                 Alchemy/Etherscan providers and normalization
│   │   ├── threat-intelligence.js        Chainabuse client, normalization, and caching
│   │   ├── copilot.js                    Groq client, evidence construction, grounding guard
│   │   ├── fraud-network.js               Case indexing, similarity, and network graph
│   │   ├── advanced-intelligence.js      Bridges, topology, story, and cross-chain readiness
│   │   └── case-workspace.js             Evidence limits, hashing, statuses, and completeness
│   └── test/
│       ├── services.test.js              Provider, threat intelligence, Copilot, tracing, and scoring tests
│       ├── advanced-intelligence.test.js Bridge, topology, story, and cross-chain tests
│       ├── case-workspace.test.js         Evidence integrity and workflow tests
│       └── fraud-network.test.js          Similarity and graph tests
└── frontend/
	├── package.json                      React/Vite scripts and dependencies
	├── index.html                        SPA entry document
	├── vite.config.js                    Vite port and API proxy configuration
	├── src/
	│   ├── main.jsx                      React bootstrap
	│   ├── App.jsx                       Route selection and shared application state
	│   ├── api.js                        Browser API client and download helpers
	│   ├── utils.js                      Formatting, validation, and aggregation helpers
	│   ├── styles.css                    Full workspace styling and responsive layout
	│   ├── components/
	│   │   ├── AppShell.jsx               Sidebar, header, navigation, and global search
	│   │   ├── CaseManagement.jsx          Case editor, evidence workspace, notes, findings
	│   │   ├── GraphCanvas.jsx              Fund-flow and cross-case graph rendering
	│   │   ├── Icon.jsx                     Shared icon component
	│   │   ├── IntelligencePanels.jsx      Risk, network, intelligence, Copilot, timeline, reports
	│   │   ├── Primitives.jsx               Buttons, panels, badges, drawers, metrics, states
	│   │   └── TransactionExplorer.jsx      Transaction table, filters, pagination, details
	│   ├── pages/
	│   │   ├── InvestigationPage.jsx        New investigation and case workspace tabs
	│   │   └── OperationsPages.jsx          Cases, monitoring, alerts, reports, system, network, Copilot
	│   └── test/
	│       └── utils.test.js                Frontend utility tests
	└── dist/                               Generated production build output
```

## Architecture and data flow

1. The browser submits an Ethereum wallet to `/api/trace`.
2. The Express alias middleware maps `/api/trace` to the canonical `/trace` handler. Similar aliases support history, monitoring, alerts, export, and reports.
3. `BlockchainProviderService` tries Alchemy first. If Alchemy fails, it disables Alchemy for the service instance and uses Etherscan.
4. Provider responses are normalized, deduplicated, and passed to the bounded multi-hop tracer.
5. TraceX builds paths and a graph, applies deterministic intelligence, checks exchange and bridge registries, screens Chainabuse, and calculates cross-chain readiness.
6. The result is stored as `result_json` in MongoDB together with case metadata. A derived fraud-network index and baseline audit events are created.
7. The client loads the stored case, workspace records, network results, monitoring status, and alerts into the case workspace.
8. Subsequent evidence, notes, findings, monitoring, Copilot, comparison, and report actions operate on the stored case and write their own records or audit events.

## Configuration

Create a `.env` in the repository root or `backend/.env`. The backend loads the root file first and then uses backend values only when a root value is absent. Never commit API keys.

```env
# Required for live investigation data: configure at least one provider.
ALCHEMY_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your_key
ETHERSCAN_API_KEY=your_key

# MongoDB persistence.
MONGODB_URI=mongodb://127.0.0.1:27017/tracex
PORT=5001
MONITORING_POLL_SECONDS=15

# Optional external intelligence.
CHAINABUSE_API_KEY=your_key
CHAINABUSE_CACHE_TTL_HOURS=168
CHAINABUSE_FAILURE_CACHE_MINUTES=60

# Optional evidence-grounded Copilot.
GROQ_API_KEY=your_key
GROQ_MODEL=openai/gpt-oss-20b

# Deterministic cross-case result controls.
FRAUD_NETWORK_MIN_SCORE=15
FRAUD_NETWORK_MAX_CASES=25

# Retained compatibility setting; only Ethereum is supported today.
DEFAULT_BLOCKCHAIN=ethereum
```

Provider readiness in `/api/config` means a credential or internal service is configured. It is not a live quota or health check. The frontend deliberately does not expose secret values.

## Requirements and setup

- Node.js 20 or newer.
- MongoDB 7 or newer locally, or a MongoDB Atlas URI.
- At least one of Alchemy or Etherscan for live blockchain data.
- Chainabuse and Groq are optional.

Install dependencies from the repository root:

```bash
npm install
```

Start the backend and frontend together:

```bash
npm run dev
```

Then open `http://localhost:5173`. Vite proxies `/api`, `/dashboard`, and `/graph` to Express at `http://localhost:5001`.

Run the processes separately when needed:

```bash
npm run server
npm run client
```

The backend waits for MongoDB during startup, initializes indexes, backfills missing case metadata, backfills missing fraud-network indexes, starts the monitoring interval, and listens on port 5001 by default.

## Scripts and tests

Root scripts:

```bash
npm run dev       # Start backend and frontend concurrently
npm run server    # Start backend through the workspace script
npm run client    # Start Vite frontend through the workspace script
npm run build     # Build frontend/dist
```

Backend tests:

```bash
npm test --workspace backend
```

Frontend tests:

```bash
npm test --workspace frontend
```

The Node test suites use the built-in `node:test` runner and cover normalization, provider fallback, Chainabuse caching, Copilot evidence isolation and grounding, bounded tracing, rule scoring, bridge detection, topology, evidence hashing, case transitions, case completeness, fraud-network similarity, and graph typing. The frontend suite covers address validation, identifier formatting, asset aggregation, and counterparty aggregation.

The Python tests are for the archived implementation and require its Python dependencies from the local environment. They are not part of the active npm test commands:

```bash
python -m unittest test_blockchain_architecture.py test_phase2_erc20.py test_phase3_monitoring.py
python smoke_test.py
```

## API reference

### Investigation and configuration

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/config` | Provider, Copilot, fraud network, bridge, and cross-chain readiness. |
| `POST` | `/trace` or `/api/trace` | Trace `{ wallet_address, blockchain }`, calculate intelligence, and save a case. |
| `GET` | `/history` or `/api/history` | List stored cases. |
| `GET` | `/history/:id` or `/api/history/:id` | Load a case and lazily enrich older stored results. |
| `DELETE` | `/history` or `/api/history` | Delete all case, network, evidence, monitoring, alert, and audit data. |
| `DELETE` | `/history/:id` or `/api/history/:id` | Delete one case and its related records. |
| `GET` | `/api/search?q=...` | Search cases and evidence by references, wallets, titles, tags, hashes, or providers. |

### Case workspace

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/cases/:caseId/workspace` | Return case metadata, evidence, notes, findings, audit, monitoring, and completeness. |
| `PATCH` | `/api/cases/:caseId` | Update title, summary, investigator, priority, tags, and controlled status. |
| `GET` | `/api/cases/:caseId/evidence` | Paginated evidence listing with optional type filter. |
| `POST` | `/api/cases/:caseId/evidence` | Save a bounded evidence snapshot and SHA-256 integrity record. |
| `PATCH` | `/api/cases/:caseId/evidence/:evidenceId` | Edit investigator label or note. |
| `POST` | `/api/cases/:caseId/evidence/:evidenceId/verify` | Recalculate and compare the stored integrity hash. |
| `GET` / `POST` | `/api/cases/:caseId/notes` | List or create investigator notes. |
| `PATCH` / `DELETE` | `/api/cases/:caseId/notes/:noteId` | Update or delete a note. |
| `GET` / `POST` | `/api/cases/:caseId/findings` | List or create evidence-backed findings. |
| `GET` | `/api/cases/:caseId/audit` | Return chronological case activity and provenance events. |

### Network, Copilot, monitoring, alerts, and outputs

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/cases/:caseId/similar` | Ranked deterministic related-case matches. |
| `GET` | `/api/fraud-network/:caseId` | Cross-case summary, relationships, evidence, and typed graph. |
| `GET` | `/api/cases/:caseId/compare/:otherCaseId` | Similarity relationship plus factual case differences. |
| `POST` | `/api/copilot` | Answer `{ case_id, question }` using stored TraceX evidence. |
| `POST` | `/monitor/start` or `/api/monitor/start` | Start a wallet monitor. |
| `POST` | `/monitor/stop` or `/api/monitor/stop` | Stop a wallet monitor. |
| `GET` | `/monitor/status` or `/api/monitor/status` | List monitors or inspect one wallet. |
| `GET` | `/alerts` or `/api/alerts` | List alerts, optionally filtered by wallet. |
| `POST` | `/alerts/:id/acknowledge` or `/api/alerts/:id/acknowledge` | Mark an alert acknowledged. |
| `POST` | `/alerts/:id/resolve` or `/api/alerts/:id/resolve` | Mark an alert resolved. |
| `GET` | `/export/:id.json` or `/api/export/:id.json` | Download the complete stored investigation JSON. |
| `GET` | `/export/:id.csv` or `/api/export/:id.csv` | Download normalized transaction CSV. |
| `POST` | `/report` or `/api/report` | Generate and download a PDF report. |
| `GET` | `/dashboard` | Serve the archived HTML dashboard. |
| `GET` | `/graph` | Serve the archived standalone graph page. |

Errors use JSON with `error` and `code` fields. Common codes include `invalid_wallet`, `unsupported_blockchain`, `provider_not_configured`, `no_activity`, `case_not_found`, `invalid_status_transition`, `duplicate_evidence`, `not_configured`, and provider-specific availability or authentication errors.

## Persistence model

MongoDB collections are represented by these Mongoose models in `backend/server.js`:

- `Investigation`: original trace result plus case metadata and counters.
- `Monitor`: wallet watch state, polling timestamps, and trace policy.
- `Alert`: deduplicated monitoring events and lifecycle status.
- `ThreatIntelligenceCache`: Chainabuse results and expiration timestamps.
- `CaseNetworkIndex`: derived searchable cross-case evidence index.
- `AuditEvent`: timestamped provenance and investigator activity.
- `EvidenceItem`: bounded snapshots, fingerprints, and integrity hashes.
- `InvestigatorNote`: case notes and optional references.
- `InvestigatorFinding`: classifications tied to saved evidence IDs.
- `CaseSequence`: per-case counters for `EV-0001`, `NT-0001`, and `FN-0001` identifiers.

Startup creates indexes and performs compatibility backfills for older cases. Stored results are also lazily enriched with newer bridge, cross-chain, topology, story, and graph fields when opened.

## Provider behavior and normalized transaction shape

Alchemy uses `alchemy_getAssetTransfers` for external, internal, and ERC-20 categories. Etherscan V2 uses `txlist`, `txlistinternal`, and `tokentx`. Alchemy is attempted first and Etherscan is the fallback. Provider errors distinguish configuration, authentication, rate limits, timeouts, invalid requests, and availability failures.

Normalized records retain both raw and display values. Native ETH uses 18 decimals; tokens use the provider's token decimals. Token records retain the token contract, symbol, name, and `asset_type: token`; native records use `asset_type: native`. Deduplication uses hash, sender, receiver, token contract, raw amount, and transaction type.

## Limitations and investigation safeguards

- Ethereum is the only supported chain in the active provider configuration.
- Provider coverage can be partial, rate-limited, unavailable, or affected by provider history limits.
- Monitoring is polling-based, not a websocket or mempool feed.
- The first monitoring poll establishes a baseline; a backend restart creates a new in-memory baseline.
- Exchange labels are dataset matches, not proof that an exchange owns or controlled an address.
- Chainabuse results are third-party supporting intelligence; unavailable status is not equivalent to zero reports.
- Bridge interaction means a transaction touched a verified registry contract; it does not prove a completed cross-chain transfer.
- Graph roles, risk scores, shared infrastructure, and Copilot explanations are leads for human review.
- Copilot receives selected evidence excerpts and intentionally cannot infer facts outside that context.
- The archived Python implementation uses a separate SQLite database and should not be mixed with the active MongoDB workflow.

## Dataset maintenance

`create_exchange_dataset.py` can rebuild `data/exchange_addresses.json` from an expected local source tree at `data/cex-addresses/data/etherscan`. It scans the configured exchange folders and writes normalized lowercase addresses with exchange names and optional tags. The source tree is not included in the visible repository structure, so the script skips missing exchange folders.

The bridge registry is maintained manually in `data/bridge_registry.json`. Entries should include a chain, contract, bridge name, contract role, official source, confidence, and verification date. Only exact chain-plus-address matches are treated as verified interactions.
