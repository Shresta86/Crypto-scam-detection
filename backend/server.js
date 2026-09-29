import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlockchainService, ProviderError } from './services/blockchain.js';
import { createChainabuseService } from './services/threat-intelligence.js';
import { CopilotError, createGroqCopilotService } from './services/copilot.js';
import { compareCaseIndexes, FraudNetworkService } from './services/fraud-network.js';
import {
  analyzeNetworkTopology, buildInvestigationStory, createBridgeRegistry,
  crossChainReadiness, detectBridgeInteractions
} from './services/advanced-intelligence.js';
import {
  boundedSnapshot, CASE_PRIORITIES, CASE_STATUSES, caseCompleteness, EVIDENCE_TYPES,
  FINDING_STATUSES, integrityHash, NOTE_TYPES, sanitizeText, validateStatusTransition
} from './services/case-workspace.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
dotenv.config({ path: join(root, '.env') });
dotenv.config({ path: join(__dirname, '.env'), override: false });

const app = express();
const PORT = Number(process.env.PORT || 5001);
const POLL_MS = Number(process.env.MONITORING_POLL_SECONDS || 15) * 1000;
const chain = 'ethereum';
const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const monitorCache = new Map();
const now = () => new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
const lower = value => String(value || '').toLowerCase();

class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

app.use(cors());
app.use(express.json({ limit: '5mb' }));
// Canonical API aliases for the React SPA. Legacy routes remain available for
// the archived-compatible dashboard without colliding with client-side pages.
app.use((req, _res, next) => {
  if (req.url.startsWith('/api/')) {
    const apiPath = req.url.slice(4);
    const aliases = ['/trace', '/history', '/monitor', '/alerts', '/export', '/report'];
    if (aliases.some(prefix => apiPath === prefix || apiPath.startsWith(`${prefix}/`) || apiPath.startsWith(`${prefix}?`))) req.url = apiPath;
  }
  next();
});

const investigationSchema = new mongoose.Schema({
  wallet_address: String, blockchain: { type: String, default: 'ethereum' }, timestamp: String,
  risk_score: Number, risk_level: String, transaction_count: Number, wallet_count: Number, max_hops: Number,
  indicators: [String], result_json: mongoose.Schema.Types.Mixed,
  case_reference: String, case_title: String, case_status: { type: String, enum: CASE_STATUSES, default: 'NEW' },
  priority: { type: String, enum: CASE_PRIORITIES, default: 'MEDIUM' }, assigned_investigator: String,
  tags: [String], case_summary: String, created_at: String, updated_at: String, closed_at: String,
  evidence_count: { type: Number, default: 0 }, note_count: { type: Number, default: 0 }, finding_count: { type: Number, default: 0 }
}, { versionKey: false });
investigationSchema.index({ case_status: 1, priority: 1, updated_at: -1 });
investigationSchema.index({ assigned_investigator: 1 });
investigationSchema.index({ tags: 1 });
investigationSchema.index({ case_reference: 1 }, { unique: true, sparse: true });
const monitorSchema = new mongoose.Schema({
  investigation_id: String, wallet_address: String, blockchain: String, status: { type: String, default: 'monitoring' },
  last_checked_at: String, last_transaction_timestamp: String, last_transaction_hash: String, created_at: String, updated_at: String,
  max_hops: Number, max_wallets: Number
}, { versionKey: false });
monitorSchema.index({ wallet_address: 1, blockchain: 1 });
const alertSchema = new mongoose.Schema({
  investigation_id: String, wallet_address: String, blockchain: String, transaction_hash: String, alert_type: String,
  severity: String, title: String, description: String, risk_contribution: Number, timestamp: String, created_at: String,
  status: { type: String, default: 'NEW' }, evidence: mongoose.Schema.Types.Mixed
}, { versionKey: false });
alertSchema.index({ wallet_address: 1, blockchain: 1, transaction_hash: 1, alert_type: 1 }, { unique: true });
const threatIntelligenceCacheSchema = new mongoose.Schema({
  address: { type: String, required: true }, chain: { type: String, required: true, default: 'ethereum' },
  provider: { type: String, required: true }, status: String, data: mongoose.Schema.Types.Mixed,
  checked_at: { type: Date, required: true }, expires_at: { type: Date, required: true }
}, { versionKey: false });
threatIntelligenceCacheSchema.index({ address: 1, chain: 1, provider: 1 }, { unique: true });
const caseNetworkIndexSchema = new mongoose.Schema({
  case_id: { type: String, required: true, unique: true }, case_label: String, investigated_at: String,
  suspect_wallet: String, wallet_addresses: [String], intermediary_wallets: [String], destination_wallets: [String],
  counterparty_wallets: [String], exchange_names: [String], exchange_keys: [String],
  exchange_entities: [mongoose.Schema.Types.Mixed], assets: [String], path_signatures: [String],
  wallet_evidence: [mongoose.Schema.Types.Mixed], path_evidence: [mongoose.Schema.Types.Mixed],
  first_activity_at: String, last_activity_at: String, updated_at: Date
}, { versionKey: false });
const auditEventSchema = new mongoose.Schema({
  case_id: { type: String, required: true, index: true }, wallet_address: String,
  event_type: { type: String, required: true }, timestamp: { type: String, required: true },
  source: String, metadata: mongoose.Schema.Types.Mixed
}, { versionKey: false });
auditEventSchema.index({ case_id: 1, timestamp: 1 });
const evidenceSchema = new mongoose.Schema({
  evidence_id: { type: String, required: true }, case_id: { type: String, required: true }, evidence_type: { type: String, enum: EVIDENCE_TYPES, required: true },
  title: String, source_type: String, source_provider: String, source_reference: String, captured_at: String, blockchain_timestamp: String,
  chain_id: Number, chain_name: String, wallet_address: String, transaction_hash: String, snapshot: mongoose.Schema.Types.Mixed,
  investigator_label: String, investigator_note: String, integrity_hash: String, integrity_algorithm: { type: String, default: 'SHA-256' },
  integrity_created_at: String, fingerprint: String, created_at: String, updated_at: String
}, { versionKey: false });
evidenceSchema.index({ case_id: 1, evidence_id: 1 }, { unique: true });
evidenceSchema.index({ case_id: 1, fingerprint: 1 }, { unique: true });
evidenceSchema.index({ transaction_hash: 1 }, { sparse: true });
const noteSchema = new mongoose.Schema({
  note_id: String, case_id: { type: String, required: true }, note_type: { type: String, enum: NOTE_TYPES, required: true },
  reference_type: String, reference_id: String, content: String, author: String, created_at: String, updated_at: String
}, { versionKey: false });
noteSchema.index({ case_id: 1, created_at: -1 });
const findingSchema = new mongoose.Schema({
  finding_id: String, case_id: { type: String, required: true }, title: String, description: String,
  classification: { type: String, enum: FINDING_STATUSES, default: 'PRELIMINARY' }, evidence_ids: [String], author: String,
  created_at: String, updated_at: String
}, { versionKey: false });
findingSchema.index({ case_id: 1, created_at: -1 });
const sequenceSchema = new mongoose.Schema({ key: { type: String, unique: true }, value: { type: Number, default: 0 } }, { versionKey: false });
for (const field of ['wallet_addresses', 'intermediary_wallets', 'destination_wallets', 'counterparty_wallets', 'exchange_names', 'path_signatures']) caseNetworkIndexSchema.index({ [field]: 1 });

export const Investigation = mongoose.model('Investigation', investigationSchema);
export const Monitor = mongoose.model('Monitor', monitorSchema);
export const Alert = mongoose.model('Alert', alertSchema);
export const ThreatIntelligenceCache = mongoose.model('ThreatIntelligenceCache', threatIntelligenceCacheSchema);
export const CaseNetworkIndex = mongoose.model('CaseNetworkIndex', caseNetworkIndexSchema);
export const AuditEvent = mongoose.model('AuditEvent', auditEventSchema);
export const EvidenceItem = mongoose.model('EvidenceItem', evidenceSchema);
export const InvestigatorNote = mongoose.model('InvestigatorNote', noteSchema);
export const InvestigatorFinding = mongoose.model('InvestigatorFinding', findingSchema);
export const CaseSequence = mongoose.model('CaseSequence', sequenceSchema);

