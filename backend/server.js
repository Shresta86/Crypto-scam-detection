import dotenv from 'dotenv';
import axios from 'axios';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
// Accept both conventional locations: backend/.env for the API and root/.env
// for a single-file project setup. Existing shell variables always take priority.
dotenv.config({ path: join(root, '.env') });
dotenv.config({ path: join(__dirname, '.env'), override: false });
const app = express();
const PORT = Number(process.env.PORT || 5001);
const API_URL = 'https://api.etherscan.io/v2/api';
const POLL_MS = Number(process.env.MONITORING_POLL_SECONDS || 15) * 1000;
const configuredChain = (process.env.DEFAULT_BLOCKCHAIN || 'ethereum').toLowerCase();
const chain = configuredChain === 'ethereum' ? 'ethereum' : 'ethereum';
const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const monitorCache = new Map();
const now = () => new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
const lower = value => String(value || '').toLowerCase();

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
const Investigation = mongoose.model('Investigation', investigationSchema);
const Monitor = mongoose.model('Monitor', monitorSchema);
const Alert = mongoose.model('Alert', alertSchema);

const exchangeData = JSON.parse(readFileSync(join(root, 'data', 'exchange_addresses.json'), 'utf8'));
const exchanges = new Map(exchangeData.map(item => [lower(item.address), item.exchange]));
const identifyExchange = address => exchanges.get(lower(address)) || null;
const timestamp = value => {
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.valueOf()) ? now() : date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
};
const validChain = value => (String(value || chain).toLowerCase() === 'ethereum' ? 'ethereum' : null);
const assertWallet = (wallet, blockchain) => {
  if (!validChain(blockchain)) throw new Error(`Unsupported blockchain: ${blockchain}`);
  if (!addressPattern.test(String(wallet || '').trim())) throw new Error('Invalid Ethereum wallet address');
};

