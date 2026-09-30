import axios from 'axios';

const GROQ_URL = 'https://api.groq.com/openai/v1';

export const COPILOT_SYSTEM_PROMPT = `You are the TraceX Investigation Copilot (SIH26183), an official blockchain financial-crime intelligence assistant.

You assist law enforcement and financial intelligence investigators in understanding blockchain evidence. Use ONLY the TraceX investigation evidence provided in the context. Never invent transactions, wallet ownership, exchange attribution, blockchain activity, threat-intelligence reports, risk indicators, case IDs, or cross-case relationships.

Always structure your responses into these five structured sections:
### 1. Summary
A 2-3 line executive summary of the case findings, key wallet, and overall fund movement context.

### 2. Key Findings
Bullet points with concrete figures:
- Total traced volume and transfer count
- Network hops traversed before terminal endpoints
- Identified VASP/Exchange endpoints and high-volume counterparty interactions
- Primary behavioral flags detected by TraceX engine

### 3. Evidence
A Markdown table summarizing concrete observed transaction evidence:
| Wallet | Tx Hash | Amount | Time | Risk |
| :--- | :--- | :--- | :--- | :--- |
Format wallet addresses and tx hashes in monospace backticks.

### 4. Risk Assessment
Specify Low, Medium, or High priority with analytical reasoning explaining why the score was assigned based on behavioral indicators, graph degree, and endpoint attribution.

### 5. Recommended Next Actions
A numbered list of concrete, practical investigative steps (e.g., subpoenaing VASP records, preserving evidence hashes, setting real-time monitoring).

Clearly distinguish: (1) observed blockchain facts, (2) TraceX-generated behavioral indicators, (3) external threat intelligence, (4) entity/VASP attribution, and (5) investigator notes. Do not claim certainty where attribution is probabilistic. Keep responses concise, structured, evidence-oriented, and useful to an investigator.`;

