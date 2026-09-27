# TraceX — MERN wallet-investigation application

TraceX traces a reported Ethereum wallet, follows outgoing funds through connected wallets, scores rule-based risk indicators, visualises the relationship graph, saves investigations, exports results, generates PDF reports, and watches monitored wallets for new activity.

## What changed

The project has been migrated from Flask + SQLite to a MERN architecture:

- **MongoDB / Mongoose:** investigations, monitoring records, and alerts are persisted in MongoDB.
- **Express / Node.js:** `backend/server.js` implements the original API contract: tracing, history, JSON/CSV export, PDF reports, monitoring, alert acknowledgement/resolution, graph data, and Etherscan integration.
- **React / Vite:** `frontend/` is the new React entry point. It hosts the established dashboard in a React shell during the UI migration, preserving its complete interaction flow and visualisation code without removing functionality.
- **Node services:** the API polls monitored wallets on the same 15-second default schedule and uses the same Ethereum address rules, trace depth (2), wallet limit (8), transaction limit (100), risk rules, exchange dataset, and Etherscan V2 calls.

The old Python files and SQLite database are intentionally retained as an archival reference; the Node server does not call them.

## Prerequisites

- Node.js 20 or newer
- MongoDB 7+ running locally, or a MongoDB Atlas connection string
- An Etherscan API key

## Configuration

Copy `.env.example` to either `.env` at the repository root or `backend/.env` and set your real values:

```env
ETHERSCAN_API_KEY=your_real_key
DEFAULT_BLOCKCHAIN=ethereum
MONGODB_URI=mongodb://127.0.0.1:27017/tracex
PORT=5001
```

`DEFAULT_BLOCKCHAIN` currently accepts `ethereum`, matching the source application.

## Install and run (development)

From the repository root:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Vite serves the React client and proxies API/dashboard requests to Express on `http://localhost:5001`.

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
- `GET, DELETE /history` and `GET, DELETE /history/:id`
- `GET /export/:id.json` and `GET /export/:id.csv`
- `POST /report`
- `POST /monitor/start`, `POST /monitor/stop`, `GET /monitor/status`
- `GET /alerts`, `POST /alerts/:id/acknowledge`, `POST /alerts/:id/resolve`
- `GET /graph`, `GET /dashboard`, and `GET /api/config`

## Notes

The first poll after monitoring starts establishes a baseline, preventing alerts for old transactions. A restart also establishes a fresh in-memory baseline; MongoDB still retains all monitor and alert records. TraceX is an investigative aid only—wallet connections, risk scores, and exchange matches do not establish fraud.
