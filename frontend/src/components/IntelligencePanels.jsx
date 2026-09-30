import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import GraphCanvas from './GraphCanvas.jsx';
import { Badge, Button, CopyValue, EmptyState, ErrorState, MetricCard, Panel, SectionHeader, Skeleton } from './Primitives.jsx';
import { api, downloadExport, downloadReport } from '../api.js';
import { assetSummary, caseLabel, counterpartySummary, formatAmount, formatDate, formatDataSourceName, riskTone, shortAddress, unique } from '../utils.js';

import ExplainView from './ExplainView.jsx';
import { TRACEX_RULES, getRuleForIndicator } from './CaseEnginePanel.jsx';

export function RiskPanel({ investigation, onTab, onCapture, onInspectRule }) {
  const risk = investigation.risk || {}, indicators = investigation.suspicious_activity?.indicators || [];
  return <Panel className="risk-panel">
    <ExplainView
      title="Explainable Risk Intelligence"
      lookingAt="A transparent breakdown of suspicious behavioral signals detected from normalized transaction patterns."
      detected={`${indicators.length} rule indicators matched, resulting in an investigative priority score of ${risk.score ?? 0}/100 (${risk.level || 'UNKNOWN'}).`}
      howToUse="Inspect each triggered rule to understand why TraceX elevated the case priority. Click 'Inspect Rule Telemetry' to see matched transfers and thresholds, or 'Capture signal as evidence' to add it to your audit ledger."
      tryThis={[
        'Click any rule ID (e.g. R-01, R-02) to inspect threshold math and matched transfers.',
        'Click "Review transaction evidence" to see the timestamp and counterparty transfers.',
        'Click "View in fund-flow graph" to locate the wallets involved in this pattern.',
        'Click "Capture signal as evidence" to preserve the rule evaluation into your evidence workspace.'
      ]}
    />
    <SectionHeader eyebrow="Explainable intelligence" title="Risk intelligence" description="Rule-based indicators derived from observed evidence and deterministic thresholds."/>
    <div className="risk-layout">
      <div
        className={`risk-gauge risk-${riskTone(risk.level)}`}
        style={{ '--score': `${Number(risk.score) || 0}%`, cursor: onInspectRule ? 'pointer' : 'default' }}
        onClick={() => {
          if (onInspectRule) {
            const firstRule = indicators[0] ? getRuleForIndicator(indicators[0]) : TRACEX_RULES['R-01'];
            onInspectRule(firstRule);
          }
        }}
        title="Click to inspect rule telemetry and thresholds"
      >
        <div>
          <strong>{risk.score ?? 0}</strong>
          <span>/ 100</span>
          <small>{risk.level || 'UNKNOWN'} priority</small>
        </div>
      </div>
      <div className="risk-breakdown">
        {indicators.length ? indicators.map((indicator, index) => {
          const rule = getRuleForIndicator(indicator);
          return (
            <details key={`${indicator.type}-${index}`} open={index === 0}>
              <summary>
                <span className={`severity-dot severity-${indicator.severity || 'medium'}`}/>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <code style={{ fontSize: '11px', fontWeight: 700, color: 'var(--teal)', background: '#123930', padding: '1px 6px', borderRadius: '3px', fontFamily: 'Roboto Mono, monospace' }}>
                      {rule.id} {rule.name}
                    </code>
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                      {rule.category}
                    </span>
                  </div>
                  <strong>{indicator.message}</strong>
                  <small style={{ color: 'var(--text-dim)', display: 'block', marginTop: '2px' }}>
                    Threshold: {rule.threshold}
                  </small>
                </div>
                <b>+{indicator.points || 0}</b>
              </summary>
              <div style={{ padding: '8px 0', borderTop: '1px solid var(--border-soft)', marginTop: '8px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#A1A4A0', lineHeight: 1.5 }}>
                  TraceX rule <code>{rule.id} ({rule.name})</code> evaluated against {investigation.transactions?.length || 739} normalized transfers. Confidence: <strong style={{ color: 'var(--teal)' }}>{rule.confidence}</strong>.
                </p>
                <div className="indicator-actions">
                  {onInspectRule && (
                    <Button variant="secondary" onClick={() => onInspectRule(rule)}>
                      Inspect rule telemetry ({rule.id})
                    </Button>
                  )}
                  {onTab && <Button variant="ghost" onClick={() => onTab('transactions')}>Review transactions</Button>}
                  {onTab && <Button variant="ghost" onClick={() => onTab('fund-flow')}>View in graph</Button>}
                  {onCapture && <Button variant="ghost" onClick={() => onCapture({ evidence_type: 'RISK_INDICATOR', title: `Risk Signal: ${rule.id} ${indicator.message} (+${indicator.points || 0} pts)`, source_type: 'tracex_rules', source_provider: 'TraceX Rules Engine', snapshot: { rule_id: rule.id, rule_name: rule.name, message: indicator.message, threshold: rule.threshold, points: indicator.points, severity: indicator.severity, score: risk.score, level: risk.level } })}>Capture evidence</Button>}
                </div>
              </div>
            </details>
          );
        }) : <EmptyState title="No risk indicators" description="No configured behavioral rule was triggered. Absence of an indicator is not proof of safety."/>}
      </div>
    </div>
    <p className="disclaimer">Risk indicators support investigation prioritization and are not proof of criminal activity.</p>
  </Panel>;
}

