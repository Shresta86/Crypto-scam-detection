import React, { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Badge, CopyValue, Drawer, EmptyState } from './Primitives.jsx';
import { formatAmount, formatDate, formatDataSourceName, unique } from '../utils.js';

const PAGE_SIZE = 25;

export default function TransactionExplorer({ transactions = [], startWallet, onCapture, onGraph }) {
  const [query, setQuery] = useState('');
  const [asset, setAsset] = useState('all');
  const [direction, setDirection] = useState('all');
  const [hop, setHop] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const assets = unique(transactions.map(tx => tx.asset));
  const filtered = useMemo(() => transactions.filter(tx => {
    const haystack = [tx.hash, tx.from, tx.to, tx.counterparty, tx.asset, tx.exchange, tx.provider].join(' ').toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) &&
      (asset === 'all' || tx.asset === asset) &&
      (direction === 'all' || tx.direction === direction) &&
      (hop === 'all' || Number(tx.hop || 0) === Number(hop));
  }).sort((a, b) => sort === 'oldest' ? new Date(a.timestamp) - new Date(b.timestamp) : sort === 'amount' ? (Number(b.amount)||0) - (Number(a.amount)||0) : new Date(b.timestamp) - new Date(a.timestamp)), [transactions, query, asset, direction, hop, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const change = setter => event => { setter(event.target.value); setPage(1); };
  const whyItMatters = tx => {
    const reasons = [];
    if (tx.exchange) reasons.push(`Touches attributed entity endpoint (${tx.exchange})`);
    if (Number(tx.hop) > 0) reasons.push(`Multi-hop intermediary transfer (Hop ${tx.hop})`);
    if (String(tx.from || '').toLowerCase() === String(startWallet || '').toLowerCase() && tx.direction === 'OUT') reasons.push('Direct dispersal from suspect wallet');
    if (Number(tx.amount) >= 1) reasons.push(`High transfer value: ${formatAmount(tx.amount)} ${tx.asset}`);
    if (tx.asset_type === 'token') reasons.push(`ERC-20 token transfer (${tx.asset})`);
    if (!reasons.length) reasons.push('Observed in normalized blockchain activity ledger');
    return reasons;
  };

  return <div className="transaction-explorer">
    <div className="table-toolbar">
      <label className="table-search"><Icon name="search"/><input value={query} onChange={change(setQuery)} placeholder="Search address, hash, asset or entity" aria-label="Search transactions"/></label>
      <select value={asset} onChange={change(setAsset)} aria-label="Filter transactions by asset"><option value="all">All assets</option>{assets.map(value => <option key={value}>{value}</option>)}</select>
      <select value={direction} onChange={change(setDirection)} aria-label="Filter transactions by direction"><option value="all">All directions</option><option value="IN">Incoming</option><option value="OUT">Outgoing</option></select>
      <select value={hop} onChange={change(setHop)} aria-label="Filter transactions by hop"><option value="all">All hops</option><option value="0">Hop 0 (Suspect)</option><option value="1">Hop 1</option><option value="2">Hop 2</option></select>
      <select value={sort} onChange={change(setSort)} aria-label="Sort transactions"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount">Largest amount</option></select>
      <span className="result-count">{filtered.length} transfers</span>
    </div>
    {!visible.length ? <EmptyState title="No matching transactions" description="Adjust the active search or filters. No transaction evidence has been removed."/> : <div className="table-scroll"><table><thead><tr><th>Time</th><th>Transaction</th><th>From</th><th>To</th><th>Asset</th><th>Amount</th><th>Direction</th><th>Hop</th><th>Entity</th><th>Data Source</th></tr></thead><tbody>{visible.map((tx, index) => <tr key={`${tx.hash}-${tx.token_contract || 'native'}-${index}`} onClick={() => setSelected(tx)} tabIndex="0"><td>{formatDate(tx.timestamp)}</td><td><CopyValue value={tx.hash || tx.transaction_hash}/></td><td><CopyValue value={tx.from}/></td><td><CopyValue value={tx.to}/></td><td><strong className="asset-cell">{tx.asset || 'UNKNOWN'}</strong><small>{tx.asset_type || tx.type}</small></td><td className="amount-cell">{formatAmount(tx.amount)}</td><td><Badge tone={tx.direction === 'OUT' ? 'warning' : 'success'}>{tx.direction || '—'}</Badge></td><td>{tx.hop ?? 0}</td><td>{tx.exchange ? <Badge tone="success">{tx.exchange}</Badge> : <span className="muted">Unattributed</span>}</td><td><span className="provider-label">{formatDataSourceName(tx.provider)}</span></td></tr>)}</tbody></table></div>}
    <div className="pagination"><span>Page {page} of {pages}</span><div><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><button disabled={page === pages} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    <Drawer title="Transaction evidence" subtitle={selected?.hash || selected?.transaction_hash} onClose={() => setSelected(null)}>{selected && <div className="evidence-list">
      <div className="why-it-matters-card">
        <div className="why-header"><Icon name="info" size={16}/><strong>Why this may matter</strong></div>
        <ul>{whyItMatters(selected).map((reason, i) => <li key={i}>{reason}</li>)}</ul>
      </div>
      <Detail label="Transaction"><CopyValue value={selected.hash || selected.transaction_hash} compact={false}/></Detail>
      <Detail label="From"><CopyValue value={selected.from} compact={false}/></Detail>
      <Detail label="To"><CopyValue value={selected.to} compact={false}/></Detail>
      <Detail label="Relationship to suspect">{String(selected.wallet || '').toLowerCase() === String(startWallet || '').toLowerCase() ? 'Directly observed on investigated wallet' : `Observed at hop ${selected.hop ?? 0}`}</Detail>
      <Detail label="Asset">{selected.asset} · {selected.asset_type || selected.type}</Detail>
      <Detail label="Amount">{formatAmount(selected.amount)} {selected.asset}</Detail>
      <Detail label="Direction"><Badge tone={selected.direction === 'OUT' ? 'warning' : 'success'}>{selected.direction}</Badge></Detail>
      <Detail label="Timestamp">{formatDate(selected.timestamp)}</Detail>
      <Detail label="Block">{selected.block_number || 'Not available'}</Detail>
      <Detail label="Data Source">{formatDataSourceName(selected.provider)}</Detail>
      <Detail label="Entity attribution">{selected.exchange || 'No known attribution in the current dataset'}</Detail>
      <div className="drawer-actions-row">
        {onCapture && <button className="button button-primary" onClick={() => { onCapture({ evidence_type: 'TRANSACTION', title: `Transfer ${selected.hash.slice(0, 10)}… (${formatAmount(selected.amount)} ${selected.asset})`, transaction_hash: selected.hash || selected.transaction_hash, wallet_address: selected.from, source_provider: formatDataSourceName(selected.provider), source_reference: selected.hash || selected.transaction_hash, snapshot: { hash: selected.hash || selected.transaction_hash, transaction_hash: selected.hash || selected.transaction_hash, from: selected.from, to: selected.to, sender: selected.from, receiver: selected.to, asset: selected.asset, amount: selected.amount, raw_amount: selected.raw_amount, timestamp: selected.timestamp, block_number: selected.block_number, provider: selected.provider, direction: selected.direction, type: selected.type || selected.transaction_type, exchange: selected.exchange || null, hop: selected.hop ?? 0 } }); setSelected(null); }}><Icon name="check"/> Save to Evidence</button>}
        {onGraph && <button className="button button-secondary" onClick={() => { onGraph(); setSelected(null); }}>View in Graph</button>}
      </div>
    </div>}</Drawer>
  </div>;
}

function Detail({ label, children }) { return <div className="evidence-row"><span>{label}</span><div>{children}</div></div>; }