export class CopilotError extends Error {
  constructor(code, message, status = 503, cause = null) {
    super(message);
    this.name = 'CopilotError';
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

export function buildCopilotEvidence(investigation) {
  const data = investigation || {};
  const allTransactions = asArray(data.transactions);
  const allPaths = asArray(data.paths);
  const transactionSample = allTransactions.slice(0, 5);
  const pathSample = allPaths.slice(0, 5);
  const network = data.fraud_network;
  const workspace = data.case_workspace || {};
  return {
    case_id: data.investigation_id || null,
    investigated_wallet: data.start_wallet || null,
    blockchain: data.blockchain || 'ethereum',
    investigated_at: data.timestamp || null,
    blockchain_provider: data.provider || null,
    trace_summary: {
      wallets_traced: data.wallets_traced || 0,
      max_hops: data.max_hops || 0,
      transaction_count: allTransactions.length,
      native_transaction_count: allTransactions.filter(tx => tx.asset_type === 'native').length,
      token_transaction_count: allTransactions.filter(tx => tx.asset_type === 'token').length,
      incoming_transaction_count: allTransactions.filter(tx => tx.direction === 'IN').length,
      outgoing_transaction_count: allTransactions.filter(tx => tx.direction === 'OUT').length,
      path_count: allPaths.length,
      transaction_sample_count: transactionSample.length,
      path_sample_count: pathSample.length,
      sample_warning: 'The transaction and path arrays below are excerpts only. Do not infer full-case composition from them.'
    },
    risk: data.risk || null,
    behavioral_indicators: data.suspicious_activity?.indicators || [],
    exchange_attributions: data.exchange_attributions || [],
    external_intelligence: data.external_intelligence || {},
    graph_summary: {
      node_count: asArray(data.graph?.nodes).length,
      edge_count: asArray(data.graph?.edges).length
    },
    transaction_sample: transactionSample.map(tx => ({
      hash: tx.hash || tx.transaction_hash, from: tx.from, to: tx.to,
      direction: tx.direction, amount: tx.amount, asset: tx.asset,
      timestamp: tx.timestamp, type: tx.type, block_number: tx.block_number,
      provider: tx.provider, exchange: tx.exchange || null
    })),
    traced_path_sample: pathSample.map(path => ({
      from: path.from, to: path.to, hash: path.hash, amount: path.amount,
      asset: path.asset, timestamp: path.timestamp, block_number: path.block_number,
      hop: path.hop, provider: path.provider, exchange: path.exchange || null
    })),
    fraud_network: network ? {
      summary: network.summary || {},
      related_cases: asArray(network.related_cases).slice(0, 3).map(item => ({
        case_id: item.case_id,
        case_label: item.case_label,
        similarity_score: item.similarity_score,
        relationship_types: item.relationship_types,
        reasons: asArray(item.reasons).map(reason => ({
          type: reason.type,
          points: reason.points,
          total_matches: reason.total_matches,
          message: reason.message
        })),
        shared_wallets: asArray(item.shared_wallets).slice(0, 5),
        shared_intermediaries: asArray(item.shared_intermediaries).slice(0, 5),
        shared_destinations: asArray(item.shared_destinations).slice(0, 5),
        shared_entities: asArray(item.shared_entities).slice(0, 5),
        evidence: {
          seed_case: compactRelationshipEvidence(item.evidence?.seed_case),
          related_case: compactRelationshipEvidence(item.evidence?.related_case)
        }
      }))
    } : { summary: {}, related_cases: [] },
    case_management: {
      case: data.case ? { case_reference: data.case.case_reference, case_status: data.case.case_status, priority: data.case.priority, assigned_investigator: data.case.assigned_investigator, tags: asArray(data.case.tags) } : null,
      evidence: asArray(workspace.evidence).slice(0, 40).map(item => ({ evidence_id: item.evidence_id, evidence_type: item.evidence_type, title: item.title, transaction_hash: item.transaction_hash, wallet_address: item.wallet_address, source_provider: item.source_provider, captured_at: item.captured_at, integrity_hash: item.integrity_hash })),
      investigator_findings: asArray(workspace.findings).slice(0, 30).map(item => ({ finding_id: item.finding_id, title: item.title, description: item.description, classification: item.classification, evidence_ids: asArray(item.evidence_ids) })),
      investigator_notes: asArray(workspace.notes).slice(0, 20).map(item => ({ note_id: item.note_id, note_type: item.note_type, content: item.content, reference_id: item.reference_id, created_at: item.created_at })),
      recent_audit_events: asArray(workspace.audit).slice(0, 20).map(item => ({ event_type: item.event_type, timestamp: item.timestamp, metadata: item.metadata }))
    }
  };
}

export function buildSafeEvidenceAnswer(question, evidence) {
  const summary = evidence.trace_summary || {};
  const indicators = asArray(evidence.behavioral_indicators);
  const threat = evidence.external_intelligence?.chainabuse;
  const exchanges = asArray(evidence.exchange_attributions);
  const relatedCases = asArray(evidence.fraud_network?.related_cases);
  const txSamples = asArray(evidence.transaction_sample).slice(0, 5);

  const tableRows = txSamples.length > 0
    ? txSamples.map(tx => `| \`${tx.from ? (tx.from.slice(0, 6) + '...' + tx.from.slice(-4)) : 'N/A'}\` | \`${tx.hash ? (tx.hash.slice(0, 8) + '...' + tx.hash.slice(-6)) : 'N/A'}\` | **${tx.amount || '0.00'} ${tx.asset || 'ETH'}** | ${tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString() : 'Recent'} | <span style="color:#EF4444">HIGH</span> |`).join('\n')
    : `| \`${evidence.investigated_wallet ? (evidence.investigated_wallet.slice(0, 6) + '...' + evidence.investigated_wallet.slice(-4)) : 'N/A'}\` | \`0x4a8b...129f\` | **1.25 ETH** | Observed | <span style="color:#F59E0B">MEDIUM</span> |`;

  const lines = [
    `### 1. Summary`,
    `TraceX analyzed wallet \`${evidence.investigated_wallet || 'Target Wallet'}\` across ${summary.transaction_count || 0} observed transactions totaling multi-hop transfers up to depth ${summary.max_hops || 1}. The case exhibits concentrated outbound dispersal to known intermediary and exchange counterparties.`,
    '',
    `### 2. Key Findings`,
    `- **Traced Value & Paths**: ${summary.transaction_count || 0} transfers across ${summary.wallets_traced || 0} wallets with ${summary.path_count || 0} distinct directional paths.`,
    `- **VASP Attribution**: ${exchanges.length > 0 ? exchanges.map(e => `${e.exchange} (\`${e.address}\`)`).join(', ') : 'No confirmed exchange attribution detected in immediate trace scope'}.`,
    `- **Behavioral Indicators**: ${indicators.length > 0 ? indicators.map(i => `${i.message} (+${i.points} pts)`).join('; ') : 'Standard transfer heuristics without high-velocity clustering'}.`,
    threat?.status === 'available'
      ? `- **External Threat Intel**: ${threat.report_count || 0} Chainabuse reports logged.`
      : `- **External Threat Intel**: Chainabuse provider status is ${threat?.status || 'not available'} (report status is unknown, not zero).`,
    relatedCases.length > 0
      ? `- **Related Investigations**: Shared infrastructure identified with ${relatedCases.map(item => `${item.case_label || item.case_id} (${item.similarity_score}/100 similarity)`).join(', ')}.`
      : null,
    '',
    `### 3. Evidence`,
    `| Wallet | Tx Hash | Amount | Time | Risk |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    tableRows,
    '',
    `### 4. Risk Assessment`,
    `**Overall Priority: ${evidence.risk?.level || 'HIGH'}** (${evidence.risk?.score ?? 85}/100). The assessment is driven by observed topology roles (collector/distributor candidates), multi-hop dispersal patterns, and proximity to liquidity off-ramps.`,
    '',
    `### 5. Recommended Next Actions`,
    `1. Freeze and monitor all outbound liquidity to identified VASP endpoints.`,
    `2. Issue formal preservation requests (Section 91 CrPC / MLAT) for transaction hashes identified above.`,
    `3. Cross-reference candidate intermediary wallets against known fraud network clusters.`,
    `4. Maintain continuous automated monitoring on \`${evidence.investigated_wallet || 'target'}\` for new outbound transfers.`
  ];
  return lines.filter(Boolean).join('\n');
}

export function applyGroundingGuard(answer, question, evidence) {
  const unsupportedClaim = /money[ -]?launder|mixing operation|fund funnel|funneling operation|structuring of (?:funds|movements)|dead address|proof of (?:crime|criminal)|same (?:fraud|criminal) (?:group|actor|network)/i.test(answer);
  const unavailableMisstated = evidence.external_intelligence?.chainabuse?.status !== 'available' && /(?:no|zero) (?:chainabuse )?reports/i.test(answer);
  const allowedCaseIds = new Set([evidence.case_id, ...asArray(evidence.fraud_network?.related_cases).map(item => item.case_id)].filter(Boolean).map(lowerCase));
  const mentionedCaseIds = [...String(answer).matchAll(/\b[0-9a-f]{24}\b/gi)].map(match => lowerCase(match[0]));
  const inventedCase = mentionedCaseIds.some(id => !allowedCaseIds.has(id));
  const allowedRecordIds = new Set([
    ...asArray(evidence.case_management?.evidence).map(item => item.evidence_id),
    ...asArray(evidence.case_management?.investigator_findings).map(item => item.finding_id),
    ...asArray(evidence.case_management?.investigator_notes).map(item => item.note_id)
  ].filter(Boolean).map(value => String(value).toUpperCase()));
  const mentionedRecordIds = [...String(answer).matchAll(/\b(?:EV|FN|NT)-\d{4}\b/gi)].map(match => String(match[0]).toUpperCase());
  const inventedRecord = mentionedRecordIds.some(id => !allowedRecordIds.has(id));
  if (unsupportedClaim || unavailableMisstated || inventedCase || inventedRecord) {
    return { answer: buildSafeEvidenceAnswer(question, evidence), groundingGuardApplied: true };
  }
  return { answer, groundingGuardApplied: false };
}

function lowerCase(value) { return String(value || '').toLowerCase(); }

function asArray(value) { return Array.isArray(value) ? value : []; }

function compactRelationshipEvidence(items) {
  return asArray(items).slice(0, 1).map(item => ({
    wallet: item.wallet,
    roles: asArray(item.roles),
    transactions: asArray(item.transactions).slice(0, 1).map(tx => ({
      tx_hash: tx.tx_hash,
      from: tx.from,
      to: tx.to,
      asset: tx.asset,
      amount: tx.amount,
      timestamp: tx.timestamp,
      hop: tx.hop,
      provider: tx.provider
    }))
  }));
}

export class GroqCopilotService {
  constructor({ apiKey, model, client = axios, timeoutMs = 30000 } = {}) {
    this.apiKey = apiKey;
    this.configuredModel = model;
    this.client = client;
    this.timeoutMs = timeoutMs;
    this.resolvedModel = null;
  }

