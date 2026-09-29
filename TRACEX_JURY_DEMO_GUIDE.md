# TraceX Jury Demonstration Guide
**SIH Pitch Playbook: The 3-Minute & 5-Minute Courtroom / Jury Scripts**

==============================================================  
**TRACEX • BLOCKCHAIN FINANCIAL CRIME INTELLIGENCE**  
*REPORT THE WALLET. TRACE THE MONEY. REVEAL THE NETWORK.*  
==============================================================

---

## 1. Executive Summary & Core Pitch
TraceX is not a cryptocurrency tracker. It is an **explainable blockchain financial crime intelligence and evidence preservation system**.

When law enforcement or compliance investigators receive a victim-reported wallet address, raw block explorers present thousands of disconnected hexadecimal transfers. TraceX ingests that address, traces multi-hop fund movement, explains suspicious behavior without black-box scores, discovers shared fraud infrastructure across cases, and packages court-ready evidence with cryptographic SHA-256 tamper verification.

---

## 2. The 3-Minute Lightning Demo (High-Impact Jury Flow)

### Timing & Script:

#### 0:00 – 0:30 | The Problem & Entry Point
- **What to Click**: Open `http://localhost:5173`. Show the landing hero screen.
- **What to Say**:  
  *"Judges, when a cybercrime victim reports that their funds were stolen, investigators start with a single hexadecimal address. Today, tracing that money across multiple hops requires hours of manual cross-referencing. TraceX changes that. Starting from a single suspect wallet, TraceX automates multi-hop fund tracing, explains behavioral risk, and reveals the criminal network."*
- **What to Click**: Click `[ Open stored demo case ]` (`TX-2026-5C7986`).
- **Expected Screen**: Case Workspace hero loads instantly with 739 transactions, 165 paths, 90/100 risk score, and the 8-stage Investigation Journey strip.

#### 0:30 – 1:00 | Explainable Risk & Fund Flow Centerpiece
- **What to Say**:  
  *"TraceX does not use opaque AI or black-box risk scores that get thrown out in court. In our Case Briefing, TraceX explains exactly why this wallet scored 90/100 HIGH priority: rapid outgoing dispersal, multi-hop intermediaries, and fund splitting."*
- **What to Click**: Click `02 FUND FLOW TRACED` in the journey strip (or Nav: `Fund Flow Graph`).
- **Expected Screen**: Full-width SVG graph displaying 42 network nodes and 165 directional edges.
- **What to Say**:  
  *"Here is our multi-hop fund-flow graph. Watch what happens when I select this suspicious intermediary path."*
- **What to Click**: Click an intermediary edge. Unrelated nodes fade, and the active path highlights with glowing cyan accents.

#### 1:00 – 1:45 | Chronological Time Machine & Cross-Case Correlation
- **What to Click**: Click `Time Machine` in the navigation hub.
- **What to Say**:  
  *"Criminals move money rapidly to evade freezing orders. TraceX includes a Transaction Time Machine to replay transfers chronologically."*
- **What to Click**: Click `▶ Play`, toggle to `2x`, then click `[ Jump to Next Signal ]`.
- **What to Say**:  
  *"Now look at our cross-case fraud intelligence."*
- **What to Click**: Click `Related Cases` in the navigation hub.
- **Expected Screen**: Case `TX-2026-9F3516` appears with a 100/100 similarity score.
- **What to Say**:  
  *"TraceX discovered that this intermediary wallet does not just belong to one isolated incident. It was also used in Case TX-2026-9F3516. We didn't just trace a transaction; we revealed shared criminal infrastructure."*

#### 1:45 – 2:30 | Evidence Integrity & Grounded Copilot
- **What to Click**: Click `Evidence & Integrity` in the navigation hub.
- **What to Say**:  
  *"Evidence must withstand cross-examination. Every transaction or wallet captured by an investigator is frozen in an immutable snapshot and hashed with SHA-256."*
- **What to Click**: Click `[ Verify integrity ]` on any item. Toast displays: *"Evidence integrity verified. SHA-256 matches immutable snapshot."*
- **What to Click**: Click `Copilot Assistant` in the navigation hub. Click `"Why is this wallet high risk?"`.
- **What to Say**:  
  *"Our AI Copilot is strictly grounded. It does not hallucinate transactions or guess criminal intent. It parses deterministic blockchain evidence and labels facts, analysis, and next steps."*

#### 2:30 – 3:00 | The Finale: Court-Ready Report
- **What to Click**: Click `Report & Exports` in the navigation hub. Click `[ Investigation report (PDF) ]`.
- **What to Say**:  
  *"Finally, TraceX generates an executive investigation brief with full chain of custody, methodology, and verified evidence ledgers. In under three minutes, TraceX turned a victim-reported wallet into structured, court-ready intelligence."*