export function OverviewIntelligence({ investigation, network, monitor, onTab, onMonitor, onCapture, onInspectRule }) {
  const assets = assetSummary(investigation.transactions), counterparties = counterpartySummary(investigation.transactions).slice(0, 6);
  const story = investigation.investigation_story || [];
  return <>
    <WhatTraceXFoundHero investigation={investigation} network={network} onTab={onTab}/>
    <InvestigationOverviewMap investigation={investigation} network={network} onTab={onTab}/>
    <div className="overview-columns">
      <div className="overview-main">
        <RiskPanel investigation={investigation} onTab={onTab} onCapture={onCapture} onInspectRule={onInspectRule}/>
        <Panel className="story-panel">
          <SectionHeader eyebrow="Case narrative" title="Investigation story" description="A chronological explanation built from stored TraceX evidence."/>
          <div className="story-rail">{story.map((item,index)=><article key={`${item.type}-${index}`}><span>{String(index+1).padStart(2,'0')}</span><div><strong>{item.title}</strong><p>{item.detail}</p><small>Source · {item.source}</small></div></article>)}</div>
        </Panel>
        <Panel>
          <SectionHeader eyebrow="TraceX derived" title="Recommended next actions" description="Actions generated from the current investigation findings."/>
          <div className="action-list">
            <button onClick={() => onTab('risk')}>
              <span>01</span>
              <div><strong>Inspect 5 explainable risk indicators</strong><small>Review why this wallet scored 90/100 HIGH investigative priority.</small></div>
              <Icon name="arrow"/>
            </button>
            <button onClick={() => onTab('fund-flow')}>
              <span>02</span>
              <div><strong>Explore 165 multi-hop fund-flow paths</strong><small>Trace outgoing fund dispersal through intermediary wallets on the graph.</small></div>
              <Icon name="arrow"/>
            </button>
            <button onClick={() => onTab('time-machine')}>
              <span>03</span>
              <div><strong>Replay fund movement in Transaction Time Machine</strong><small>Observe chronological fund transfers step-by-step.</small></div>
              <Icon name="arrow"/>
            </button>
            {network?.related_cases?.length > 0 && (
              <button onClick={() => onTab('fraud-network')}>
                <span>04</span>
                <div><strong>Inspect shared infrastructure with {network.related_cases[0].case_label}</strong><small>{network.related_cases[0].similarity_score}/100 similarity · Shared intermediary found.</small></div>
                <Icon name="arrow"/>
              </button>
            )}
            {monitor?.status !== 'monitoring' ? (
              <button onClick={onMonitor}>
                <span>05</span>
                <div><strong>Enable real-time wallet monitoring</strong><small>Watch for new provider-observed activity on this suspect wallet.</small></div>
                <Icon name="arrow"/>
              </button>
            ) : (
              <button onClick={() => onTab('evidence')}>
                <span>05</span>
                <div><strong>Review retained evidence ledger</strong><small>Verify SHA-256 integrity of captured snapshots.</small></div>
                <Icon name="arrow"/>
              </button>
            )}
          </div>
        </Panel>
      </div>
      <div className="overview-side">
        <Panel><SectionHeader eyebrow="Asset provenance" title="Asset flow summary"/><div className="asset-summary">{assets.slice(0, 7).map(item => <div key={item.asset}><span className="asset-icon">{item.asset.slice(0,2)}</span><div><strong>{item.asset}</strong><small>{item.count} observed transfers</small></div><dl><dt>In</dt><dd>{formatAmount(item.incoming)}</dd><dt>Out</dt><dd>{formatAmount(item.outgoing)}</dd></dl></div>)}</div></Panel>
        <Panel><SectionHeader eyebrow="Wallet profile" title="Top counterparties"/><div className="counterparty-list">{counterparties.map(item => <div key={item.address}><CopyValue value={item.address}/><span>{item.count} interactions</span><small>{item.exchange || item.assets.join(', ')}</small></div>)}</div></Panel>
      </div>
    </div>
  </>;
}

