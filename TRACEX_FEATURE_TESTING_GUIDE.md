# TraceX Feature Testing Guide
**Comprehensive Manual QA & Verification Runbook for All Capabilities**

This runbook provides deterministic, step-by-step instructions to manually verify and showcase all capabilities in TraceX.

---

### Primary Demonstration Case Reference
- **Case Reference**: `TX-2026-5C7986` (MongoDB ID: `6aba9bf3a9851671145c7986`)
- **Subject Wallet**: `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` (`vitalik.eth`)
- **Blockchain**: Ethereum Mainnet
- **Stored Dataset**: 739 normalized transfers, 165 multi-hop fund paths, 42 network nodes, 9 topology candidates, 5 risk indicators, 1 related case (`TX-2026-9F3516`).

---

## Capabilities Testing Matrix

### 1. Investigation Entry & Live / Stored Provider Recovery
- **Where**: `http://localhost:5173/investigate`
- **Steps**:
  1. Open the landing screen.
  2. Verify the hero section displays *"Report the Wallet. Trace the Money. Reveal the Network."*
  3. Verify the quick-action banner: `Ready for jury demonstration: TX-2026-5C7986 (739 transfers · 8 wallets)`.
  4. Test live validation: Enter an invalid string like `0x123` and click *Start investigation*. (Observe field validation error: *"Invalid Ethereum address"*).
  5. Test provider recovery: When live RPC fails or quota is exhausted, observe the `LIVE PROVIDER TEMPORARILY UNAVAILABLE` panel with options: `[ Retry live analysis ]`, `[ Open recent investigation ]`, and `[ View stored cases ]`.
  6. Click `[ Open stored demo case ]`.
- **Expected Result**: Case `TX-2026-5C7986` loads instantly from MongoDB storage without consuming live provider quota.

---

### 2. Investigation Journey Progress Strip
- **Where**: Top of Case Workspace (directly below case title).
- **Steps**:
  1. Observe the 8 sequential progress pills:
     - `01 WALLET ANALYZED` (`✓`)
     - `02 FUND FLOW TRACED` (`165 PATHS`)
     - `03 RISK SIGNALS` (`5 FOUND`)
     - `04 ENTITY INTEL` (`1 MATCH`)
     - `05 RELATED CASES` (`1 FOUND`)
     - `06 EVIDENCE` (`0 SAVED` or active count)
     - `07 MONITORING` (`ACTIVE` / `INACTIVE`)
     - `08 REPORT` (`READY`)
  2. Click `03 RISK SIGNALS`. Observe the workspace immediately switches to the **Risk Intelligence** tab.
  3. Click `02 FUND FLOW TRACED`. Observe the workspace immediately switches to the **Fund Flow Graph** tab.
- **Expected Result**: Clean 1-click navigation teaching the investigator the 8-step lifecycle of a financial crime investigation.

---

### 3. "What TraceX Found" Editorial Intelligence Summary
- **Where**: Case Workspace → Nav: **Case Briefing** (Overview tab).
- **Steps**:
  1. In the Overview tab, look at the top editorial hero grid containing 5 cards:
     - **High-Risk Behavioral Patterns**: 90/100 HIGH Priority with 5 indicators. Click `[ Explore Risk Intelligence → ]`.
     - **Multi-Hop Fund Dispersal**: 165 paths across 42 network nodes. Click `[ View Fund Flow Graph → ]`.
     - **Topology Roles Identified**: 9 collector and distributor candidates. Click `[ Inspect Network Roles → ]`.
     - **Shared Infrastructure Detected**: Overlap with Case `TX-2026-9F3516` (100/100 similarity). Click `[ Inspect Fraud Network → ]`.
     - **VASP / Exchange Attribution**: Potential attribution identified. Click `[ View Entity Attribution → ]`.
- **Expected Result**: Every finding card derives its numbers dynamically from case evidence and navigates directly to the relevant tool.

---

### 4. Interactive Investigation Map
- **Where**: Case Workspace → Nav: **Case Briefing** (Overview tab).
- **Steps**:
  1. View the visual pipeline flow diagram:
     `Suspect Wallet` → `Normalized Transfers (739)` → `Risk Signals (5)` & `Fund Flow (165)` → `Network Roles (9)` & `Related Cases (1)` → `Saved Evidence (SHA-256 Ledger)`.
  2. Click `Step 04 Fund Flow`.
- **Expected Result**: Workspaces switches seamlessly to the Fund Flow Graph.

---

### 5. Fund-Flow Graph Centerpiece & Path Highlighting
- **Where**: Case Workspace → Nav: **FLOW ANALYSIS → Fund Flow Graph**.
- **Steps**:
  1. Observe the expanded full-width canvas rendering 42 graph nodes and 165 directional edges.
  2. Click `? Explain this view` at the top of the graph to expand the investigator guide.
  3. In the toolbar, select `Hop 2` from the hop filter. Notice that only secondary dispersal edges and connected nodes remain visible. Reset hop to `All hops`.
  4. Click on any transfer line (edge).
  5. Observe the active edge highlights with glowing cyan accents (`focused`), and the **Focused evidence path** bar appears at the bottom.
  6. Observe that unrelated nodes and edges fade to `14%` opacity.
  7. Click `Clear focus` on the strip.