const exchangeData = JSON.parse(readFileSync(join(root, 'data', 'exchange_addresses.json'), 'utf8'));
const bridgeData = JSON.parse(readFileSync(join(root, 'data', 'bridge_registry.json'), 'utf8'));
export const bridgeRegistry = createBridgeRegistry(bridgeData);
const exchanges = new Map(exchangeData.map(item => [lower(item.address), item.exchange]));
const identifyExchange = address => exchanges.get(lower(address)) || null;
const validChain = value => (String(value || chain).toLowerCase() === 'ethereum' ? 'ethereum' : null);
const assertWallet = (wallet, blockchain) => {
  if (!validChain(blockchain)) throw new AppError(400, 'unsupported_blockchain', `Unsupported blockchain: ${blockchain}`);
  if (!addressPattern.test(String(wallet || '').trim())) throw new AppError(400, 'invalid_wallet', 'Invalid Ethereum wallet address');
};

const chainabuse = createChainabuseService({ CacheModel: ThreatIntelligenceCache });
const copilot = createGroqCopilotService();
export const fraudNetwork = new FraudNetworkService({
  InvestigationModel: Investigation,
  NetworkIndexModel: CaseNetworkIndex,
  minScore: process.env.FRAUD_NETWORK_MIN_SCORE || 15,
  maxRelatedCases: process.env.FRAUD_NETWORK_MAX_CASES || 25
});
const blockchainService = () => createBlockchainService({ identifyExchange });
async function recordAudit(caseId, eventType, metadata = {}, walletAddress = null, source = 'tracex') {
  if (!caseId) return null;
  const event = { case_id: String(caseId), wallet_address: walletAddress, event_type: eventType, timestamp: now(), source, metadata };
  try { await AuditEvent.create(event); } catch (error) { console.error(`audit_event: ${error.message}`); }
  return event;
}
async function nextIdentifier(caseId, prefix) {
  const sequence = await CaseSequence.findOneAndUpdate({ key: `${prefix}:${caseId}` }, { $inc: { value: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return `${prefix}-${String(sequence.value).padStart(4, '0')}`;
}
function assertCaseId(caseId) { if (!mongoose.isValidObjectId(caseId)) throw new AppError(400, 'invalid_case', 'Invalid case ID'); }
async function requireCase(caseId) { assertCaseId(caseId); const doc = await Investigation.findById(caseId); if (!doc) throw new AppError(404, 'case_not_found', 'Investigation not found'); return doc; }
const caseReference = (id, timestamp = now()) => `TX-${new Date(String(timestamp).replace(' UTC', 'Z')).getUTCFullYear() || new Date().getUTCFullYear()}-${String(id).slice(-6).toUpperCase()}`;
function caseView(doc) {
  const item = doc?.toObject ? doc.toObject() : { ...(doc || {}) }, id = String(item._id || item.id || '');
  return {
    id, case_id: id, case_reference: item.case_reference || caseReference(id, item.timestamp),
    case_title: item.case_title || 'Blockchain Fund Movement Investigation', case_status: item.case_status || 'NEW',
    priority: item.priority || 'MEDIUM', assigned_investigator: item.assigned_investigator || '', tags: item.tags || [],
    case_summary: item.case_summary || '', created_at: item.created_at || item.timestamp, updated_at: item.updated_at || item.timestamp,
    closed_at: item.closed_at || null, evidence_count: item.evidence_count || 0, note_count: item.note_count || 0, finding_count: item.finding_count || 0
  };
}
async function backfillCaseMetadata() {
  const missing = await Investigation.find({ $or: [{ case_reference: { $exists: false } }, { case_reference: null }] }).select('_id timestamp').lean();
  await Promise.all(missing.map(item => Investigation.updateOne({ _id: item._id }, {
    $set: { case_reference: caseReference(String(item._id), item.timestamp), case_title: 'Blockchain Fund Movement Investigation', case_status: 'NEW', priority: 'MEDIUM', tags: [], created_at: item.timestamp || now(), updated_at: item.timestamp || now(), evidence_count: 0, note_count: 0, finding_count: 0 }
  })));
  return missing.length;
}

export async function traceWallet(startWallet, maxHops = 2, maxWallets = 8, service = blockchainService()) {
  const visited = new Set(), queue = [[startWallet, 0]], all = [], paths = [], traceWarnings = [];
  while (queue.length && visited.size < maxWallets) {
    const [wallet, hop] = queue.shift();
    if (visited.has(lower(wallet))) continue;
    visited.add(lower(wallet));
    let transactions;
    try { transactions = await service.fetchTransactions(wallet, 100); }
    catch (error) {
      if (!all.length) throw error;
      traceWarnings.push({ wallet, hop, provider: error.provider || 'blockchain', code: error.code || 'unavailable', message: 'This hop could not be retrieved; previously observed evidence was preserved.' });
      continue;
    }
    const queuedCounterparties = new Set();
    for (const transaction of transactions) {
      transaction.wallet = wallet; transaction.hop = hop; all.push(transaction);
      if (transaction.direction !== 'OUT' || !transaction.counterparty || lower(transaction.counterparty) === lower(wallet)) continue;
      paths.push({
        from: wallet, to: transaction.counterparty, amount: transaction.amount, raw_amount: transaction.raw_amount,
        hash: transaction.hash, transaction_hash: transaction.hash, timestamp: transaction.timestamp,
        block_number: transaction.block_number, hop: hop + 1, type: transaction.type, asset: transaction.asset,
        token_contract: transaction.token_contract, provider: transaction.provider, exchange: identifyExchange(transaction.counterparty)
      });
      const key = lower(transaction.counterparty);
      if (!identifyExchange(transaction.counterparty) && hop < maxHops && !visited.has(key) && !queuedCounterparties.has(key) && !queue.some(([item]) => lower(item) === key)) {
        queue.push([transaction.counterparty, hop + 1]); queuedCounterparties.add(key);
      }
    }
  }
  return { start_wallet: startWallet, wallets_traced: visited.size, max_hops: maxHops, transactions: all, paths, trace_warnings: traceWarnings, evidence_completeness: traceWarnings.length ? 'partial_provider_coverage' : 'complete_for_bounded_trace', provider: service.summary() };
}

export function intelligence(transactions, paths, external = null) {
  const indicators = [], byWallet = new Map();
  if (transactions.length >= 20) indicators.push({ type: 'high_activity', source: 'blockchain_observation', message: 'High transaction activity detected', severity: 'medium', points: 15 });
  transactions.forEach(tx => { const key = lower(tx.wallet); byWallet.set(key, [...(byWallet.get(key) || []), tx]); });
  let rapid = false, splitting = false, consolidation = false;
  for (const items of byWallet.values()) {
    const ordered = [...items].filter(item => item.timestamp).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    for (let i = 0; i < ordered.length - 1; i += 1) if (ordered[i].direction === 'IN' && ordered[i + 1].direction === 'OUT' && new Date(ordered[i + 1].timestamp) - new Date(ordered[i].timestamp) <= 600000) rapid = true;
    if (new Set(items.filter(x => x.direction === 'OUT').map(x => lower(x.counterparty))).size >= 3) splitting = true;
    if (new Set(items.filter(x => x.direction === 'IN').map(x => lower(x.counterparty))).size >= 3) consolidation = true;
  }
  if (rapid) indicators.push({ type: 'rapid_movement', source: 'behavioral_analysis', message: 'Funds moved out shortly after being received', severity: 'high', points: 25 });
  if (splitting) indicators.push({ type: 'fund_splitting', source: 'behavioral_analysis', message: 'Funds split across multiple wallets', severity: 'medium', points: 20 });
  if (consolidation) indicators.push({ type: 'fund_consolidation', source: 'behavioral_analysis', message: 'Funds consolidated from multiple wallets', severity: 'high', points: 20 });
  const exchange = transactions.find(tx => tx.exchange)?.exchange;
  if (exchange) indicators.push({ type: 'exchange_interaction', source: 'entity_attribution', message: `Known exchange interaction: ${exchange} (not evidence of fraud)`, severity: 'medium', points: 10 });
  if (paths.some(path => path.hop >= 2)) indicators.push({ type: 'multi_hop', source: 'behavioral_analysis', message: 'Funds moved through multiple intermediary wallets', severity: 'medium', points: 10 });
  if (external?.status === 'available' && Number(external.report_count) > 0) indicators.push({ type: 'external_reported_activity', source: 'external_intelligence', message: `Chainabuse contains ${external.report_count} report(s) for this address (supporting intelligence, not proof of criminal activity)`, severity: 'high', points: 20 });
  const score = Math.min(100, indicators.reduce((sum, item) => sum + item.points, 0));
  const kinds = new Set(indicators.map(item => item.type));
  const recommendations = [
    kinds.has('rapid_movement') && 'Review transaction timestamps to investigate rapid movement of funds.',
    kinds.has('fund_splitting') && 'Examine the wallets receiving the split funds and trace their subsequent movement.',
    kinds.has('fund_consolidation') && 'Review the wallets that contributed funds to identify common transaction patterns.',
    kinds.has('exchange_interaction') && 'Verify the interaction with the identified cryptocurrency exchange.',
    kinds.has('multi_hop') && 'Examine intermediary wallets involved in the multi-hop fund movement.',
    kinds.has('high_activity') && 'Review the high-volume transaction activity for unusual patterns.',
    kinds.has('external_reported_activity') && 'Review the underlying Chainabuse reports and independently corroborate their claims.'
  ].filter(Boolean);
  return {
    suspicious_activity: { indicators, count: indicators.length },
    risk: { score, level: score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW', breakdown: indicators.map(({ type, source, message, points }) => ({ type, source, message, points })), disclaimer: 'Investigative indicator only; not proof of fraud or criminal activity.' },
    investigator_recommendations: recommendations.length ? recommendations : ['Continue monitoring the wallet and review transaction history for unusual activity.']
  };
}

export function graph(result) {
  const nodes = new Map([[result.start_wallet, { id: result.start_wallet, label: 'Suspect Wallet', type: 'suspect' }]]), edges = [];
  const bridges = new Map((result.bridge_intelligence?.interactions || []).map(item => [lower(item.bridge_contract), item]));
  const topology = new Map((result.network_analytics?.candidates || []).map(item => [lower(item.address), item]));
  result.paths.forEach(path => {
    const sourceTopology = topology.get(lower(path.from)), targetTopology = topology.get(lower(path.to)), bridge = bridges.get(lower(path.to));
    nodes.set(path.from, { id: path.from, address: path.from, label: lower(path.from) === lower(result.start_wallet) ? 'Suspect Wallet' : sourceTopology?.role?.replaceAll('_', ' ') || 'Wallet', type: lower(path.from) === lower(result.start_wallet) ? 'suspect' : sourceTopology ? 'hub' : 'wallet', analytics: sourceTopology || null });
    nodes.set(path.to, { id: path.to, address: path.to, label: bridge?.bridge || path.exchange || targetTopology?.role?.replaceAll('_', ' ') || 'Wallet', type: bridge ? 'bridge' : path.exchange ? 'exchange' : targetTopology ? 'hub' : 'wallet', analytics: targetTopology || null, bridge: bridge || null });
    edges.push({ source: path.from, target: path.to, amount: path.amount, timestamp: path.timestamp, hash: path.hash, block_number: path.block_number, hop: path.hop, type: path.type, asset: path.asset, provider: path.provider, label: `${path.amount} ${path.asset}` });
  });
  return { nodes: [...nodes.values()], edges };
}

function enrichStoredResult(result = {}) {
  let changed = false;
  if (!result.bridge_intelligence) {
    const interactions = detectBridgeInteractions(result.transactions || [], bridgeRegistry);
    result.bridge_intelligence = { status: interactions.length ? 'observed' : 'no_verified_interaction', registry_entries: bridgeRegistry.size, interactions, disclaimer: 'Bridge interaction means a transaction touched a verified contract; it does not by itself establish a destination-chain transfer.' }; changed = true;
  }
  if (!result.cross_chain) { result.cross_chain = crossChainReadiness({ supported_chains: ['ethereum'] }); changed = true; }
  if (!result.network_analytics) { result.network_analytics = analyzeNetworkTopology(result.transactions || [], result.paths || []); changed = true; }
  if (!result.investigation_story) { result.investigation_story = buildInvestigationStory(result); changed = true; }
  if (changed) result.graph = graph(result);
  return { result, changed };
}

function baselineAuditEvents(result = {}, timestamp = now()) {
  return [
    { event_type: 'CASE_CREATED', timestamp, source: 'tracex', metadata: { blockchain: result.blockchain || 'ethereum' } },
    { event_type: 'PROVIDER_USED', timestamp, source: result.provider?.selected || 'blockchain_provider', metadata: { providers: result.provider?.providers_used || [], fallback_used: Boolean(result.provider?.fallback_used) } },
    { event_type: 'WALLET_ANALYZED', timestamp, source: 'tracex', metadata: { transactions: result.transactions?.length || 0, wallets: result.wallets_traced || 0 } },
    { event_type: 'TRACE_COMPLETED', timestamp, source: 'tracex', metadata: { paths: result.paths?.length || 0, max_hops: result.max_hops || 0 } },
    { event_type: 'RISK_CALCULATED', timestamp, source: 'tracex_rules', metadata: { score: result.risk?.score || 0, level: result.risk?.level || 'UNKNOWN', indicators: result.suspicious_activity?.indicators?.length || 0 } },
    { event_type: 'EXTERNAL_INTELLIGENCE_CHECKED', timestamp, source: 'chainabuse', metadata: { status: result.external_intelligence?.chainabuse?.status || 'unknown', reports: result.external_intelligence?.chainabuse?.report_count ?? null } }
  ];
}

async function save(result) {
  result.timestamp = now();
  const doc = new Investigation({ wallet_address: result.start_wallet, blockchain: result.blockchain, timestamp: result.timestamp, risk_score: result.risk.score, risk_level: result.risk.level, transaction_count: result.transactions.length, wallet_count: result.wallets_traced, max_hops: result.max_hops, indicators: result.suspicious_activity.indicators.map(item => item.message), case_title: 'Blockchain Fund Movement Investigation', case_status: 'NEW', priority: 'MEDIUM', tags: [], created_at: result.timestamp, updated_at: result.timestamp });
  result.investigation_id = String(doc._id);
  doc.case_reference = caseReference(result.investigation_id, result.timestamp);
  result.case = caseView(doc);
  result.audit_trail = baselineAuditEvents(result, result.timestamp);
  if (result.exchange_attributions?.length) result.audit_trail.push({ event_type: 'ENTITY_MATCHED', timestamp: result.timestamp, source: 'tracex_attribution_dataset', metadata: { matches: result.exchange_attributions.length } });
  doc.result_json = result; await doc.save();
  await AuditEvent.insertMany(result.audit_trail.map(event => ({ ...event, case_id: result.investigation_id, wallet_address: result.start_wallet })), { ordered: false }).catch(error => console.error(`audit_seed: ${error.message}`));
  try { await fraudNetwork.indexInvestigation(doc.toObject()); }
  catch (error) { console.error(`fraud_network_index: ${error.message}`); }
  return result;
}
function publicDoc(doc) { const item = doc.toObject ? doc.toObject() : doc; item.id = String(item._id); Object.assign(item, caseView(item)); delete item._id; delete item.result_json; return item; }

app.get('/api/config', (_req, res) => res.json({
  apiConfigured: Boolean(process.env.ALCHEMY_RPC_URL || process.env.ETHERSCAN_API_KEY), blockchain: chain,
  providers: { alchemy: process.env.ALCHEMY_RPC_URL ? 'CONFIGURED' : 'UNAVAILABLE', etherscan: process.env.ETHERSCAN_API_KEY ? 'CONFIGURED' : 'UNAVAILABLE' },
  externalIntelligence: { chainabuse: Boolean(process.env.CHAINABUSE_API_KEY) }, copilot: { configured: Boolean(process.env.GROQ_API_KEY) },
  fraudNetwork: { configured: true, minimumScore: fraudNetwork.minScore, maximumRelatedCases: fraudNetwork.maxRelatedCases },
  bridgeIntelligence: { configured: true, verifiedContracts: bridgeRegistry.size, registrySource: 'official_protocol_documentation' },
  crossChain: crossChainReadiness({ supported_chains: ['ethereum'] })
}));

app.post('/trace', async (req, res, next) => {
  try {
    const wallet = String(req.body.wallet_address || req.body.wallet || '').trim();
    if (!wallet) throw new AppError(400, 'wallet_required', 'Wallet address is required');
    assertWallet(wallet, req.body.blockchain || chain);
    const service = blockchainService();
    if (!service.configured) throw new AppError(503, 'provider_not_configured', 'No blockchain provider is configured');
    const result = await traceWallet(wallet, 2, 8, service);
    if (!result.transactions.length) throw new AppError(404, 'no_activity', 'No Ethereum activity was found for this wallet');
    result.blockchain = 'ethereum'; result.graph = graph(result);
    const threat = await chainabuse.screenAddress(wallet, 'ethereum');
    result.external_intelligence = { chainabuse: threat };
    Object.assign(result, intelligence(result.transactions, result.paths, threat));
    const counts = new Map();
    result.transactions.filter(tx => tx.exchange).forEach(tx => { const key = `${tx.exchange}|${lower(tx.counterparty)}`; counts.set(key, (counts.get(key) || 0) + 1); });
    result.exchange_attributions = [...counts].map(([key, interactions]) => { const [exchange, address] = key.split('|'); return { exchange, address, interactions, transaction_count: interactions, confidence: 'Dataset match' }; });
    const bridgeInteractions = detectBridgeInteractions(result.transactions, bridgeRegistry);
    result.bridge_intelligence = { status: bridgeInteractions.length ? 'observed' : 'no_verified_interaction', registry_entries: bridgeRegistry.size, interactions: bridgeInteractions, disclaimer: 'Bridge interaction means a transaction touched a verified contract; it does not by itself establish a destination-chain transfer.' };
    result.cross_chain = crossChainReadiness({ supported_chains: ['ethereum'] });
    result.network_analytics = analyzeNetworkTopology(result.transactions, result.paths);
    result.investigation_story = buildInvestigationStory(result);
    result.graph = graph(result);
    res.json(await save(result));
  } catch (error) { next(error); }
});

app.post('/api/copilot', async (req, res, next) => {
  try {
    const caseId = String(req.body.case_id || '').trim(), question = String(req.body.question || '').trim();
    if (!caseId) throw new AppError(400, 'case_required', 'case_id is required');
    if (!mongoose.isValidObjectId(caseId)) throw new AppError(400, 'invalid_case', 'Invalid case_id');
    if (!question) throw new AppError(400, 'question_required', 'A Copilot question is required');
    if (question.length > 2000) throw new AppError(400, 'question_too_long', 'Copilot questions must be 2000 characters or fewer');
    const doc = await Investigation.findById(caseId).lean();
    if (!doc) throw new AppError(404, 'case_not_found', 'Investigation not found');
    const [networkEvidence, evidence, findings, notes, audit] = await Promise.all([
      fraudNetwork.fraudNetwork(caseId),
      EvidenceItem.find({ case_id: caseId }).sort({ created_at: -1 }).limit(40).lean(),
      InvestigatorFinding.find({ case_id: caseId }).sort({ created_at: -1 }).limit(30).lean(),
      InvestigatorNote.find({ case_id: caseId }).sort({ created_at: -1 }).limit(20).lean(),
      AuditEvent.find({ case_id: caseId }).sort({ timestamp: -1 }).limit(30).lean()
    ]);
    const result = await copilot.answer(question, {
      ...(doc.result_json || {}), investigation_id: caseId, case: caseView(doc), fraud_network: networkEvidence,
      case_workspace: { evidence, findings, notes, audit }
    });
    await recordAudit(caseId, 'COPILOT_QUERY', { question_length: question.length, model: result.model, grounding_guard_applied: Boolean(result.grounding_guard_applied) }, doc.wallet_address, 'groq');
    res.json({ case_id: caseId, ...result });
  } catch (error) { next(error); }
});

app.get('/api/cases/:caseId/similar', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.caseId)) throw new AppError(400, 'invalid_case', 'Invalid case ID');
    const result = await fraudNetwork.similarCases(req.params.caseId);
    if (!result) throw new AppError(404, 'case_not_found', 'Investigation not found');
    res.json(result);
  } catch (error) { next(error); }
});

