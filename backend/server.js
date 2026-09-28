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
import { FraudNetworkService } from './services/fraud-network.js';

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

const investigationSchema = new mongoose.Schema({
  wallet_address: String, blockchain: { type: String, default: 'ethereum' }, timestamp: String,
  risk_score: Number, risk_level: String, transaction_count: Number, wallet_count: Number, max_hops: Number,
  indicators: [String], result_json: mongoose.Schema.Types.Mixed
}, { versionKey: false });
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
for (const field of ['wallet_addresses', 'intermediary_wallets', 'destination_wallets', 'counterparty_wallets', 'exchange_names', 'path_signatures']) caseNetworkIndexSchema.index({ [field]: 1 });

export const Investigation = mongoose.model('Investigation', investigationSchema);
export const Monitor = mongoose.model('Monitor', monitorSchema);
export const Alert = mongoose.model('Alert', alertSchema);
export const ThreatIntelligenceCache = mongoose.model('ThreatIntelligenceCache', threatIntelligenceCacheSchema);
export const CaseNetworkIndex = mongoose.model('CaseNetworkIndex', caseNetworkIndexSchema);

const exchangeData = JSON.parse(readFileSync(join(root, 'data', 'exchange_addresses.json'), 'utf8'));
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

export async function traceWallet(startWallet, maxHops = 2, maxWallets = 8, service = blockchainService()) {
  const visited = new Set(), queue = [[startWallet, 0]], all = [], paths = [];
  while (queue.length && visited.size < maxWallets) {
    const [wallet, hop] = queue.shift();
    if (visited.has(lower(wallet))) continue;
    visited.add(lower(wallet));
    const transactions = await service.fetchTransactions(wallet, 100);
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
  return { start_wallet: startWallet, wallets_traced: visited.size, max_hops: maxHops, transactions: all, paths, provider: service.summary() };
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
  result.paths.forEach(path => {
    nodes.set(path.from, { id: path.from, label: lower(path.from) === lower(result.start_wallet) ? 'Suspect Wallet' : 'Wallet', type: lower(path.from) === lower(result.start_wallet) ? 'suspect' : 'wallet' });
    nodes.set(path.to, { id: path.to, label: path.exchange || 'Wallet', type: path.exchange ? 'exchange' : 'wallet' });
    edges.push({ source: path.from, target: path.to, amount: path.amount, timestamp: path.timestamp, hash: path.hash, block_number: path.block_number, hop: path.hop, type: path.type, asset: path.asset, provider: path.provider, label: `${path.amount} ${path.asset}` });
  });
  return { nodes: [...nodes.values()], edges };
}

async function save(result) {
  result.timestamp = now();
  const doc = new Investigation({ wallet_address: result.start_wallet, blockchain: result.blockchain, timestamp: result.timestamp, risk_score: result.risk.score, risk_level: result.risk.level, transaction_count: result.transactions.length, wallet_count: result.wallets_traced, max_hops: result.max_hops, indicators: result.suspicious_activity.indicators.map(item => item.message) });
  result.investigation_id = String(doc._id); doc.result_json = result; await doc.save();
  try { await fraudNetwork.indexInvestigation(doc.toObject()); }
  catch (error) { console.error(`fraud_network_index: ${error.message}`); }
  return result;
}
function publicDoc(doc) { const item = doc.toObject ? doc.toObject() : doc; item.id = String(item._id); delete item._id; delete item.result_json; return item; }

app.get('/api/config', (_req, res) => res.json({
  apiConfigured: Boolean(process.env.ALCHEMY_RPC_URL || process.env.ETHERSCAN_API_KEY), blockchain: chain,
  providers: { alchemy: Boolean(process.env.ALCHEMY_RPC_URL), etherscan: Boolean(process.env.ETHERSCAN_API_KEY) },
  externalIntelligence: { chainabuse: Boolean(process.env.CHAINABUSE_API_KEY) }, copilot: { configured: Boolean(process.env.GROQ_API_KEY) },
  fraudNetwork: { configured: true, minimumScore: fraudNetwork.minScore, maximumRelatedCases: fraudNetwork.maxRelatedCases }
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
    const networkEvidence = await fraudNetwork.fraudNetwork(caseId);
    const result = await copilot.answer(question, { ...(doc.result_json || {}), investigation_id: caseId, fraud_network: networkEvidence });
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

app.get('/history', async (_req, res, next) => { try { res.json((await Investigation.find().sort({ timestamp: -1 })).map(publicDoc)); } catch (error) { next(error); } });
app.delete('/history', async (_req, res, next) => { try { await Promise.all([Investigation.deleteMany({}), CaseNetworkIndex.deleteMany({})]); res.json({ deleted: true }); } catch (error) { next(error); } });
app.get('/history/:id', async (req, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'invalid_case', 'Invalid investigation ID'); const doc = await Investigation.findById(req.params.id); if (!doc) throw new AppError(404, 'case_not_found', 'Investigation not found'); res.json(doc.result_json); } catch (error) { next(error); } });
app.delete('/history/:id', async (req, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'invalid_case', 'Invalid investigation ID'); const doc = await Investigation.findByIdAndDelete(req.params.id); if (!doc) throw new AppError(404, 'case_not_found', 'Investigation not found'); await CaseNetworkIndex.deleteOne({ case_id: String(req.params.id) }); res.json({ deleted: true }); } catch (error) { next(error); } });
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