- **Expected Result**: The graph provides smooth SVG panning, zoom in/out, fit, and high-visibility path isolation.

---

### 6. Wallet Intelligence Inspector (Graph Node Click)
- **Where**: Case Workspace → Nav: **Fund Flow Graph** → Click any wallet node.
- **Steps**:
  1. Click an intermediary node (e.g. `hub` or `wallet`).
  2. In the right drawer, verify the following intelligence fields:
     - Address with 1-click copy
     - Role Badge (e.g. `COLLECTOR CANDIDATE` or `INTERMEDIARY`)
     - Observed transfers (incoming vs outgoing breakdown)
     - Topology reason (distinct sources & destinations)
  3. Click `[ Show in transactions ]`. Observe that the app switches to the Transactions tab and pre-filters by this address.
  4. Return to Graph, select the node again, and click `[ Capture wallet as evidence ]`.
- **Expected Result**: Node intelligence is completely inspectable and connected directly to Transactions and Evidence.

---

### 7. Transfer Intelligence Inspector (Graph Edge Click)
- **Where**: Case Workspace → Nav: **Fund Flow Graph** → Click any transfer arrow.
- **Steps**:
  1. Click an edge connecting two wallets.
  2. In the drawer, observe:
     - Transaction Hash
     - Source (From) & Destination (To)
     - Asset & Transfer Amount (with token precision)
     - Hop number & Provider provenance
  3. Click `[ Capture path as evidence ]`.
- **Expected Result**: Opens the 4-step Evidence Capture Wizard pre-populated with path data.

---

### 8. Explainable Risk Intelligence
- **Where**: Case Workspace → Nav: **INTELLIGENCE → Risk Intelligence**.
- **Steps**:
  1. Observe the large circular gauge showing **90 / 100** (`HIGH priority`).
  2. Expand each indicator to review its exact rule code and point weight:
     - `High transaction activity detected` (+20 pts)
     - `Funds moved out shortly after being received` (+20 pts)
     - `Funds split across multiple wallets` (+15 pts)
     - `Funds consolidated from multiple wallets` (+15 pts)
     - `Funds moved through multiple intermediary wallets` (+20 pts)
  3. Under `Rapid movement`, click `[ Review transaction evidence ]`.
  4. Click `[ Capture signal as evidence ]`.
- **Expected Result**: Proves risk is 100% deterministic and explainable, not a black-box score.

---

### 9. Normalized Transaction Explorer & "Why This Matters"
- **Where**: Case Workspace → Nav: **FLOW ANALYSIS → Transactions**.
- **Steps**:
  1. Filter by `Hop 2` using the hop dropdown. Observe that transfers at hop 2 are isolated.
  2. Filter by direction `OUT` and sort by `Largest amount`.
  3. Click any row in the table to open the Transaction Evidence Drawer.
  4. In the drawer, inspect the top box titled **"Why this may matter"**:
     - Displays contextual bullet points (e.g. *"Multi-hop intermediary transfer (Hop 2)"*, *"Direct dispersal from suspect wallet"*, *"High transfer value"*).
  5. Click `[ View in Graph ]` to highlight this transfer on the graph.
  6. Click `[ Save to Evidence ]` to capture it.
- **Expected Result**: Raw transactions are transformed into context-aware investigative evidence.

---

### 10. Transaction Time Machine Playback & Jump to Signal
- **Where**: Case Workspace → Nav: **FLOW ANALYSIS → Time Machine**.
- **Steps**:
  1. Observe the dedicated Time Machine interface with the **"What to watch during playback"** guidance card.
  2. Click the Play button (`▶ Play`).
  3. Observe the progress timeline animate, displaying block number, exact timestamp, asset, direction, and hop badge.
  4. Toggle speed to `2x`.
  5. Click `[ Jump to Next Signal ]`. Observe the index jump forward directly to a multi-hop or high-value dispersal transfer.
  6. Click `[ Capture active transfer as evidence ]`.
- **Expected Result**: Replays chronological fund movements with pause, step, speed control, and signal jumping.

---

### 11. Cross-Case Fraud Network & Shared Intermediary
- **Where**: Case Workspace → Nav: **INTELLIGENCE → Related Cases**.
- **Steps**:
  1. Observe the Related Investigations metric grid (1 related investigation, shared wallets, common intermediaries).
  2. Review the correlation card for Case `TX-2026-9F3516` with a **100 / 100** similarity score.
  3. Review the reason chips: `+100 common intermediary`, `+50 same suspect wallet`, `+30 shared destination`, `+25 path overlap`.
  4. Click `[ Compare evidence ]`.
  5. In the Comparison Drawer, verify side-by-side case attributes (Case A vs Case B) and observed differences.
  6. Click `[ Capture relationship as evidence ]`.
- **Expected Result**: Demonstrates multi-case crime ring detection through deterministic infrastructure overlap.

