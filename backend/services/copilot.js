import axios from 'axios';

const GROQ_URL = 'https://api.groq.com/openai/v1';

export const COPILOT_SYSTEM_PROMPT = `You are the TraceX Investigation Copilot.

You assist investigators in understanding blockchain investigation evidence. Use only the TraceX investigation evidence provided in the context. Never invent transactions, wallet ownership, exchange attribution, blockchain activity, threat-intelligence reports, risk indicators, case IDs, or cross-case relationships. Fraud-network relationships are deterministic TraceX findings; explain only relationships present in fraud_network.related_cases and never discover new relationships yourself.

Clearly distinguish: (1) observed blockchain facts, (2) TraceX-generated behavioral indicators, (3) external threat intelligence, (4) entity/VASP attribution, (5) investigator-authored notes/findings, and (6) investigative hypotheses. Investigator-authored material is a lead unless its referenced evidence supports it; do not elevate it to an observed fact.

A TraceX risk score is an investigative indicator, not proof of criminal activity. A third-party report is supporting intelligence, not proof of criminal ownership. If an external source is unavailable, say its result is unknown; never convert unavailable into zero reports. The transactions and paths in context may be labeled samples, so never generalize sample composition to the whole case. Do not describe mixing, laundering, funneling, structuring, criminal intent, or wallet ownership unless that exact conclusion exists in the supplied evidence. Behavioral indicators describe rule matches only. If evidence is insufficient, explicitly state that. When possible, reference concrete transaction hashes, wallet addresses, assets, amounts, timestamps, traced paths, indicators, and external-intelligence sources. Do not claim certainty where attribution is uncertain. Keep responses concise, structured, evidence-oriented, and useful to an investigator.`;

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
  const transactionReferences = asArray(evidence.transaction_sample).slice(0, 3).map(tx => `${tx.hash} (${tx.amount} ${tx.asset})`).join('; ');
  const lines = [
    `TraceX evidence summary for ${evidence.investigated_wallet || 'the investigated wallet'}:`,
    '',
    'Observed blockchain facts',
    `- ${summary.transaction_count || 0} transactions: ${summary.native_transaction_count || 0} native and ${summary.token_transaction_count || 0} token transfers.`,
    `- ${summary.incoming_transaction_count || 0} incoming and ${summary.outgoing_transaction_count || 0} outgoing transactions.`,
    `- ${summary.path_count || 0} traced paths across ${summary.wallets_traced || 0} wallets, with a maximum configured depth of ${summary.max_hops || 0}.`,
    `- Blockchain provider evidence: ${evidence.blockchain_provider?.selected || 'unknown'}.`,
    transactionReferences ? `- Sample transaction references: ${transactionReferences}.` : '- No transaction samples are available.',
    '',
    'TraceX risk calculation',
    ...(indicators.length ? indicators.map(item => `- ${item.message} (+${Number(item.points) || 0}, source: ${item.source || 'TraceX rule engine'}).`) : ['- No behavioral indicators were recorded.']),
    `- Final score: ${evidence.risk?.score ?? 0} (${evidence.risk?.level || 'UNKNOWN'}).`,
    '- This score is an investigative indicator, not proof of fraud or criminal activity.',
    '',
    'External intelligence and attribution',
    threat?.status === 'available'
      ? `- Chainabuse returned ${Number(threat.report_count) || 0} report(s); any reports are supporting intelligence only.`
      : `- Chainabuse status: ${threat?.status || 'not available'}. Its report status is unknown.`,
    exchanges.length
      ? `- Dataset-matched exchange attribution: ${exchanges.map(item => `${item.exchange} (${item.address})`).join(', ')}.`
      : '- No exchange/VASP dataset match was recorded.',
    '',
    'Fraud network intelligence',
    relatedCases.length
      ? `- ${relatedCases.length} potentially related investigation(s) were found from deterministic shared-infrastructure evidence.`
      : '- No potentially related investigations met the deterministic similarity threshold.',
    ...relatedCases.slice(0, 5).map(item => `- ${item.case_label || item.case_id}: ${item.similarity_score}/100 — ${asArray(item.reasons).map(reason => reason.message).join('; ')}.`),
    '',
    `Question addressed: ${question}`
  ];
  return lines.filter(line => line !== false).join('\n');
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
    if (!this.configured) throw new CopilotError('not_configured', 'Groq Copilot is not configured', 503);
    const model = await this.resolveModel();
    const evidence = buildCopilotEvidence(investigation);
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
      if (error instanceof CopilotError) throw error;
      throw this.mapError(error);
    }
  }
}

export function createGroqCopilotService({ env = process.env, client = axios } = {}) {
  return new GroqCopilotService({ apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL, client });
}
