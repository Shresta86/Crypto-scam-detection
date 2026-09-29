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