---

### 12. 4-Step Visual Evidence Capture Wizard & SHA-256 Tamper Detection
- **Where**: Case Workspace → Nav: **CASE WORK → Evidence & Integrity**.
- **Steps**:
  1. Click `[ Capture new evidence ]`.
  2. In the Evidence Preservation Wizard:
     - **Step 1 (What)**: Select `TRANSACTION` or `WALLET`, enter a descriptive title. Click `Next Step`.
     - **Step 2 (Source)**: Verify source provider (`Alchemy / TraceX`) and hash. Click `Next Step`.
     - **Step 3 (Snapshot)**: Inspect the JSON preview of the bounded snapshot. Enter an investigator note. Click `Next Step`.
     - **Step 4 (Integrity)**: Read the SHA-256 explanation box (Canonical Deterministic Key Ordering).
  3. Click `[ Capture & Calculate SHA-256 ]`.
  4. Observe the toast notification: *"Evidence snapshot captured and SHA-256 hashed."*
  5. In the Retained Evidence Ledger, locate your newly captured item.
  6. Click `[ Verify integrity ]`.
  7. Observe the verification confirmation: *"Evidence integrity verified. SHA-256 matches immutable snapshot."*
- **Expected Result**: Court-ready evidence custody pipeline with cryptographic tamper verification.

---

### 13. Investigator Notes & Formal Findings
- **Where**: Case Workspace → Nav: **CASE WORK → Notes & Findings**.
- **Steps**:
  1. In the New Note box, write: *"Intermediary wallet forwarded funds within 4 minutes."* Click `Save note`. Verify it appears with note ID.
  2. In the Finding form, enter:
     - Title: *"Intermediary infrastructure coordination"*
     - Evidence IDs: *"EV-0001"*
     - Description: *"Observed transfer dispersal matches patterns identified in related case."*
  3. Click `Create finding`. Verify it appears under workspace records with the cited evidence IDs.
  4. Click the delete icon on any note to verify note removal.
- **Expected Result**: Clearly distinguishes working leads (notes) from cited conclusions (findings).

---

### 14. Real-Time Wallet Monitoring
- **Where**: Case Workspace → Case Hero header or Nav: **Monitoring**.
- **Steps**:
  1. Click `[ Start monitoring ]` in the case hero.
  2. Observe the badge change to `Monitoring active` with green dot.
  3. Navigate to `/monitoring` in the global sidebar to see the active monitor entry with last checked timestamp and deduplication cache.
  4. Click `[ Stop monitoring ]` to pause monitoring.
- **Expected Result**: Continuous watchlist monitoring without duplicate tracking jobs.

---

### 15. Grounded Groq Investigation Copilot
- **Where**: Case Workspace → Nav: **ASSIST & REPORT → Copilot Assistant**.
- **Steps**:
  1. Observe the 6 one-click starter prompts:
     - *"Summarize this investigation"*
     - *"Why is this wallet high risk?"*
     - *"Where did the funds go?"*
     - *"Which transactions triggered indicators?"*
     - *"Are there related investigations?"*
     - *"What should I inspect next?"*
  2. Click `"Why is this wallet high risk?"`.
  3. Observe the structured response formatted with authoritative headers:
     - `### OBSERVED BLOCKCHAIN EVIDENCE`
     - `### TRACEX ANALYSIS`
     - `### EXTERNAL INTELLIGENCE`
     - `### INVESTIGATOR MATERIAL`
     - `### NEXT INVESTIGATIVE STEPS`
- **Expected Result**: Grounded, verifiable explanations citing real case facts with zero hallucinations.

---

### 16. Professional PDF Investigation Report
- **Where**: Case Workspace → Nav: **ASSIST & REPORT → Report & Exports**.
- **Steps**:
  1. Click `[ Investigation report (PDF) ]`.
  2. Observe browser download of `TraceX_Case_TX-2026-5C7986.pdf`.
  3. Open the downloaded PDF and verify:
     - Professional header branding & Case Reference
     - Executive Summary
     - Risk Assessment & deterministic indicator table
     - Fund-Flow Graph summary and topology statistics
     - Retained Evidence Ledger with SHA-256 digests
     - Formal Investigator Findings & Audit Trail
     - Methodology and Limitations disclaimer
  4. Click `[ Transaction evidence (CSV) ]` to verify 740 rows of exported CSV data.
  5. Click `[ Complete evidence object (JSON) ]` to verify structured schema export.
- **Expected Result**: Comprehensive, audit-proof reports ready for law enforcement and compliance teams.

---

### 17. Feature Test Lab (All 23 Capabilities Self-Check)
- **Where**: Case Workspace → Nav: **DEV & QA → Feature Test Lab**.
- **Steps**:
  1. Click the `Feature Test Lab` tab in the navigation hub.
  2. View the complete 23-item verification table.
  3. Click `[ Open & Test Feature ]` on any row (e.g. *Transaction Time Machine* or *Cross-Case Fraud Network*).
- **Expected Result**: Direct 1-click test launcher verifying every capability in TraceX.
