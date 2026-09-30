import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Badge, Button, EmptyState } from './Primitives.jsx';
import { assetFlowSummary, assetSummary, counterpartySummary, formatAmount, formatDate, shortAddress, timelineBuckets, unique, visualizationEvents } from '../utils.js';

const MODES = [
  ['flow', 'Fund flow'], ['temporal', 'Temporal'], ['topology', 'Topology'], ['patterns', 'Patterns'],
  ['counterparties', 'Counterparties'], ['assets', 'Assets'], ['risk', 'Risk'], ['relationships', 'Relationships']
];

const txId = tx => String(tx?.hash || tx?.transaction_hash || `${tx?.from}-${tx?.to}-${tx?.timestamp}`);

function TemporalCanvas({ events, selected, onSelect }) {
  const buckets = useMemo(() => timelineBuckets(events), [events]);
  const max = Math.max(1, ...buckets.map(item => item.count));
  if (!buckets.length) return <EmptyState title="No timestamped transfer evidence" description="The active filters do not contain transfers with usable timestamps."/>;
  return <div className="studio-temporal"><div className="studio-axis-label"><span>{formatDate(events[0]?.timestamp)}</span><span>{formatDate(events.at(-1)?.timestamp)}</span></div><svg viewBox="0 0 920 310" role="img" aria-label="Chronological transfer-density visualization">
    <defs><linearGradient id="studio-river" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#35d596" stopOpacity=".75"/><stop offset="1" stopColor="#35d596" stopOpacity=".06"/></linearGradient></defs>
    {[60, 130, 200, 270].map(y => <line key={y} x1="40" x2="890" y1={y} y2={y} className="studio-gridline"/>)}
    {buckets.map((item, index) => { const width = 820 / buckets.length, height = (item.count / max) * 190, x = 56 + index * width, y = 260 - height; const active = item.events.some(tx => txId(tx) === txId(selected)); return <g key={item.index} className={`studio-bar ${active ? 'active' : ''}`} onClick={() => onSelect(item.events[0])} tabIndex="0" role="button"><rect x={x} y={y} width={Math.max(10, width - 8)} height={height} rx="5" fill="url(#studio-river)"/><text x={x + 4} y="286">{item.count}</text></g>; })}
    <line x1="40" x2="890" y1="260" y2="260" className="studio-axis"/>
  </svg><p>Each column is a chronological evidence bucket. Select a bucket to focus its first provider-observed transfer; density is transfer count, not value.</p></div>;
}

function FlowCanvas({ events, selected, onSelect, activeIndex }) {
  if (!events.length) return <EmptyState title="No flow evidence under these filters" description="TraceX does not synthesize movement when no qualifying provider-observed transfer exists."/>;
  const visible = events.slice(Math.max(0, activeIndex - 2), activeIndex + 3);
  return <div className="studio-flow" aria-label="Chronological fund-flow replay">
    <div className="studio-flow-rail"/>
    {visible.map(tx => { const active = txId(tx) === txId(selected); return <button key={txId(tx)} className={`studio-transfer ${active ? 'active' : ''}`} onClick={() => onSelect(tx)}><span className="studio-transfer-dot"/><time>{formatDate(tx.timestamp)}</time><div><strong>{shortAddress(tx.from)}</strong><i><Icon name="arrow" size={16}/></i><strong>{shortAddress(tx.to)}</strong></div><b>{formatAmount(tx.amount)} {tx.asset}</b><small>Hop {tx.hop ?? 0} · {tx.provider || 'Provider unknown'}</small></button>; })}
    <p>Movement markers correspond one-to-one with the selected transfer evidence.</p>
  </div>;
}