app.get('/api/fraud-network/:caseId', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.caseId)) throw new AppError(400, 'invalid_case', 'Invalid case ID');
    const result = await fraudNetwork.fraudNetwork(req.params.caseId);
    if (!result) throw new AppError(404, 'case_not_found', 'Investigation not found');
    res.json(result);
  } catch (error) { next(error); }
});

app.get('/api/cases/:caseId/audit', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.caseId)) throw new AppError(400, 'invalid_case', 'Invalid case ID');
    let events = await AuditEvent.find({ case_id: req.params.caseId }).sort({ timestamp: 1 }).lean();
    if (!events.length) {
      const doc = await Investigation.findById(req.params.caseId).lean();
      if (!doc) throw new AppError(404, 'case_not_found', 'Investigation not found');
      const result = doc.result_json || {};
      await AuditEvent.insertMany(baselineAuditEvents(result, result.timestamp || doc.timestamp).map(event => ({ ...event, case_id: req.params.caseId, wallet_address: result.start_wallet || doc.wallet_address })));
      events = await AuditEvent.find({ case_id: req.params.caseId }).sort({ timestamp: 1 }).lean();
    }
    res.json({ case_id: req.params.caseId, events: events.map(item => ({ ...item, id: String(item._id), _id: undefined })) });
  } catch (error) { next(error); }
});