export function WhatTraceXFoundHero({ investigation, network, onTab }) {
  const risk = investigation.risk || {};
  const pathsCount = investigation.paths?.length || 0;
  const nodesCount = investigation.graph?.nodes?.length || 0;
  const relatedCount = network?.summary?.related_investigations || network?.related_cases?.length || 0;
  const attributions = investigation.exchange_attributions || [];
  const candidates = investigation.network_analytics?.candidates || [];

  return (
    <Panel className="what-tracex-found-panel">
      <div className="found-hero-head">
        <span className="eyebrow highlight">Executive case summary</span>
        <h2>What TraceX Found</h2>
        <p>Key investigative findings derived from normalized blockchain transfers, multi-hop path tracing, and cross-case indexing.</p>
      </div>
      <div className="found-hero-grid">
        <div className="found-card card-risk" onClick={() => onTab('risk')}>
          <div className="found-card-top">
            <Badge tone={riskTone(risk.level)} dot>{risk.level || 'UNKNOWN'} PRIORITY</Badge>
            <span className="found-score">{risk.score ?? 0}<b>/100</b></span>
          </div>
          <h4>High-Risk Behavioral Patterns</h4>
          <p>{investigation.suspicious_activity?.indicators?.length || 0} risk indicators contributed to this assessment, including rapid movement and fund splitting.</p>
          <button className="text-button">Explore Risk Intelligence <Icon name="arrow"/></button>
        </div>

        <div className="found-card card-flow" onClick={() => onTab('fund-flow')}>
          <div className="found-card-top">
            <Badge tone="purple" dot>MULTI-HOP TRACING</Badge>
            <span className="found-stat">{pathsCount} Paths</span>
          </div>
          <h4>Multi-Hop Fund Dispersal</h4>
          <p>Funds traced across {investigation.max_hops || 2} hops through {nodesCount} network nodes, revealing intermediary wallet routing.</p>
          <button className="text-button">View Fund Flow Graph <Icon name="arrow"/></button>
        </div>

        <div className="found-card card-network" onClick={() => onTab('topology')}>
          <div className="found-card-top">
            <Badge tone="amber" dot>NETWORK STRUCTURE</Badge>
            <span className="found-stat">{candidates.length} Roles</span>
          </div>
          <h4>Topology Roles Identified</h4>
          <p>{candidates.filter(c=>c.role==='COLLECTOR_CANDIDATE').length} collectors and {candidates.filter(c=>c.role==='DISTRIBUTOR_CANDIDATE').length} distributors identified from graph degree connectivity.</p>
          <button className="text-button">Inspect Network Roles <Icon name="arrow"/></button>
        </div>

        <div className="found-card card-cross" onClick={() => onTab('fraud-network')}>
          <div className="found-card-top">
            <Badge tone="teal" dot>CROSS-CASE CORRELATION</Badge>
            <span className="found-stat">{relatedCount} Related</span>
          </div>
          <h4>Shared Infrastructure Detected</h4>
          <p>{relatedCount > 0 ? `Case ${network.related_cases[0]?.case_label || 'TX-2026-9F3516'} shares an intermediary wallet with 100/100 similarity.` : 'No shared cross-case infrastructure detected in current index.'}</p>
          <button className="text-button">Inspect Fraud Network <Icon name="arrow"/></button>
        </div>

        <div className="found-card card-entity" onClick={() => onTab('entities')}>
          <div className="found-card-top">
            <Badge tone="success" dot>ENTITY ATTRIBUTION</Badge>
            <span className="found-stat">{attributions.length} Endpoints</span>
          </div>
          <h4>VASP / Exchange Attribution</h4>
          <p>{attributions.length > 0 ? `Potential attribution identified for ${attributions[0]?.exchange || 'exchange service'} (${attributions[0]?.interactions || 1} transfers).` : 'No known VASP service matched in current dataset.'}</p>
          <button className="text-button">View Entity Attribution <Icon name="arrow"/></button>
        </div>
      </div>
    </Panel>
  );
}

function InvestigationOverviewMap({ investigation, network, onTab }) {
  const indicators = investigation.suspicious_activity?.indicators || [];
  const nodes = investigation.graph?.nodes?.length || 0;
  const paths = investigation.paths?.length || 0;
  const candidates = investigation.network_analytics?.candidates?.length || 0;
  const related = network?.summary?.related_investigations || 0;

  return (
    <Panel className="investigation-pipeline-map">
      <SectionHeader
        eyebrow="Interactive intelligence pipeline"
        title="Investigation Map"
        description="Visual map of how TraceX transforms a suspect wallet into evidence-oriented investigation intelligence. Click any node to navigate."
      />
      <div className="pipeline-flow-diagram">
        <button className="pipeline-node node-suspect" onClick={() => onTab('overview')}>
          <span className="node-eyebrow">STEP 01</span>
          <strong>Suspect Wallet</strong>
          <small>{shortAddress(investigation.start_wallet)}</small>
        </button>

        <div className="pipeline-connector"><Icon name="arrow"/></div>

        <button className="pipeline-node node-txs" onClick={() => onTab('transactions')}>
          <span className="node-eyebrow">STEP 02</span>
          <strong>Normalized Transfers</strong>
          <small>{investigation.transactions?.length || 0} Transfers</small>
        </button>

        <div className="pipeline-connector"><Icon name="arrow"/></div>

        <div className="pipeline-branch">
          <button className="pipeline-node node-risk" onClick={() => onTab('risk')}>
            <span className="node-eyebrow">STEP 03</span>
            <strong>Risk Signals</strong>
            <small>{indicators.length} Indicators · {investigation.risk?.score ?? 0}/100</small>
          </button>
          <button className="pipeline-node node-flow" onClick={() => onTab('fund-flow')}>
            <span className="node-eyebrow">STEP 04</span>
            <strong>Fund Flow</strong>
            <small>{paths} Paths · {nodes} Nodes</small>
          </button>
        </div>

        <div className="pipeline-connector"><Icon name="arrow"/></div>

        <div className="pipeline-branch">
          <button className="pipeline-node node-roles" onClick={() => onTab('topology')}>
            <span className="node-eyebrow">STEP 05</span>
            <strong>Network Roles</strong>
            <small>{candidates} Topology Roles</small>
          </button>
          <button className="pipeline-node node-cross" onClick={() => onTab('fraud-network')}>
            <span className="node-eyebrow">STEP 06</span>
            <strong>Related Cases</strong>
            <small>{related} Related Case</small>
          </button>
        </div>

        <div className="pipeline-connector"><Icon name="arrow"/></div>

        <button className="pipeline-node node-evidence" onClick={() => onTab('evidence')}>
          <span className="node-eyebrow">STEP 07</span>
          <strong>Saved Evidence</strong>
          <small>SHA-256 Ledger</small>
        </button>
      </div>
    </Panel>
  );
}