function TopologyCanvas({ graph, onSelect }) {
  const nodes = (graph?.nodes || []).slice(0, 16), edges = (graph?.edges || []).filter(edge => nodes.some(node => node.id === edge.source) && nodes.some(node => node.id === edge.target)).slice(0, 24);
  const positions = new Map(nodes.map((node, index) => { const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length) - Math.PI / 2; return [node.id, { x: 460 + Math.cos(angle) * 310, y: 245 + Math.sin(angle) * 155, node }]; }));
  if (!nodes.length) return <EmptyState title="No network topology available" description="A graph appears once the case contains connected observed transfer evidence."/>;
  return <div className="studio-topology"><svg viewBox="0 0 920 490" role="img" aria-label="Observed network topology"><defs><marker id="studio-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 8 4 0 8Z" fill="#4d8065"/></marker></defs>{edges.map((edge, index) => { const a = positions.get(edge.source), b = positions.get(edge.target); return a && b ? <line key={`${edge.source}-${edge.target}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd="url(#studio-arrow)"/> : null; })}{[...positions.values()].map(({ x, y, node }) => <g key={node.id} className="studio-node" transform={`translate(${x} ${y})`} onClick={() => onSelect(node)} role="button" tabIndex="0"><circle r="25"/><text y="45">{shortAddress(node.address || node.label || node.id, 6, 4)}</text></g>)}</svg><p>Solid links are observed graph relationships; this view does not assert ownership or intent.</p></div>;
}

export default function IntelligenceStudio({ investigation, network, onTab, onCapture }) {
  const [mode, setMode] = useState('flow');
  const [asset, setAsset] = useState('all');
  const [riskOnly, setRiskOnly] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const events = useMemo(() => visualizationEvents(investigation.transactions, { asset, riskOnly, indicators: investigation.suspicious_activity?.indicators }), [investigation, asset, riskOnly]);
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = events[Math.min(activeIndex, Math.max(0, events.length - 1))] || null;
  const assets = unique(investigation.transactions?.map(tx => tx.asset));
  const flows = useMemo(() => assetFlowSummary(events, asset).slice(0, 7), [events, asset]);
  const counterparties = useMemo(() => counterpartySummary(events).slice(0, 8), [events]);
  const risk = investigation.risk?.breakdown || [];

  useEffect(() => { setActiveIndex(0); setPlaying(false); }, [asset, riskOnly, mode]);
  useEffect(() => { if (!playing || events.length < 2) return undefined; const timer = window.setInterval(() => setActiveIndex(index => index >= events.length - 1 ? (setPlaying(false), index) : index + 1), 1000 / speed); return () => window.clearInterval(timer); }, [playing, events.length, speed]);
  const select = item => { const index = events.findIndex(tx => txId(tx) === txId(item)); if (index >= 0) setActiveIndex(index); };

  const inspector = selected ? <>
    <span className="studio-inspector-label">SELECTED EVIDENCE</span><Badge tone="success" dot>Provider observed</Badge><h3>{formatAmount(selected.amount)} {selected.asset}</h3><dl><div><dt>Transfer</dt><dd>{shortAddress(selected.hash || selected.transaction_hash || 'No hash')}</dd></div><div><dt>From</dt><dd>{shortAddress(selected.from)}</dd></div><div><dt>To</dt><dd>{shortAddress(selected.to)}</dd></div><div><dt>Observed at</dt><dd>{formatDate(selected.timestamp)}</dd></div><div><dt>Provenance</dt><dd>{selected.provider || investigation.provider?.selected || 'Not recorded'}</dd></div></dl><div className="studio-inspector-actions"><Button variant="secondary" onClick={() => onTab('transactions')}>Open transaction</Button>{onCapture && <Button variant="ghost" onClick={() => onCapture({ evidence_type: 'VISUALIZED_TRANSFER', title: `Studio transfer: ${formatAmount(selected.amount)} ${selected.asset}`, transaction_hash: selected.hash || selected.transaction_hash, wallet_address: selected.from, source_provider: selected.provider || investigation.provider?.selected, snapshot: selected })}>Capture evidence</Button>}</div>
  </> : <EmptyState title="Select evidence" description="Choose a visual object to reveal its provenance and available actions."/>;

  const renderCanvas = () => {
    if (mode === 'flow') return <FlowCanvas events={events} selected={selected} onSelect={select} activeIndex={activeIndex}/>;
    if (mode === 'temporal') return <TemporalCanvas events={events} selected={selected} onSelect={select}/>;
    if (mode === 'topology') return <TopologyCanvas graph={investigation.graph} onSelect={node => onTab('fund-flow')}/>;
    if (mode === 'patterns') return <div className="studio-patterns">{(investigation.suspicious_activity?.indicators || []).map((item, index) => <button key={`${item.type}-${index}`} onClick={() => onTab('patterns')}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{item.message}</b><small>{item.supporting_transactions?.length || 0} supporting transaction reference(s) · {item.source || 'TraceX rules'}</small></div><Icon name="arrow"/></button>)}{!(investigation.suspicious_activity?.indicators || []).length && <EmptyState title="No rule detections" description="No detector rule was triggered by the active stored case evidence."/>}</div>;
    if (mode === 'counterparties') return <div className="studio-constellation"><div className="constellation-subject">SUBJECT<br/><b>{shortAddress(investigation.start_wallet)}</b></div>{counterparties.map((item, index) => <button key={item.address} style={{ '--angle': `${(360 / Math.max(1, counterparties.length)) * index}deg` }} onClick={() => onTab('transactions')}><b>{shortAddress(item.address, 6, 4)}</b><small>{item.count} observed interactions</small></button>)}<p>Distance is not a risk score. Each orbit item is an observed counterparty, sized by interaction count in the inspector list.</p></div>;
    if (mode === 'assets') return <div className="studio-asset-flow">{assetSummary(events).map(item => <button key={item.asset} onClick={() => setAsset(item.asset)}><span>{item.asset}</span><b>{item.count} transfers</b><small>IN {formatAmount(item.incoming)} · OUT {formatAmount(item.outgoing)}</small></button>)}{!events.length && <EmptyState title="No asset evidence" description="No asset-specific transfer evidence matches the current filters."/>}</div>;
    if (mode === 'risk') return <div className="studio-risk-map"><div className="risk-total"><span>EXPLAINABLE RISK</span><b>{investigation.risk?.score ?? 0}<small>/100</small></b><p>{investigation.risk?.level || 'UNKNOWN'} investigative priority</p></div><div>{risk.map((item, index) => <button key={`${item.type}-${index}`} onClick={() => onTab('risk')}><span>{String(item.type || 'rule').replaceAll('_', ' ')}</span><b>+{item.points || 0}</b><small>{item.supporting_transactions?.length || 0} supporting references</small></button>)}</div></div>;
    return <div className="studio-relationships">{network?.related_cases?.length ? network.related_cases.map(item => <button key={item.case_id} onClick={() => onTab('fraud-network')}><span>CASE</span><div><b>{item.case_label || item.case_id}</b><small>{item.reasons?.length || 0} grounded relationship reason(s)</small></div><strong>{item.similarity_score}/100</strong></button>) : <EmptyState title="No stored cross-case relationship" description="No case met the configured shared-infrastructure threshold."/>}</div>;
  };

  return <section className="intelligence-studio">
    <header className="studio-header"><div><span>CASE INTELLIGENCE STUDIO</span><h2>{investigation.investigation_id?.slice(-10).toUpperCase()} · {shortAddress(investigation.start_wallet)}</h2></div><div><Badge tone="neutral">{asset === 'all' ? 'ALL ASSETS' : asset}</Badge><Badge tone="purple">{events.length} EVIDENCE EVENTS</Badge></div></header>
    <div className="studio-layout"><aside className="studio-controls"><span>VISUALIZATION</span>{MODES.map(([id, label]) => <button key={id} className={mode === id ? 'active' : ''} onClick={() => setMode(id)}>{label}<Icon name="chevron" size={14}/></button>)}<hr/><label>Asset<select value={asset} onChange={event => setAsset(event.target.value)}><option value="all">All assets</option>{assets.map(value => <option key={value}>{value}</option>)}</select></label><label className="studio-check"><input type="checkbox" checked={riskOnly} onChange={event => setRiskOnly(event.target.checked)}/> Evidence linked to a detector</label><small>All visual objects are generated from stored case evidence under the active filters.</small></aside>
      <main className="studio-canvas"><header><div><span>{mode.toUpperCase()} VIEW</span><strong>{mode === 'flow' ? 'Chronological transfer path' : 'Evidence-derived analysis'}</strong></div>{mode === 'flow' && <div className="studio-playback"><button onClick={() => setActiveIndex(value => Math.max(0, value - 1))} aria-label="Previous transfer">‹</button><button className="play" onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause animation' : 'Play animation'}><Icon name={playing ? 'pause' : 'play'} size={15}/>{playing ? 'Pause' : 'Replay'}</button><button onClick={() => setActiveIndex(value => Math.min(events.length - 1, value + 1))} aria-label="Next transfer">›</button>{[0.5, 1, 2, 4].map(value => <button key={value} className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)}>{value}×</button>)}</div>}</header>{renderCanvas()}</main>
      <aside className="studio-inspector">{inspector}</aside>
    </div>
    <footer className="studio-evidence-strip"><span>PATH / EVIDENCE STRIP</span>{flows.length ? flows.map(flow => <button key={`${flow.from}-${flow.to}-${flow.asset}`} onClick={() => onTab('transactions')}><b>{shortAddress(flow.from, 5, 4)} → {shortAddress(flow.to, 5, 4)}</b><small>{flow.count} transfer(s) · {flow.asset}</small></button>) : <small>No comparable asset flow is available for the active evidence filter.</small>}</footer>
  </section>;
}