async function etherscan(action, wallet) {
  const { data } = await axios.get(API_URL, { timeout: 20000, params: { chainid: 1, module: 'account', action, address: wallet, startblock: 0, endblock: 999999999, page: 1, offset: 100, sort: 'desc', apikey: process.env.ETHERSCAN_API_KEY } });
  return data?.status === '1' && Array.isArray(data.result) ? data.result : [];
}
function normalise(raw, wallet, type) {
  const from = raw.from || '', to = raw.to || '', hash = raw.hash || raw.transactionHash;
  if (!hash || !from || !to) return null;
  const isToken = type === 'ERC20_TRANSFER';
  const decimals = isToken ? Number(raw.tokenDecimal || raw.decimals || 0) : 18;
  const rawAmount = String(raw.value || '0');
  const amount = Number(rawAmount) / (10 ** decimals);
  const direction = lower(from) === lower(wallet) ? 'OUT' : 'IN';
  const counterparty = direction === 'OUT' ? to : from;
  const asset = isToken ? (raw.tokenSymbol || raw.symbol || 'UNKNOWN') : 'ETH';
  return { blockchain: 'ethereum', transaction_hash: hash, block_number: raw.blockNumber, timestamp: timestamp(raw.timeStamp || raw.timestamp), sender: from, receiver: to, amount: Number(amount.toFixed(isToken ? 8 : 6)), raw_amount: rawAmount, display_amount: Number(amount.toFixed(isToken ? 8 : 6)), asset, asset_type: isToken ? 'token' : 'native', token_contract: isToken ? (raw.contractAddress || null) : null, token_symbol: asset, token_decimals: decimals, transaction_type: type, status: String(raw.isError || '0') === '1' ? 'failed' : 'success', hash, from, to, direction, counterparty, exchange: identifyExchange(counterparty), type, wallet, value: amount, display_value: amount, asset_name: isToken ? (raw.tokenName || asset) : 'Ethereum', token_name: isToken ? (raw.tokenName || asset) : undefined };
}
async function transactions(wallet) {
  const [normal, internal, token] = await Promise.all(['txlist', 'txlistinternal', 'tokentx'].map(action => etherscan(action, wallet).catch(() => [])));
  return [...normal.map(tx => normalise(tx, wallet, 'normal')), ...internal.filter(tx => String(tx.isError || '0') !== '1').map(tx => normalise(tx, wallet, 'internal')), ...token.map(tx => normalise(tx, wallet, 'ERC20_TRANSFER'))].filter(Boolean);
}
async function traceWallet(start_wallet, max_hops = 2, max_wallets = 8) {
  const visited = new Set(), queue = [[start_wallet, 0]], all = [], paths = [];
  while (queue.length && visited.size < max_wallets) {
    const [wallet, hop] = queue.shift(); if (visited.has(lower(wallet))) continue; visited.add(lower(wallet));
    const unique = new Map();
    for (const tx of await transactions(wallet)) unique.set([lower(tx.hash), lower(tx.from), lower(tx.to), tx.token_contract || '', tx.amount].join('|'), tx);
    const connections = new Map();
    for (const tx of unique.values()) {
      tx.wallet = wallet; tx.hop = hop; all.push(tx);
      if (tx.direction !== 'OUT' || !tx.counterparty || lower(tx.counterparty) === lower(wallet)) continue;
      const key = lower(tx.counterparty), connection = connections.get(key) || { from: wallet, to: tx.counterparty, amount: 0, count: 0, hash: tx.hash, timestamp: tx.timestamp, hop: hop + 1, type: tx.type, asset: tx.asset || 'ETH', exchange: identifyExchange(tx.counterparty) };
      connection.amount += tx.amount; connection.count++; connections.set(key, connection);
      if (!identifyExchange(tx.counterparty) && hop < max_hops && !visited.has(key) && !queue.some(([item]) => lower(item) === key)) queue.push([tx.counterparty, hop + 1]);
    }
    for (const item of connections.values()) paths.push({ ...item, amount: Number(item.amount.toFixed(6)) });
  }
  return { start_wallet, wallets_traced: visited.size, max_hops, transactions: all, paths };
}
function intelligence(transactions, paths) {
  const indicators = [], byWallet = new Map();
  if (transactions.length >= 20) indicators.push({ type: 'high_activity', message: 'High transaction activity detected', severity: 'medium', points: 15 });
  transactions.forEach(tx => { const key = lower(tx.wallet); byWallet.set(key, [...(byWallet.get(key) || []), tx]); });
  let rapid = false, splitting = false, consolidation = false;
  for (const items of byWallet.values()) {
    const ordered = [...items].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    for (let i = 0; i < ordered.length - 1; i++) if (ordered[i].direction === 'IN' && ordered[i + 1].direction === 'OUT' && new Date(ordered[i + 1].timestamp) - new Date(ordered[i].timestamp) <= 600000) rapid = true;
    if (new Set(items.filter(x => x.direction === 'OUT').map(x => lower(x.counterparty))).size >= 3) splitting = true;
    if (new Set(items.filter(x => x.direction === 'IN').map(x => lower(x.counterparty))).size >= 3) consolidation = true;
  }
  if (rapid) indicators.push({ type: 'rapid_movement', message: 'Funds moved out shortly after being received', severity: 'high', points: 25 });
  if (splitting) indicators.push({ type: 'fund_splitting', message: 'Funds split across multiple wallets', severity: 'medium', points: 20 });
  if (consolidation) indicators.push({ type: 'fund_consolidation', message: 'Funds consolidated from multiple wallets', severity: 'high', points: 20 });
  const exchange = transactions.find(tx => tx.exchange)?.exchange;
  if (exchange) indicators.push({ type: 'exchange_interaction', message: `Known exchange interaction: ${exchange} (not evidence of fraud)`, severity: 'medium', points: 10 });
  if (paths.some(path => path.hop >= 2)) indicators.push({ type: 'multi_hop', message: 'Funds moved through multiple intermediary wallets', severity: 'medium', points: 10 });
  const score = Math.min(100, indicators.reduce((sum, item) => sum + item.points, 0));
  const kinds = new Set(indicators.map(item => item.type));
  const recommendations = [kinds.has('rapid_movement') && 'Review transaction timestamps to investigate rapid movement of funds.', kinds.has('fund_splitting') && 'Examine the wallets receiving the split funds and trace their subsequent movement.', kinds.has('fund_consolidation') && 'Review the wallets that contributed funds to identify common transaction patterns.', kinds.has('exchange_interaction') && 'Verify the interaction with the identified cryptocurrency exchange.', kinds.has('multi_hop') && 'Examine intermediary wallets involved in the multi-hop fund movement.', kinds.has('high_activity') && 'Review the high-volume transaction activity for unusual patterns.'].filter(Boolean);
  return { suspicious_activity: { indicators, count: indicators.length }, risk: { score, level: score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW' }, investigator_recommendations: recommendations.length ? recommendations : ['Continue monitoring the wallet and review transaction history for unusual activity.'] };
}
function graph(result) {
  const nodes = new Map([[result.start_wallet, { id: result.start_wallet, label: 'Suspect Wallet', type: 'suspect' }]]), edges = [];
  result.paths.forEach(path => { nodes.set(path.from, { id: path.from, label: lower(path.from) === lower(result.start_wallet) ? 'Suspect Wallet' : 'Wallet', type: lower(path.from) === lower(result.start_wallet) ? 'suspect' : 'wallet' }); nodes.set(path.to, { id: path.to, label: path.exchange || 'Wallet', type: path.exchange ? 'exchange' : 'wallet' }); if (path.amount > 0) edges.push({ source: path.from, target: path.to, amount: path.amount, timestamp: path.timestamp, hash: path.hash, hop: path.hop, type: path.type, asset: path.asset || 'ETH', label: `${path.amount} ${path.asset || 'ETH'}` }); });
  return { nodes: [...nodes.values()], edges };
}
async function save(result) {
  result.timestamp = now();
  const doc = await Investigation.create({ wallet_address: result.start_wallet, blockchain: result.blockchain, timestamp: result.timestamp, risk_score: result.risk.score, risk_level: result.risk.level, transaction_count: result.transactions.length, wallet_count: result.wallets_traced, max_hops: result.max_hops, indicators: result.suspicious_activity.indicators.map(item => item.message), result_json: result });
  result.investigation_id = String(doc._id); doc.result_json = result; await doc.save(); return result;
}
function publicDoc(doc) { const item = doc.toObject ? doc.toObject() : doc; item.id = String(item._id); delete item._id; delete item.result_json; return item; }

app.get('/api/config', (_req, res) => res.json({ apiConfigured: Boolean(process.env.ETHERSCAN_API_KEY), blockchain: chain }));
app.post('/trace', async (req, res, next) => { try { const wallet = String(req.body.wallet_address || req.body.wallet || '').trim(); if (!wallet) return res.status(400).json({ error: 'Wallet address is required' }); assertWallet(wallet, req.body.blockchain || chain); if (!process.env.ETHERSCAN_API_KEY) return res.status(500).json({ error: 'Etherscan API key is missing' }); const result = await traceWallet(wallet); result.blockchain = 'ethereum'; result.graph = graph(result); Object.assign(result, intelligence(result.transactions, result.paths)); const counts = new Map(); result.transactions.filter(tx => tx.exchange).forEach(tx => { const key = `${tx.exchange}|${lower(tx.counterparty)}`; counts.set(key, (counts.get(key) || 0) + 1); }); result.exchange_attributions = [...counts].map(([key, interactions]) => { const [exchange, address] = key.split('|'); return { exchange, address, interactions, transaction_count: interactions, confidence: 'Dataset match' }; }); res.json(await save(result)); } catch (error) { next(error); } });
app.get('/history', async (_req, res, next) => { try { res.json((await Investigation.find().sort({ timestamp: -1 })).map(publicDoc)); } catch (error) { next(error); } });
app.delete('/history', async (_req, res, next) => { try { await Investigation.deleteMany({}); res.json({ deleted: true }); } catch (error) { next(error); } });
app.get('/history/:id', async (req, res, next) => { try { const doc = await Investigation.findById(req.params.id); if (!doc) return res.status(404).json({ error: 'Investigation not found' }); res.json(doc.result_json); } catch (error) { next(error); } });
app.delete('/history/:id', async (req, res, next) => { try { const doc = await Investigation.findByIdAndDelete(req.params.id); if (!doc) return res.status(404).json({ error: 'Investigation not found' }); res.json({ deleted: true }); } catch (error) { next(error); } });
app.get('/export/:id.:format', async (req, res, next) => { try { const doc = await Investigation.findById(req.params.id); if (!doc) return res.status(404).json({ error: 'Investigation not found' }); const data = doc.result_json; if (req.params.format === 'json') { res.attachment(`TraceX_${req.params.id}.json`).type('application/json').send(JSON.stringify(data, null, 2)); return; } if (req.params.format === 'csv') { const fields = ['direction', 'from', 'to', 'amount', 'timestamp', 'hash', 'exchange', 'type']; const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`; res.attachment(`TraceX_${req.params.id}.csv`).type('text/csv').send([fields.join(','), ...data.transactions.map(tx => fields.map(field => quote(tx[field])).join(','))].join('\n')); return; } res.status(400).json({ error: 'Format must be json or csv' }); } catch (error) { next(error); } });

async function createAlert(wallet, transaction, type, severity, title, description, blockchain = 'ethereum') {
  const hash = transaction.transaction_hash || transaction.hash;
  if (!hash) return null;
  try { return await Alert.create({ wallet_address: wallet, blockchain, transaction_hash: hash, alert_type: type, severity, title, description, timestamp: transaction.timestamp || now(), created_at: now(), status: 'NEW', evidence: { source: 'monitoring_poll', asset: transaction.asset || transaction.token_symbol || 'ETH' } }); } catch (error) { if (error?.code === 11000) return null; throw error; }
}
async function pollMonitor(monitor) {
  const current = await transactions(monitor.wallet_address); if (!current.length) return;
  const cacheKey = `${monitor.blockchain}|${lower(monitor.wallet_address)}`;
  const hadBaseline = monitorCache.has(cacheKey);
  const known = monitorCache.get(cacheKey) || new Set();
  const fresh = current.filter(tx => !known.has(`${tx.blockchain}|${lower(tx.hash)}`));
  monitorCache.set(cacheKey, new Set(current.map(tx => `${tx.blockchain}|${lower(tx.hash)}`)));
  // A monitor's first poll establishes its baseline; later polls create alerts only for new activity.
  if (hadBaseline) for (const tx of fresh) {
    const other = current.filter(item => item.hash !== tx.hash);
    if (other.length >= 20) await createAlert(monitor.wallet_address, tx, 'high_activity', 'MEDIUM', 'High transaction activity', 'High transaction activity detected within the monitored wallet');
    if (tx.asset_type === 'token') await createAlert(monitor.wallet_address, tx, 'erc20_activity', 'MEDIUM', 'Token activity detected', `${tx.asset || 'Token'} movement observed`);
    if (tx.direction === 'IN' && other.some(item => item.direction === 'OUT' && Math.abs(new Date(tx.timestamp) - new Date(item.timestamp)) <= 600000)) await createAlert(monitor.wallet_address, tx, 'rapid_movement', 'HIGH', 'Rapid movement of funds', 'Funds moved quickly after receipt');
  }
  const latest = [...current].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  await Monitor.findByIdAndUpdate(monitor._id, { last_checked_at: now(), last_transaction_timestamp: latest.timestamp, last_transaction_hash: latest.hash, updated_at: now() });
}
async function monitorTick() { try { for (const item of await Monitor.find({ status: 'monitoring' })) await pollMonitor(item); } catch (error) { console.error('Monitoring poll failed:', error.message); } }
app.post('/monitor/start', async (req, res, next) => { try { const wallet = String(req.body.wallet_address || req.body.wallet || '').trim(); if (!wallet) return res.status(400).json({ error: 'Wallet address is required' }); assertWallet(wallet, req.body.blockchain || chain); const update = { investigation_id: req.body.investigation_id || null, status: 'monitoring', updated_at: now(), max_hops: 2, max_wallets: 8 }; let item = await Monitor.findOneAndUpdate({ wallet_address: wallet, blockchain: 'ethereum' }, update, { new: true, sort: { created_at: -1 } }); if (!item) item = await Monitor.create({ ...update, wallet_address: wallet, blockchain: 'ethereum', last_checked_at: now(), created_at: now() }); res.json(publicDoc(item)); } catch (error) { next(error); } });
app.post('/monitor/stop', async (req, res, next) => { try { const wallet = String(req.body.wallet_address || req.body.wallet || '').trim(); if (!wallet) return res.status(400).json({ error: 'Wallet address is required' }); const item = await Monitor.findOneAndUpdate({ wallet_address: wallet, blockchain: validChain(req.body.blockchain) || chain }, { status: 'stopped', updated_at: now() }, { new: true, sort: { created_at: -1 } }); res.json(item ? publicDoc(item) : { wallet_address: wallet, blockchain: 'ethereum', status: 'stopped' }); } catch (error) { next(error); } });
app.get('/monitor/status', async (req, res, next) => { try { const wallet = req.query.wallet || req.query.wallet_address; if (!wallet) return res.json({ wallets: (await Monitor.find({ blockchain: validChain(req.query.blockchain) || chain }).sort({ updated_at: -1 })).map(publicDoc) }); const item = await Monitor.findOne({ wallet_address: String(wallet).trim(), blockchain: validChain(req.query.blockchain) || chain }).sort({ created_at: -1 }); res.json(item ? publicDoc(item) : { wallet_address: String(wallet).trim(), blockchain: 'ethereum', status: 'not_monitoring' }); } catch (error) { next(error); } });
app.get('/alerts', async (req, res, next) => { try { const query = { blockchain: validChain(req.query.blockchain) || chain }; if (req.query.wallet || req.query.wallet_address) query.wallet_address = String(req.query.wallet || req.query.wallet_address).trim(); res.json((await Alert.find(query).sort({ created_at: -1 })).map(publicDoc)); } catch (error) { next(error); } });
for (const [suffix, status] of [['acknowledge', 'ACKNOWLEDGED'], ['resolve', 'RESOLVED']]) app.post(`/alerts/:id/${suffix}`, async (req, res, next) => { try { const item = await Alert.findByIdAndUpdate(req.params.id, { status }, { new: true }); if (!item) return res.status(404).json({ error: 'Alert not found' }); res.json({ id: String(item._id), status }); } catch (error) { next(error); } });

app.post('/report', (req, res) => {
  const data = req.body || {}; if (!data.start_wallet) return res.status(400).json({ error: 'No wallet analysis data provided.' });
  const pdf = new PDFDocument({ margin: 42 }); const chunks = []; pdf.on('data', part => chunks.push(part)); pdf.on('end', () => { res.attachment(`TraceX_Investigation_${data.start_wallet.slice(0, 10)}.pdf`).type('application/pdf').send(Buffer.concat(chunks)); });
  pdf.fontSize(20).text('TraceX Investigation Report', { align: 'center' }).moveDown();
  pdf.fontSize(10).text(`Investigation ID: ${data.investigation_id || 'N/A'}\nReported Wallet: ${data.start_wallet}\nReport Generated: ${new Date().toLocaleString()}`).moveDown();
  pdf.fontSize(14).text('Risk Assessment').fontSize(10).text(`Risk Score: ${data.risk?.score ?? 0}\nRisk Level: ${data.risk?.level || 'UNKNOWN'}`).moveDown();
  pdf.fontSize(14).text('Trace Summary').fontSize(10).text(`Wallets Traced: ${data.wallets_traced ?? 0}\nMaximum Hops: ${data.max_hops ?? 'N/A'}\nTransactions Found: ${(data.transactions || []).length}\nPaths Found: ${(data.paths || []).length}`).moveDown();
  pdf.fontSize(14).text('Suspicious Activity Indicators').fontSize(10); (data.suspicious_activity?.indicators || []).forEach(item => pdf.text(`• ${item.message || item}`)); if (!(data.suspicious_activity?.indicators || []).length) pdf.text('No suspicious indicators detected.'); pdf.moveDown();
  pdf.fontSize(14).text('Investigator Recommendations').fontSize(10); (data.investigator_recommendations || []).forEach(item => pdf.text(`• ${item}`)); pdf.moveDown();
  pdf.fontSize(14).text('Transaction Analysis').fontSize(8); (data.transactions || []).slice(0, 200).forEach(tx => pdf.text(`${tx.direction || ''} | ${tx.from || ''} → ${tx.to || ''} | ${tx.amount ?? ''} ${tx.asset || 'ETH'} | ${tx.timestamp || ''} | ${tx.hash || ''}`));
  pdf.moveDown().fontSize(9).text('Disclaimer: This report is an automated investigative aid. Risk scores and suspicious activity indicators are rule-based and do not by themselves establish fraud or criminal activity. Findings should be independently verified by investigators.'); pdf.end();
});

app.get('/dashboard', (_req, res) => res.sendFile(join(root, 'templates', 'x.html')));
app.get('/graph', (_req, res) => res.sendFile(join(root, 'templates', 'graph.html')));
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: error.message || 'Internal server error' }); });

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tracex')
  .then(() => { app.listen(PORT, () => console.log(`TraceX API listening on http://localhost:${PORT}`)); setInterval(monitorTick, POLL_MS).unref(); monitorTick(); })
  .catch(error => { console.error(`MongoDB connection failed: ${error.message}`); process.exit(1); });