app.get('/api/cases/:caseId/workspace', async (req, res, next) => {
  try {
    const doc = await requireCase(req.params.caseId), caseId = String(doc._id), result = doc.result_json || {};
    const [evidence, notes, findings, audit, monitor, reportEvents] = await Promise.all([
      EvidenceItem.find({ case_id: caseId }).sort({ created_at: -1 }).limit(100).lean(),
      InvestigatorNote.find({ case_id: caseId }).sort({ created_at: -1 }).limit(100).lean(),
      InvestigatorFinding.find({ case_id: caseId }).sort({ created_at: -1 }).limit(100).lean(),
      AuditEvent.find({ case_id: caseId }).sort({ timestamp: -1 }).limit(200).lean(),
      Monitor.findOne({ investigation_id: caseId, status: 'monitoring' }).lean(),
      AuditEvent.countDocuments({ case_id: caseId, event_type: 'REPORT_GENERATED' })
    ]);
    res.json({ case: caseView(doc), evidence, notes, findings, audit, completeness: caseCompleteness({ investigation: result, evidenceCount: evidence.length, noteCount: notes.length, findingCount: findings.length, monitoring: Boolean(monitor), reportGenerated: reportEvents > 0 }) });
  } catch (error) { next(error); }
});

app.patch('/api/cases/:caseId', async (req, res, next) => {
  try {
    const doc = await requireCase(req.params.caseId), changes = {}, events = [], stamp = now();
    if (req.body.case_title !== undefined) changes.case_title = sanitizeText(req.body.case_title, 160) || 'Blockchain Fund Movement Investigation';
    if (req.body.case_summary !== undefined) changes.case_summary = sanitizeText(req.body.case_summary, 4000);
    if (req.body.assigned_investigator !== undefined) { changes.assigned_investigator = sanitizeText(req.body.assigned_investigator, 120); if (changes.assigned_investigator !== (doc.assigned_investigator || '')) events.push(['CASE_ASSIGNED', { previous_investigator: doc.assigned_investigator || null, assigned_investigator: changes.assigned_investigator || null }]); }
    if (req.body.priority !== undefined) { const priority = String(req.body.priority).toUpperCase(); if (!CASE_PRIORITIES.includes(priority)) throw new AppError(400, 'invalid_priority', 'Priority must be LOW, MEDIUM, HIGH, or CRITICAL'); changes.priority = priority; if (priority !== (doc.priority || 'MEDIUM')) events.push(['CASE_PRIORITY_CHANGED', { previous_priority: doc.priority || 'MEDIUM', new_priority: priority }]); }
    if (req.body.tags !== undefined) { if (!Array.isArray(req.body.tags)) throw new AppError(400, 'invalid_tags', 'tags must be an array'); const tags = [...new Set(req.body.tags.map(value => sanitizeText(value, 40)).filter(Boolean))].slice(0, 20); changes.tags = tags; const previous = new Set(doc.tags || []); for (const tag of tags) if (!previous.has(tag)) events.push(['CASE_TAG_ADDED', { tag }]); for (const tag of previous) if (!tags.includes(tag)) events.push(['CASE_TAG_REMOVED', { tag }]); }
    if (req.body.case_status !== undefined) { const status = String(req.body.case_status).toUpperCase(), previous = doc.case_status || 'NEW'; if (!CASE_STATUSES.includes(status)) throw new AppError(400, 'invalid_status', `Status must be one of: ${CASE_STATUSES.join(', ')}`); if (!validateStatusTransition(previous, status)) throw new AppError(409, 'invalid_status_transition', `Cannot transition case from ${previous} to ${status}`); changes.case_status = status; changes.closed_at = status === 'CLOSED' ? stamp : null; if (status !== previous) events.push([previous === 'CLOSED' ? 'CASE_REOPENED' : status === 'CLOSED' ? 'CASE_CLOSED' : 'CASE_STATUS_CHANGED', { previous_status: previous, new_status: status }]); }
    changes.updated_at = stamp;
    Object.assign(doc, changes); await doc.save();
    for (const [type, metadata] of events) await recordAudit(String(doc._id), type, metadata, doc.wallet_address, 'investigator_workspace');
    res.json({ case: caseView(doc) });
  } catch (error) { next(error); }
});

