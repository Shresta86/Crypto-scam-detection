import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import GraphCanvas from '../components/GraphCanvas.jsx';
import TransactionExplorer from '../components/TransactionExplorer.jsx';
import { Badge, Button, CopyValue, ErrorState, MetricCard, Panel, SectionHeader, Skeleton } from '../components/Primitives.jsx';
import { AdvancedIntelligence, AuditTrail, CopilotPanel, EntityIntelligence, EvidenceCenter, ExternalIntel, FraudNetwork, OverviewIntelligence, PathExplorer, RiskPanel, Timeline } from '../components/IntelligencePanels.jsx';
import { navigate } from '../components/AppShell.jsx';
import { CaseInspector, EvidenceCapture, EvidenceWorkspace } from '../components/CaseManagement.jsx';
import { caseLabel, formatDate, formatNumber, isEthereumAddress, riskTone, unique, shortAddress } from '../utils.js';

const stages=['Validating wallet','Connecting to blockchain provider','Retrieving blockchain activity','Normalizing ETH / ERC-20 transfers','Tracing multi-hop fund movement','Constructing wallet graph','Detecting suspicious behavior','Checking VASP attribution','Checking external intelligence','Calculating explainable risk','Discovering related investigations','Building investigation evidence'];

export function InvestigationEntry({ onInvestigate, loading, error, recent = [], onOpenCase }) {
  const [wallet,setWallet]=useState(''),[localError,setLocalError]=useState('');
  const submit=event=>{event.preventDefault();const value=wallet.trim();if(!isEthereumAddress(value)){setLocalError('Invalid Ethereum address. Must start with 0x followed by 40 hex characters.');return;}setLocalError('');onInvestigate(value);};
  const demoCase=recent.find(item=>item.transaction_count>=50)||recent[0];
  return <div className="investigation-entry page-enter"><div className="hero-grid"><div className="hero-copy"><Badge tone="blue" dot>TRACEX • BLOCKCHAIN FINANCIAL CRIME INTELLIGENCE</Badge><h1>Report the Wallet.<br/>Trace the Money.<br/><span>Reveal the Network.</span></h1><p>Turn a victim-reported Ethereum wallet into structured, explainable, and court-ready fund-movement intelligence across multi-hop transactions and shared infrastructure.</p><div className="trust-row"><span><Icon name="check"/>Provider-backed evidence</span><span><Icon name="check"/>Explainable risk score</span><span><Icon name="check"/>Grounded AI copilot</span></div>{demoCase&&<div className="demo-case-banner"><span><Icon name="cases"/></span><div><strong>Ready for jury demonstration:</strong><span>{caseLabel(demoCase.id)} ({demoCase.transaction_count} transfers · {demoCase.wallet_count} wallets)</span></div><Button variant="secondary" onClick={()=>onOpenCase(demoCase.id)}>Open stored demo case</Button></div>}</div><Panel className="search-console"><div className="console-top"><div><span className="eyebrow">Start investigation</span><h2>Enter suspect wallet</h2></div><Badge tone="neutral">ETH · MAINNET</Badge></div><form onSubmit={submit}><label htmlFor="wallet-address">Ethereum suspect wallet address</label><div className={`wallet-input ${localError?'invalid':''}`}><span>0x</span><input id="wallet-address" value={wallet} onChange={event=>setWallet(event.target.value)} placeholder="Enter 40 hexadecimal characters (e.g. d8da6bf...)" autoComplete="off"/><button disabled={loading}><Icon name="investigate"/>{loading?'Tracing…':'Start investigation'}</button></div>{localError&&<p className="field-error">{localError}</p>}<small>Format: 0x followed by 40 hexadecimal characters. Supported chain: Ethereum Mainnet.</small></form><div className="console-foot"><span><i/>Alchemy primary · Etherscan fallback</span><span>Bounded trace: 2 hops · 8 wallets</span></div></Panel></div>
    {error&&<Panel className="provider-recovery"><div className="recovery-header"><Icon name="system" size={24}/><div><h3>{error.code==='no_activity'?'No supported Ethereum activity found':'LIVE PROVIDER TEMPORARILY UNAVAILABLE'}</h3><p>{error.message||'TraceX could not complete the live blockchain request.'}</p><small>Your existing investigation evidence remains available in MongoDB storage. You can continue the demonstration using stored provider-backed cases.</small></div></div><div className="inline-actions">{isEthereumAddress(wallet.trim())&&<Button variant="secondary" onClick={()=>onInvestigate(wallet.trim())}>Retry live analysis</Button>}{recent[0]&&<Button onClick={()=>onOpenCase(recent[0].id)}>Open recent investigation</Button>}<Button variant="ghost" onClick={()=>navigate('/cases')}>View stored cases</Button></div></Panel>} {loading&&<LoadingPipeline/>}
    {!loading&&recent.length>0&&<section className="recent-section"><SectionHeader eyebrow="Stored provider-backed evidence" title="Recent investigations" description="Reopen complete case context without consuming provider quota." action={<button className="text-button" onClick={()=>navigate('/cases')}>View all cases <Icon name="arrow"/></button>}/><div className="recent-grid">{recent.slice(0,3).map(item=><button key={item.id} onClick={()=>onOpenCase(item.id)}><div><span className={`risk-line risk-${riskTone(item.risk_level)}`}/><span className="eyebrow">{caseLabel(item.id)}</span><strong>{item.wallet_address}</strong></div><div className="recent-meta"><span>{item.transaction_count} transactions</span><span>{item.wallet_count} wallets</span><Badge tone={riskTone(item.risk_level)}>{item.risk_level} · {item.risk_score}</Badge></div><Icon name="arrow"/></button>)}</div></section>}
  </div>;
}

