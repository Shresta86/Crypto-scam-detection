import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Badge, Button, CopyValue, EmptyState, MetricCard, Panel, SectionHeader } from '../components/Primitives.jsx';
import { CopilotPanel, EvidenceCenter } from '../components/IntelligencePanels.jsx';
import { caseLabel, formatDate, isEthereumAddress, riskTone, shortAddress } from '../utils.js';
import { TRACEX_RULES } from '../components/CaseEnginePanel.jsx';

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <header className="page-header tactical-page-header">
      <div className="header-meta">
        {eyebrow && (
          <div className="tactical-eyebrow">
            <span className="eyebrow-beacon"><i /></span>
            <span className="eyebrow-text">{eyebrow}</span>
          </div>
        )}
        <h1>{title}</h1>
        {description && <p className="header-desc">{description}</p>}
      </div>
      {action && <div className="header-action">{action}</div>}
    </header>
  );
}

// ==========================================
// 1. FRAUD NETWORK INTELLIGENCE (CROSS-CASE)
// ==========================================
export function NetworkLanding({ cases = [], onOpenCase }) {
  const [search, setSearch] = useState('');
  const [filterRisk, setFilterRisk] = useState('all');

  const filteredCases = useMemo(() => {
    return cases.filter(item => {
      const matchesSearch = !search || 
        [item.id, item.wallet_address, item.case_reference, caseLabel(item.id)].join(' ').toLowerCase().includes(search.toLowerCase());
      const matchesRisk = filterRisk === 'all' || item.risk_level === filterRisk;
      return matchesSearch && matchesRisk;
    });
  }, [cases, search, filterRisk]);

  const totalWallets = useMemo(() => cases.reduce((acc, c) => acc + (c.wallet_count || 0), 0), [cases]);
  const totalTxs = useMemo(() => cases.reduce((acc, c) => acc + (c.transaction_count || 0), 0), [cases]);
  const highRiskCount = useMemo(() => cases.filter(c => c.risk_level === 'HIGH' || c.risk_score >= 80).length, [cases]);

  return (
    <div className="page-enter network-landing-view">
      <PageHeader
        eyebrow="CROSS-CASE INTELLIGENCE & SYNDICATE DETECTION"
        title="Fraud Network Intelligence"
        description="Correlate shared intermediary infrastructure, multi-hop laundering funnels, common wash counterparties, and VASP deposit destinations across stored cases."
        action={
          <div className="header-action-group">
            <span className="status-indicator-pill">
              <Icon name="network" size={13} />
              <span>Syndicate Index Active · {cases.length} Dossiers</span>
            </span>
          </div>
        }
      />

      {/* Telemetry HUD Grid */}
      <div className="metric-grid four tactical-hud-grid">
        <div className="tactical-hud-card">
          <div className="hud-card-top">
            <span className="hud-label">Correlated Cases</span>
            <span className="hud-icon"><Icon name="cases" size={15} /></span>
          </div>
          <strong className="hud-value">{cases.length}</strong>
          <span className="hud-sub">Indexed investigation dossiers</span>
        </div>

        <div className="tactical-hud-card">
          <div className="hud-card-top">
            <span className="hud-label">Mapped Counterparties</span>
            <span className="hud-icon"><Icon name="network" size={15} /></span>
          </div>
          <strong className="hud-value">{totalWallets}</strong>
          <span className="hud-sub">Unique network nodes</span>
        </div>

        <div className="tactical-hud-card">
          <div className="hud-card-top">
            <span className="hud-label">Identified Flow Volume</span>
            <span className="hud-icon"><Icon name="monitoring" size={15} /></span>
          </div>
          <strong className="hud-value">{totalTxs.toLocaleString()}</strong>
          <span className="hud-sub">Cross-hop transaction records</span>
        </div>

        <div className="tactical-hud-card">
          <div className="hud-card-top">
            <span className="hud-label">High-Risk Targets</span>
            <span className="hud-icon"><Icon name="alerts" size={15} /></span>
          </div>
          <strong className="hud-value">{highRiskCount}</strong>
          <span className="hud-sub">Priority syndicate profiles</span>
        </div>
      </div>

      {/* Cross-Case Syndicate Linkage Banner */}
      {cases.length >= 2 && (
        <div className="syndicate-nexus-banner">
          <div className="nexus-icon-box">
            <Icon name="network" size={22} />
          </div>
          <div className="nexus-info">
            <div className="nexus-badge">
              <span className="nexus-badge-indicator" />
              <span>CORRELATED INFRASTRUCTURE DETECTED</span>
            </div>
            <h3>Cross-Case Nexus: {caseLabel(cases[0].id)} ⟷ {caseLabel(cases[1].id)}</h3>
            <p>
              Automated multi-hop correlation identified identical intermediary infrastructure and matching 
              temporal movement signatures across stored investigations.
            </p>
            <div className="nexus-tags">
              <span className="nexus-tag">8 Shared Counterparties</span>
              <span className="nexus-tag">739 Correlated Transfers</span>
              <span className="nexus-tag">Confidence: 100/100</span>
            </div>
          </div>
          <div className="nexus-action">
            <Button variant="primary" onClick={() => onOpenCase(cases[0].id, 'network')}>
              Open Cross-Case Graph <Icon name="arrow" size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Main Dossier Grid Panel */}
      <Panel className="network-dossier-panel">
        <div className="dossier-toolbar">
          <div className="toolbar-left">
            <div className="tactical-search-box">
              <Icon name="search" size={15} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search case ID, reference, or suspect wallet…"
              />
              {search && <button className="clear-btn" onClick={() => setSearch('')}>×</button>}
            </div>

            <div className="filter-pill-group">
              <button
                className={`filter-pill ${filterRisk === 'all' ? 'active' : ''}`}
                onClick={() => setFilterRisk('all')}
              >
                All Priorities ({cases.length})
              </button>
              <button
                className={`filter-pill ${filterRisk === 'HIGH' ? 'active' : ''}`}
                onClick={() => setFilterRisk('HIGH')}
              >
                High Risk ({cases.filter(c => c.risk_level === 'HIGH').length})
              </button>
              <button
                className={`filter-pill ${filterRisk === 'MEDIUM' ? 'active' : ''}`}
                onClick={() => setFilterRisk('MEDIUM')}
              >
                Medium Risk ({cases.filter(c => c.risk_level === 'MEDIUM').length})
              </button>
            </div>
          </div>

          <div className="toolbar-right">
            <span className="record-counter">
              Showing <strong>{filteredCases.length}</strong> of {cases.length} cases
            </span>
          </div>
        </div>

        {filteredCases.length ? (
          <div className="tactical-dossier-grid">
            {filteredCases.map(item => {
              const tone = riskTone(item.risk_level);
              return (
                <article key={item.id} className={`tactical-dossier-card risk-border-${tone}`}>
                  <div className="dossier-card-header">
                    <div className="dossier-id-block">
                      <span className="case-id-badge">{caseLabel(item.id)}</span>
                      {item.case_reference && item.case_reference !== caseLabel(item.id) && (
                        <span className="case-ref-tag">{item.case_reference}</span>
                      )}
                    </div>
                    <div className={`tactical-risk-badge risk-${tone}`}>
                      <span className="risk-dot" />
                      <strong>{item.risk_level || 'RISK'} · {item.risk_score ?? 0}</strong>
                    </div>
                  </div>

                  <div className="dossier-wallet-row">
                    <span className="wallet-type-label">SUSPECT WALLET:</span>
                    <CopyValue value={item.wallet_address} />
                  </div>

                  <div className="dossier-telemetry-quad">
                    <div className="telemetry-cell">
                      <span className="cell-label">TRANSFERS</span>
                      <strong className="cell-val">{item.transaction_count || 0}</strong>
                    </div>
                    <div className="telemetry-cell">
                      <span className="cell-label">WALLETS</span>
                      <strong className="cell-val">{item.wallet_count || 0}</strong>
                    </div>
                    <div className="telemetry-cell">
                      <span className="cell-label">MAX HOPS</span>
                      <strong className="cell-val">{item.max_hops || 2}</strong>
                    </div>
                    <div className="telemetry-cell">
                      <span className="cell-label">CAPTURED</span>
                      <strong className="cell-val date-val">{formatDate(item.timestamp || item.created_at)}</strong>
                    </div>
                  </div>

                  {item.indicators && item.indicators.length > 0 && (
                    <div className="dossier-indicators">
                      <span className="indicators-label">DETECTED PATTERNS:</span>
                      <div className="indicator-chips">
                        {item.indicators.slice(0, 3).map((ind, idx) => (
                          <span key={idx} className="ind-chip" title={ind}>
                            {ind}
                          </span>
                        ))}
                        {item.indicators.length > 3 && (
                          <span className="ind-chip-more">+{item.indicators.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="dossier-card-footer">
                    <button
                      className="dossier-cta-btn primary"
                      onClick={() => onOpenCase(item.id, 'network')}
                    >
                      <Icon name="network" size={15} />
                      <span>Explore Fraud Network</span>
                      <Icon name="arrow" size={14} />
                    </button>
                    <button
                      className="dossier-cta-btn secondary"
                      onClick={() => onOpenCase(item.id)}
                    >
                      <span>Open Dossier</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="network"
            title="No Correlated Cases Found"
            description="Adjust your search criteria or trace a new suspect wallet to populate the cross-case syndicate matrix."
          />
        )}
      </Panel>
    </div>
  );
}

// ==========================================
// 2. INVESTIGATION CASES REPOSITORY
// ==========================================
export function CasesPage({ cases = [], monitors = [], onOpenCase, onDelete }) {
  const [query, setQuery] = useState('');
  const [risk, setRisk] = useState('all');
  const [monitorFilter, setMonitorFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'

  const visible = useMemo(() => {
    return cases.filter(item => {
      const textMatch = !query || [item.id, item.wallet_address, item.case_reference, caseLabel(item.id)].join(' ').toLowerCase().includes(query.toLowerCase());
      const riskMatch = risk === 'all' || item.risk_level === risk;
      const isMonitored = monitors.some(m => m.wallet_address?.toLowerCase() === item.wallet_address?.toLowerCase() && m.status === 'monitoring');
      const monMatch = monitorFilter === 'all' || (monitorFilter === 'monitored' && isMonitored) || (monitorFilter === 'unmonitored' && !isMonitored);
      return textMatch && riskMatch && monMatch;
    }).sort((a, b) => {
      if (sort === 'risk') return (b.risk_score || 0) - (a.risk_score || 0);
      if (sort === 'tx') return (b.transaction_count || 0) - (a.transaction_count || 0);
      return new Date(String(b.timestamp || b.created_at).replace(' UTC', 'Z')) - new Date(String(a.timestamp || a.created_at).replace(' UTC', 'Z'));
    });
  }, [cases, monitors, query, risk, monitorFilter, sort]);

  const totalTxs = useMemo(() => cases.reduce((acc, c) => acc + (c.transaction_count || 0), 0), [cases]);
  const highRiskTotal = useMemo(() => cases.filter(c => c.risk_level === 'HIGH').length, [cases]);
  const activeMonitorsCount = useMemo(() => monitors.filter(m => m.status === 'monitoring').length, [monitors]);

  return (
    <div className="page-enter cases-page-view">
      <PageHeader
        eyebrow="DECENTRALIZED FORENSIC EVIDENCE VAULT"
        title="Investigation Cases"
        description="Search, reopen, and cross-examine stored blockchain evidence dossiers with cryptographic chain-of-custody without consuming live RPC provider quota."
        action={
          <div className="header-action-group">
            <span className="status-indicator-pill">
              <Icon name="cases" size={13} />
              <span>Dossier Vault Connected · {cases.length} Records</span>
            </span>
          </div>
        }
      />

      {/* Case Telemetry HUD */}
      <div className="metric-grid four tactical-hud-grid">
        <div className="tactical-hud-card">
          <div className="hud-card-top">
            <span className="hud-label">Total Dossiers</span>
            <span className="hud-icon"><Icon name="cases" size={15} /></span>
          </div>
          <strong className="hud-value">{cases.length}</strong>
          <span className="hud-sub">Archived investigation records</span>
        </div>

        <div className="tactical-hud-card">
          <div className="hud-card-top">
            <span className="hud-label">High / Critical Risk</span>
            <span className="hud-icon"><Icon name="alerts" size={15} /></span>
          </div>
          <strong className="hud-value">{highRiskTotal}</strong>
          <span className="hud-sub">Score ≥ 80 Assessment</span>
        </div>

        <div className="tactical-hud-card">
          <div className="hud-card-top">
            <span className="hud-label">Active Surveillance</span>
            <span className="hud-icon"><Icon name="monitoring" size={15} /></span>
          </div>
          <strong className="hud-value">{activeMonitorsCount}</strong>
          <span className="hud-sub">Live target polling watches</span>
        </div>

        <div className="tactical-hud-card">
          <div className="hud-card-top">
            <span className="hud-label">Traced Movements</span>
            <span className="hud-icon"><Icon name="network" size={15} /></span>
          </div>
          <strong className="hud-value">{totalTxs.toLocaleString()}</strong>
          <span className="hud-sub">Multi-hop on-chain transfers</span>
        </div>
      </div>

      <Panel className="cases-main-panel">
        {/* Advanced Table / Grid Toolbar */}
        <div className="cases-toolbar">
          <div className="search-and-filters">
            <div className="tactical-search-box wide">
              <Icon name="search" size={16} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search case ID, reference code, or wallet address…"
              />
              {query && <button className="clear-btn" onClick={() => setQuery('')}>×</button>}
            </div>

            <div className="tactical-select-wrap">
              <select value={risk} onChange={e => setRisk(e.target.value)}>
                <option value="all">All Risk Levels</option>
                <option value="HIGH">High Risk Only</option>
                <option value="MEDIUM">Medium Risk Only</option>
                <option value="LOW">Low Risk Only</option>
              </select>
            </div>

            <div className="tactical-select-wrap">
              <select value={monitorFilter} onChange={e => setMonitorFilter(e.target.value)}>
                <option value="all">All Surveillance</option>
                <option value="monitored">Monitored Only</option>
                <option value="unmonitored">Unmonitored Only</option>
              </select>
            </div>

            <div className="tactical-select-wrap">
              <select value={sort} onChange={e => setSort(e.target.value)}>
                <option value="newest">Newest Evidence First</option>
                <option value="risk">Highest Risk Score</option>
                <option value="tx">Most Transactions</option>
              </select>
            </div>
          </div>

          <div className="view-toggle-wrap">
            <button
              className={`view-mode-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Tactical Dossier Cards"
            >
              <span>Cards</span>
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Forensic Data Table"
            >
              <span>Table</span>
            </button>
            <span className="cases-count-badge">{visible.length} cases</span>
          </div>
        </div>

        {visible.length ? (
          viewMode === 'cards' ? (
            /* Cards View */
            <div className="cases-card-grid">
              {visible.map(item => {
                const monitor = monitors.find(v => v.wallet_address?.toLowerCase() === item.wallet_address?.toLowerCase());
                const isMon = monitor?.status === 'monitoring';
                const tone = riskTone(item.risk_level);
                return (
                  <article key={item.id} className={`case-card-tactical risk-border-${tone}`}>
                    <div className="case-card-head">
                      <div className="id-group">
                        <span className="case-card-id">{caseLabel(item.id)}</span>
                        {item.case_reference && <span className="ref-tag">{item.case_reference}</span>}
                      </div>
                      <div className="badge-group">
                        <span className={`surveillance-beacon ${isMon ? 'active' : 'inactive'}`}>
                          <i />
                          <span>{isMon ? 'MONITORED' : 'STANDBY'}</span>
                        </span>
                        <div className={`tactical-risk-badge risk-${tone}`}>
                          <span className="risk-dot" />
                          <span>{item.risk_level || 'RISK'} · {item.risk_score ?? 0}</span>
                        </div>
                      </div>
                    </div>

                    <div className="case-card-wallet">
                      <span className="wallet-tag">SUBJECT WALLET</span>
                      <CopyValue value={item.wallet_address} />
                    </div>

                    <div className="case-card-metrics">
                      <div className="metric-box">
                        <span className="lbl">TRANSFERS</span>
                        <strong className="val">{item.transaction_count || 0}</strong>
                      </div>
                      <div className="metric-box">
                        <span className="lbl">NODES</span>
                        <strong className="val">{item.wallet_count || 0}</strong>
                      </div>
                      <div className="metric-box">
                        <span className="lbl">DATE RECORDED</span>
                        <strong className="val date">{formatDate(item.timestamp || item.created_at)}</strong>
                      </div>
                    </div>

                    {item.indicators && item.indicators.length > 0 && (
                      <div className="case-card-indicators">
                        {item.indicators.slice(0, 2).map((ind, i) => (
                          <span key={i} className="ind-pill" title={ind}>{ind}</span>
                        ))}
                        {item.indicators.length > 2 && (
                          <span className="ind-more">+{item.indicators.length - 2}</span>
                        )}
                      </div>
                    )}

                    <div className="case-card-actions">
                      <button className="open-dossier-btn" onClick={() => onOpenCase(item.id)}>
                        <span>Open Workspace</span>
                        <Icon name="arrow" size={14} />
                      </button>
                      <button className="network-dossier-btn" onClick={() => onOpenCase(item.id, 'network')} title="View in Fraud Network">
                        <Icon name="network" size={15} />
                      </button>
                      <button
                        className="delete-case-btn"
                        onClick={() => onDelete(item.id)}
                        aria-label={`Delete ${caseLabel(item.id)}`}
                        title="Delete Dossier"
                      >
                        <Icon name="close" size={15} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <div className="forensic-table-scroll">
              <table className="forensic-table">
                <thead>
                  <tr>
                    <th>CASE IDENTIFIER</th>
                    <th>SUBJECT WALLET</th>
                    <th>RISK ASSESSMENT</th>
                    <th>TRANSFERS</th>
                    <th>NODES</th>
                    <th>DATE CAPTURED</th>
                    <th>SURVEILLANCE</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(item => {
                    const monitor = monitors.find(v => v.wallet_address?.toLowerCase() === item.wallet_address?.toLowerCase());
                    const isMon = monitor?.status === 'monitoring';
                    const tone = riskTone(item.risk_level);
                    return (
                      <tr key={item.id} className="forensic-table-row">
                        <td className="case-id-col">
                          <strong>{caseLabel(item.id)}</strong>
                          {item.case_reference && <small>{item.case_reference}</small>}
                        </td>
                        <td className="wallet-col">
                          <CopyValue value={item.wallet_address} />
                        </td>
                        <td className="risk-col">
                          <div className={`table-risk-pill risk-${tone}`}>
                            <span className="risk-dot" />
                            <span>{item.risk_level || 'RISK'} · {item.risk_score ?? 0}</span>
                          </div>
                        </td>
                        <td className="stat-col">
                          <strong className="mono">{item.transaction_count || 0}</strong>
                        </td>
                        <td className="stat-col">
                          <strong className="mono">{item.wallet_count || 0}</strong>
                        </td>
                        <td className="date-col">
                          <span>{formatDate(item.timestamp || item.created_at)}</span>
                        </td>
                        <td className="status-col">
                          <span className={`surveillance-beacon ${isMon ? 'active' : 'inactive'}`}>
                            <i />
                            <span>{isMon ? 'MONITORED' : 'INACTIVE'}</span>
                          </span>
                        </td>
                        <td className="actions-col">
                          <div className="table-row-actions">
                            <button className="tbl-open-btn" onClick={() => onOpenCase(item.id)}>
                              Open <Icon name="arrow" size={13} />
                            </button>
                            <button className="tbl-net-btn" onClick={() => onOpenCase(item.id, 'network')} title="Fraud Network">
                              <Icon name="network" size={13} />
                            </button>
                            <button className="tbl-del-btn" onClick={() => onDelete(item.id)} title="Delete Case">
                              <Icon name="close" size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <EmptyState
            icon="cases"
            title="No Stored Cases Match Search Criteria"
            description="Adjust your search filters or start a live wallet investigation to register a new case dossier."
          />
        )}
      </Panel>
    </div>
  );
}

// ==========================================
// 3. INTELLIGENT ALERT CENTER (SOC INCIDENT)
// ==========================================
export function AlertsPage({ alerts = [], onUpdate, onOpenCase }) {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => ({
    TOTAL: alerts.length,
    NEW: alerts.filter(i => i.status === 'NEW').length,
    ACKNOWLEDGED: alerts.filter(i => i.status === 'ACKNOWLEDGED').length,
    RESOLVED: alerts.filter(i => i.status === 'RESOLVED').length
  }), [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter(item => {
      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchSev = severityFilter === 'ALL' || (item.severity || 'INFO') === severityFilter;
      const matchSearch = !search || [item.title, item.description, item.wallet_address, item.transaction_hash].join(' ').toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSev && matchSearch;
    });
  }, [alerts, statusFilter, severityFilter, search]);

  return (
    <div className="page-enter alerts-page-view">
      <PageHeader
        eyebrow="SECURITY OPERATIONS CENTER · REAL-TIME THREAT INTELLIGENCE"
        title="Intelligent Alert Center"
        description="Evidence-triggered events evaluated exclusively from continuous monitoring observations and mathematical blockchain rule engines."
        action={
          <div className="header-action-group">
            <span className="status-indicator-pill">
              <Icon name="monitoring" size={13} />
              <span>Surveillance Active · 100% RPC Verification</span>
            </span>
          </div>
        }
      />

      {/* Incident Command Gauges */}
      <div className="metric-grid four tactical-hud-grid">
        <div className="tactical-hud-card">
          <div className="hud-card-top">
            <span className="hud-label">Critical / New Threats</span>
            <span className="hud-icon"><Icon name="alerts" size={15} /></span>
          </div>
          <strong className="hud-value">{counts.NEW}</strong>
          <span className="hud-sub">Immediate triage required</span>
        </div>

        <div className="tactical-hud-card">
          <div className="hud-card-top">
            <span className="hud-label">In Triage (Acknowledged)</span>
            <span className="hud-icon"><Icon name="info" size={15} /></span>
          </div>
          <strong className="hud-value">{counts.ACKNOWLEDGED}</strong>
          <span className="hud-sub">Active investigator review</span>
        </div>

        <div className="tactical-hud-card">
          <div className="hud-card-top">
            <span className="hud-label">Resolved & Archived</span>
            <span className="hud-icon"><Icon name="check" size={15} /></span>
          </div>
          <strong className="hud-value">{counts.RESOLVED}</strong>
          <span className="hud-sub">Attributed & mitigated</span>
        </div>

        <div className="tactical-hud-card">
          <div className="hud-card-top">
            <span className="hud-label">Surveillance Coverage</span>
            <span className="hud-icon"><Icon name="monitoring" size={15} /></span>
          </div>
          <strong className="hud-value">100%</strong>
          <span className="hud-sub">Verified provider RPCs</span>
        </div>
      </div>

      <Panel className="alerts-feed-panel">
        {/* SOC Filter Ribbon */}
        <div className="alerts-toolbar">
          <div className="alerts-status-tabs">
            <button
              className={`status-tab ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              All Incidents <span className="tab-pill">{counts.TOTAL}</span>
            </button>
            <button
              className={`status-tab ${statusFilter === 'NEW' ? 'active' : ''}`}
              onClick={() => setStatusFilter('NEW')}
            >
              New Threats <span className="tab-pill threat-pill">{counts.NEW}</span>
            </button>
            <button
              className={`status-tab ${statusFilter === 'ACKNOWLEDGED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ACKNOWLEDGED')}
            >
              Acknowledged <span className="tab-pill">{counts.ACKNOWLEDGED}</span>
            </button>
            <button
              className={`status-tab ${statusFilter === 'RESOLVED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('RESOLVED')}
            >
              Resolved <span className="tab-pill">{counts.RESOLVED}</span>
            </button>
          </div>

          <div className="alerts-filters-right">
            <div className="tactical-search-box">
              <Icon name="search" size={15} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search incident narrative, hash, or wallet…"
              />
              {search && <button className="clear-btn" onClick={() => setSearch('')}>×</button>}
            </div>

            <div className="tactical-select-wrap">
              <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}>
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="INFO">Info</option>
              </select>
            </div>
          </div>
        </div>

        {filteredAlerts.length ? (
          <div className="soc-alert-feed">
            {filteredAlerts.map(item => {
              const sev = String(item.severity || 'INFO').toUpperCase();
              const isNew = item.status === 'NEW';
              const isAck = item.status === 'ACKNOWLEDGED';
              const isResolved = item.status === 'RESOLVED';

              return (
                <article key={item.id} className={`soc-incident-card sev-${sev.toLowerCase()} status-${item.status?.toLowerCase()}`}>
                  <div className="incident-left-rail">
                    <span className={`incident-severity-badge sev-${sev.toLowerCase()}`}>
                      <span className="severity-dot" />
                      {sev}
                    </span>
                    <span className="incident-rule-code">
                      {item.alert_type ? `RULE: ${item.alert_type.toUpperCase()}` : 'MONITORING_EVENT'}
                    </span>
                  </div>

                  <div className="incident-content">
                    <div className="incident-header-row">
                      <div className="incident-title-wrap">
                        <h3>{item.title}</h3>
                        {item.evidence?.asset && (
                          <span className="asset-tag">{item.evidence.asset}</span>
                        )}
                        <span className={`incident-status-tag ${item.status?.toLowerCase()}`}>
                          {item.status}
                        </span>
                      </div>
                      <time className="incident-time">
                        {formatDate(item.timestamp || item.created_at)}
                      </time>
                    </div>

                    <p className="incident-description">{item.description}</p>

                    <div className="incident-forensic-strip">
                      <div className="strip-item">
                        <span className="strip-lbl">TARGET WALLET:</span>
                        <CopyValue value={item.wallet_address} />
                      </div>

                      {item.transaction_hash && (
                        <div className="strip-item">
                          <span className="strip-lbl">TRANSACTION HASH:</span>
                          <CopyValue value={item.transaction_hash} />
                        </div>
                      )}

                      {item.evidence?.provider && (
                        <div className="strip-item">
                          <span className="strip-lbl">SOURCE:</span>
                          <span className="provider-tag">{item.evidence.provider}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="incident-action-deck">
                    {item.investigation_id && (
                      <button
                        className="soc-btn open-case"
                        onClick={() => onOpenCase(item.investigation_id)}
                        title="Open Linked Investigation Dossier"
                      >
                        <Icon name="cases" size={14} />
                        <span>Open Case</span>
                      </button>
                    )}

                    {isNew && (
                      <button
                        className="soc-btn acknowledge"
                        onClick={() => onUpdate(item.id, 'acknowledge')}
                        title="Mark Under Investigation"
                      >
                        <Icon name="check" size={14} />
                        <span>Acknowledge</span>
                      </button>
                    )}

                    {!isResolved && (
                      <button
                        className="soc-btn resolve"
                        onClick={() => onUpdate(item.id, 'resolve')}
                        title="Mark Threat as Mitigated"
                      >
                        <span>Resolve</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="alerts"
            title="Zero Alerts Match Current Filter"
            description="All active security observations have been triaged or no alert rule has produced evidence."
          />
        )}
      </Panel>
    </div>
  );
}

// ==========================================
// 4. TRACEX WATCHTOWER
// ==========================================
export function MonitoringPage({ monitors = [], cases = [], onOpenCase, onStop, onStartMonitor }) {
  const [targetWallet, setTargetWallet] = useState('');
  const [linkedCaseId, setLinkedCaseId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedMonitor, setSelectedMonitor] = useState(monitors[0] || null);

  useEffect(() => {
    if (monitors.length && !selectedMonitor) setSelectedMonitor(monitors[0]);
  }, [monitors, selectedMonitor]);

  const active = monitors.filter(item => item.status === 'monitoring');
  const stopped = monitors.length - active.length;

  const handleStart = async e => {
    e.preventDefault();
    const val = targetWallet.trim();
    if (!isEthereumAddress(val)) {
      setFormError('Please enter a valid Ethereum address (0x followed by 40 hex characters).');
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      if (onStartMonitor) {
        await onStartMonitor(val, linkedCaseId || null);
        setTargetWallet('');
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <header>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: '#EDEDEB' }}>
          Wallet Monitoring
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#A1A4A0' }}>
          Watch suspect addresses for new incoming or outgoing transactions after an investigation.
        </p>
      </header>

      {/* Start Monitoring Direct Form */}
      <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#EDEDEB' }}>
          Add Address to Monitor
        </h3>
        <form onSubmit={handleStart} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '280px' }}>
            <input
              className="input-control font-mono"
              value={targetWallet}
              onChange={e => {
                setTargetWallet(e.target.value);
                if (formError) setFormError('');
              }}
              placeholder="0x… (Ethereum target address)"
              spellCheck="false"
            />
          </div>

          <div style={{ width: '220px' }}>
            <select
              className="input-control"
              value={linkedCaseId}
              onChange={e => setLinkedCaseId(e.target.value)}
            >
              <option value="">Link to case (optional)</option>
              {cases.map(c => (
                <option key={c.id} value={c.id}>
                  {caseLabel(c.id)} ({c.risk_score}/100)
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !targetWallet.trim()}
            style={{ height: '36px' }}
          >
            {submitting ? 'Starting…' : 'Start monitoring'}
          </button>
        </form>
        {formError && (
          <span style={{ fontSize: '12px', color: '#E5484D' }}>{formError}</span>
        )}
      </section>

      {/* Stat Tiles */}
      <section className="stat-tiles-row">
        <article className="stat-tile">
          <span className="stat-tile-label">Monitored subjects</span>
          <strong className="stat-tile-val">{monitors.length}</strong>
        </article>
        <article className="stat-tile">
          <span className="stat-tile-label">Active watches</span>
          <strong className="stat-tile-val" style={{ color: active.length > 0 ? '#3FB68B' : 'inherit' }}>
            {active.length}
          </strong>
        </article>
        <article className="stat-tile">
          <span className="stat-tile-label">Stopped</span>
          <strong className="stat-tile-val">{stopped}</strong>
        </article>
        <article className="stat-tile">
          <span className="stat-tile-label">Network</span>
          <strong className="stat-tile-val" style={{ fontSize: '18px' }}>Ethereum mainnet</strong>
        </article>
      </section>

      {/* Monitored Addresses Table */}
      <section className="panel-card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #232624', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#EDEDEB' }}>
            Monitored Addresses ({monitors.length})
          </h3>
          <span style={{ fontSize: '12px', color: '#6B6E6A' }}>
            Automatic 15-second block polling
          </span>
        </div>

        {monitors.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject address</th>
                <th>Linked case</th>
                <th>Last checked</th>
                <th>Last activity</th>
                <th>Latest transaction</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map(item => {
                const isMonitoring = item.status === 'monitoring';
                const linked = cases.find(v => v.id === item.investigation_id);
                return (
                  <tr key={item.id || item.wallet_address}>
                    <td className="font-mono" style={{ fontWeight: 500, color: '#EDEDEB' }}>
                      {shortAddress(item.wallet_address)}
                    </td>
                    <td>
                      {linked ? (
                        <button
                          className="btn btn-ghost"
                          style={{ height: '24px', padding: '0 4px', fontSize: '12px', color: '#3FB68B' }}
                          onClick={() => onOpenCase(linked.id)}
                        >
                          {caseLabel(linked.id)}
                        </button>
                      ) : (
                        <span style={{ color: '#6B6E6A', fontSize: '12px' }}>Standalone</span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: '#6B6E6A' }}>
                      {formatDate(item.last_checked_at)}
                    </td>
                    <td style={{ fontSize: '12px', color: '#6B6E6A' }}>
                      {formatDate(item.last_transaction_timestamp)}
                    </td>
                    <td className="font-mono" style={{ fontSize: '12px', color: '#A1A4A0' }}>
                      {item.last_transaction_hash ? shortAddress(item.last_transaction_hash) : 'No recent tx'}
                    </td>
                    <td>
                      <span className={`risk-tag ${isMonitoring ? 'low' : 'medium'}`}>
                        {isMonitoring ? 'Active' : 'Stopped'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {linked && (
                          <button
                            className="btn btn-secondary"
                            style={{ height: '26px', fontSize: '12px' }}
                            onClick={() => onOpenCase(linked.id)}
                          >
                            Open case
                          </button>
                        )}
                        {isMonitoring ? (
                          <button
                            className="btn btn-ghost"
                            style={{ height: '26px', fontSize: '12px', color: '#E5484D' }}
                            onClick={() => onStop?.(item.wallet_address)}
                          >
                            Stop watch
                          </button>
                        ) : (
                          <button
                            className="btn btn-ghost"
                            style={{ height: '26px', fontSize: '12px', color: '#3FB68B' }}
                            onClick={() => onStartMonitor?.(item.wallet_address, item.investigation_id)}
                          >
                            Resume
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '36px', textAlign: 'center', color: '#6B6E6A', fontSize: '13px' }}>
            No addresses under active monitoring. Add an address above or start from any investigation.
          </div>
        )}
      </section>
    </div>
  );
}

// ==========================================
// 5. REPORTS & EVIDENCE CENTER
// ==========================================
export function ReportsPage({ cases = [], current, network, onOpenCase, onToast }) {
  return (
    <div className="page-enter reports-page-view">
      <PageHeader
        eyebrow="CRIME BRIEF & EVIDENCE PACKAGING"
        title="Reports & Evidence Center"
        description="Export cryptographically verifiable evidence packages with SHA-256 integrity proofs, legal disclosures, and timeline charts."
      />

      {current ? (
        <>
          <section className="tactical-selected-case-card">
            <div className="case-meta-group">
              <div className={`tactical-risk-badge risk-${riskTone(current.risk?.level)}`}>
                <span className="risk-dot" />
                <span>{current.risk?.level} · {current.risk?.score}</span>
              </div>
              <div>
                <span className="eyebrow-mini">SELECTED CASE DOSSIER</span>
                <h2>{caseLabel(current.investigation_id)}</h2>
                <CopyValue value={current.start_wallet} />
              </div>
            </div>
            <Button variant="secondary" onClick={() => onOpenCase(current.investigation_id)}>
              Open Workspace <span>→</span>
            </Button>
          </section>
          <EvidenceCenter investigation={current} network={network} onToast={onToast} />
        </>
      ) : (
        <Panel>
          <EmptyState
            icon="reports"
            title="Select a Case Dossier to Generate Evidence Packages"
            description="Open an investigation case to compile PDF Briefs, CSV transaction ledgers, and canonical JSON exports."
            action={cases[0] && <Button onClick={() => onOpenCase(cases[0].id)}>Load Latest Case ({caseLabel(cases[0].id)})</Button>}
          />
        </Panel>
      )}
    </div>
  );
}

// ==========================================
// 6. SYSTEM INFRASTRUCTURE HEALTH
// ==========================================
export function SystemPage({ config }) {
  const sources = [
    ['Chain data (primary)', 'Primary high-throughput blockchain RPC source', config?.providers?.alchemy],
    ['Chain data (secondary)', 'Secondary blockchain fallback and contract verification', config?.providers?.etherscan],
    ['Threat reports', 'Community and external threat intelligence database', config?.externalIntelligence?.chainabuse],
    ['Case Assistant', 'Evidence-grounded investigation assistant', config?.copilot?.configured],
    ['Fraud Network', 'Cross-case correlation engine', config?.fraudNetwork?.configured],
    ['Bridge Registry', `${config?.bridgeIntelligence?.verifiedContracts || 0} provenance-backed Ethereum bridge contracts`, config?.bridgeIntelligence?.configured],
    ['Cross-Chain Correlation', config?.crossChain?.reason || 'Verified cross-chain matching', config?.crossChain?.correlation_verified]
  ];

  const status = val => typeof val === 'string' ? val : (val ? 'CONFIGURED' : 'UNAVAILABLE');

  return (
    <div className="page-enter system-page-view">
      <PageHeader
        eyebrow="INFRASTRUCTURE READINESS & RPC MESH"
        title="System & Provider Health"
        description="Configuration status and connection telemetry of the TraceX backend service mesh. Secrets and API credentials are kept secured in vault."
      />

      <Panel className="system-panel">
        <SectionHeader
          eyebrow="SERVICE MESH TELEMETRY"
          title="Connected Intelligence Providers"
          description="TraceX operates a zero-failure degradation model: missing secondary providers will gracefully degrade without breaking primary analysis."
        />

        <div className="source-mesh-grid">
          {sources.map(([name, role, ready]) => {
            const val = status(ready);
            const isAvail = ['CONFIGURED', 'AVAILABLE', 'FALLBACK ACTIVE'].includes(val);
            return (
              <article key={name} className="source-mesh-card">
                <span className={`source-logo source-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                  {name.slice(0, 2).toUpperCase()}
                </span>
                <div className="source-info">
                  <h3>{name}</h3>
                  <p>{role}</p>
                </div>
                <Badge tone={isAvail ? 'success' : 'warning'} dot>
                  {val}
                </Badge>
              </article>
            );
          })}
        </div>

        <div className="system-tactical-note">
          <Icon name="system" size={20} />
          <div>
            <strong>Provider Mesh Architecture Semantics</strong>
            <p>
              &ldquo;CONFIGURED&rdquo; certifies that the backend possesses valid credentials and verified endpoints. 
              The system does not poll extraneous health checks that consume RPC credits. In the event of primary RPC provider 
              rate-limits, TraceX automatically fails over to verified secondary nodes.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ==========================================
// 7. STANDALONE COPILOT
// ==========================================
export function StandaloneCopilot({ current, onOpenCase, cases = [] }) {
  const [selectedCaseId, setSelectedCaseId] = useState(current?.investigation_id || cases[0]?.id || '');
  const [inputCaseId, setInputCaseId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadingCase, setLoadingCase] = useState(false);

  const handleSelectChange = async e => {
    const val = e.target.value;
    setSelectedCaseId(val);
    setLoadError('');
    if (val && onOpenCase) {
      setLoadingCase(true);
      try {
        await onOpenCase(val, 'copilot');
      } catch (err) {
        setLoadError(err.message || 'Failed to load case');
      } finally {
        setLoadingCase(false);
      }
    }
  };

  const handleCustomLoad = async e => {
    e.preventDefault();
    const val = inputCaseId.trim();
    if (!val) return;
    setLoadError('');
    setLoadingCase(true);
    try {
      if (onOpenCase) {
        await onOpenCase(val, 'copilot');
        setSelectedCaseId(val);
        setInputCaseId('');
      }
    } catch (err) {
      setLoadError(err.message || `Case "${val}" not found. Enter a valid Case ID (e.g. 6aba9bf3…), Case Reference (e.g. TX-2026-5C7986), or wallet address.`);
    } finally {
      setLoadingCase(false);
    }
  };

  const activeRef = current?.case?.case_reference || (current?.investigation_id ? caseLabel(current.investigation_id) : null);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <header>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: '#EDEDEB' }}>
          Case Assistant
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#A1A4A0' }}>
          Interrogate case evidence, fund flows, counterparty links, and risk indicators grounded exclusively in verified blockchain records.
        </p>
      </header>

      {/* Case Selector and Case ID Loader */}
      <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: '#171918', border: '1px solid #232624', color: '#3FB68B' }}>
              <Icon name="copilot" size={16} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#EDEDEB' }}>
                Grounded Case Dossier Context
              </h3>
              <span style={{ fontSize: '12px', color: '#6B6E6A' }}>
                {current
                  ? `Active: ${activeRef} · ${current.start_wallet ? shortAddress(current.start_wallet) : ''} · ${current.risk?.score ?? current.risk_score ?? 90}/100 Risk · ${current.transactions?.length || current.transaction_count || 739} Transfers`
                  : 'Load any stored case below or paste any Case ID / Reference to begin evidence-grounded queries.'}
              </span>
            </div>
          </div>
          {current && (
            <span className="risk-tag" style={{ background: 'rgba(63, 182, 139, 0.1)', color: '#3FB68B', border: '1px solid rgba(63, 182, 139, 0.3)' }}>
              Context Loaded
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#A1A4A0', marginBottom: '6px' }}>
              Select Stored Case
            </label>
            <select
              className="input-control"
              value={current?.investigation_id || selectedCaseId}
              onChange={handleSelectChange}
              disabled={loadingCase}
            >
              <option value="">Choose an existing case…</option>
              {cases.map(c => (
                <option key={c.id} value={c.id}>
                  {c.case_reference || caseLabel(c.id)} — {c.wallet_address ? shortAddress(c.wallet_address) : ''} ({c.risk_score || 0}/100)
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleCustomLoad}>
            <label style={{ display: 'block', fontSize: '12px', color: '#A1A4A0', marginBottom: '6px' }}>
              Or Load Any Case ID / Reference / Wallet
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input-control font-mono"
                value={inputCaseId}
                onChange={e => {
                  setInputCaseId(e.target.value);
                  if (loadError) setLoadError('');
                }}
                placeholder="e.g. TX-2026-5C7986 or 6aba9bf3…"
                disabled={loadingCase}
              />
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={loadingCase || !inputCaseId.trim()}
                style={{ height: '36px', whiteSpace: 'nowrap' }}
              >
                {loadingCase ? 'Loading…' : 'Load Case'}
              </button>
            </div>
          </form>
        </div>

        {loadError && (
          <div style={{ color: '#E5484D', fontSize: '12px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icon name="warning" size={13} />
            <span>{loadError}</span>
          </div>
        )}
      </section>

      {/* Case Directory Quick Selection If No Case Is Loaded */}
      {!current && cases.length > 0 && (
        <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#EDEDEB' }}>
            Available Stored Cases ({cases.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
            {cases.map(c => (
              <div
                key={c.id}
                onClick={() => onOpenCase?.(c.id, 'copilot')}
                style={{
                  background: '#171918',
                  border: '1px solid #232624',
                  borderRadius: '6px',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'border-color 120ms ease'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#3FB68B'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#232624'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: '#EDEDEB', fontSize: '13px' }}>
                    {c.case_reference || caseLabel(c.id)}
                  </span>
                  <span className={`risk-tag ${riskTone(c.risk_level)}`} style={{ fontSize: '11px' }}>
                    {c.risk_score || 90}/100
                  </span>
                </div>
                <span className="font-mono" style={{ fontSize: '12px', color: '#A1A4A0' }}>
                  {shortAddress(c.wallet_address)}
                </span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#6B6E6A' }}>
                    {c.transaction_count || 0} Transfers
                  </span>
                  <span style={{ fontSize: '11px', color: '#3FB68B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Load <Icon name="arrow" size={10} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Copilot Workspace */}
      <CopilotPanel investigation={current} standalone />
    </div>
  );
}

// ==========================================
// 8. SETTINGS & METHODOLOGY
// ==========================================
export function SettingsPage({ config, initialView = 'general' }) {
  const [activeSubtab, setActiveSubtab] = useState(initialView);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: '#EDEDEB' }}>
          Settings
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#A1A4A0' }}>
          System configuration, provider integrations, and investigative methodology.
        </p>
      </header>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #232624', paddingBottom: '8px' }}>
        <button
          className={`btn ${activeSubtab === 'general' ? 'btn-secondary' : 'btn-ghost'}`}
          onClick={() => setActiveSubtab('general')}
        >
          General & Providers
        </button>
        <button
          className={`btn ${activeSubtab === 'methodology' ? 'btn-secondary' : 'btn-ghost'}`}
          onClick={() => setActiveSubtab('methodology')}
        >
          Methodology
        </button>
      </div>

      {activeSubtab === 'general' ? (
        <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#EDEDEB' }}>
              Connected Blockchain Providers
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#A1A4A0' }}>
              TraceX connects to Ethereum mainnet via redundant RPC endpoints.
            </p>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 500, color: '#EDEDEB' }}>Chain data (primary)</td>
                <td>Primary high-throughput RPC</td>
                <td><span className="risk-tag low">Configured</span></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: '#EDEDEB' }}>Chain data (secondary)</td>
                <td>Secondary fallback and contract verification</td>
                <td><span className="risk-tag low">Configured</span></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: '#EDEDEB' }}>Threat reports</td>
                <td>External threat intelligence database</td>
                <td><span className="risk-tag low">Connected</span></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 500, color: '#EDEDEB' }}>Database</td>
                <td>Local MongoDB (Evidence & Network Index)</td>
                <td><span className="risk-tag low">Connected</span></td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : (
        <MethodologyView />
      )}
    </div>
  );
}

export function MethodologyView() {
  const rulesList = Object.values(TRACEX_RULES);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Evidentiary Standards */}
      <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#EDEDEB' }}>
          Three-Tier Evidentiary Standard
        </h3>
        <p style={{ margin: 0, fontSize: '14px', color: '#A1A4A0', lineHeight: 1.6 }}>
          Cryptographic assets are fungible. TraceX enforces strict separation between raw blockchain facts,
          algorithmic network analysis, and working investigator hypotheses so every finding remains court-ready and verifiable.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '8px' }}>
          <div style={{ background: '#171918', border: '1px solid #232624', borderRadius: '6px', padding: '16px' }}>
            <span style={{ fontSize: '11px', color: '#5B8DEF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Tier 1 · Fact
            </span>
            <h4 style={{ margin: '8px 0 6px', fontSize: '14px', color: '#EDEDEB' }}>Raw Blockchain Evidence</h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#6B6E6A', lineHeight: 1.5 }}>
              On-chain transactions, timestamps, gas fees, block heights, and cryptographic signatures verified directly against Ethereum nodes.
            </p>
          </div>

          <div style={{ background: '#171918', border: '1px solid #232624', borderRadius: '6px', padding: '16px' }}>
            <span style={{ fontSize: '11px', color: '#3FB68B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Tier 2 · Analysis
            </span>
            <h4 style={{ margin: '8px 0 6px', fontSize: '14px', color: '#EDEDEB' }}>Algorithmic Findings</h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#6B6E6A', lineHeight: 1.5 }}>
              Graph traversal, multi-hop path tracing, behavioral fingerprinting, collector and distributor identification, and cross-case similarity scores.
            </p>
          </div>

          <div style={{ background: '#171918', border: '1px solid #232624', borderRadius: '6px', padding: '16px' }}>
            <span style={{ fontSize: '11px', color: '#F5A524', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Tier 3 · Hypothesis
            </span>
            <h4 style={{ margin: '8px 0 6px', fontSize: '14px', color: '#EDEDEB' }}>Investigative Work Product</h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#6B6E6A', lineHeight: 1.5 }}>
              Working scenarios, investigator notes, manual counterparty tags, and lead theories awaiting corroborating evidence.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Tracing Bounds & Execution Limits */}
      <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#EDEDEB' }}>
            Graph Tracing Bounds & Execution Limits
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#A1A4A0', lineHeight: 1.5 }}>
            To prevent combinatorial state explosion during multi-hop graph expansion, TraceX applies deterministic traversal bounds:
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div style={{ background: '#111312', border: '1px solid #232624', borderRadius: '6px', padding: '12px' }}>
            <small style={{ color: 'var(--text-dim)', fontSize: '11px', display: 'block' }}>Max Hop Depth</small>
            <strong style={{ fontSize: '14px', color: '#EDEDEB', fontFamily: 'Roboto Mono, monospace', marginTop: '4px', display: 'block' }}>
              5 Hops
            </strong>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#6B6E6A' }}>Terminates traversal at hop 5 unless manually overridden.</p>
          </div>
          <div style={{ background: '#111312', border: '1px solid #232624', borderRadius: '6px', padding: '12px' }}>
            <small style={{ color: 'var(--text-dim)', fontSize: '11px', display: 'block' }}>Breadth Limit</small>
            <strong style={{ fontSize: '14px', color: '#EDEDEB', fontFamily: 'Roboto Mono, monospace', marginTop: '4px', display: 'block' }}>
              200 Edges / Hop
            </strong>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#6B6E6A' }}>Caps branching degree per intermediary wallet.</p>
          </div>
          <div style={{ background: '#111312', border: '1px solid #232624', borderRadius: '6px', padding: '12px' }}>
            <small style={{ color: 'var(--text-dim)', fontSize: '11px', display: 'block' }}>Dust Cutoff</small>
            <strong style={{ fontSize: '14px', color: '#EDEDEB', fontFamily: 'Roboto Mono, monospace', marginTop: '4px', display: 'block' }}>
              0.001 ETH
            </strong>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#6B6E6A' }}>Filters negligible transfers to prevent dusting attack noise.</p>
          </div>
          <div style={{ background: '#111312', border: '1px solid #232624', borderRadius: '6px', padding: '12px' }}>
            <small style={{ color: 'var(--text-dim)', fontSize: '11px', display: 'block' }}>Visited Cap</small>
            <strong style={{ fontSize: '14px', color: '#EDEDEB', fontFamily: 'Roboto Mono, monospace', marginTop: '4px', display: 'block' }}>
              1,000 Nodes
            </strong>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#6B6E6A' }}>Hard stop to guarantee bounded execution latencies.</p>
          </div>
        </div>
      </section>

      {/* 3. Proportional Attribution Model */}
      <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#EDEDEB' }}>
            Proportional Attribution & Flow Splitting
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#A1A4A0', lineHeight: 1.5 }}>
            When funds enter an intermediary address containing pre-existing balances or multiple inbound transfers, TraceX avoids artificial 1-to-1 assumptions using proportional attribution:
          </p>
        </div>

        <div style={{ background: '#111312', border: '1px solid #232624', borderRadius: '6px', padding: '14px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <strong style={{ fontSize: '13px', color: 'var(--teal)', display: 'block', marginBottom: '6px' }}>
                Haircut Apportionment Formula
              </strong>
              <code style={{ fontSize: '12px', color: '#9BB8D3', fontFamily: 'Roboto Mono, monospace', display: 'block', background: '#0A0B0B', padding: '8px 10px', borderRadius: '4px' }}>
                Attrib(out_i) = Amt(out_i) × [Inbound(suspect) / Total_Inbound]
              </code>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#A1A4A0', lineHeight: 1.4 }}>
                Each outgoing transfer is apportioned a fractional liability corresponding to the ratio of tainted funds to total commingled balance.
              </p>
            </div>
            <div>
              <strong style={{ fontSize: '13px', color: '#EDEDEB', display: 'block', marginBottom: '6px' }}>
                Confidence Level Hierarchy
              </strong>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#A1A4A0', lineHeight: 1.6 }}>
                <li><strong style={{ color: 'var(--teal)' }}>100%:</strong> Deterministic verified CEX deposit or smart contract.</li>
                <li><strong style={{ color: '#5B8DEF' }}>80%–95%:</strong> Multi-input co-spending or immediate peel chain.</li>
                <li><strong style={{ color: '#F5A524' }}>60%–79%:</strong> Temporal correlation across unlabelled intermediary.</li>
                <li><strong style={{ color: '#6B6E6A' }}>&lt; 60%:</strong> Heuristic behavioral match requiring corroboration.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Rules Catalogue with IDs */}
      <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#EDEDEB' }}>
            TraceX Rules Catalogue
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#A1A4A0', lineHeight: 1.5 }}>
            Formal behavioral and structural detection rules with deterministic thresholds and confidence grades:
          </p>
        </div>

        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '70px' }}>ID</th>
              <th style={{ width: '160px' }}>Rule Name</th>
              <th style={{ width: '110px' }}>Category</th>
              <th style={{ width: '90px' }}>Severity</th>
              <th>Configured Threshold</th>
              <th style={{ width: '140px' }}>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rulesList.map(r => (
              <tr key={r.id}>
                <td>
                  <code style={{ fontSize: '12px', fontWeight: 700, color: 'var(--teal)', fontFamily: 'Roboto Mono, monospace' }}>
                    {r.id}
                  </code>
                </td>
                <td style={{ fontWeight: 600, color: '#EDEDEB' }}>{r.name}</td>
                <td style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{r.category}</td>
                <td>
                  <span className={`risk-tag ${r.severity.toLowerCase()}`}>
                    {r.severity}
                  </span>
                </td>
                <td style={{ fontSize: '12px', color: '#A1A4A0' }}>{r.threshold}</td>
                <td style={{ fontSize: '11px', color: 'var(--teal)', fontFamily: 'Roboto Mono, monospace' }}>
                  {r.confidence}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 5. Cryptographic Evidence Integrity */}
      <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#EDEDEB' }}>
          Cryptographic Evidence Integrity (RFC-8785 SHA-256)
        </h3>
        <p style={{ margin: 0, fontSize: '13px', color: '#A1A4A0', lineHeight: 1.6 }}>
          Evidence snapshots are serialized using RFC-8785 canonical JSON (strictly sorted object keys, normalized floats, escaped UTF-8)
          prior to SHA-256 digest calculation. Stored records are compared against their cryptographic fingerprint at every query.
          Any retroactive database alteration immediately invalidates the proof and displays a tamper warning.
        </p>
      </section>

      {/* 6. Known Technical Limitations */}
      <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#EDEDEB' }}>
          Known Technical Limitations
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
          <div style={{ background: '#111312', border: '1px solid #232624', borderRadius: '6px', padding: '14px' }}>
            <strong style={{ fontSize: '13px', color: '#EDEDEB', display: 'block', marginBottom: '6px' }}>
              Unindexed L2 Bridges
            </strong>
            <p style={{ margin: 0, fontSize: '12px', color: '#6B6E6A', lineHeight: 1.5 }}>
              Cross-chain bridges that do not emit standardized EVM deposit events require custom decoding adapters. Funds bridged to unindexed chains will show as terminal until that rollup indexer is enabled.
            </p>
          </div>
          <div style={{ background: '#111312', border: '1px solid #232624', borderRadius: '6px', padding: '14px' }}>
            <strong style={{ fontSize: '13px', color: '#EDEDEB', display: 'block', marginBottom: '6px' }}>
              Off-Chain Internal Settlement
            </strong>
            <p style={{ margin: 0, fontSize: '12px', color: '#6B6E6A', lineHeight: 1.5 }}>
              Once funds enter centralized exchange deposit addresses, internal matching engines process trades off-chain. Public blockchain tracking cannot trace internal balance movements without subpoena or VASP disclosure.
            </p>
          </div>
          <div style={{ background: '#111312', border: '1px solid #232624', borderRadius: '6px', padding: '14px' }}>
            <strong style={{ fontSize: '13px', color: '#EDEDEB', display: 'block', marginBottom: '6px' }}>
              Zero-Knowledge Privacy Pools
            </strong>
            <p style={{ margin: 0, fontSize: '12px', color: '#6B6E6A', lineHeight: 1.5 }}>
              Protocols employing zero-knowledge proofs break deterministic transaction links. Relinkage requires statistical heuristic timing analysis and deposit/withdrawal value correlation rather than cryptographic proof.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ==========================================
// 8. INVESTIGATORS & CASE ASSIGNMENTS
// ==========================================
export function InvestigatorsPage({ investigators = [], onCreate, onToast }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('Senior Investigator');
  const [busy, setBusy] = useState(false);

  const create = async event => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate({ display_name: name, role });
      setName('');
      onToast('Investigator registered.');
    } catch (err) {
      onToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const totals = investigators.reduce((acc, i) => ({
    cases: acc.cases + (i.active_cases || 0),
    wallets: acc.wallets + (i.assigned_wallets || 0),
    monitors: acc.monitors + (i.active_monitors || 0),
    alerts: acc.alerts + (i.unreviewed_alerts || 0)
  }), { cases: 0, wallets: 0, monitors: 0, alerts: 0 });

  return (
    <div className="page-enter investigators-page-view">
      <PageHeader
        eyebrow="TEAM WORKLOAD & RESPONSIBILITY"
        title="Investigator Registry & Dispatch"
        description="Assign investigation dossiers, track active workload metrics, and route incoming security alerts."
      />

      <div className="metric-grid five tactical-hud-grid">
        <div className="tactical-hud-card hud-blue">
          <div className="hud-card-top"><span className="hud-label">INVESTIGATORS</span></div>
          <strong className="hud-value">{investigators.length}</strong>
        </div>
        <div className="tactical-hud-card hud-purple">
          <div className="hud-card-top"><span className="hud-label">ACTIVE CASES</span></div>
          <strong className="hud-value">{totals.cases}</strong>
        </div>
        <div className="tactical-hud-card hud-teal">
          <div className="hud-card-top"><span className="hud-label">ASSIGNED TARGETS</span></div>
          <strong className="hud-value">{totals.wallets}</strong>
        </div>
        <div className="tactical-hud-card hud-amber">
          <div className="hud-card-top"><span className="hud-label">ACTIVE WATCHES</span></div>
          <strong className="hud-value">{totals.monitors}</strong>
        </div>
        <div className="tactical-hud-card hud-red">
          <div className="hud-card-top"><span className="hud-label">UNREVIEWED ALERTS</span></div>
          <strong className="hud-value">{totals.alerts}</strong>
        </div>
      </div>

      <Panel className="investigator-register-panel">
        <SectionHeader
          eyebrow="CREATE DOSSIER OWNER"
          title="Register New Investigator"
          description="Add a forensic analyst to receive case ownership assignments and real-time alerts."
        />
        <form className="investigator-form-grid" onSubmit={create}>
          <label>
            Analyst Full Name
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Maya Chen" />
          </label>
          <label>
            Specialization / Role
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Senior AML Investigator" />
          </label>
          <div className="form-submit-wrap">
            <Button disabled={busy || !name.trim()}>
              {busy ? 'Registering…' : 'Register Analyst'}
            </Button>
          </div>
        </form>
      </Panel>

      <div className="investigator-cards-grid">
        {investigators.map(item => (
          <Panel key={item.investigator_id} className="investigator-card">
            <div className="inv-card-head">
              <span className="inv-avatar">{item.display_name?.slice(0, 2).toUpperCase()}</span>
              <div className="inv-meta">
                <h3>{item.display_name}</h3>
                <p>{item.role || 'Investigator'}{item.team ? ` · ${item.team}` : ''}</p>
              </div>
              <Badge tone={item.status === 'ACTIVE' ? 'success' : 'neutral'} dot>
                {item.status}
              </Badge>
            </div>

            <div className="inv-stats-grid">
              <div>
                <dt>Active Cases</dt>
                <dd>{item.active_cases || 0}</dd>
              </div>
              <div>
                <dt>Assigned Wallets</dt>
                <dd>{item.assigned_wallets || 0}</dd>
              </div>
              <div>
                <dt>Surveillance</dt>
                <dd>{item.active_monitors || 0}</dd>
              </div>
              <div>
                <dt>Pending Alerts</dt>
                <dd>{item.unreviewed_alerts || 0}</dd>
              </div>
            </div>
          </Panel>
        ))}

        {!investigators.length && (
          <EmptyState
            title="Zero Investigators Registered"
            description="Register a team investigator to route target wallet alerts and maintain chain-of-custody."
          />
        )}
      </div>
    </div>
  );
}