app.get('/api/cases/:caseId/evidence', async (req, res, next) => {
  try { await requireCase(req.params.caseId); const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50)), query = { case_id: req.params.caseId }; if (req.query.type && EVIDENCE_TYPES.includes(String(req.query.type).toUpperCase())) query.evidence_type = String(req.query.type).toUpperCase(); const [items,total] = await Promise.all([EvidenceItem.find(query).sort({ created_at: -1 }).skip((page-1)*limit).limit(limit).lean(),EvidenceItem.countDocuments(query)]); res.json({ items, page, limit, total, pages: Math.max(1, Math.ceil(total/limit)) }); } catch (error) { next(error); }
});

app.post('/api/cases/:caseId/evidence', async (req, res, next) => {
  try {
    const doc = await requireCase(req.params.caseId), type = String(req.body.evidence_type || '').toUpperCase();
    if (!EVIDENCE_TYPES.includes(type)) throw new AppError(400, 'invalid_evidence_type', `Unsupported evidence type. Allowed: ${EVIDENCE_TYPES.join(', ')}`);
    let snapshot; try { snapshot = boundedSnapshot(type, req.body.snapshot); } catch (error) { throw new AppError(400, error.message, error.message.replaceAll('_', ' ')); }
    const evidenceId = await nextIdentifier(req.params.caseId, 'EV'), stamp = now();
    const item = {
      evidence_id: evidenceId, case_id: req.params.caseId, evidence_type: type,
      title: sanitizeText(req.body.title, 180) || `${type.replaceAll('_', ' ')} evidence`,
      source_type: sanitizeText(req.body.source_type, 80) || 'TRACEX', source_provider: sanitizeText(req.body.source_provider, 80) || snapshot.provider || 'TraceX',
      source_reference: sanitizeText(req.body.source_reference, 300) || snapshot.hash || snapshot.transaction_hash || snapshot.address || snapshot.id || evidenceId,
      captured_at: stamp, blockchain_timestamp: snapshot.timestamp || req.body.blockchain_timestamp || null,
      chain_id: Number(req.body.chain_id || snapshot.chain_id || 1), chain_name: sanitizeText(req.body.chain_name || snapshot.chain_name || 'ethereum', 40),
      wallet_address: sanitizeText(req.body.wallet_address || snapshot.wallet || snapshot.address || '', 100), transaction_hash: sanitizeText(req.body.transaction_hash || snapshot.hash || snapshot.transaction_hash || '', 100),
      snapshot, investigator_label: sanitizeText(req.body.investigator_label, 120), investigator_note: sanitizeText(req.body.investigator_note, 2000),
      integrity_algorithm: 'SHA-256', integrity_created_at: stamp, created_at: stamp, updated_at: stamp
    };
    item.integrity_hash = integrityHash(item); item.fingerprint = integrityHash({ ...item, evidence_id: '', captured_at: '', integrity_created_at: '' });
    try { const created = await EvidenceItem.create(item); await Investigation.findByIdAndUpdate(doc._id, { $inc: { evidence_count: 1 }, updated_at: stamp }); await recordAudit(req.params.caseId, 'EVIDENCE_ADDED', { evidence_id: evidenceId, evidence_type: type, title: item.title, integrity_algorithm: 'SHA-256' }, doc.wallet_address, 'investigator_workspace'); res.status(201).json(created.toObject()); }
    catch (error) { if (error?.code === 11000) throw new AppError(409, 'duplicate_evidence', 'This evidence snapshot is already saved in the case'); throw error; }
  } catch (error) { next(error); }
});

app.patch('/api/cases/:caseId/evidence/:evidenceId', async (req, res, next) => {
  try { await requireCase(req.params.caseId); const update = { updated_at: now() }; if (req.body.investigator_label !== undefined) update.investigator_label = sanitizeText(req.body.investigator_label, 120); if (req.body.investigator_note !== undefined) update.investigator_note = sanitizeText(req.body.investigator_note, 2000); const item = await EvidenceItem.findOneAndUpdate({ case_id: req.params.caseId, evidence_id: req.params.evidenceId }, update, { new: true }); if (!item) throw new AppError(404, 'evidence_not_found', 'Evidence item not found'); res.json(item); } catch (error) { next(error); }
});

app.post('/api/cases/:caseId/evidence/:evidenceId/verify', async (req, res, next) => {
  try { const doc = await requireCase(req.params.caseId), item = await EvidenceItem.findOne({ case_id: req.params.caseId, evidence_id: req.params.evidenceId }).lean(); if (!item) throw new AppError(404, 'evidence_not_found', 'Evidence item not found'); const computed = integrityHash(item), verified = computed === item.integrity_hash; await recordAudit(req.params.caseId, 'EVIDENCE_VERIFIED', { evidence_id: item.evidence_id, status: verified ? 'VERIFIED' : 'INTEGRITY_MISMATCH', algorithm: item.integrity_algorithm }, doc.wallet_address, 'evidence_integrity'); res.json({ evidence_id: item.evidence_id, verified, status: verified ? 'VERIFIED' : 'INTEGRITY_MISMATCH', integrity_algorithm: item.integrity_algorithm, recorded_hash: item.integrity_hash, computed_hash: computed, integrity_created_at: item.integrity_created_at }); } catch (error) { next(error); }
});