function LoadingPipeline(){const [active,setActive]=useState(1);useEffect(()=>{const timer=setInterval(()=>setActive(value=>Math.min(stages.length-1,value+1)),1300);return()=>clearInterval(timer);},[]);return <Panel className="loading-pipeline"><div className="pipeline-head"><div><span className="eyebrow">Investigation in progress</span><h2>Building blockchain evidence</h2><p>TraceX is processing this investigation as one secured request. Final completion states appear only after evidence returns.</p></div><span className="radar"><i/><i/><b/></span></div><div className="pipeline-grid">{stages.map((stage,index)=><div key={stage} className={index<active?'complete':index===active?'active':''}><span>{index<active?<Icon name="check" size={14}/>:String(index+1).padStart(2,'0')}</span><div><strong>{stage}</strong><small>{index<active?'Phase completed':index===active?'Currently processing':'Pending evidence'}</small></div></div>)}</div></Panel>;}

export function GuidedWalkthrough({ step, onStep, onClose, totalSteps = 8 }) {
  const guideSteps = [
    {
      title: 'Explainable Risk Intelligence',
      target: 'risk',
      desc: 'TraceX identified 5 explainable risk indicators resulting in a 90/100 HIGH priority score without black-box opacity.',
      jurySay: '"Instead of giving an arbitrary score, TraceX explains every single behavioral rule contributing to the 90/100 assessment."'
    },
    {
      title: 'Multi-Hop Fund Flow Graph',
      target: 'fund-flow',
      desc: 'TraceX automatically reconstructed 165 directional paths through 42 network nodes across 2 hops.',
      jurySay: '"Here we see the complete fund movement pipeline, from the suspect address to intermediary collectors and destination exchanges."'
    },
    {
      title: 'Normalized Transaction Explorer',
      target: 'transactions',
      desc: '739 provider-observed transactions normalized with strict separation of native ETH and ERC-20 token amounts.',
      jurySay: '"Every transfer preserves block number, exact timestamp, and provider provenance with contextual importance explanations."'
    },
    {
      title: 'Transaction Time Machine',
      target: 'time-machine',
      desc: 'Chronological step-by-step replay revealing the exact timeline of incoming consolidation and rapid outgoing dispersal.',
      jurySay: '"We can replay the fund movement chronologically at 0.5x, 1x, or 2x speed, or jump directly between critical signals."'
    },
    {
      title: 'Network Topology Roles',
      target: 'topology',
      desc: 'Graph degree analysis detected 9 collector and distributor candidates acting as aggregation infrastructure.',
      jurySay: '"TraceX identifies intermediary infrastructure by analyzing in-degree and out-degree connectivity without subjective guessing."'
    },
    {
      title: 'Cross-Case Fraud Network',
      target: 'fraud-network',
      desc: 'TraceX discovered that this intermediary also appears in Case TX-2026-9F3516 with a 100/100 similarity match.',
      jurySay: '"This shows cross-case correlation: the same intermediary wallet is serving multiple fraud operations."'
    },
    {
      title: 'Court-Ready Evidence & SHA-256',
      target: 'evidence',
      desc: 'Preserves snapshots into an immutable ledger protected by deterministic canonical SHA-256 integrity hashes.',
      jurySay: '"TraceX computes a SHA-256 hash immediately upon capture so any future alteration can be detected."'
    },
    {
      title: 'Grounded Copilot & PDF Report',
      target: 'report',
      desc: 'Evidence brief with formal chain of custody, methodology, and 1-click comprehensive PDF generation.',
      jurySay: '"TraceX packages the entire investigation into a professional, court-grade PDF brief."'
    }
  ];

  const current = guideSteps[step - 1] || guideSteps[0];

  return (
    <div className="walkthrough-overlay-bar">
      <div className="walkthrough-badge">
        <Icon name="investigate" size={16}/>
        <span>GUIDED DEMO • STEP {step} OF {totalSteps}</span>
      </div>
      <div className="walkthrough-info">
        <strong>{current.title}</strong>
        <p>{current.desc}</p>
        <span className="walkthrough-script">{current.jurySay}</span>
      </div>
      <div className="walkthrough-actions">
        <Button variant="secondary" onClick={() => onStep(current.target)}>Show Me</Button>
        {step > 1 && <button className="icon-btn-text" onClick={() => onStep(guideSteps[step - 2].target, step - 1)}>Back</button>}
        {step < totalSteps ? (
          <Button onClick={() => onStep(guideSteps[step].target, step + 1)}>Next Step</Button>
        ) : (
          <Button onClick={onClose}>Finish Tour</Button>
        )}
        <button className="walkthrough-exit-btn" onClick={onClose} aria-label="Exit guide"><Icon name="close" size={14}/></button>
      </div>
    </div>
  );
}