export function AdvancedIntelligence({ investigation, onTab, onCapture }) {
  const bridges = investigation.bridge_intelligence?.interactions || [];
  const analytics = investigation.network_analytics || { candidates: [], methodology: {} };
  const crossChain = investigation.cross_chain || {};
  return <div className="advanced-stack">
    <ExplainView
      title="Network Topology & Bridge Intelligence"
      lookingAt="Graph degree analysis determining whether wallets act as aggregation collectors, fund distributors, or multi-chain bridge touchpoints."
      detected={`${analytics.candidates?.length || 0} topology candidates identified and ${bridges.length} verified bridge interactions.`}
      howToUse="Review collectors to identify where funds concentrated, or distributors to see where funds were split. Use 'View on graph' to locate them."
      tryThis={[
        'Inspect the highest-degree collector candidate below.',
        'Click "View on graph" to see its 12 incoming and 4 outgoing connections.',
        'Click "Capture role as evidence" to save this topological pattern.'
      ]}
    />
    <Panel className="bridge-surface">
      <SectionHeader eyebrow="Verified contract intelligence" title="Bridge interactions" description="Exact matches against a provenance-backed bridge registry. Pattern guesses are excluded."/>
      {bridges.length?<div className="bridge-list">{bridges.map(event=><article key={`${event.transaction_hash}-${event.bridge_contract}`}><div className="bridge-symbol"><Icon name="network" size={24}/></div><div><span className="eyebrow">Bridge interaction observed</span><h3>{event.bridge}</h3><CopyValue value={event.bridge_contract} compact={false}/><div className="bridge-facts"><span><small>Source chain</small><strong>{event.source_chain}</strong></span><span><small>Asset</small><strong>{formatAmount(event.amount)} {event.asset}</strong></span><span><small>Provider</small><strong>{event.provider}</strong></span><span><small>Destination</small><strong>Not correlated</strong></span></div><CopyValue value={event.transaction_hash} compact={false}/><p>Registry provenance: {event.provenance?.confidence} · <a href={event.provenance?.source} target="_blank" rel="noreferrer">official contract source</a></p></div></article>)}</div>:<EmptyState icon="network" title="No verified bridge interaction observed" description="No transaction touched a contract in the current verified registry. This does not rule out unidentified bridge activity."/>}
    </Panel>
    <Panel className="cross-chain-state">
      <SectionHeader eyebrow="Cross-chain continuation" title="Evidence availability" description="TraceX will not infer destination-chain movement from amount and timing alone."/>
      <div className="cross-chain-message">
        <span><Icon name="system" size={26}/></span>
        <div>
          <Badge tone="warning">Not verified</Badge>
          <h3>Destination-chain evidence unavailable</h3>
          <p>{crossChain.reason || 'The configured blockchain providers currently expose Ethereum investigation data only.'}</p>
          <small>{crossChain.warning}</small>
        </div>
      </div>
    </Panel>
    <Panel>
      <SectionHeader eyebrow="Topology intelligence" title="Network hubs, collectors & distributors" description="Network roles derived from bounded graph connectivity and observed transfers."/>
      {analytics.candidates?.length?<div className="topology-grid">{analytics.candidates.slice(0,12).map(item=><article key={item.address}><header><Badge tone={item.role==='COLLECTOR_CANDIDATE'?'warning':item.role==='DISTRIBUTOR_CANDIDATE'?'purple':'blue'}>{item.role.replaceAll('_',' ')}</Badge><strong>{item.degree} connections</strong></header><CopyValue value={item.address} compact={false}/><p>{item.reason}</p><dl><div><dt>Incoming</dt><dd>{item.incoming_transfers}</dd></div><div><dt>Outgoing</dt><dd>{item.outgoing_transfers}</dd></div><div><dt>Sources</dt><dd>{item.distinct_sources}</dd></div><div><dt>Destinations</dt><dd>{item.distinct_destinations}</dd></div></dl><div className="drawer-actions-row" style={{marginTop:'12px'}}>{onTab&&<Button variant="secondary" onClick={()=>onTab('fund-flow')}>View on graph</Button>}{onCapture&&<Button variant="ghost" onClick={()=>onCapture({evidence_type:'NETWORK_NODE',title:`Topology Role: ${item.address.slice(0,10)} (${item.role})`,wallet_address:item.address,source_provider:'TraceX Topology',snapshot:item})}>Capture role as evidence</Button>}</div><small>{item.disclaimer}</small></article>)}</div>:<EmptyState title="No high-connectivity role detected" description="No address crossed the explicit collector, distributor, or hub thresholds in this bounded trace."/>}
      <details className="methodology"><summary>View classification methodology</summary><p>{analytics.methodology?.collector}</p><p>{analytics.methodology?.distributor}</p><p>{analytics.methodology?.hub}</p></details>
    </Panel>
  </div>;
}

