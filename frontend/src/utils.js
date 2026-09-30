export const isEthereumAddress = value => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
export const shortAddress = (value, head = 8, tail = 6) => { const text = String(value || '—'); return text.length > head + tail + 3 ? `${text.slice(0, head)}…${text.slice(-tail)}` : text; };
export const caseLabel = id => `CASE-${String(id || '').slice(-6).toUpperCase()}`;
export const formatNumber = value => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(value) || 0);
export const formatAmount = value => { const number = Number(value); if (!Number.isFinite(number)) return '—'; if (number === 0) return '0'; if (Math.abs(number) < 0.0001) return number.toExponential(3); return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(number); };
export const formatDate = value => { if (!value) return 'Not available'; const date = new Date(String(value).replace(' UTC', 'Z')); return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };
export const riskTone = level => ({ HIGH: 'danger', MEDIUM: 'warning', LOW: 'success' }[String(level || '').toUpperCase()] || 'neutral');
export const unique = values => [...new Set((values || []).filter(Boolean))];
export async function copyText(value) { await navigator.clipboard.writeText(String(value || '')); }

export function assetSummary(transactions = []) {
  const assets = new Map();
  for (const tx of transactions) {
    const symbol = tx.asset || 'UNKNOWN';
    const item = assets.get(symbol) || { asset: symbol, incoming: 0, outgoing: 0, count: 0 };
    item.count += 1;
    if (tx.direction === 'IN') item.incoming += Number(tx.amount) || 0;
    if (tx.direction === 'OUT') item.outgoing += Number(tx.amount) || 0;
    assets.set(symbol, item);
  }
  return [...assets.values()].sort((a, b) => b.count - a.count);
}

export function counterpartySummary(transactions = []) {
  const map = new Map();
  for (const tx of transactions) {
    const address = String(tx.counterparty || (tx.direction === 'IN' ? tx.from : tx.to) || '').toLowerCase();
    if (!address) continue;
    const item = map.get(address) || { address, count: 0, assets: new Set(), volume: 0, exchange: tx.exchange || null };
    item.count += 1; item.assets.add(tx.asset || 'UNKNOWN'); item.volume += Number(tx.amount) || 0; item.exchange ||= tx.exchange || null; map.set(address, item);
  }
  return [...map.values()].map(item => ({ ...item, assets: [...item.assets] })).sort((a, b) => b.count - a.count);
}

// Visualization adapters only transform provider-backed case evidence. They do
// not infer values, timestamps, or relationships that are absent from a case.
export function visualizationEvents(transactions = [], { asset = 'all', riskOnly = false, indicators = [] } = {}) {
  const supported = new Set((indicators || []).flatMap(item => item.supporting_transactions || []).filter(Boolean).map(String));
  return [...transactions]
    .filter(tx => asset === 'all' || tx.asset === asset)
    .filter(tx => !riskOnly || supported.has(String(tx.hash || tx.transaction_hash || '')))
    .filter(tx => tx.timestamp && tx.from && tx.to)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

export function assetFlowSummary(transactions = [], asset = 'all') {
  const scoped = (transactions || []).filter(tx => asset === 'all' || tx.asset === asset);
  const byRoute = new Map();
  for (const tx of scoped) {
    if (!tx.from || !tx.to || !tx.asset) continue;
    const key = `${String(tx.from).toLowerCase()}>${String(tx.to).toLowerCase()}|${tx.asset}`;
    const current = byRoute.get(key) || { from: tx.from, to: tx.to, asset: tx.asset, count: 0, amount: 0, transactionHashes: [] };
    current.count += 1;
    current.amount += Number(tx.amount) || 0;
    if (tx.hash || tx.transaction_hash) current.transactionHashes.push(tx.hash || tx.transaction_hash);
    byRoute.set(key, current);
  }
  return [...byRoute.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
}

export function timelineBuckets(transactions = [], buckets = 18) {
  const events = visualizationEvents(transactions);
  if (!events.length) return [];
  const first = new Date(events[0].timestamp).valueOf(), last = new Date(events.at(-1).timestamp).valueOf();
  const span = Math.max(1, last - first);
  const result = Array.from({ length: Math.min(buckets, events.length) }, (_, index) => ({ index, count: 0, incoming: 0, outgoing: 0, events: [] }));
  for (const tx of events) {
    const index = Math.min(result.length - 1, Math.floor(((new Date(tx.timestamp).valueOf() - first) / span) * result.length));
    const item = result[index];
    item.count += 1;
    if (tx.direction === 'IN') item.incoming += 1; else item.outgoing += 1;
    item.events.push(tx);
  }
  return result;
}