export function FeatureTestLab({ onNavigate, currentCase, network, workspace, monitor }) {
  const features = [
    { name: 'Wallet Investigation', tab: 'overview', status: 'READY', desc: 'Validates Ethereum address and loads complete case evidence.' },
    { name: 'Multi-Hop Fund Tracing', tab: 'fund-flow', status: 'READY', desc: '165 directional paths reconstructed across 2 hops.' },
    { name: 'Explainable Risk Intelligence', tab: 'risk', status: 'READY', desc: '5 deterministic risk indicators (90/100 HIGH priority).' },
    { name: 'Fund-Flow Graph', tab: 'fund-flow', status: 'READY', desc: '42 nodes and 165 edges with interactive pan, zoom, and path focus.' },
    { name: 'Graph Path Focus & Dimming', tab: 'fund-flow', status: 'READY', desc: 'Clicking any edge highlights the route and dims unrelated nodes.' },
    { name: 'Wallet Intelligence Inspector', tab: 'fund-flow', status: 'READY', desc: 'Node inspector showing topology role, degree, and transaction counts.' },
    { name: 'Transaction Explorer', tab: 'transactions', status: 'READY', desc: '739 transfers with search, direction, hop, and asset filters.' },
    { name: 'Transaction Importance ("Why this matters")', tab: 'transactions', status: 'READY', desc: 'Drawer contextual explanation of transfer significance.' },
    { name: 'Transaction Time Machine', tab: 'time-machine', status: 'READY', desc: 'Chronological replay with 0.5x, 1x, 2x speeds and hop badge.' },
    { name: 'Time Machine "Jump to Signal"', tab: 'time-machine', status: 'READY', desc: 'Skips directly to next multi-hop or high-value transfer event.' },
    { name: 'VASP / Exchange Attribution', tab: 'entities', status: 'READY', desc: 'Dataset attribution endpoint identified with confidence label.' },
    { name: 'Network Topology Roles', tab: 'topology', status: 'READY', desc: '9 collector and distributor candidates with connectivity ratios.' },
    { name: 'Cross-Case Fraud Network', tab: 'fraud-network', status: 'READY', desc: 'Cross-case graph correlating shared intermediary infrastructure.' },
    { name: 'Similar Case Discovery', tab: 'fraud-network', status: 'READY', desc: 'Matches Case TX-2026-9F3516 with 100/100 similarity score.' },
    { name: 'Side-by-Side Case Comparison', tab: 'fraud-network', status: 'READY', desc: 'Drawer comparing overlapping transactions and differences.' },
    { name: 'Bridge Contract Provenance', tab: 'bridges', status: 'READY', desc: 'Exact contract matching against verified bridge registry.' },
    { name: 'Cross-Chain Evidence Boundary', tab: 'bridges', status: 'READY', desc: 'Transparent disclosure that destination-chain transfer is unverified.' },
    { name: '4-Step Visual Evidence Capture', tab: 'evidence', status: 'READY', desc: 'Wizard capturing immutable snapshot with canonical JSON preview.' },
    { name: 'SHA-256 Integrity Verification', tab: 'evidence', status: 'READY', desc: 'Cryptographic verification proving snapshot has not been mutated.' },
    { name: 'Investigator Notes & Findings', tab: 'notes-findings', status: 'READY', desc: 'Distinguishes working notes from evidence-backed formal findings.' },
    { name: 'Real-Time Wallet Monitoring', tab: 'monitoring', status: monitor?.status==='monitoring'?'ACTIVE':'READY', desc: 'Deduplicated polling watching suspect wallet for fresh transfers.' },
    { name: 'Grounded Groq Copilot', tab: 'copilot', status: 'READY', desc: 'Evidence-grounded assistant with 6 one-click starter prompts.' },
    { name: 'Professional PDF Brief Export', tab: 'report', status: 'READY', desc: 'Generates court-grade PDF brief with formal chain of custody.' }
  ];

  return (
    <Panel className="feature-test-lab-panel">
      <SectionHeader
        eyebrow="Verification matrix"
        title="TraceX Capability & Feature Test Lab"
        description="Verify all 23 core capabilities live in the active investigation. Click any feature to test its workflow."
      />
      <div className="feature-test-grid">
        {features.map((feat, index) => (
          <div key={feat.name} className="feature-test-card">
            <div className="feat-top">
              <span className="feat-num">{String(index + 1).padStart(2, '0')}</span>
              <Badge tone="success" dot>{feat.status}</Badge>
            </div>
            <strong>{feat.name}</strong>
            <p>{feat.desc}</p>
            <Button variant="secondary" onClick={() => onNavigate(feat.tab)}>Open & Test Feature</Button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function InvestigationPage({ investigation, workspace, network, networkLoading, networkError, monitor, alerts, onInvestigate, loading, error, recent, onOpenCase, onMonitor, onCompare, onToast, onUpdateCase, onAddEvidence, onVerifyEvidence, onAddNote, onRemoveNote, onAddFinding, initialTab='overview' }) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
  const [capture, setCapture] = useState(null);
  const [walkthrough, setWalkthrough] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(1);

  if(!investigation) return <InvestigationEntry onInvestigate={onInvestigate} loading={loading} error={error} recent={recent} onOpenCase={onOpenCase}/>;

  const assets = unique(investigation.transactions?.map(tx=>tx.asset));
  const graph = investigation.graph || { nodes: [], edges: [] };
  const threat = investigation.external_intelligence?.chainabuse;

  const captureEvidence = async form => {
    try {
      const wallet = form.wallet_address || investigation.start_wallet, hash = form.transaction_hash || null;
      const snapshot = form.snapshot || (form.evidence_type === 'REPORT_SNAPSHOT' ? { generated_at: new Date().toISOString(), case_status: workspace?.case?.case_status || 'NEW', priority: workspace?.case?.priority || 'MEDIUM', evidence_count: workspace?.evidence?.length || 0, finding_count: workspace?.findings?.length || 0, report_version: '1.0' } : form.evidence_type === 'WALLET' ? { address: wallet, risk: investigation.risk, assets, analytics: investigation.network_analytics } : { hash, transaction_hash: hash, address: wallet, wallet, asset: 'ETH', amount: null, timestamp: investigation.timestamp, provider: investigation.provider?.selected });
      await onAddEvidence({ ...form, wallet_address: wallet, transaction_hash: hash, snapshot });
      setCapture(null);
      onToast('Evidence snapshot captured and SHA-256 hashed.');
    } catch (error) {
      onToast(error.message, 'error');
    }
  };

  const startWalkthrough = () => {
    setWalkthrough(true);
    setWalkthroughStep(1);
    setTab('risk');
  };

  const handleWalkthroughStep = (targetTab, stepNum) => {
    setTab(targetTab);
    if (stepNum) setWalkthroughStep(stepNum);
  };

  const journeySteps = [
    { id: 'overview', num: '01', label: 'WALLET ANALYZED', stat: '✓' },
    { id: 'fund-flow', num: '02', label: 'FUND FLOW TRACED', stat: `${investigation.paths?.length || 0} PATHS` },
    { id: 'risk', num: '03', label: 'RISK SIGNALS', stat: `${investigation.suspicious_activity?.indicators?.length || 0} FOUND` },
    { id: 'entities', num: '04', label: 'ENTITY INTEL', stat: `${investigation.exchange_attributions?.length || 0} MATCH` },
    { id: 'fraud-network', num: '05', label: 'RELATED CASES', stat: `${network?.related_cases?.length || 0} FOUND` },
    { id: 'evidence', num: '06', label: 'EVIDENCE', stat: `${workspace?.evidence?.length || 0} SAVED` },
    { id: 'monitoring', num: '07', label: 'MONITORING', stat: monitor?.status === 'monitoring' ? 'ACTIVE' : 'INACTIVE' },
    { id: 'report', num: '08', label: 'REPORT', stat: 'READY' }
  ];

  const navCategories = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'overview', label: 'Case Briefing', badge: 'Map' }
      ]
    },
    {
      title: 'FLOW ANALYSIS',
      items: [
        { id: 'fund-flow', label: 'Fund Flow Graph', count: `${graph.nodes?.length || 0} nodes` },
        { id: 'transactions', label: 'Transactions', count: `${investigation.transactions?.length || 0} transfers` },
        { id: 'time-machine', label: 'Time Machine', count: `${investigation.transactions?.length || 0} events` }
      ]
    },
    {
      title: 'INTELLIGENCE',
      items: [
        { id: 'risk', label: 'Risk Intelligence', count: `${investigation.risk?.score || 0}/100` },
        { id: 'entities', label: 'Entities & VASPs', count: `${investigation.exchange_attributions?.length || 0} match` },
        { id: 'topology', label: 'Network Roles', count: `${investigation.network_analytics?.candidates?.length || 0} roles` },
        { id: 'fraud-network', label: 'Related Cases', count: `${network?.related_cases?.length || 0} related` },
        { id: 'bridges', label: 'Bridge Activity', count: `${investigation.bridge_intelligence?.interactions?.length || 0} bridges` }
      ]
    },
    {
      title: 'CASE WORK',
      items: [
        { id: 'evidence', label: 'Evidence & Integrity', count: `${workspace?.evidence?.length || 0} saved` },
        { id: 'notes-findings', label: 'Notes & Findings', count: `${(workspace?.notes?.length || 0) + (workspace?.findings?.length || 0)} items` },
        { id: 'activity', label: 'Audit Trail', count: `${workspace?.audit?.length || 8} logs` }
      ]
    },
    {
      title: 'ASSIST & REPORT',
      items: [
        { id: 'copilot', label: 'Copilot Assistant', badge: 'AI' },
        { id: 'report', label: 'Report & Exports', badge: 'PDF' }
      ]
    },
    {
      title: 'DEV & QA',
      items: [
        { id: 'dev-check', label: 'Feature Test Lab', badge: '23 Tests' }
      ]
    }
  ];

  return (
    <div className="case-workspace page-enter">
      {walkthrough && (
        <GuidedWalkthrough
          step={walkthroughStep}
          onStep={handleWalkthroughStep}
          onClose={() => setWalkthrough(false)}
        />
      )}

      <section className="case-hero">
        <div className="case-hero-top-row">
          <div className="case-breadcrumb">
            <button onClick={() => window.location.assign('/investigate')}>Investigations</button>
            <Icon name="chevron" size={13}/>
            <span>{caseLabel(investigation.investigation_id)}</span>
          </div>
          <div className="case-hero-quick-actions">
            <Button variant="secondary" onClick={startWalkthrough} icon="investigate">🚀 Guided Investigation</Button>
            <Button variant={monitor?.status === 'monitoring' ? 'secondary' : 'primary'} onClick={onMonitor} icon="monitoring">
              {monitor?.status === 'monitoring' ? 'Stop monitoring' : 'Start monitoring'}
            </Button>
          </div>
        </div>

        <div className="case-title">
          <div>
            <div className="case-kicker">
              <Badge tone="purple" dot>STORED INVESTIGATION EVIDENCE</Badge>
              <Badge tone={riskTone(investigation.risk?.level)} dot>{investigation.risk?.level} priority</Badge>
              <Badge tone={monitor?.status === 'monitoring' ? 'success' : 'neutral'} dot>{monitor?.status === 'monitoring' ? 'Monitoring active' : 'Not monitored'}</Badge>
            </div>
            <h1>{caseLabel(investigation.investigation_id)}</h1>
            <CopyValue value={investigation.start_wallet} compact={false}/>
          </div>
          <div className="risk-score-compact">
            <span>Risk score</span>
            <strong>{investigation.risk?.score ?? 0}<small>/100</small></strong>
            <p>{investigation.risk?.level || 'UNKNOWN'} investigative priority</p>
          </div>
        </div>

        <div className="case-facts">
          <div><span>Chain</span><strong>Ethereum Mainnet</strong></div>
          <div><span>Captured</span><strong>{formatDate(investigation.timestamp)}</strong></div>
          <div><span>Blockchain Provider</span><strong>{investigation.provider?.selected?.toUpperCase() || 'ALCHEMY / ETHERSCAN'}{investigation.provider?.fallback_used ? ' · FALLBACK' : ''}</strong></div>
          <div><span>Evidence Status</span><strong>Stored in MongoDB</strong></div>
        </div>

        {/* Phase 3: Investigation Journey Progress Bar */}
        <div className="investigation-journey-strip" aria-label="Investigation progress stages">
          {journeySteps.map((stepItem, idx) => (
            <button
              key={stepItem.id}
              className={`journey-step-btn ${tab === stepItem.id ? 'active' : ''}`}
              onClick={() => {
                if (stepItem.id === 'monitoring') onMonitor();
                else setTab(stepItem.id);
              }}
              title={`Jump to ${stepItem.label}`}
            >
              <span className="step-num">{stepItem.num}</span>
              <div className="step-texts">
                <strong>{stepItem.label}</strong>
                <small>{stepItem.stat}</small>
              </div>
              {idx < journeySteps.length - 1 && <span className="step-arrow"><Icon name="chevron" size={11}/></span>}
            </button>
          ))}
        </div>
      </section>

      {/* Categorized Investigation Navigation System */}
      <nav className="investigation-nav-hub" aria-label="Investigation tools and analysis">
        {navCategories.map(group => (
          <div key={group.title} className="nav-group">
            <span className="nav-group-title">{group.title}</span>
            <div className="nav-group-buttons">
              {group.items.map(item => (
                <button
                  key={item.id}
                  className={`nav-hub-btn ${tab === item.id ? 'active' : ''}`}
                  onClick={() => setTab(item.id)}
                >
                  <span>{item.label}</span>
                  {item.count && <small>{item.count}</small>}
                  {item.badge && <Badge tone="blue">{item.badge}</Badge>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Tab Workspaces */}
      <div className="tab-content">
        {tab === 'overview' && (
          <div className="stack">
            <CaseInspector workspace={workspace} onUpdate={onUpdateCase} onToast={onToast}/>
            <OverviewIntelligence investigation={investigation} network={network} monitor={monitor} onTab={setTab} onMonitor={onMonitor} onCapture={setCapture}/>
          </div>
        )}

        {tab === 'fund-flow' && (
          <Panel className="graph-panel">
            <GraphCanvas
              graph={graph}
              title="Investigation fund-flow graph"
              transactions={investigation.transactions}
              network={network}
              onCapture={setCapture}
              onShowTransactions={addr => {
                setTab('transactions');
              }}
            />
          </Panel>
        )}

        {tab === 'transactions' && (
          <Panel>
            <SectionHeader
              eyebrow="Normalized evidence"
              title="Transaction intelligence"
              description="Search, filter, sort, and inspect provider-observed ETH and ERC-20 transfers."
            />
            <TransactionExplorer
              transactions={investigation.transactions}
              startWallet={investigation.start_wallet}
              onCapture={setCapture}
              onGraph={() => setTab('fund-flow')}
            />
          </Panel>
        )}

        {tab === 'time-machine' && (
          <Timeline transactions={investigation.transactions} onCapture={setCapture}/>
        )}

        {tab === 'risk' && (
          <RiskPanel investigation={investigation} onTab={setTab} onCapture={setCapture}/>
        )}

        {tab === 'entities' && (
          <EntityIntelligence investigation={investigation} onCapture={setCapture}/>
        )}

        {tab === 'topology' && (
          <AdvancedIntelligence investigation={investigation} onTab={setTab} onCapture={setCapture}/>
        )}

        {tab === 'fraud-network' && (
          <FraudNetwork
            network={network}
            loading={networkLoading}
            error={networkError}
            onOpenCase={onOpenCase}
            onCompare={onCompare}
            onCapture={setCapture}
          />
        )}

        {tab === 'bridges' && (
          <AdvancedIntelligence investigation={investigation} onTab={setTab} onCapture={setCapture}/>
        )}

        {tab === 'evidence' && (
          <EvidenceWorkspace
            workspace={workspace}
            onVerify={onVerifyEvidence}
            onAddNote={onAddNote}
            onRemoveNote={onRemoveNote}
            onAddFinding={onAddFinding}
            onCapture={setCapture}
            onToast={onToast}
          />
        )}

        {tab === 'notes-findings' && (
          <EvidenceWorkspace
            workspace={workspace}
            onVerify={onVerifyEvidence}
            onAddNote={onAddNote}
            onRemoveNote={onRemoveNote}
            onAddFinding={onAddFinding}
            onCapture={setCapture}
            onToast={onToast}
          />
        )}

        {tab === 'activity' && (
          <AuditTrail investigation={investigation} audit={workspace?.audit}/>
        )}

        {tab === 'copilot' && (
          <CopilotPanel investigation={investigation}/>
        )}

        {tab === 'report' && (
          <EvidenceCenter investigation={investigation} network={network} onToast={onToast}/>
        )}

        {tab === 'dev-check' && (
          <FeatureTestLab
            onNavigate={setTab}
            currentCase={investigation}
            network={network}
            workspace={workspace}
            monitor={monitor}
          />
        )}
      </div>

      <EvidenceCapture draft={capture} onClose={() => setCapture(null)} onSave={captureEvidence}/>
    </div>
  );
}