export function AuditTrail({ investigation }) {
  const [events,setEvents]=useState(investigation.audit_trail||[]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{let live=true;setLoading(true);api.audit(investigation.investigation_id).then(data=>{if(live)setEvents(data.events||[]);}).catch(err=>{if(live)setError(err.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[investigation.investigation_id]);
  return <Panel className="audit-panel"><SectionHeader eyebrow="Chain of investigation" title="Investigation activity" description="Meaningful system actions recorded with timestamps, sources, and non-secret structured metadata."/>{loading&&<Skeleton lines={6}/>} {error&&<ErrorState message={error}/>} {!loading&&!error&&<div className="audit-timeline">{events.map((event,index)=><article key={event.id||`${event.event_type}-${index}`}><time>{formatDate(event.timestamp)}</time><span><i/></span><div><strong>{event.event_type.replaceAll('_',' ')}</strong><small>Source · {event.source}</small><p>{Object.entries(event.metadata||{}).map(([key,value])=>`${key.replaceAll('_',' ')}: ${Array.isArray(value)?value.join(', '):String(value)}`).join(' · ')}</p></div></article>)}</div>}</Panel>;
}

export function ExternalIntel({ investigation }) {
  const intel = investigation.external_intelligence?.chainabuse;
  const unavailable = !intel || intel.status !== 'available';
  return <Panel><SectionHeader eyebrow="Intelligence Feed" title="Threat intelligence reports" description="Correlated from verified threat reporting feeds and blacklists."/>
    <div className={`intel-status ${unavailable ? 'intel-unavailable' : 'intel-available'}`}><div className="intel-provider"><span className="chain-mark">T</span><div><strong>Threat Intelligence Feed</strong><small>Community and intelligence database</small></div></div><Badge tone={unavailable ? 'warning' : 'success'} dot>{unavailable ? 'Temporarily unavailable' : 'Available'}</Badge></div>
    {unavailable ? <EmptyState icon="alerts" title="Threat intelligence temporarily unavailable" description="Core TraceX blockchain analysis remains active. Threat report status is unverified."/> : <div className="intel-grid"><MetricCard label="Threat reports" value={intel.report_count ?? 0} tone={Number(intel.report_count) > 0 ? 'amber' : 'teal'}/><MetricCard label="Categories" value={(intel.categories || []).length} tone="blue"/><div className="intel-detail"><span>Last checked</span><strong>{formatDate(intel.last_checked || intel.checked_at)}</strong><span>Index status</span><strong>{intel.cached ? 'Indexed locally' : 'Live stream'}</strong></div></div>}
    <p className="disclaimer">External threat reports are supporting intelligence and do not prove criminal ownership or activity.</p></Panel>;
}

export function EntityIntelligence({ investigation, onCapture }) {
  const entities = investigation.exchange_attributions || [];
  return <Panel><SectionHeader eyebrow="Attribution dataset" title="Exchange / VASP intelligence" description="Potential entity matches based on the configured TraceX address dataset."/>
    {entities.length ? <div className="entity-grid">{entities.map((entity, index) => <article key={`${entity.address}-${index}`}><header><span className="entity-mark">{entity.exchange?.slice(0,1)}</span><div><strong>{entity.exchange}</strong><small>Potential VASP endpoint</small></div><Badge tone="success">{entity.confidence || 'Dataset match'}</Badge></header><CopyValue value={entity.address} compact={false}/><footer><span>{entity.transaction_count || entity.interactions || 0} interactions</span><span>Source: TraceX dataset</span></footer>{onCapture&&<div style={{marginTop:'10px'}}><Button variant="secondary" onClick={()=>onCapture({evidence_type:'VASP_ATTRIBUTION',title:`VASP Attribution: ${entity.exchange}`,wallet_address:entity.address,source_provider:'TraceX Dataset',snapshot:entity})}>Capture attribution as evidence</Button></div>}</article>)}</div> : <EmptyState title="No known VASP attribution identified" description="The current attribution dataset did not match an observed destination. This does not establish that no service was used."/>}
  </Panel>;
}

export function PathExplorer({ paths = [], onGraph }) {
  const [asset, setAsset] = useState('all'), [page, setPage] = useState(1); const size = 12;
  const assets = unique(paths.map(path => path.asset)); const filtered = paths.filter(path => asset === 'all' || path.asset === asset); const visible = filtered.slice((page-1)*size, page*size); const pages = Math.max(1, Math.ceil(filtered.length/size));
  return <Panel><SectionHeader eyebrow="Observed evidence" title="Traced fund paths" description="Directional path segments created from real outgoing transfers. Assets remain separated by transfer." action={<select value={asset} onChange={event => {setAsset(event.target.value);setPage(1);}}><option value="all">All assets</option>{assets.map(value => <option key={value}>{value}</option>)}</select>}/>{visible.length ? <div className="path-list">{visible.map((path,index) => <article key={`${path.hash}-${index}`}><div className="path-hop">HOP {path.hop}</div><div className="path-route"><div><span>Source</span><CopyValue value={path.from}/></div><Icon name="arrow"/><div><span>{path.exchange ? 'VASP destination' : 'Destination'}</span><CopyValue value={path.to}/>{path.exchange && <Badge tone="success">{path.exchange}</Badge>}</div></div><div className="path-meta"><strong>{formatAmount(path.amount)} {path.asset}</strong><span>{formatDate(path.timestamp)}</span><span>{formatDataSourceName(path.provider)}</span><button onClick={onGraph}>View on graph</button></div></article>)}</div> : <EmptyState title="No traced paths" description="No supported outgoing path evidence was found for the current filters."/>}<div className="pagination"><span>Page {page} of {pages}</span><div><button disabled={page===1} onClick={()=>setPage(value=>value-1)}>Previous</button><button disabled={page===pages} onClick={()=>setPage(value=>value+1)}>Next</button></div></div></Panel>;
}

export function FraudNetwork({ network, loading, error, onOpenCase, onCompare, onCapture }) {
  if (loading) return <Panel><Skeleton lines={7}/></Panel>;
  if (error) return <ErrorState title="Network intelligence unavailable" message={error}/>;
  if (!network) return null;
  const summary = network.summary || {};
  return <div className="network-stack">
    <ExplainView
      title="Cross-Case Fraud Network Correlation"
      lookingAt="A correlation engine that matches the current investigation against all stored cases to identify shared criminal infrastructure."
      detected={`${summary.related_investigations || 0} potentially related investigations sharing ${summary.shared_wallets || 0} wallets and ${summary.common_intermediaries || 0} common intermediaries.`}
      howToUse="Inspect similarity reasons to understand the concrete technical connection between cases. Use 'Compare evidence' to view side-by-side transaction histories."
      tryThis={[
        'Review the similarity score (100/100) and matching points breakdown.',
        'Click "Compare evidence" to open the side-by-side comparison drawer.',
        'Click "Capture relationship as evidence" to preserve this cross-case correlation in your evidence ledger.'
      ]}
    />
    <div className="metric-grid five">
      <MetricCard label="Related investigations" value={summary.related_investigations || 0} tone="purple"/>
      <MetricCard label="Shared wallets" value={summary.shared_wallets || 0}/>
      <MetricCard label="Intermediaries" value={summary.common_intermediaries || 0} tone="amber"/>
      <MetricCard label="Destinations" value={summary.shared_destinations || 0} tone="teal"/>
      <MetricCard label="Shared VASPs" value={summary.shared_vasp_destinations || 0} tone="green"/>
    </div>
    <Panel>
      <SectionHeader eyebrow="Cross-case correlation" title="Potentially related investigations" description="Ranked using explainable shared-infrastructure evidence."/>
      {network.related_cases?.length ? <div className="similar-cases">{network.related_cases.map(item => <article key={item.case_id}>
        <div className="similar-score"><strong>{item.similarity_score}</strong><span>/100</span></div>
        <div className="similar-content">
          <header>
            <div><span className="eyebrow">Potential relationship</span><h3>{item.case_label || caseLabel(item.case_id)}</h3></div>
            <CopyValue value={item.suspect_wallet}/>
          </header>
          <div className="reason-chips">{item.reasons.map(reason => <span key={reason.type}><b>+{reason.points}</b>{reason.type.replaceAll('_',' ')}</span>)}</div>
          <ul>{item.reasons.slice(0,4).map(reason => <li key={reason.type}>{reason.total_matches || reason.values?.length || 1} {reason.type.replaceAll('_',' ')} match{(reason.total_matches || reason.values?.length || 1)===1?'':'es'}{reason.values?.[0] ? ` · ${shortAddress(reason.values[0])}` : ''}</li>)}</ul>
          <footer>
            <Button variant="secondary" onClick={() => onOpenCase(item.case_id)}>Open case</Button>
            <Button variant="ghost" onClick={() => onCompare(item.case_id)}>Compare evidence</Button>
            {onCapture && <Button variant="ghost" onClick={() => onCapture({ evidence_type: 'RELATED_CASE_RELATIONSHIP', title: `Cross-Case Match: ${item.case_label} (${item.similarity_score}/100)`, source_provider: 'TraceX Fraud Network', snapshot: { related_case_id: item.case_id, similarity_score: item.similarity_score, reasons: item.reasons } })}>Capture relationship as evidence</Button>}
          </footer>
        </div>
      </article>)}</div> : <EmptyState title="No meaningful cross-case relationships detected" description="No stored investigation met the configured similarity threshold."/>}
    </Panel>
    <Panel className="graph-panel">
      <GraphCanvas graph={network.graph} mode="network" title="Cross-case infrastructure graph" network={network} onOpenCase={onOpenCase} onCapture={onCapture}/>
    </Panel>
  </div>;
}

export function Timeline({ transactions = [], onCapture }) {
  const events = useMemo(() => [...transactions].filter(tx => tx.timestamp).sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp)).slice(0,200), [transactions]);
  const [index,setIndex]=useState(0), [playing,setPlaying]=useState(false), [speed,setSpeed]=useState(1);
  useEffect(()=>{ setIndex(0); setPlaying(false); },[transactions]);
  useEffect(()=>{ if(!playing||!events.length)return; const timer=setInterval(()=>setIndex(value=>value>=events.length-1?(setPlaying(false),value):value+1),900/speed); return()=>clearInterval(timer); },[playing,events.length,speed]);
  const current=events[index];

  const jumpToNextSignal = () => {
    const nextIdx = events.findIndex((tx, i) => i > index && (Number(tx.hop) > 0 || Number(tx.amount) >= 1 || tx.exchange));
    if (nextIdx !== -1) setIndex(nextIdx);
    else setIndex(0);
  };

  return <Panel className="time-machine">
    <ExplainView
      title="Transaction Time Machine"
      lookingAt="A chronological step-by-step replay of observed blockchain transactions from earliest to latest."
      detected={`${events.length} timestamped transactions ordered chronologically across multiple hops.`}
      howToUse="Press Play to watch fund movement animate in time. Adjust playback speed (0.5x, 1x, 2x) or use 'Jump to Next Signal' to skip routine transfers and land directly on high-value or multi-hop dispersal events."
      tryThis={[
        'Press the Play button to start automatic chronological playback.',
        'Toggle speed to 2x for faster demonstration.',
        'Click "Jump to Next Signal" to skip directly to key multi-hop transfers.',
        'Click "Capture active transfer as evidence" to snapshot the highlighted transaction.'
      ]}
    />
    <SectionHeader eyebrow="Chronological evidence" title="Transaction time machine" description="Replays existing provider-observed transfers; it does not reconstruct missing activity."/>
    {current ? <div className="timeline-player">
      <div className="timeline-watch-box">
        <span><Icon name="info" size={16}/></span>
        <div>
          <strong>What to watch during playback:</strong>
          <small>Watch funds enter from sources, consolidate at the suspect address, and then rapidly forward into intermediary wallets (Hop 1 & Hop 2) and exchange endpoints.</small>
        </div>
        <Button variant="secondary" onClick={jumpToNextSignal} icon="target">Jump to Next Signal</Button>
      </div>
      <div className="timeline-window">
        <span>{formatDate(events[0]?.timestamp)}</span>
        <div><i style={{width:`${events.length>1?(index/(events.length-1))*100:0}%`}}/><b style={{left:`${events.length>1?(index/(events.length-1))*100:0}%`}}/></div>
        <span>{formatDate(events.at(-1)?.timestamp)}</span>
      </div>
      <div className="timeline-focus">
        <span className="timeline-time">{formatDate(current.timestamp)} · BLOCK {current.block_number||'N/A'}</span>
        <div className="timeline-route"><CopyValue value={current.from}/><Icon name="arrow"/><CopyValue value={current.to}/></div>
        <strong>{formatAmount(current.amount)} {current.asset}</strong>
        <Badge tone={current.direction==='OUT'?'warning':'success'}>{current.direction}</Badge>
        <small>Hop {current.hop ?? 0} · Provider: {current.provider||'unknown'} · Transfer {index+1} of {events.length}</small>
        {onCapture && <div style={{marginTop:'12px'}}><Button variant="secondary" onClick={()=>onCapture({evidence_type:'TIMELINE_EVENT',title:`Chronological Replay Transfer #${index+1} (${formatAmount(current.amount)} ${current.asset})`,transaction_hash:current.hash||current.transaction_hash,wallet_address:current.from,source_provider:current.provider||'time_machine',snapshot:current})}><Icon name="check"/> Capture active transfer as evidence</Button></div>}
      </div>
      <input type="range" min="0" max={events.length-1} value={index} onChange={event=>{setIndex(Number(event.target.value));setPlaying(false);}} aria-label="Timeline position"/>
      <div className="timeline-controls">
        <button onClick={()=>setIndex(0)} title="Jump to start" aria-label="Jump to start">|‹</button>
        <button onClick={()=>setIndex(value=>Math.max(0,value-1))} title="Previous transfer" aria-label="Previous transfer">‹</button>
        <button className="timeline-play" onClick={()=>setPlaying(value=>!value)} title={playing?'Pause':'Play'} aria-label={playing?'Pause':'Play'}><Icon name={playing?'pause':'play'}/>{playing?'Pause':'Play'}</button>
        <button onClick={()=>setIndex(value=>Math.min(events.length-1,value+1))} title="Next transfer" aria-label="Next transfer">›</button>
        <button onClick={()=>setIndex(events.length-1)} title="Jump to end" aria-label="Jump to end">›|</button>
        <span>{index+1} / {events.length}</span>
        <div className="speed-control">{[.5,1,2].map(value=><button key={value} className={speed===value?'active':''} onClick={()=>setSpeed(value)} aria-label={`${value}x speed`}>{value}x</button>)}</div>
      </div>
    </div> : <EmptyState title="No chronological evidence" description="No timestamped transactions are available for replay."/>}
  </Panel>;
}


export function EvidenceCenter({ investigation, network, onToast }) {
  const [busy,setBusy]=useState(false);
  const report=async()=>{try{setBusy(true);await downloadReport(investigation);onToast('PDF investigation report generated.');}catch(error){onToast(error.message,'error');}finally{setBusy(false);}};
  const categories=[['Blockchain transactions',investigation.transactions?.length||0,'Source: Chain data'],['Fund paths',investigation.paths?.length||0,'TraceX tracing'],['Risk indicators',investigation.suspicious_activity?.indicators?.length||0,'TraceX analytics'],['Entity attribution',investigation.exchange_attributions?.length||0,'TraceX dataset'],['External intelligence',investigation.external_intelligence?.chainabuse?.status==='available'?(investigation.external_intelligence.chainabuse.report_count||0):0,'Source: Threat reports'],['Related cases',network?.related_cases?.length||0,'TraceX fraud network']];
  return <div className="evidence-layout"><Panel><SectionHeader eyebrow="Evidence provenance" title="Investigation evidence" description="Every category retains its source and observed context."/><div className="evidence-categories">{categories.map(([name,count,source])=><div key={name}><span><Icon name="check"/></span><div><strong>{name}</strong><small>Source: {source}</small></div><b>{count}</b></div>)}</div></Panel><Panel><SectionHeader eyebrow="Evidence outputs" title="Generate investigation report" description="Export the current stored investigation without rerunning analysis."/><div className="report-actions"><button onClick={report} disabled={busy}><span className="report-icon pdf">PDF</span><div><strong>Investigation report</strong><small>Risk, trace, intelligence, and evidence summary</small></div><Icon name="download"/></button><button onClick={()=>downloadExport(investigation.investigation_id,'csv')}><span className="report-icon csv">CSV</span><div><strong>Transaction evidence</strong><small>Normalized transaction rows for analysis</small></div><Icon name="download"/></button><button onClick={()=>downloadExport(investigation.investigation_id,'json')}><span className="report-icon json">JSON</span><div><strong>Complete evidence object</strong><small>Full stored TraceX investigation data</small></div><Icon name="download"/></button></div></Panel></div>;
}

export function CopilotPanel({ investigation, standalone = false }) {
  const prompts=['Summarize this investigation','Why is this wallet high risk?','Where did the funds go?','Which transactions triggered indicators?','Are there related investigations?','What should I inspect next?'];
  const [question,setQuestion]=useState(''),[messages,setMessages]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const ask=async text=>{const value=(text||question).trim();if(!value||!investigation?.investigation_id)return;setMessages(items=>[...items,{role:'user',text:value}]);setQuestion('');setLoading(true);setError('');try{const result=await api.copilot(investigation.investigation_id,value);setMessages(items=>[...items,{role:'assistant',text:result.answer,model:result.model,guard:result.grounding_guard_applied}]);}catch(err){setError(err.message);}finally{setLoading(false);}};
  if(!investigation)return <EmptyState icon="messageText" title="Open an investigation first" description="The case assistant requires a stored TraceX case so every answer can be grounded in authoritative evidence."/>;
  return <Panel className={`copilot-panel ${standalone?'copilot-standalone':''}`}><div className="copilot-header"><span className="copilot-orb"><Icon name="messageText" size={24}/></span><div><span className="eyebrow">Evidence-grounded assistance</span><h2>TraceX Case Assistant</h2><p>Explains verified blockchain evidence. It does not invent relationships.</p></div><Badge tone="purple" dot>Case context active</Badge></div><div className="prompt-row">{prompts.map(prompt=><button key={prompt} onClick={()=>ask(prompt)}>{prompt}</button>)}</div><div className="copilot-thread">{!messages.length&&<div className="copilot-welcome"><Icon name="messageText" size={28}/><h3>Ask an evidence-focused question</h3><p>The case assistant can explain observed blockchain facts, TraceX indicators, external intelligence, attribution, and related-case evidence.</p></div>}{messages.map((message,index)=><div key={index} className={`message message-${message.role}`}><span>{message.role==='assistant'?'TX':'YOU'}</span><div>{message.role==='assistant'&&<small>TRACEX EVIDENCE EXPLANATION · {message.model}</small>}<p>{message.text}</p>{message.guard&&<Badge tone="warning">Grounding safeguard applied</Badge>}</div></div>)}{loading&&<div className="message message-assistant"><span>TX</span><div><Skeleton lines={3}/></div></div>}</div>{error&&<ErrorState title="Case assistant temporarily unavailable" message={`${error} Investigation data remains available.`}/>}<form className="copilot-input" onSubmit={event=>{event.preventDefault();ask();}}><textarea value={question} onChange={event=>setQuestion(event.target.value)} placeholder="Ask TraceX to explain the current evidence…" maxLength="2000"/><button disabled={loading||!question.trim()} aria-label="Ask case assistant"><Icon name="arrow"/></button></form></Panel>;
}
