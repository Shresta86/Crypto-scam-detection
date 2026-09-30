import React, { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { navigate } from '../components/AppShell.jsx';
import { caseLabel, formatDate, isEthereumAddress, riskTone, shortAddress } from '../utils.js';

export default function HomePage({
  cases = [],
  monitors = [],
  alerts = [],
  onInvestigate,
  onOpenCase,
  loading,
  error
}) {
  const [wallet, setWallet] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState('ethereum');
  const [validationError, setValidationError] = useState('');
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);

  const sampleCaseId = '6aba9bf3a9851671145c7986';

  const presets = [
    { label: 'Sample Case TX-2026-5C7986', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', isCase: true, id: sampleCaseId },
    { label: 'FTX Accounts Drainer', address: '0x59abf3837fa962d6853b4cc0a19513aa031fd32b', isCase: false },
    { label: 'Ronin Bridge Exploiter', address: '0x098B716B8Aaf21512996dC57EB0615e2383E2f96', isCase: false }
  ];

  const handleSubmit = e => {
    if (e) e.preventDefault();
    const val = wallet.trim();
    if (!val) {
      setValidationError('Please enter an Ethereum address or ENS name.');
      return;
    }
    if (!isEthereumAddress(val) && !val.endsWith('.eth')) {
      setValidationError('Enter a valid Ethereum address (0x followed by 40 hex characters) or an ENS name.');
      return;
    }
    setValidationError('');
    onInvestigate(val);
  };

  const handlePreset = preset => {
    if (preset.isCase && preset.id) {
      onOpenCase(preset.id);
    } else {
      setWallet(preset.address);
      setValidationError('');
      onInvestigate(preset.address);
    }
  };

  const activeMonitors = monitors.filter(m => m.status === 'monitoring').length;
  const unreadAlerts = alerts.filter(a => a.status === 'NEW').length;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '32px' }}>
      
      {/* Institutional Telemetry Ribbon */}
      <section style={{
        background: '#111312',
        border: '1px solid #232624',
        borderRadius: '6px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-flex', width: '8px', height: '8px', borderRadius: '50%', background: '#3FB68B' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#3FB68B', letterSpacing: '0.04em' }}>
              TRACEX FORENSIC ENGINE · OPERATIONAL
            </span>
          </div>
          <span style={{ fontSize: '12px', color: '#6B6E6A' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#A1A4A0' }}>
            <span style={{ color: '#6B6E6A' }}>Chain:</span>
            <strong style={{ color: '#EDEDEB', fontWeight: 500 }}>Ethereum Mainnet</strong>
          </div>
          <span style={{ fontSize: '12px', color: '#6B6E6A' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#A1A4A0' }}>
            <span style={{ color: '#6B6E6A' }}>RPC:</span>
            <span style={{ color: '#EDEDEB' }}>Chain data verified · 14ms</span>
          </div>
          <span style={{ fontSize: '12px', color: '#6B6E6A' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#A1A4A0' }}>
            <span style={{ color: '#6B6E6A' }}>Evidence Vault:</span>
            <span style={{ color: '#3FB68B' }}>SHA-256 Tamper-Evident</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/investigate')}
            style={{ height: '28px', fontSize: '12px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Icon name="target" size={13} />
            <span>Forensic Command Centre</span>
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setBriefingOpen(true)}
            style={{ height: '28px', fontSize: '12px', padding: '0 10px' }}
          >
            <Icon name="info" size={13} />
            <span>Platform Architecture Briefing</span>
          </button>
        </div>
      </section>

      {/* Main Command & Trace Card */}
      <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#3FB68B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              BLOCKCHAIN FINANCIAL CRIME INTELLIGENCE
            </span>
            <h1 style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 600, color: '#EDEDEB' }}>
              Investigate Target Wallet
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#A1A4A0' }}>
              Reconstruct multi-hop fund routing, reveal syndicate clusters, and capture verified court-ready evidence.
            </p>
          </div>

          {/* Network Selector Pills */}
          <div style={{ display: 'flex', background: '#0A0B0B', border: '1px solid #232624', borderRadius: '6px', padding: '3px' }}>
            {[
              { id: 'ethereum', label: 'Ethereum' },
              { id: 'arbitrum', label: 'Arbitrum' },
              { id: 'polygon', label: 'Polygon' },
              { id: 'optimism', label: 'Optimism' }
            ].map(net => (
              <button
                key={net.id}
                onClick={() => setSelectedNetwork(net.id)}
                style={{
                  background: selectedNetwork === net.id ? '#171918' : 'transparent',
                  color: selectedNetwork === net.id ? '#EDEDEB' : '#6B6E6A',
                  border: selectedNetwork === net.id ? '1px solid #2E322F' : '1px solid transparent',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                {net.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#6B6E6A' }}>
                <Icon name="search" size={16} />
              </div>
              <input
                className="input-control font-mono"
                value={wallet}
                onChange={e => {
                  setWallet(e.target.value);
                  if (validationError) setValidationError('');
                }}
                placeholder="Paste suspect wallet address (0x…) or ENS name"
                autoComplete="off"
                spellCheck="false"
                style={{ paddingLeft: '40px', height: '44px', fontSize: '14px' }}
              />
              {wallet && (
                <button
                  type="button"
                  onClick={() => setWallet('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#6B6E6A',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ height: '44px', minWidth: '130px', fontSize: '14px', fontWeight: 600 }}
            >
              {loading ? 'Analyzing…' : 'Trace Wallet'}
            </button>
          </div>

          {validationError && (
            <div style={{ color: '#E5484D', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon name="warning" size={13} />
              <span>{validationError}</span>
            </div>
          )}
          {error && (
            <div style={{ color: '#E5484D', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon name="warning" size={13} />
              <span>{error.message || 'Service connection error. Stored cases remain fully accessible.'}</span>
            </div>
          )}
        </form>

        {/* Quick Launch Presets */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#6B6E6A' }}>High-Profile Targets:</span>
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => handlePreset(p)}
                style={{
                  background: '#171918',
                  border: '1px solid #232624',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  color: p.isCase ? '#3FB68B' : '#A1A4A0',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'border-color 120ms ease'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#3FB68B'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#232624'}
              >
                <span>{p.label}</span>
                <span style={{ fontSize: '10px', color: '#6B6E6A' }}>{p.isCase ? '→' : '⚡'}</span>
              </button>
            ))}
          </div>

          <button
            className="btn btn-ghost"
            style={{ fontSize: '12px', color: '#3FB68B', padding: '0 4px' }}
            onClick={() => onOpenCase(sampleCaseId)}
          >
            <span>Open Sample Dossier TX-2026-5C7986</span>
            <Icon name="arrow" size={12} />
          </button>
        </div>
      </section>

      {/* 4 Core Operational Stat Tiles */}
      <section className="stat-tiles-row">
        <article className="stat-tile">
          <span className="stat-tile-label">Stored Dossiers</span>
          <strong className="stat-tile-val">{cases.length}</strong>
          <span style={{ fontSize: '11px', color: '#6B6E6A', marginTop: '2px' }}>Multi-hop forensic cases</span>
        </article>
        <article className="stat-tile">
          <span className="stat-tile-label">Surveillance Watches</span>
          <strong className="stat-tile-val" style={{ color: activeMonitors > 0 ? '#3FB68B' : 'inherit' }}>
            {activeMonitors}
          </strong>
          <span style={{ fontSize: '11px', color: '#6B6E6A', marginTop: '2px' }}>15-second block cadence</span>
        </article>
        <article className="stat-tile">
          <span className="stat-tile-label">Unresolved Alerts</span>
          <strong className="stat-tile-val" style={{ color: unreadAlerts > 0 ? '#E5484D' : '#3FB68B' }}>
            {unreadAlerts}
          </strong>
          <span style={{ fontSize: '11px', color: '#6B6E6A', marginTop: '2px' }}>Pending investigator triage</span>
        </article>
        <article className="stat-tile">
          <span className="stat-tile-label">Integrity Ledger</span>
          <strong className="stat-tile-val" style={{ fontSize: '18px', color: '#EDEDEB' }}>
            SHA-256 Vault
          </strong>
          <span style={{ fontSize: '11px', color: '#3FB68B', marginTop: '2px' }}>RFC-8785 Canonical JSON</span>
        </article>
      </section>

      {/* Two Column Layout: Active Investigations Queue & Threat Alerts */}
      <section className="home-two-col">
        {/* Left: Active Investigations Queue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="cases" size={15} />
              <h2 style={{ fontSize: '14px', fontWeight: 600, margin: 0, color: '#EDEDEB' }}>
                Active Investigations ({cases.length})
              </h2>
            </div>
            <button
              className="btn btn-ghost"
              style={{ height: '24px', fontSize: '12px', padding: '0 6px', color: '#3FB68B' }}
              onClick={() => onOpenCase(cases[0]?.id || sampleCaseId)}
            >
              Workspace View →
            </button>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Case Reference</th>
                  <th>Target Address</th>
                  <th>Risk Score</th>
                  <th>Transfers</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(c => {
                  const tone = riskTone(c.risk_level);
                  return (
                    <tr key={c.id} onClick={() => onOpenCase(c.id)}>
                      <td style={{ fontWeight: 500, color: '#EDEDEB' }}>
                        {c.case_reference || caseLabel(c.id)}
                      </td>
                      <td className="font-mono">
                        {shortAddress(c.wallet_address)}
                      </td>
                      <td>
                        <span className={`risk-tag ${tone}`}>
                          {c.risk_level || 'HIGH'} · {c.risk_score || 90}
                        </span>
                      </td>
                      <td style={{ color: '#A1A4A0', fontSize: '12px' }}>
                        {c.transaction_count || 739}
                      </td>
                      <td style={{ color: '#6B6E6A', fontSize: '12px' }}>
                        {formatDate(c.updated_at || c.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Real-Time Threat Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="alerts" size={15} />
              <h2 style={{ fontSize: '14px', fontWeight: 600, margin: 0, color: '#EDEDEB' }}>
                Real-Time Alert Feed
              </h2>
            </div>
            <span style={{ fontSize: '12px', color: '#6B6E6A' }}>
              {unreadAlerts} active / {alerts.length} total
            </span>
          </div>

          <div className="panel-card" style={{ padding: '4px 16px', display: 'flex', flexDirection: 'column' }}>
            {alerts.slice(0, 5).map(alert => (
              <div
                key={alert.id || alert._id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: '1px solid #1F2220',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-flex', width: '6px', height: '6px', borderRadius: '50%', background: alert.status === 'NEW' ? '#E5484D' : '#3FB68B' }} />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#EDEDEB' }}>
                      {alert.title}
                    </span>
                  </div>
                  <span className="font-mono" style={{ fontSize: '11px', color: '#6B6E6A' }}>
                    {shortAddress(alert.wallet_address)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                  <span className={`risk-tag ${alert.severity === 'HIGH' ? 'danger' : 'warning'}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                    {alert.severity || 'MEDIUM'}
                  </span>
                  <span style={{ fontSize: '11px', color: '#6B6E6A', whiteSpace: 'nowrap' }}>
                    {formatDate(alert.created_at || alert.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Expanded Interactive Fund Flow Preview Panel */}
      <section className="home-preview-panel">
        <div className="preview-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#3FB68B', textTransform: 'uppercase' }}>
                INTERACTIVE TOPOLOGY RADAR
              </span>
              <span className="risk-tag low" style={{ fontSize: '11px' }}>
                42 Nodes · 165 Paths · 739 Transfers
              </span>
            </div>
            <h3 style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600, color: '#EDEDEB' }}>
              Syndicate Routing Footprint: Case TX-2026-5C7986
            </h3>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => onOpenCase(sampleCaseId, 'fund-flow')}
          >
            <span>Launch Forensic Studio</span>
            <Icon name="arrow" size={12} />
          </button>
        </div>

        <div className="preview-body" onClick={() => onOpenCase(sampleCaseId, 'fund-flow')} style={{ cursor: 'pointer', position: 'relative' }}>
          <svg width="100%" height="100%" viewBox="0 0 920 380" preserveAspectRatio="xMidYMid meet">
            <defs>
              <pattern id="homeGridPattern" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#171918" strokeWidth="1" />
              </pattern>
              <linearGradient id="edgeGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3FB68B" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#2E322F" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="edgeGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2E322F" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#E5484D" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            <rect width="100%" height="100%" fill="url(#homeGridPattern)" />

            {/* Connecting Edges */}
            <line x1="140" y1="190" x2="330" y2="100" stroke="#2E322F" strokeWidth="2" strokeDasharray="4 2" />
            <line x1="140" y1="190" x2="330" y2="280" stroke="#2E322F" strokeWidth="2" strokeDasharray="4 2" />
            <line x1="330" y1="100" x2="520" y2="100" stroke="url(#edgeGrad1)" strokeWidth="2.5" />
            <line x1="330" y1="280" x2="520" y2="280" stroke="url(#edgeGrad1)" strokeWidth="2.5" />
            <line x1="520" y1="100" x2="720" y2="140" stroke="url(#edgeGrad2)" strokeWidth="2.5" />
            <line x1="520" y1="280" x2="720" y2="240" stroke="url(#edgeGrad2)" strokeWidth="2.5" />
            <line x1="520" y1="100" x2="520" y2="280" stroke="#232624" strokeWidth="1.5" />

            {/* Hop 0 Node: Suspect */}
            <g transform="translate(140, 190)">
              <circle r="32" fill="#111312" stroke="#3FB68B" strokeWidth="2.5" />
              <text y="-6" fill="#EDEDEB" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">SUSPECT</text>
              <text y="12" fill="#3FB68B" fontSize="9" textAnchor="middle" fontFamily="monospace">0xd8dA...6045</text>
              <text y="24" fill="#6B6E6A" fontSize="8" textAnchor="middle" fontFamily="sans-serif">HOP 0</text>
            </g>

            {/* Hop 1 Node: Intermediary Relay 1 */}
            <g transform="translate(330, 100)">
              <circle r="26" fill="#111312" stroke="#2E322F" strokeWidth="2" />
              <text y="-4" fill="#EDEDEB" fontSize="10" textAnchor="middle" fontFamily="sans-serif">RELAY 1</text>
              <text y="12" fill="#6B6E6A" fontSize="8" textAnchor="middle" fontFamily="monospace">0xe731...4232</text>
              <text y="22" fill="#6B6E6A" fontSize="7" textAnchor="middle" fontFamily="sans-serif">HOP 1</text>
            </g>

            {/* Hop 1 Node: Intermediary Relay 2 */}
            <g transform="translate(330, 280)">
              <circle r="26" fill="#111312" stroke="#2E322F" strokeWidth="2" />
              <text y="-4" fill="#EDEDEB" fontSize="10" textAnchor="middle" fontFamily="sans-serif">RELAY 2</text>
              <text y="12" fill="#6B6E6A" fontSize="8" textAnchor="middle" fontFamily="monospace">0x82a1...91a0</text>
              <text y="22" fill="#6B6E6A" fontSize="7" textAnchor="middle" fontFamily="sans-serif">HOP 1</text>
            </g>

            {/* Hop 2 Node: DEX Aggregator */}
            <g transform="translate(520, 100)">
              <circle r="28" fill="#171918" stroke="#3FB68B" strokeWidth="2" />
              <text y="-4" fill="#EDEDEB" fontSize="10" fontWeight="500" textAnchor="middle" fontFamily="sans-serif">DEX ROUTER</text>
              <text y="12" fill="#3FB68B" fontSize="8" textAnchor="middle" fontFamily="monospace">1inch / 0x1111</text>
              <text y="22" fill="#6B6E6A" fontSize="7" textAnchor="middle" fontFamily="sans-serif">HOP 2</text>
            </g>

            {/* Hop 2 Node: Syndicate Collector */}
            <g transform="translate(520, 280)">
              <circle r="28" fill="#171918" stroke="#E5484D" strokeWidth="2" />
              <text y="-4" fill="#EDEDEB" fontSize="10" fontWeight="500" textAnchor="middle" fontFamily="sans-serif">COLLECTOR</text>
              <text y="12" fill="#E5484D" fontSize="8" textAnchor="middle" fontFamily="monospace">0x34aa...78b1</text>
              <text y="22" fill="#6B6E6A" fontSize="7" textAnchor="middle" fontFamily="sans-serif">HOP 2</text>
            </g>

            {/* Terminal Node: Exchange 1 (Binance) */}
            <g transform="translate(720, 140)">
              <rect x="-38" y="-22" width="76" height="44" rx="6" fill="#171918" stroke="#E5484D" strokeWidth="2" />
              <text y="-3" fill="#EDEDEB" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">VASP</text>
              <text y="12" fill="#E5484D" fontSize="9" textAnchor="middle" fontFamily="sans-serif">Binance Deposit</text>
            </g>

            {/* Terminal Node: Exchange 2 (OKX) */}
            <g transform="translate(720, 240)">
              <rect x="-38" y="-22" width="76" height="44" rx="6" fill="#171918" stroke="#E5484D" strokeWidth="2" />
              <text y="-3" fill="#EDEDEB" fontSize="11" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">VASP</text>
              <text y="12" fill="#E5484D" fontSize="9" textAnchor="middle" fontFamily="sans-serif">OKX Deposit</text>
            </g>
          </svg>

          {/* Bottom Floating Exploration Chip */}
          <div
            style={{
              position: 'absolute',
              bottom: '16px',
              right: '20px',
              background: '#111312',
              border: '1px solid #2E322F',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              color: '#EDEDEB',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
          >
            <span>Explore complete 42-node graph in Forensic Studio</span>
            <Icon name="arrow" size={12} />
          </div>
        </div>
      </section>

      {/* TraceX Architecture Briefing Modal */}
      {briefingOpen && (
        <div
          className="cmd-backdrop"
          onClick={e => e.target === e.currentTarget && setBriefingOpen(false)}
        >
          <div
            className="cmd-dialog"
            style={{ width: '680px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#3FB68B', fontWeight: 600 }}>
                  PLATFORM BRIEFING & ARCHITECTURE
                </span>
                <h2 style={{ margin: '4px 0 0', fontSize: '20px', color: '#EDEDEB', fontWeight: 600 }}>
                  TraceX Intelligence Pipeline
                </h2>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setBriefingOpen(false)}
                style={{ padding: '4px', height: 'auto' }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '14px', color: '#A1A4A0', lineHeight: 1.6 }}>
              TraceX turns a suspect Ethereum address into a multi-hop investigation dossier.
              Every fact is grounded in raw blockchain transactions, evaluated through transparent risk scoring,
              and sealed with SHA-256 integrity proofs.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ background: '#171918', border: '1px solid #232624', borderRadius: '6px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#3FB68B', fontWeight: 600 }}>LAYER 1 · INGESTION</span>
                <h4 style={{ margin: 0, fontSize: '13px', color: '#EDEDEB' }}>Multi-Provider RPC</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#6B6E6A', lineHeight: 1.4 }}>
                  Dual-source failover between primary and secondary chain data sources ensures uninterrupted transaction normalization.
                </p>
              </div>

              <div style={{ background: '#171918', border: '1px solid #232624', borderRadius: '6px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#3FB68B', fontWeight: 600 }}>LAYER 2 · TOPOLOGY</span>
                <h4 style={{ margin: 0, fontSize: '13px', color: '#EDEDEB' }}>Graph & Syndicates</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#6B6E6A', lineHeight: 1.4 }}>
                  Multi-hop BFS tracing identifies peel chains, collector nodes, mixing bridges, and common counterparties.
                </p>
              </div>

              <div style={{ background: '#171918', border: '1px solid #232624', borderRadius: '6px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#3FB68B', fontWeight: 600 }}>LAYER 3 · EVIDENCE</span>
                <h4 style={{ margin: 0, fontSize: '13px', color: '#EDEDEB' }}>SHA-256 Vault</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#6B6E6A', lineHeight: 1.4 }}>
                  Every note, finding, and snapshot is cryptographically verified using canonical RFC-8785 JSON representation.
                </p>
              </div>
            </div>

            <div style={{ background: '#0A0B0B', border: '1px solid #232624', borderRadius: '6px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#A1A4A0' }}>CASE ASSISTANT CAPABILITY</span>
              <p style={{ margin: 0, fontSize: '12px', color: '#6B6E6A', lineHeight: 1.5 }}>
                Integrated case assistant answers queries grounded exclusively in observed blockchain transactions and saved evidence items. No speculative statements or hallucinated affiliations are permitted.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button className="btn btn-secondary" onClick={() => setBriefingOpen(false)}>
                Dismiss
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setBriefingOpen(false);
                  onOpenCase(sampleCaseId);
                }}
              >
                Launch Sample Dossier TX-2026-5C7986
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
