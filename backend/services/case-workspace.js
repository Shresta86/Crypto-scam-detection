import { createHash } from 'node:crypto';

export const CASE_STATUSES = ['NEW', 'ACTIVE', 'UNDER_REVIEW', 'ESCALATED', 'CLOSED'];
export const CASE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const NOTE_TYPES = ['GENERAL_CASE_NOTE', 'WALLET_NOTE', 'TRANSACTION_NOTE', 'PATH_NOTE', 'ENTITY_NOTE', 'EVIDENCE_NOTE', 'ALERT_NOTE', 'RELATIONSHIP_NOTE'];
export const FINDING_STATUSES = ['PRELIMINARY', 'SUPPORTED', 'REQUIRES_REVIEW'];
export const EVIDENCE_TYPES = ['TRANSACTION', 'WALLET', 'TRACED_PATH', 'RISK_INDICATOR', 'VASP_ATTRIBUTION', 'EXTERNAL_INTELLIGENCE', 'RELATED_CASE_RELATIONSHIP', 'NETWORK_NODE', 'BRIDGE_INTERACTION', 'ALERT', 'TIMELINE_EVENT', 'REPORT_SNAPSHOT'];

export const STATUS_TRANSITIONS = {
  NEW: ['ACTIVE', 'CLOSED'], ACTIVE: ['UNDER_REVIEW', 'ESCALATED', 'CLOSED'],
  UNDER_REVIEW: ['ACTIVE', 'ESCALATED', 'CLOSED'], ESCALATED: ['UNDER_REVIEW', 'CLOSED'], CLOSED: ['ACTIVE']
};

export function sanitizeText(value, maxLength = 2000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

export function evidenceIntegrityPayload(item) {
  return {
    evidence_id: item.evidence_id, case_id: item.case_id, evidence_type: item.evidence_type,
    source_type: item.source_type, source_provider: item.source_provider, source_reference: item.source_reference,
    captured_at: item.captured_at, blockchain_timestamp: item.blockchain_timestamp || null,
    chain_id: item.chain_id ?? null, chain_name: item.chain_name || null,
    wallet_address: item.wallet_address || null, transaction_hash: item.transaction_hash || null,
    snapshot: item.snapshot
  };
}

export function integrityHash(item) {
  return createHash('sha256').update(canonicalize(evidenceIntegrityPayload(item))).digest('hex');
}

function pick(source, keys) {
  const result = {};
  for (const key of keys) if (source?.[key] !== undefined) result[key] = source[key];
  return result;
}

const SNAPSHOT_FIELDS = {
  TRANSACTION: ['hash','transaction_hash','tx_hash','from','to','sender','receiver','asset','amount','raw_amount','timestamp','block_number','provider','chain_id','chain_name','direction','type','token_address','exchange','hop'],
  WALLET: ['address','wallet','role','risk','incoming','outgoing','assets','related_cases','analytics','bridge'],
  TRACED_PATH: ['from','to','hash','transaction_hash','asset','amount','timestamp','block_number','provider','hop','exchange'],
  RISK_INDICATOR: ['type','source','message','severity','points','supporting_transactions','calculated_at'],
  VASP_ATTRIBUTION: ['address','exchange','entity','confidence','source','interactions','transaction_count'],
  EXTERNAL_INTELLIGENCE: ['source','status','address','report_count','categories','reports','confidence','last_checked','cached'],
  RELATED_CASE_RELATIONSHIP: ['case_id','case_label','similarity_score','relationship_types','reasons','shared_wallets','shared_intermediaries','shared_destinations','shared_entities'],
  NETWORK_NODE: ['id','address','wallet','label','type','entity','analytics','bridge'],
  BRIDGE_INTERACTION: ['type','source_chain','source_chain_id','wallet','bridge','bridge_entity','bridge_contract','contract_role','transaction_hash','asset','amount','timestamp','block','provider','destination_chain','correlation_status','provenance'],
  ALERT: ['id','alert_type','severity','title','description','wallet_address','transaction_hash','timestamp','status','evidence'],
  TIMELINE_EVENT: ['hash','from','to','asset','amount','timestamp','block_number','provider','direction'],
  REPORT_SNAPSHOT: ['generated_at','case_status','priority','evidence_count','finding_count','report_version']
};

export function boundedSnapshot(type, source) {
  if (!EVIDENCE_TYPES.includes(type)) throw new Error('invalid_evidence_type');
  const snapshot = pick(source || {}, SNAPSHOT_FIELDS[type]);
  const encoded = JSON.stringify(snapshot);
  if (!Object.keys(snapshot).length) throw new Error('empty_evidence_snapshot');
  if (encoded.length > 50000) throw new Error('evidence_snapshot_too_large');
  return snapshot;
}

export function validateStatusTransition(previous, next) {
  if (!CASE_STATUSES.includes(next)) return false;
  if (previous === next) return true;
  return (STATUS_TRANSITIONS[previous] || []).includes(next);
}

export function caseCompleteness({ investigation, evidenceCount = 0, noteCount = 0, findingCount = 0, monitoring = false, reportGenerated = false } = {}) {
  const result = investigation?.result_json || investigation || {};
  const threat = result.external_intelligence?.chainabuse;
  const steps = [
    { id: 'blockchain_analysis', label: 'Blockchain Analysis', complete: Boolean(result.transactions?.length) },
    { id: 'risk_assessment', label: 'Risk Assessment', complete: Number.isFinite(Number(result.risk?.score)) },
    { id: 'network_analysis', label: 'Network Analysis', complete: Boolean(result.graph?.nodes?.length) },
    { id: 'external_intelligence', label: 'External Intelligence Checked', complete: Boolean(threat?.status) },
    { id: 'evidence_selected', label: 'Evidence Selected', complete: evidenceCount > 0 },
    { id: 'investigator_findings', label: 'Investigator Findings', complete: findingCount > 0 || noteCount > 0 },
    { id: 'monitoring', label: 'Monitoring', complete: monitoring, optional: true },
    { id: 'report_generated', label: 'Report Generated', complete: reportGenerated, optional: true }
  ];
  const required = steps.filter(step => !step.optional);
  return { completed: required.filter(step => step.complete).length, total: required.length, percentage: Math.round(required.filter(step => step.complete).length / required.length * 100), steps };
}