app.get('/api/cases/:caseId/notes', async (req, res, next) => { try { await requireCase(req.params.caseId); res.json(await InvestigatorNote.find({ case_id: req.params.caseId }).sort({ created_at: -1 }).limit(200).lean()); } catch (error) { next(error); } });
app.post('/api/cases/:caseId/notes', async (req, res, next) => { try { const doc = await requireCase(req.params.caseId), type = String(req.body.note_type || 'GENERAL_CASE_NOTE').toUpperCase(); if (!NOTE_TYPES.includes(type)) throw new AppError(400, 'invalid_note_type', `Unsupported note type. Allowed: ${NOTE_TYPES.join(', ')}`); const content = sanitizeText(req.body.content, 5000); if (!content) throw new AppError(400, 'note_required', 'Note content is required'); const stamp = now(), note = await InvestigatorNote.create({ note_id: await nextIdentifier(req.params.caseId, 'NT'), case_id: req.params.caseId, note_type: type, reference_type: sanitizeText(req.body.reference_type, 80), reference_id: sanitizeText(req.body.reference_id, 300), content, author: sanitizeText(req.body.author || doc.assigned_investigator || 'Local investigator', 120), created_at: stamp, updated_at: stamp }); await Investigation.findByIdAndUpdate(doc._id, { $inc: { note_count: 1 }, updated_at: stamp }); await recordAudit(req.params.caseId, 'NOTE_CREATED', { note_id: note.note_id, note_type: type, reference_id: note.reference_id || null }, doc.wallet_address, 'investigator'); res.status(201).json(note); } catch (error) { next(error); } });
app.patch('/api/cases/:caseId/notes/:noteId', async (req, res, next) => { try { const doc = await requireCase(req.params.caseId), content = sanitizeText(req.body.content, 5000); if (!content) throw new AppError(400, 'note_required', 'Note content is required'); const note = await InvestigatorNote.findOneAndUpdate({ case_id: req.params.caseId, note_id: req.params.noteId }, { content, updated_at: now() }, { new: true }); if (!note) throw new AppError(404, 'note_not_found', 'Note not found'); await recordAudit(req.params.caseId, 'NOTE_UPDATED', { note_id: note.note_id }, doc.wallet_address, 'investigator'); res.json(note); } catch (error) { next(error); } });
app.delete('/api/cases/:caseId/notes/:noteId', async (req, res, next) => { try { const doc = await requireCase(req.params.caseId), note = await InvestigatorNote.findOneAndDelete({ case_id: req.params.caseId, note_id: req.params.noteId }); if (!note) throw new AppError(404, 'note_not_found', 'Note not found'); await Investigation.findByIdAndUpdate(doc._id, { $inc: { note_count: -1 }, updated_at: now() }); await recordAudit(req.params.caseId, 'NOTE_DELETED', { note_id: note.note_id, note_type: note.note_type }, doc.wallet_address, 'investigator'); res.json({ deleted: true }); } catch (error) { next(error); } });

app.get('/api/cases/:caseId/findings', async (req, res, next) => { try { await requireCase(req.params.caseId); res.json(await InvestigatorFinding.find({ case_id: req.params.caseId }).sort({ created_at: -1 }).limit(200).lean()); } catch (error) { next(error); } });
app.post('/api/cases/:caseId/findings', async (req, res, next) => { try { const doc = await requireCase(req.params.caseId), evidenceIds = [...new Set((req.body.evidence_ids || []).map(value => sanitizeText(value, 40)).filter(Boolean))], classification = String(req.body.classification || 'PRELIMINARY').toUpperCase(); if (!FINDING_STATUSES.includes(classification)) throw new AppError(400, 'invalid_finding_classification', `Classification must be one of: ${FINDING_STATUSES.join(', ')}`); if (!evidenceIds.length) throw new AppError(400, 'evidence_required', 'A finding must reference at least one saved evidence item'); const count = await EvidenceItem.countDocuments({ case_id: req.params.caseId, evidence_id: { $in: evidenceIds } }); if (count !== evidenceIds.length) throw new AppError(400, 'invalid_evidence_reference', 'One or more evidence IDs do not belong to this case'); const title = sanitizeText(req.body.title, 180), description = sanitizeText(req.body.description, 5000); if (!title || !description) throw new AppError(400, 'finding_required', 'Finding title and description are required'); const stamp = now(), finding = await InvestigatorFinding.create({ finding_id: await nextIdentifier(req.params.caseId, 'FN'), case_id: req.params.caseId, title, description, classification, evidence_ids: evidenceIds, author: sanitizeText(req.body.author || doc.assigned_investigator || 'Local investigator', 120), created_at: stamp, updated_at: stamp }); await Investigation.findByIdAndUpdate(doc._id, { $inc: { finding_count: 1 }, updated_at: stamp }); await recordAudit(req.params.caseId, 'FINDING_CREATED', { finding_id: finding.finding_id, classification, evidence_ids: evidenceIds }, doc.wallet_address, 'investigator'); res.status(201).json(finding); } catch (error) { next(error); } });

app.get('/api/search', async (req, res, next) => {
  try { const q = sanitizeText(req.query.q, 120); if (q.length < 3) return res.json({ cases: [], evidence: [] }); const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), pattern = new RegExp(escaped, 'i'); const [cases, evidence] = await Promise.all([Investigation.find({ $or: [{ case_reference: pattern }, { wallet_address: pattern }, { case_title: pattern }, { assigned_investigator: pattern }, { tags: pattern }] }).sort({ updated_at: -1 }).limit(10).lean(), EvidenceItem.find({ $or: [{ evidence_id: pattern }, { source_reference: pattern }, { transaction_hash: pattern }, { wallet_address: pattern }] }).sort({ created_at: -1 }).limit(10).lean()]); res.json({ cases: cases.map(publicDoc), evidence }); } catch (error) { next(error); }
});

app.get('/api/cases/:caseId/compare/:otherCaseId', async (req, res, next) => {
  try {
    const { caseId, otherCaseId } = req.params;
    if (!mongoose.isValidObjectId(caseId) || !mongoose.isValidObjectId(otherCaseId)) throw new AppError(400, 'invalid_case', 'Both case IDs must be valid');
    if (caseId === otherCaseId) throw new AppError(400, 'same_case', 'Select two different investigations to compare');
    const [leftDoc, rightDoc, leftIndex, rightIndex] = await Promise.all([
      Investigation.findById(caseId).lean(), Investigation.findById(otherCaseId).lean(),
      fraudNetwork.ensureIndex(caseId), fraudNetwork.ensureIndex(otherCaseId)
    ]);
    if (!leftDoc || !rightDoc || !leftIndex || !rightIndex) throw new AppError(404, 'case_not_found', 'One or both investigations were not found');
    const left = leftDoc.result_json || {}, right = rightDoc.result_json || {};
    res.json({
      case_a: { case_id: caseId, wallet: left.start_wallet, investigated_at: left.timestamp, risk_score: left.risk?.score ?? leftDoc.risk_score, risk_level: left.risk?.level || leftDoc.risk_level },
      case_b: { case_id: otherCaseId, wallet: right.start_wallet, investigated_at: right.timestamp, risk_score: right.risk?.score ?? rightDoc.risk_score, risk_level: right.risk?.level || rightDoc.risk_level },
      relationship: compareCaseIndexes(leftIndex, rightIndex),
      differences: {
        transaction_count: { case_a: (left.transactions || []).length, case_b: (right.transactions || []).length },
        traced_paths: { case_a: (left.paths || []).length, case_b: (right.paths || []).length },
        wallets_traced: { case_a: left.wallets_traced || 0, case_b: right.wallets_traced || 0 },
        assets_involved: { case_a: leftIndex.assets?.length || 0, case_b: rightIndex.assets?.length || 0 },
        vasp_attributions: { case_a: (left.exchange_attributions || []).length, case_b: (right.exchange_attributions || []).length }
      }
    });
  } catch (error) { next(error); }
});