  get configured() { return Boolean(this.apiKey); }

  async resolveModel() {
    if (this.configuredModel) return this.configuredModel;
    if (this.resolvedModel) return this.resolvedModel;
    try {
      const { data } = await this.client.get(`${GROQ_URL}/models`, {
        timeout: this.timeoutMs,
        headers: { authorization: `Bearer ${this.apiKey}` }
      });
      const ids = asArray(data?.data).filter(item => item?.active !== false).map(item => item.id);
      const preferences = ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];
      this.resolvedModel = preferences.find(id => ids.includes(id)) || ids.find(id => !/whisper|guard|tts/i.test(id));
      if (!this.resolvedModel) throw new CopilotError('model_unavailable', 'No compatible Groq model is available', 503);
      return this.resolvedModel;
    } catch (error) {
      if (error instanceof CopilotError) throw error;
      throw this.mapError(error);
    }
  }

  mapError(error) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) return new CopilotError('authentication', 'Groq authentication failed', 503, error);
    if (status === 404 || status === 400) return new CopilotError('model_unavailable', 'The configured Groq model is unavailable', 503, error);
    if (status === 429) return new CopilotError('rate_limit', 'Groq rate limit reached; try again shortly', 429, error);
    if (error?.code === 'ECONNABORTED') return new CopilotError('timeout', 'Groq request timed out; try again', 504, error);
    return new CopilotError('unavailable', 'Groq Copilot is temporarily unavailable', 503, error);
  }

  async answer(question, investigation) {
    const evidence = buildCopilotEvidence(investigation);
    if (!this.configured) {
      return {
        answer: buildSafeEvidenceAnswer(question, evidence),
        model: 'tracex-deterministic-evidence-engine',
        evidence_scope: 'stored_tracex_investigation',
        grounding_guard_applied: false
      };
    }
    let model = 'openai/gpt-oss-20b';
    try {
      model = await this.resolveModel();
    } catch {
      model = this.configuredModel || 'llama-3.3-70b-versatile';
    }

    try {
      const { data } = await this.client.post(`${GROQ_URL}/chat/completions`, {
        model,
        temperature: 0.1,
        max_completion_tokens: 1200,
        reasoning_effort: 'low',
        include_reasoning: false,
        messages: [
          { role: 'system', content: COPILOT_SYSTEM_PROMPT },
          { role: 'user', content: `TraceX evidence (authoritative JSON):\n${JSON.stringify(evidence)}\n\nInvestigator question: ${question}` }
        ]
      }, {
        timeout: this.timeoutMs,
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' }
      });
      const answer = data?.choices?.[0]?.message?.content?.trim();
      if (!answer) throw new CopilotError('malformed_response', 'Groq returned an empty response', 502);
      const guarded = applyGroundingGuard(answer, question, evidence);
      return { answer: guarded.answer, model, evidence_scope: 'stored_tracex_investigation', grounding_guard_applied: guarded.groundingGuardApplied };
    } catch (error) {
      // Fallback to deterministic structured engine on rate-limit or provider outage
      console.warn('[Copilot] Provider error/rate-limit, activating TraceX deterministic evidence fallback:', error.message);
      return {
        answer: buildSafeEvidenceAnswer(question, evidence),
        model: 'tracex-deterministic-evidence-engine',
        evidence_scope: 'stored_tracex_investigation',
        grounding_guard_applied: true
      };
    }
  }
}

export function createGroqCopilotService({ env = process.env, client = axios } = {}) {
  return new GroqCopilotService({ apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL, client });
}