async function createAlert(wallet, transaction, type, severity, title, description, blockchain = 'ethereum') {
  const hash = transaction.transaction_hash || transaction.hash; if (!hash) return null;
  try { return await Alert.create({ wallet_address: wallet, blockchain, transaction_hash: hash, alert_type: type, severity, title, description, timestamp: transaction.timestamp || now(), created_at: now(), status: 'NEW', evidence: { source: 'monitoring_poll', asset: transaction.asset || transaction.token_symbol || 'ETH', provider: transaction.provider } }); }
  catch (error) { if (error?.code === 11000) return null; throw error; }
}
async function pollMonitor(monitor) {
  const current = await blockchainService().fetchTransactions(monitor.wallet_address, 100); if (!current.length) return;
  const cacheKey = `${monitor.blockchain}|${lower(monitor.wallet_address)}`, hadBaseline = monitorCache.has(cacheKey), known = monitorCache.get(cacheKey) || new Set();
  const identity = tx => `${tx.blockchain}|${lower(tx.hash)}|${lower(tx.token_contract)}|${tx.raw_amount}`;
  const fresh = current.filter(tx => !known.has(identity(tx))); monitorCache.set(cacheKey, new Set(current.map(identity)));
  if (hadBaseline) for (const tx of fresh) {
    const other = current.filter(item => item.hash !== tx.hash);
    if (other.length >= 20) await createAlert(monitor.wallet_address, tx, 'high_activity', 'MEDIUM', 'High transaction activity', 'High transaction activity detected within the monitored wallet');
    if (tx.asset_type === 'token') await createAlert(monitor.wallet_address, tx, 'erc20_activity', 'MEDIUM', 'Token activity detected', `${tx.asset || 'Token'} movement observed`);
    if (tx.direction === 'IN' && other.some(item => item.direction === 'OUT' && Math.abs(new Date(tx.timestamp) - new Date(item.timestamp)) <= 600000)) await createAlert(monitor.wallet_address, tx, 'rapid_movement', 'HIGH', 'Rapid movement of funds', 'Funds moved quickly after receipt');
  }
  const latest = [...current].filter(item => item.timestamp).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  await Monitor.findByIdAndUpdate(monitor._id, { last_checked_at: now(), last_transaction_timestamp: latest?.timestamp || null, last_transaction_hash: latest?.hash || null, updated_at: now() });
}
async function monitorTick() { try { for (const item of await Monitor.find({ status: 'monitoring' })) await pollMonitor(item); } catch (error) { console.error('Monitoring poll failed:', error.message); } }
app.post('/monitor/start', async (req, res, next) => { try { const wallet = String(req.body.wallet_address || req.body.wallet || '').trim(); if (!wallet) throw new AppError(400, 'wallet_required', 'Wallet address is required'); assertWallet(wallet, req.body.blockchain || chain); const update = { investigation_id: req.body.investigation_id || null, status: 'monitoring', updated_at: now(), max_hops: 2, max_wallets: 8 }; let item = await Monitor.findOneAndUpdate({ wallet_address: wallet, blockchain: 'ethereum' }, update, { new: true, sort: { created_at: -1 } }); if (!item) item = await Monitor.create({ ...update, wallet_address: wallet, blockchain: 'ethereum', last_checked_at: now(), created_at: now() }); res.json(publicDoc(item)); } catch (error) { next(error); } });
app.post('/monitor/stop', async (req, res, next) => { try { const wallet = String(req.body.wallet_address || req.body.wallet || '').trim(); if (!wallet) throw new AppError(400, 'wallet_required', 'Wallet address is required'); const item = await Monitor.findOneAndUpdate({ wallet_address: wallet, blockchain: validChain(req.body.blockchain) || chain }, { status: 'stopped', updated_at: now() }, { new: true, sort: { created_at: -1 } }); res.json(item ? publicDoc(item) : { wallet_address: wallet, blockchain: 'ethereum', status: 'stopped' }); } catch (error) { next(error); } });
app.get('/monitor/status', async (req, res, next) => { try { const wallet = req.query.wallet || req.query.wallet_address; if (!wallet) return res.json({ wallets: (await Monitor.find({ blockchain: validChain(req.query.blockchain) || chain }).sort({ updated_at: -1 })).map(publicDoc) }); const item = await Monitor.findOne({ wallet_address: String(wallet).trim(), blockchain: validChain(req.query.blockchain) || chain }).sort({ created_at: -1 }); res.json(item ? publicDoc(item) : { wallet_address: String(wallet).trim(), blockchain: 'ethereum', status: 'not_monitoring' }); } catch (error) { next(error); } });
app.get('/alerts', async (req, res, next) => { try { const query = { blockchain: validChain(req.query.blockchain) || chain }; if (req.query.wallet || req.query.wallet_address) query.wallet_address = String(req.query.wallet || req.query.wallet_address).trim(); res.json((await Alert.find(query).sort({ created_at: -1 })).map(publicDoc)); } catch (error) { next(error); } });
for (const [suffix, status] of [['acknowledge', 'ACKNOWLEDGED'], ['resolve', 'RESOLVED']]) app.post(`/alerts/:id/${suffix}`, async (req, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) throw new AppError(400, 'invalid_alert', 'Invalid alert ID'); const item = await Alert.findByIdAndUpdate(req.params.id, { status }, { new: true }); if (!item) throw new AppError(404, 'alert_not_found', 'Alert not found'); res.json({ id: String(item._id), status }); } catch (error) { next(error); } });