app.get('/history', async (_req, res, next) => { try { res.json((await Investigation.find().sort({ timestamp: -1 })).map(publicDoc)); } catch (error) { next(error); } });
app.delete('/history', async (_req, res, next) => { try { await Promise.all([Investigation.deleteMany({}), CaseNetworkIndex.deleteMany({}), AuditEvent.deleteMany({}), EvidenceItem.deleteMany({}), InvestigatorNote.deleteMany({}), InvestigatorFinding.deleteMany({}), CaseSequence.deleteMany({}), Monitor.deleteMany({}), Alert.deleteMany({})]); res.json({ deleted: true }); } catch (error) { next(error); } });
app.get('/history/:id', async (req, res, next) => { try { const doc = await requireCase(req.params.id), enriched = enrichStoredResult(doc.result_json || {}); enriched.result.case = caseView(doc); if (enriched.changed) { doc.result_json = enriched.result; doc.markModified('result_json'); await doc.save(); } res.json(enriched.result); } catch (error) { next(error); } });
app.delete('/history/:id', async (req, res, next) => { try { const doc = await requireCase(req.params.id), caseId = String(doc._id); await Promise.all([Investigation.deleteOne({ _id: doc._id }), CaseNetworkIndex.deleteOne({ case_id: caseId }), AuditEvent.deleteMany({ case_id: caseId }), EvidenceItem.deleteMany({ case_id: caseId }), InvestigatorNote.deleteMany({ case_id: caseId }), InvestigatorFinding.deleteMany({ case_id: caseId }), CaseSequence.deleteMany({ key: new RegExp(`:${caseId}$`) }), Monitor.deleteMany({ investigation_id: caseId }), Alert.deleteMany({ investigation_id: caseId })]); res.json({ deleted: true }); } catch (error) { next(error); } });
app.get('/export/:id.:format', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'invalid_case', 'Invalid investigation ID');
    const doc = await Investigation.findById(req.params.id); if (!doc) throw new AppError(404, 'case_not_found', 'Investigation not found');
    const data = doc.result_json;
    if (req.params.format === 'json') return res.attachment(`TraceX_${req.params.id}.json`).type('application/json').send(JSON.stringify(data, null, 2));
    if (req.params.format === 'csv') {
      const fields = ['direction', 'from', 'to', 'amount', 'asset', 'token_contract', 'block_number', 'timestamp', 'hash', 'exchange', 'type', 'provider'];
      const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
      return res.attachment(`TraceX_${req.params.id}.csv`).type('text/csv').send([fields.join(','), ...data.transactions.map(tx => fields.map(field => quote(tx[field])).join(','))].join('\n'));
    }
    throw new AppError(400, 'invalid_format', 'Format must be json or csv');
  } catch (error) { next(error); }
});

async function createAlert(wallet, transaction, type, severity, title, description, blockchain = 'ethereum', investigationId = null) {
  const hash = transaction.transaction_hash || transaction.hash; if (!hash) return null;
  try { const alert = await Alert.create({ investigation_id: investigationId, wallet_address: wallet, blockchain, transaction_hash: hash, alert_type: type, severity, title, description, timestamp: transaction.timestamp || now(), created_at: now(), status: 'NEW', evidence: { source: 'monitoring_poll', asset: transaction.asset || transaction.token_symbol || 'ETH', provider: transaction.provider } }); await recordAudit(investigationId, 'ALERT_CREATED', { alert_id: String(alert._id), alert_type: type, severity, transaction_hash: hash }, wallet, 'monitoring'); return alert; }
  catch (error) { if (error?.code === 11000) return null; throw error; }
}
async function pollMonitor(monitor) {
  const current = await blockchainService().fetchTransactions(monitor.wallet_address, 100); if (!current.length) return;
  const cacheKey = `${monitor.blockchain}|${lower(monitor.wallet_address)}`, hadBaseline = monitorCache.has(cacheKey), known = monitorCache.get(cacheKey) || new Set();
  const identity = tx => `${tx.blockchain}|${lower(tx.hash)}|${lower(tx.token_contract)}|${tx.raw_amount}`;
  const fresh = current.filter(tx => !known.has(identity(tx))); monitorCache.set(cacheKey, new Set(current.map(identity)));
  if (hadBaseline) for (const tx of fresh) {
    const other = current.filter(item => item.hash !== tx.hash);
    if (other.length >= 20) await createAlert(monitor.wallet_address, tx, 'high_activity', 'MEDIUM', 'High transaction activity', 'High transaction activity detected within the monitored wallet', monitor.blockchain, monitor.investigation_id);
    if (tx.asset_type === 'token') await createAlert(monitor.wallet_address, tx, 'erc20_activity', 'MEDIUM', 'Token activity detected', `${tx.asset || 'Token'} movement observed`, monitor.blockchain, monitor.investigation_id);
    if (tx.direction === 'IN' && other.some(item => item.direction === 'OUT' && Math.abs(new Date(tx.timestamp) - new Date(item.timestamp)) <= 600000)) await createAlert(monitor.wallet_address, tx, 'rapid_movement', 'HIGH', 'Rapid movement of funds', 'Funds moved quickly after receipt', monitor.blockchain, monitor.investigation_id);
  }
  const latest = [...current].filter(item => item.timestamp).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  await Monitor.findByIdAndUpdate(monitor._id, { last_checked_at: now(), last_transaction_timestamp: latest?.timestamp || null, last_transaction_hash: latest?.hash || null, updated_at: now() });
}
async function monitorTick() { try { for (const item of await Monitor.find({ status: 'monitoring' })) await pollMonitor(item); } catch (error) { console.error('Monitoring poll failed:', error.message); } }
app.post('/monitor/start', async (req, res, next) => { try { const wallet = String(req.body.wallet_address || req.body.wallet || '').trim(); if (!wallet) throw new AppError(400, 'wallet_required', 'Wallet address is required'); assertWallet(wallet, req.body.blockchain || chain); const update = { investigation_id: req.body.investigation_id || null, status: 'monitoring', updated_at: now(), max_hops: 2, max_wallets: 8 }; let item = await Monitor.findOneAndUpdate({ wallet_address: wallet, blockchain: 'ethereum' }, update, { new: true, sort: { created_at: -1 } }); if (!item) item = await Monitor.create({ ...update, wallet_address: wallet, blockchain: 'ethereum', last_checked_at: now(), created_at: now() }); await recordAudit(update.investigation_id, 'MONITORING_STARTED', { status: 'monitoring' }, wallet, 'monitoring'); res.json(publicDoc(item)); } catch (error) { next(error); } });
app.post('/monitor/stop', async (req, res, next) => { try { const wallet = String(req.body.wallet_address || req.body.wallet || '').trim(); if (!wallet) throw new AppError(400, 'wallet_required', 'Wallet address is required'); const item = await Monitor.findOneAndUpdate({ wallet_address: wallet, blockchain: validChain(req.body.blockchain) || chain }, { status: 'stopped', updated_at: now() }, { new: true, sort: { created_at: -1 } }); if (item?.investigation_id) await recordAudit(item.investigation_id, 'MONITORING_STOPPED', { status: 'stopped' }, wallet, 'monitoring'); res.json(item ? publicDoc(item) : { wallet_address: wallet, blockchain: 'ethereum', status: 'stopped' }); } catch (error) { next(error); } });
app.get('/monitor/status', async (req, res, next) => { try { const wallet = req.query.wallet || req.query.wallet_address; if (!wallet) return res.json({ wallets: (await Monitor.find({ blockchain: validChain(req.query.blockchain) || chain }).sort({ updated_at: -1 })).map(publicDoc) }); const item = await Monitor.findOne({ wallet_address: String(wallet).trim(), blockchain: validChain(req.query.blockchain) || chain }).sort({ created_at: -1 }); res.json(item ? publicDoc(item) : { wallet_address: String(wallet).trim(), blockchain: 'ethereum', status: 'not_monitoring' }); } catch (error) { next(error); } });
app.get('/alerts', async (req, res, next) => { try { const query = { blockchain: validChain(req.query.blockchain) || chain }; if (req.query.wallet || req.query.wallet_address) query.wallet_address = String(req.query.wallet || req.query.wallet_address).trim(); res.json((await Alert.find(query).sort({ created_at: -1 })).map(publicDoc)); } catch (error) { next(error); } });
for (const [suffix, status] of [['acknowledge', 'ACKNOWLEDGED'], ['resolve', 'RESOLVED']]) app.post(`/alerts/:id/${suffix}`, async (req, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'invalid_alert', 'Invalid alert ID'); const item = await Alert.findByIdAndUpdate(req.params.id, { status }, { new: true }); if (!item) throw new AppError(404, 'alert_not_found', 'Alert not found'); res.json({ id: String(item._id), status }); } catch (error) { next(error); } });

