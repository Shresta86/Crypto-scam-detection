# TraceX Phase 0 audit

Audit date: 2026-09-30

## Evidence collected

- Local frontend (`5173`) and backend (`5001`) were reachable.
- The existing backend suite completed with 29 passing tests; the frontend suite completed with 4 passing tests; the production frontend build completed successfully.
- `/api/config` reported Alchemy, Etherscan, Chainabuse, Groq, fraud-network, and bridge registry as configured.
- Two stored cases were present; the first has 739 transactions, eight wallets, and a HIGH/90 risk score.
- Stored-case, workspace, fraud-network, audit, monitor-status, alerts, and OpenAPI endpoints returned HTTP 200 when checked individually.
- Invalid address and ENS-style input returned HTTP 400. ENS resolution is therefore not currently supported.
- `GET /export/:id.pdf` returns HTTP 400 by design: export supports only JSON and CSV. The frontend uses `POST /api/report` for PDF generation; that route still needs an automated open/not-blank verification.
- This audit did not submit a live trace request because Phase 0 has no approved known-scam, exchange-hot-wallet, or fresh-wallet fixtures and submitting one would create new persisted cases and consume provider quota.
- UI manual interaction could not be independently exercised because the available in-app browser connection was unavailable. No UI workflow is marked “Yes” on source inspection alone.

## Known owner-reported issue

| Issue | Current status |
|---|---|
| Options did not switch between internal workspaces | Fixed immediately before this audit: routing now observes query-string tab changes. Regression coverage is still missing. |

## Feature audit

| Feature | Works? | Evidence | Root cause / limitation | Severity |
|---|---|---|---|---|
| Frontend build | Yes | `npm run build` completed locally | No UI E2E coverage | P2 |
| Frontend utility tests | Partial | 4 tests pass | Tests cover helpers only, not rendered workflows | P1 |
| Backend service tests | Partial | 29 backend tests pass, covering normalization, fallback, Chainabuse caching, Copilot grounding, tracing partial results, bridge intelligence, evidence integrity, and fraud-network rules | No recorded-provider HTTP integration suite or endpoint E2E coverage | P1 |
| Provider configuration | Partial | `/api/config` reports configured providers | No startup fail-fast requirement found; status is configuration, not a live provider health check | P1 |
| Alchemy/Etherscan fallback | Partial | Source has primary/fallback service and unit coverage | No observed live failure/retry/rate-limit/pagination audit | P1 |
| Wallet validation | Partial | Invalid and ENS-style values return 400 | No checksum-address acceptance/rejection test; ENS intentionally unsupported but UI does not explain it | P2 |
| Live tracing | Unverified | Existing stored cases prove a prior successful trace | No controlled live trace was run in this audit; no background job/progress API found | P1 |
| Transaction normalization | Partial | Backend tests cover ETH/ERC-20 decimal normalization | Internal/NFT coverage and reconciliation against recorded providers are missing | P1 |
| Multi-hop tracing | Partial | Service tests cover partial provider failure | No time budget/background job or high-volume performance proof | P1 |
| Case persistence | Partial | Stored cases survive API reads and are MongoDB-backed | Refresh/deep-link UI journey unverified | P1 |
| Case navigation | Partial | URL/query switching fix was made and builds | Browser back/forward and refresh regression tests absent | P1 |
| Fund-flow graph / Studio | Partial | Stored graph payload is available; custom views compile | No 2,000-node responsiveness proof; current SVG graph lacks worker/clustering evidence | P1 |
| Transaction Explorer | Unverified | Component and transaction payload exist | Filtering, empty/error states, and large-data behavior not manually tested | P2 |
| Risk intelligence | Partial | Deterministic risk breakdown and supporting refs are returned | No click-through/reconciliation test from score to every evidence item | P1 |
| Time Machine | Partial | Ordered transaction replay component exists | No real-timestamp gap/cleanup component test | P2 |
| Pattern intelligence | Partial | Deterministic indicator payload exists | No end-to-end detector-to-evidence test | P1 |
| VASP / bridge intelligence | Partial | Attribution and verified bridge registry code exist | Dataset provenance/UI interaction unverified | P2 |
| Fraud network | Partial | `/api/fraud-network/:caseId` returns HTTP 200 | Relation evidence UI and server index reconciliation not tested | P1 |
| Monitoring | Partial | Monitor status endpoint returns HTTP 200; in-process poller exists | Poller has an in-memory baseline after restart; no durable queue/worker or push update | P1 |
| Alerts | Partial | `/alerts` returns HTTP 200 | Creation/real-time update/idempotency journey unverified | P1 |
| Evidence integrity | Partial | Evidence models and verify endpoint exist | Requirement to hash exact exported bytes is not evidenced; export-to-verify test missing | P1 |
| Notes and findings | Unverified | Persistence routes and audit calls exist | Create/edit/delete UI/API lifecycle not executed | P2 |
| Copilot | Partial | Server service has evidence context and grounding-guard tests | Live Groq response/citations/UI failure state unverified | P1 |
| PDF reports | Partial | `POST /api/report` is implemented; frontend invokes it | PDF was not generated/opened by a test; export route correctly rejects PDF | P1 |
| JSON/CSV exports | Partial | GET export code exists | Download content/reconciliation untested | P2 |
| Developer API keys | Partial | Secrets are hashed, one-time reveal, scope and expiry checks exist | Key-management endpoints are unauthenticated; no rate limiting found; scope E2E absent | P0 |
| API secrets in browser | Partial | Provider keys stay server-side; new TraceX key is intentionally returned once to browser | Unauthenticated API-key creation and browser clipboard reveal need explicit product security review | P0 |
| Accessibility / responsive UX | Unverified | Some aria labels and reduced-motion styles exist | No keyboard, contrast, or 1280px audit | P2 |
| CI / lint / type check / E2E | No | Package scripts expose build and tests only | No lint, type-check, Playwright, or CI configuration found | P1 |
| Health / structured logging | Partial | Configuration endpoint and console logging exist | No `/health` route, request IDs, or structured logging evidence | P2 |

## Browser-reachable credential and token review

| Surface | Exposure observed | Assessment |
|---|---|---|
| `/api/config` | Boolean/status indicators only | Provider keys are not returned. |
| Client API module | Calls same-origin TraceX endpoints | No Alchemy, Etherscan, Chainabuse, or Groq secret is embedded. |
| Developer key creation response | Newly-created TraceX secret returned once | Expected product behavior, but endpoint has no user authentication and must be protected before release. |
| Developer key UI | One-time secret can be copied to clipboard | Expected, but must be clearly labelled and restricted by authenticated access. |

## Phase 1/2 backlog discovered (not implemented)

1. P0: protect developer-key management with authentication/authorization and add per-key rate limiting.
2. P1: add recorded-provider integration tests, timeout/retry/pagination tests, and background-job progress behavior.
3. P1: establish a safe, explicit five-wallet audit fixture set; label all demonstration data.
4. P1: add browser E2E tests for tracing, evidence, monitoring, Copilot, developer API scopes, refresh, and report download.
5. P1: add report PDF open/not-blank verification and evidence-byte hashing design review.
6. P2: add health/readiness endpoint, request IDs, structured logging, and provider liveness status.
7. P2: consolidate design tokens and perform keyboard/contrast/responsive audit.