- **Closing Punchline**:  
  *"TraceX: Report the Wallet. Trace the Money. Reveal the Network."*

---

## 3. The 5-Minute In-Depth Demo (Deep-Dive Jury Flow)

| Time | Phase | Action / Click | Speaking Script | Expected Screen |
|:---|:---|:---|:---|:---|
| **0:00 - 0:45** | **Victim Intake & Entry** | Landing page → Show invalid address error → Click `[ Open stored demo case ]` | *"We begin with victim intake. In live operations, APIs can face rate limits or downtime. TraceX features graceful offline recovery: investigators can immediately proceed using provider-backed stored evidence."* | Clean hero screen with provider status badge and quick-access banner |
| **0:45 - 1:30** | **Investigation Overview & Map** | Case Briefing → Point out "What TraceX Found" and "Investigation Map" | *"TraceX derives 5 key findings from 739 normalized transfers. Our visual Investigation Map guides the investigator through each technical layer: from raw transfers to risk, topology, and cross-case links."* | Editorial hero grid + 7-stage interactive pipeline map |
| **1:30 - 2:15** | **Fund-Flow Graph & Node Inspector** | Click `Fund Flow Graph` → Filter by `Hop 2` → Select collector node → Click `[ Show in transactions ]` | *"Here we isolate Hop 2 dispersal. Clicking this node reveals its role as a Collector Candidate that aggregated funds from 12 distinct sources. One click jumps straight to its normalized transactions."* | Centerpiece graph with highlighted route; side inspector showing degree connectivity |
| **2:15 - 3:00** | **Time Machine & Topology** | Click `Time Machine` → Click `Jump to Next Signal` → Click `Network Roles` | *"Criminals rely on rapid forwarding. Our Time Machine animates transfers chronologically. TraceX's topology algorithms classify hubs, collectors, and distributors based on in-degree and out-degree connectivity."* | Interactive timeline player with animated progress; topology card grid |
| **3:00 - 3:45** | **Fraud Network & Comparison** | Click `Related Cases` → Click `[ Compare evidence ]` | *"This is our strongest intelligence feature: cross-case correlation. Notice the 100/100 similarity match. Clicking 'Compare evidence' shows side-by-side transaction histories proving shared infrastructure between investigations."* | Comparison drawer showing shared intermediary and overlapping transfer amounts |
| **3:45 - 4:20** | **4-Step Evidence Capture & Tamper Detection** | Click `Evidence & Integrity` → Click `[ Capture new evidence ]` → Step through 1 to 4 → Verify | *"We built a 4-step evidence wizard. Step 1 classifies the evidence; Step 2 records provider provenance; Step 3 freezes the bounded snapshot; Step 4 calculates the canonical SHA-256 hash. Any subsequent tampering causes instant verification failure."* | Step 1-4 Wizard with JSON preview and SHA-256 integrity pipeline |
| **4:20 - 4:45** | **Grounded Copilot** | Click `Copilot Assistant` → Click `"Are there related investigations?"` | *"Our Groq LLM copilot acts as a senior investigative analyst. It references only verified case records and structures every answer into observed evidence, analysis, and next steps."* | Markdown response with citation headers |
| **4:45 - 5:00** | **Report Export & Conclusion** | Click `Report & Exports` → Download PDF | *"TraceX exports the complete evidence brief into PDF, CSV, and JSON. From a single reported address to a court-ready case brief in five minutes."* | PDF document download and confirmation toast |

---

## 4. Demo Safety & Contingency Plan (What to do if Live APIs Fail)

### Scenario: Alchemy or Etherscan Rate Limit / Timeout
1. Do not panic. TraceX was deliberately engineered for this exact scenario.
2. The UI will display:
   > **LIVE PROVIDER TEMPORARILY UNAVAILABLE**  
   > *TraceX could not complete the live blockchain request. Your existing investigation evidence remains available in MongoDB storage.*
3. **What to Say**:  
   *"Notice how TraceX handles live blockchain RPC instability. In real-world cybercrime operations, external providers frequently hit rate limits. TraceX safeguards the investigation by decoupling live retrieval from stored provider-backed analysis."*
4. Click `[ Open stored demo case ]` or `[ Open recent investigation ]`.
5. Proceed through the demo seamlessly using Case `TX-2026-5C7986`.

---

## 5. Winning Presentation Tips for SIH Judges
1. **Never say "AI found the fraud"**: Emphasize that **deterministic TraceX graph and behavioral rules** found the connections, and the AI Copilot only synthesizes and explains the verified evidence.
2. **Emphasize Tamper-Evidence**: Judges love compliance and court admissibility. Point out that snapshots are canonically serialized with sorted JSON keys before hashing.
3. **Use the "🚀 Guided Investigation" Button**: If judges ask how a junior detective would use the software, click the `🚀 Guided Investigation` button in the case header. It displays step-by-step guidance overlays with exact talking points!