app.post('/report', async (req, res, next) => {
  try {
    let data = req.body || {}, caseDoc = null, caseId = String(data.investigation_id || '');
    if (mongoose.isValidObjectId(caseId)) caseDoc = await Investigation.findById(caseId).lean();
    if (caseDoc) data = { ...(caseDoc.result_json || {}), ...data, investigation_id: caseId, case: caseView(caseDoc) };
    if (!data.start_wallet) throw new AppError(400, 'report_data_required', 'No wallet analysis data provided.');
    const [evidence, findings, notes, audit] = caseDoc ? await Promise.all([
      EvidenceItem.find({ case_id: caseId }).sort({ created_at: -1 }).lean(),
      InvestigatorFinding.find({ case_id: caseId }).sort({ created_at: -1 }).lean(),
      InvestigatorNote.find({ case_id: caseId }).sort({ created_at: -1 }).limit(50).lean(),
      AuditEvent.find({ case_id: caseId }).sort({ timestamp: 1 }).lean()
    ]) : [[], [], [], []];
    const verified = evidence.filter(item => integrityHash(item) === item.integrity_hash).length;
    const pdf = new PDFDocument({ margin: 44, bufferPages: true }), chunks = [];
    const title = text => pdf.moveDown(0.7).font('Helvetica-Bold').fontSize(13).fillColor('#10263f').text(text).moveDown(0.25).font('Helvetica').fontSize(9).fillColor('#202c38');
    const bullet = text => pdf.text(`• ${String(text || '').replace(/[\r\n]+/g, ' ')}`);
    pdf.on('data', part => chunks.push(part));
    pdf.on('end', () => res.attachment(`TraceX_Case_${data.case?.case_reference || caseId || data.start_wallet.slice(2, 10)}.pdf`).type('application/pdf').send(Buffer.concat(chunks)));
    pdf.font('Helvetica-Bold').fontSize(21).fillColor('#10263f').text('TraceX Case Intelligence Report', { align: 'center' });
    pdf.font('Helvetica').fontSize(9).fillColor('#405166').text('Evidence-aware blockchain investigation brief', { align: 'center' }).moveDown();
    pdf.fillColor('#202c38').text(`Case reference: ${data.case?.case_reference || 'Unpersisted analysis'}\nCase ID: ${caseId || 'N/A'}\nStatus: ${data.case?.case_status || 'N/A'}   Priority: ${data.case?.priority || 'N/A'}\nSubject wallet: ${data.start_wallet}\nGenerated: ${now()}`);
    title('Executive Summary');
    pdf.text(data.case?.case_summary || `TraceX analyzed ${(data.transactions || []).length} observed transaction(s) across ${data.wallets_traced || 0} traced wallet(s). This report is an investigative aid and not a determination of wrongdoing.`);
    title('Risk Assessment');
    pdf.text(`Risk score: ${data.risk?.score ?? 0}/100 (${data.risk?.level || 'UNKNOWN'}). Evidence completeness: ${data.evidence_completeness || 'not recorded'}.`);
    (data.suspicious_activity?.indicators || []).slice(0, 10).forEach(item => bullet(item.message || item));
    title('Fund Flow and Transaction Summary');
    pdf.text(`Maximum trace depth: ${data.max_hops ?? 'N/A'} • Paths: ${(data.paths || []).length} • Transactions: ${(data.transactions || []).length}`);
    (data.paths || []).slice(0, 12).forEach(path => bullet(`${path.from || '?'} → ${path.to || '?'} | ${path.amount ?? '?'} ${path.asset || 'ETH'} | ${path.hash || ''}`));
    title('Entities, VASPs and External Intelligence');
    const threat = data.external_intelligence?.chainabuse;
    pdf.text(`Chainabuse: ${threat?.status || 'not available'}; reported categories: ${(threat?.categories || []).join(', ') || 'none recorded'}.`);
    (data.exchange_attributions || []).slice(0, 12).forEach(item => bullet(`${item.exchange || 'Attributed entity'} — ${item.interactions || item.transaction_count || 0} observed interaction(s)`));
    title('Evidence Integrity Summary');
    pdf.text(`${evidence.length} evidence item(s) retained; ${verified}/${evidence.length} SHA-256 integrity hash(es) currently verify. Evidence is a bounded snapshot captured at the listed time.`);
    evidence.slice(0, 25).forEach(item => bullet(`${item.evidence_id} | ${item.evidence_type} | ${item.title} | captured ${item.captured_at}`));
    title('Investigator Findings');
    if (findings.length) findings.forEach(item => bullet(`${item.finding_id} [${item.classification}] ${item.title}: ${item.description}`)); else pdf.text('No investigator-authored findings have been recorded.');
    title('Notes and Audit Timeline');
    notes.slice(0, 10).forEach(item => bullet(`Note ${item.note_id} (${item.note_type}): ${item.content}`));
    audit.slice(-20).forEach(item => bullet(`${item.timestamp} — ${item.event_type}`));
    title('Recommendations and Limitations');
    (data.investigator_recommendations || []).slice(0, 12).forEach(bullet);
    pdf.text('Automated signals, labels, and third-party intelligence require independent review. The absence of a signal is not evidence of absence; provider coverage may be partial.');
    const pageRange = pdf.bufferedPageRange();
    for (let page = 0; page < pageRange.count; page += 1) { pdf.switchToPage(page); pdf.fontSize(7).fillColor('#687787').text(`TraceX • Confidential investigative working paper • Page ${page + 1} of ${pageRange.count}`, 44, pdf.page.height - 32, { align: 'center', width: pdf.page.width - 88 }); }
    await recordAudit(caseId, 'REPORT_GENERATED', { format: 'pdf', evidence_count: evidence.length, verified_evidence: verified }, data.start_wallet, 'reporting');
    pdf.end();
  } catch (error) { next(error); }
});

app.get('/dashboard', (_req, res) => res.sendFile(join(root, 'templates', 'x.html')));
app.get('/graph', (_req, res) => res.sendFile(join(root, 'templates', 'graph.html')));
app.use((error, _req, res, _next) => {
  const status = error?.status || (error instanceof ProviderError ? 502 : error instanceof CopilotError ? error.status : 500), code = error?.code || 'internal_error';
  if (status >= 500) {
    const upstreamStatus = error?.cause?.response?.status;
    console.error(`${code}: ${error.message}${upstreamStatus ? ` (upstream HTTP ${upstreamStatus})` : ''}`);
  }
  res.status(status).json({ error: error.message || 'Internal server error', code });
});

let server = null;
export async function startServer({ port = PORT, mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tracex' } = {}) {
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongoUri);
  await Promise.all([Investigation.init(), Monitor.init(), Alert.init(), ThreatIntelligenceCache.init(), CaseNetworkIndex.init(), AuditEvent.init(), EvidenceItem.init(), InvestigatorNote.init(), InvestigatorFinding.init(), CaseSequence.init()]);
  const backfilledCaseMetadata = await backfillCaseMetadata();
  if (backfilledCaseMetadata) console.log(`Case workspace metadata backfilled for ${backfilledCaseMetadata} investigation(s)`);
  const indexedCases = await fraudNetwork.backfillMissingIndexes();
  if (indexedCases) console.log(`Fraud network index backfilled for ${indexedCases} investigation(s)`);
  server = app.listen(port, () => console.log(`TraceX API listening on http://localhost:${port}`));
  setInterval(monitorTick, POLL_MS).unref(); monitorTick(); return server;
}
export async function stopServer() { if (server) await new Promise(done => server.close(done)); server = null; if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); }
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) startServer().catch(error => { console.error(`MongoDB connection failed: ${error.message}`); process.exit(1); });

export { app };