app.post('/report', (req, res) => {
  const data = req.body || {}; if (!data.start_wallet) return res.status(400).json({ error: 'No wallet analysis data provided.' });
  const pdf = new PDFDocument({ margin: 42 }), chunks = [];
  pdf.on('data', part => chunks.push(part)); pdf.on('end', () => res.attachment(`TraceX_Investigation_${data.start_wallet.slice(0, 10)}.pdf`).type('application/pdf').send(Buffer.concat(chunks)));
  pdf.fontSize(20).text('TraceX Investigation Report', { align: 'center' }).moveDown();
  pdf.fontSize(10).text(`Investigation ID: ${data.investigation_id || 'N/A'}\nReported Wallet: ${data.start_wallet}\nReport Generated: ${new Date().toLocaleString()}\nBlockchain Provider: ${data.provider?.selected || 'unknown'}`).moveDown();
  pdf.fontSize(14).text('Risk Assessment').fontSize(10).text(`Risk Score: ${data.risk?.score ?? 0}\nRisk Level: ${data.risk?.level || 'UNKNOWN'}\nThis score is an investigative indicator, not proof of criminal activity.`).moveDown();
  pdf.fontSize(14).text('Trace Summary').fontSize(10).text(`Wallets Traced: ${data.wallets_traced ?? 0}\nMaximum Hops: ${data.max_hops ?? 'N/A'}\nTransactions Found: ${(data.transactions || []).length}\nPaths Found: ${(data.paths || []).length}`).moveDown();
  const threat = data.external_intelligence?.chainabuse;
  pdf.fontSize(14).text('External Intelligence').fontSize(10).text(`Chainabuse status: ${threat?.status || 'not available'}\nReports: ${threat?.report_count ?? 0}\nCategories: ${(threat?.categories || []).join(', ') || 'None'}`).moveDown();
  pdf.fontSize(14).text('Suspicious Activity Indicators').fontSize(10); (data.suspicious_activity?.indicators || []).forEach(item => pdf.text(`- ${item.message || item}`)); if (!(data.suspicious_activity?.indicators || []).length) pdf.text('No suspicious indicators detected.');
  pdf.moveDown().fontSize(14).text('Investigator Recommendations').fontSize(10); (data.investigator_recommendations || []).forEach(item => pdf.text(`- ${item}`));
  pdf.moveDown().fontSize(14).text('Transaction Analysis').fontSize(8); (data.transactions || []).slice(0, 200).forEach(tx => pdf.text(`${tx.direction || ''} | ${tx.from || ''} -> ${tx.to || ''} | ${tx.amount ?? ''} ${tx.asset || 'ETH'} | ${tx.timestamp || ''} | ${tx.hash || ''} | ${tx.provider || ''}`));
  pdf.moveDown().fontSize(9).text('Disclaimer: This report is an automated investigative aid. Findings should be independently verified by investigators.'); pdf.end();
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
  await Promise.all([Investigation.init(), Monitor.init(), Alert.init(), ThreatIntelligenceCache.init(), CaseNetworkIndex.init()]);
  const indexedCases = await fraudNetwork.backfillMissingIndexes();
  if (indexedCases) console.log(`Fraud network index backfilled for ${indexedCases} investigation(s)`);
  server = app.listen(port, () => console.log(`TraceX API listening on http://localhost:${port}`));
  setInterval(monitorTick, POLL_MS).unref(); monitorTick(); return server;
}
export async function stopServer() { if (server) await new Promise(done => server.close(done)); server = null; if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); }
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) startServer().catch(error => { console.error(`MongoDB connection failed: ${error.message}`); process.exit(1); });

export { app };
