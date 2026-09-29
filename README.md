# TraceX — MERN wallet-investigation application

TraceX traces a reported Ethereum wallet, follows outgoing funds through connected wallets, scores explainable rule-based risk indicators, enriches the primary wallet with cached Chainabuse intelligence, detects shared infrastructure across saved cases, visualises relationship graphs, saves investigations, exports results, watches monitored wallets, and provides an evidence-grounded Groq investigation Copilot.

## What changed

The project has been migrated from Flask + SQLite to a MERN architecture:

- **MongoDB / Mongoose:** investigations, a derived cross-case network index, monitoring records, and alerts are persisted in MongoDB.
- **Express / Node.js:** `backend/server.js` implements tracing, history, JSON/CSV export, PDF reports, monitoring, alert acknowledgement/resolution, graph data, external intelligence, and Copilot routes.
- **React / Vite:** `frontend/` is the active componentized investigation workspace with client-side navigation, fund-flow and cross-case graphs, transaction/path intelligence, case management, monitoring, alerts, reports, provider status, and the grounded Copilot. The older HTML dashboard routes remain available only for compatibility.
- **Node services:** Alchemy Asset Transfers is the primary Ethereum provider and Etherscan V2 is the fallback. Both normalize to one transaction schema before tracing and monitoring. Chainabuse is cached in MongoDB. Fraud-network matches are calculated deterministically from saved evidence; Groq only explains that supplied evidence when an investigator asks.

The old Python files and SQLite database are intentionally retained as an archival reference; the Node server does not call them.

## Prerequisites

- Node.js 20 or newer
- MongoDB 7+ running locally, or a MongoDB Atlas connection string
- An Alchemy RPC URL (recommended primary provider)
- An Etherscan API key (recommended fallback)
- Optional Chainabuse and Groq API keys

## Configuration

Copy `.env.example` to either `.env` at the repository root or `backend/.env` and set your real values:

```env
ALCHEMY_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your_key
ETHERSCAN_API_KEY=your_real_key
CHAINABUSE_API_KEY=your_real_key
CHAINABUSE_CACHE_TTL_HOURS=168
GROQ_API_KEY=your_real_key
GROQ_MODEL=openai/gpt-oss-20b
FRAUD_NETWORK_MIN_SCORE=15
FRAUD_NETWORK_MAX_CASES=25
DEFAULT_BLOCKCHAIN=ethereum
MONGODB_URI=mongodb://127.0.0.1:27017/tracex
PORT=5001
```

`DEFAULT_BLOCKCHAIN` currently accepts `ethereum`, matching the source application. Fraud-network scores use fixed, explainable signal weights and are capped at 100. The two fraud-network settings control the result threshold and response-size limit.

## Install and run (development)

From the repository root:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Vite serves the React command center and proxies canonical `/api/...` requests to Express on `http://localhost:5001`.

If you prefer separate terminals:

```bash
npm run server
npm run client
```

## Production client build

```bash
npm run build
```

The client output is written to `frontend/dist`. Run the Express API with `npm run server`; deploy the static `frontend/dist` folder behind the same reverse proxy as the API, forwarding the API routes listed in `frontend/vite.config.js` to port 5001.

## API compatibility

All original browser endpoints remain available:

- `POST /trace`
- `POST /api/copilot` (loads evidence from a stored investigation)
- `GET /api/cases/:caseId/similar` (ranked, explainable related-case matches)
- `GET /api/fraud-network/:caseId` (summary, relationships, and typed network graph)
- `GET /api/cases/:caseId/compare/:otherCaseId` (deterministic evidence comparison)
- `GET /api/cases/:caseId/audit` (persistent investigation activity and provenance events)
- `GET, DELETE /history` and `GET, DELETE /history/:id`
- `GET /export/:id.json` and `GET /export/:id.csv`
- `POST /report`
- `POST /monitor/start`, `POST /monitor/stop`, `GET /monitor/status`
- `GET /alerts`, `POST /alerts/:id/acknowledge`, `POST /alerts/:id/resolve`
- `GET /graph`, `GET /dashboard`, and `GET /api/config`

The React client uses backward-compatible `/api/trace`, `/api/history`, `/api/monitor`, `/api/alerts`, `/api/export`, and `/api/report` aliases so application routes such as `/monitoring`, `/alerts`, and `/reports` remain valid SPA pages.

## Advanced investigation intelligence

TraceX performs exact-match bridge detection against `data/bridge_registry.json`. Each registry entry carries its chain, contract role, official source, confidence, and verification date. A bridge interaction is evidence that a transaction touched that verified contract; it is not automatically a verified cross-chain continuation.

The current provider configuration exposes Ethereum investigation data only. The application therefore reports cross-chain correlation as `destination_data_unavailable` and does not infer it from similar amounts and timestamps. Normalized transactions include `chain_id` and `chain_name` so additional evidence-backed chain providers can be introduced without changing the investigation schema.

Network analytics classify collector, distributor, and high-connectivity candidates using explicit graph thresholds. These are topology descriptions, not claims of criminal ownership. Stored cases are safely enriched on read with bridge, cross-chain readiness, topology, investigation-story, and audit structures so existing demo evidence remains usable.

## Notes

Fraud-network links are investigative leads: shared wallets, paths, reports, scores, and exchange matches do not establish fraud, ownership, or a common actor.

The first poll after monitoring starts establishes a baseline, preventing alerts for old transactions. A restart also establishes a fresh in-memory baseline; MongoDB still retains all monitor and alert records. TraceX is an investigative aid only—wallet connections, risk scores, and exchange matches do not establish fraud.
