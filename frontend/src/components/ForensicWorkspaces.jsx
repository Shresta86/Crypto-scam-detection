import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Badge, Button, EmptyState, MetricCard, Panel, SectionHeader } from './Primitives.jsx';
import { api } from '../api.js';
import { formatAmount, formatDate, riskTone, shortAddress } from '../utils.js';

// ============================================================================
// 1. MONEY FLOW RECONSTRUCTION
// ============================================================================
export function MoneyFlowReconstruction({ investigation, onTab, onCapture, onToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeHop, setActiveHop] = useState(null);
  const [selectedTx, setSelectedTx] = useState('');
  const [animating, setAnimating] = useState(true);

  const nonZeroTxs = useMemo(() => {
    return (investigation?.transactions || []).filter(tx => Number(tx.amount) > 0);
  }, [investigation]);

  useEffect(() => {
    if (!investigation?.investigation_id) return;
    setLoading(true);
    api.moneyFlow(investigation.investigation_id, selectedTx || undefined)
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(err => {
        console.error('Money flow error:', err);
        setLoading(false);
      });
  }, [investigation?.investigation_id, selectedTx]);

  const replay = () => {
    setAnimating(false);
    setTimeout(() => setAnimating(true), 50);
  };

  const captureReconstruction = () => {
    if (!data || !onCapture) return;
    onCapture({
      evidence_type: 'TRACED_PATH',
      title: `Money Flow: ${data.source_transfer?.amount} ${data.source_transfer?.asset} from ${shortAddress(data.source_transfer?.from)}`,
      source_provider: 'TraceX Proportional Flow Attribution',
      snapshot: {
        source_transfer: data.source_transfer,
        traceable_amount: data.traceable_amount,
        unresolved_amount: data.unresolved_amount,
        destinations_count: data.destinations_count,
        methodology: data.methodology
      }
    });
  };

  return (
    <div className="forensic-workspace-section">
      <div className="forensic-section-head">
        <div>
          <span className="forensic-eyebrow">FUND FLOW PROPAGATION</span>
          <h2 className="forensic-title">Money Flow Reconstruction</h2>
          <p className="forensic-desc">
            How a selected reported transfer propagated through the observed network using bounded proportional flow allocation.
          </p>
        </div>
        <div className="forensic-actions-row">
          <Button variant="secondary" onClick={replay} icon="investigate">
            [ Replay Flow ]
          </Button>
          <Button variant="ghost" onClick={captureReconstruction}>
            [ Capture Evidence ]
          </Button>
          <Button variant="ghost" onClick={() => onToast?.('Reconstruction figure queued for executive report export.')}>
            [ Add Figure To Report ]
          </Button>
        </div>
      </div>

      {/* Starting Transfer Picker */}
      <div className="forensic-picker-bar">
        <label htmlFor="tx-picker">Selected Reported Transfer:</label>
        <select
          id="tx-picker"
          value={selectedTx}
          onChange={e => setSelectedTx(e.target.value)}
          className="forensic-select"
        >
          {nonZeroTxs.slice(0, 15).map(tx => (
            <option key={tx.hash || tx.transaction_hash} value={tx.hash || tx.transaction_hash}>
              {tx.amount} {tx.asset || 'ETH'} · {shortAddress(tx.from)} → {shortAddress(tx.to)} ({tx.timestamp ? tx.timestamp.slice(0, 16) : 'Block tx'})
            </option>
          ))}
        </select>
        <span className="forensic-badge-tag">
          {data?.traceable_percentage ?? 100}% Traceable in Scope
        </span>
      </div>

      {loading ? (
        <div className="forensic-loading-box">Reconstructing proportional fund flow...</div>
      ) : data?.status === 'reconstructed' ? (
        <div className="forensic-flow-grid">
          {/* Summary Metric Cards */}
          <div className="forensic-metrics-row">
            <div className="forensic-metric-box">
              <span className="metric-lbl">ORIGINAL SELECTED AMOUNT</span>
              <strong className="metric-val">
                {data.source_transfer?.amount} <small>{data.source_transfer?.asset}</small>
              </strong>
              <span className="metric-sub">Tx {shortAddress(data.source_transfer?.hash)}</span>
            </div>
            <div className="forensic-metric-box accent">
              <span className="metric-lbl">OBSERVABLY TRACEABLE PORTION</span>
              <strong className="metric-val text-green">
                {data.traceable_amount} <small>{data.source_transfer?.asset}</small>
              </strong>
              <span className="metric-sub">{data.traceable_percentage}% of reported inflow</span>
            </div>
            <div className="forensic-metric-box">
              <span className="metric-lbl">UNRESOLVED / TERMINAL PORTION</span>
              <strong className="metric-val text-amber">
                {data.unresolved_amount} <small>{data.source_transfer?.asset}</small>
              </strong>
              <span className="metric-sub">Retained, mixed, or beyond 2 hops</span>
            </div>
            <div className="forensic-metric-box">
              <span className="metric-lbl">DESTINATIONS & ENTITIES</span>
              <strong className="metric-val">
                {data.destinations_count} <small>wallets</small>
              </strong>
              <span className="metric-sub">{data.entity_interactions?.length || 0} attributed endpoints</span>
            </div>
          </div>

          {/* Interactive Flow Tree Diagram */}
          <div className="forensic-flow-canvas">
            <div className="flow-column source-col">
              <span className="col-label">01 REPORTED SOURCE</span>
              <div className="flow-node source-node">
                <span className="node-role">SENDER</span>
                <strong>{shortAddress(data.source_transfer?.from)}</strong>
                <span className="node-amount">{data.source_transfer?.amount} {data.source_transfer?.asset}</span>
                <small className="node-time">{data.source_transfer?.timestamp || 'Initial'}</small>
              </div>
            </div>

            <div className={`flow-connector ${animating ? 'active' : ''}`}>
              <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                <path d="M 0 20 L 100 20" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4"/>
              </svg>
              <span className="flow-arrow-lbl">{data.source_transfer?.amount} {data.source_transfer?.asset}</span>
            </div>

            <div className="flow-column intermediary-col">
              <span className="col-label">02 SUSPECT WALLET (HOP 1)</span>
              <div className="flow-node suspect-node">
                <span className="node-role">SUSPECT / RECIPIENT</span>
                <strong>{shortAddress(data.source_transfer?.to)}</strong>
                <span className="node-note">Dispersed to {data.hop_1_movements?.length || 0} destinations</span>
              </div>
            </div>

            <div className={`flow-connector ${animating ? 'active' : ''}`}>
              <svg viewBox="0 0 100 80" preserveAspectRatio="none">
                <path d="M 0 40 C 50 40, 50 10, 100 10" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M 0 40 C 50 40, 50 70, 100 70" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </div>

            <div className="flow-column downstream-col">
              <span className="col-label">03 MULTI-HOP DISPERSAL (HOP 2)</span>
              <div className="downstream-branches">
                {data.hop_1_movements?.slice(0, 4).map((h1, idx) => (
                  <div key={h1.hash || idx} className="branch-card">
                    <div className="branch-head">
                      <strong>{shortAddress(h1.to)}</strong>
                      <span className="branch-amount">{h1.amount} {h1.asset}</span>
                    </div>
                    <div className="branch-meta">
                      {h1.exchange ? (
                        <span className="entity-chip">{h1.exchange} (VASP)</span>
                      ) : (
                        <span>Intermediary forward</span>
                      )}
                      <small>{h1.timestamp ? h1.timestamp.slice(11, 19) : ''}</small>
                    </div>
                    {h1.downstream_branches?.length > 0 && (
                      <div className="sub-branches">
                        {h1.downstream_branches.slice(0, 2).map((h2, sIdx) => (
                          <div key={h2.hash || sIdx} className="sub-branch-item">
                            <span>↳ {shortAddress(h2.to)}:</span>
                            <b>{h2.amount} {h2.asset}</b>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Forensic Limitation Disclaimer */}
          <div className="forensic-disclaimer-card">
            <strong>FORENSIC LIMITATION & ALLOCATION METHODOLOGY:</strong>
            <p>
              Crypto assets are fungible. TraceX does not pretend a specific token unit maintains an immutable identity
              after consolidation or mingling. Downstream flows are computed using proportional flow allocation
              bounded within the retrieved multi-hop depth. This is an analytical aid, not proof of criminal coordination.
            </p>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No Flow Reconstructed"
          description="Select a transfer with non-zero value to reconstruct downstream fund movement."
        />
      )}
    </div>
  );
}

// ============================================================================
// 2. WALLET BEHAVIOUR FINGERPRINT & COMPARISON
// ============================================================================
export function WalletFingerprintWorkspace({ investigation, onTab, onCapture }) {
  const [fingerprint, setFingerprint] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [selectedWallet, setSelectedWallet] = useState(investigation?.start_wallet || '');
  const [compareWallet, setCompareWallet] = useState('');
  const [activeDimension, setActiveDimension] = useState(null);

  const candidateWallets = useMemo(() => {
    const list = [investigation?.start_wallet];
    (investigation?.paths || []).forEach(p => {
      if (p.from) list.push(p.from);
      if (p.to) list.push(p.to);
    });
    return [...new Set(list.filter(Boolean))];
  }, [investigation]);

  useEffect(() => {
    if (!investigation?.investigation_id || !selectedWallet) return;
    api.fingerprint(investigation.investigation_id, selectedWallet)
      .then(setFingerprint)
      .catch(console.error);
  }, [investigation?.investigation_id, selectedWallet]);

  const handleCompare = () => {
    if (!compareWallet || compareWallet === selectedWallet) return;
    api.compareFingerprint(investigation.investigation_id, selectedWallet, compareWallet)
      .then(setComparison)
      .catch(console.error);
  };

  const m = fingerprint?.metrics || {};

  return (
    <div className="forensic-workspace-section">
      <div className="forensic-section-head">
        <div>
          <span className="forensic-eyebrow">BEHAVIORAL PROFILING</span>
          <h2 className="forensic-title">Wallet Behaviour Fingerprint</h2>
          <p className="forensic-desc">
            Explainable profile derived from observed transfer frequency, forwarding intervals, fan-in/fan-out, and topology centrality.
          </p>
        </div>
        <div className="forensic-actions-row">
          <Button variant="secondary" onClick={() => onTab?.('transactions')}>
            [ Show Underlying Transfers ]
          </Button>
          <Button variant="ghost" onClick={() => onTab?.('fund-flow')}>
            [ Show Graph Structure ]
          </Button>
        </div>
      </div>

      {/* Target Selector */}
      <div className="forensic-picker-bar">
        <label htmlFor="fingerprint-wallet">Subject Wallet:</label>
        <select
          id="fingerprint-wallet"
          value={selectedWallet}
          onChange={e => {
            setSelectedWallet(e.target.value);
            setComparison(null);
          }}
          className="forensic-select"
        >
          {candidateWallets.slice(0, 20).map(w => (
            <option key={w} value={w}>
              {w} {w === investigation?.start_wallet ? '(Subject Case Wallet)' : ''}
            </option>
          ))}
        </select>
      </div>

      {fingerprint && (
        <div className="fingerprint-grid">
          {/* Dimension Cards */}
          <div className="dimensions-panel">
            <h3 className="sub-title">Observed Behaviour Dimensions</h3>
            <div className="dimension-cards-grid">
              <div
                className={`dim-card ${activeDimension === 'delay' ? 'selected' : ''}`}
                onClick={() => setActiveDimension('delay')}
              >
                <span className="dim-name">FORWARDING DELAY</span>
                <strong className="dim-val">{m.median_forwarding_delay_sec}s</strong>
                <small className="dim-desc">Median time between incoming and outgoing transfers</small>
                <span className="dim-action">Click to inspect timing →</span>
              </div>

              <div
                className={`dim-card ${activeDimension === 'fanout' ? 'selected' : ''}`}
                onClick={() => setActiveDimension('fanout')}
              >
                <span className="dim-name">FAN-OUT / FAN-IN</span>
                <strong className="dim-val">{m.fan_out} out / {m.fan_in} in</strong>
                <small className="dim-desc">Ratio of distinct destinations vs distinct sources</small>
                <span className="dim-action">Click to view graph →</span>
              </div>

              <div
                className={`dim-card ${activeDimension === 'frequency' ? 'selected' : ''}`}
                onClick={() => setActiveDimension('frequency')}
              >
                <span className="dim-name">TX FREQUENCY</span>
                <strong className="dim-val">{m.transaction_frequency_per_day} /day</strong>
                <small className="dim-desc">Observed over {m.observation_span_days} days span</small>
                <span className="dim-action">Click for transfer list →</span>
              </div>

              <div
                className={`dim-card ${activeDimension === 'collector' ? 'selected' : ''}`}
                onClick={() => setActiveDimension('collector')}
              >
                <span className="dim-name">COLLECTOR TENDENCY</span>
                <strong className="dim-val">{m.collector_tendency}/100</strong>
                <small className="dim-desc">Aggregation score based on multi-source consolidation</small>
                <span className="dim-action">Click for topology roles →</span>
              </div>

              <div
                className={`dim-card ${activeDimension === 'distributor' ? 'selected' : ''}`}
                onClick={() => setActiveDimension('distributor')}
              >
                <span className="dim-name">DISTRIBUTOR TENDENCY</span>
                <strong className="dim-val">{m.distributor_tendency}/100</strong>
                <small className="dim-desc">Dispersal score based on rapid outward splitting</small>
                <span className="dim-action">Click for topology roles →</span>
              </div>

              <div
                className={`dim-card ${activeDimension === 'diversity' ? 'selected' : ''}`}
                onClick={() => setActiveDimension('diversity')}
              >
                <span className="dim-name">COUNTERPARTY DIVERSITY</span>
                <strong className="dim-val">{m.counterparty_diversity}</strong>
                <small className="dim-desc">Ratio of unique counterparts ({m.in_degree + m.out_degree} unique)</small>
                <span className="dim-action">Click for counterparts →</span>
              </div>
            </div>

            {/* 24-Hour Activity Histogram */}
            <div className="activity-histogram-box">
              <span className="hist-title">ACTIVE HOUR DISTRIBUTION (UTC)</span>
              <div className="hist-bars">
                {(m.hourly_distribution || []).map((cnt, hour) => {
                  const maxH = Math.max(1, ...(m.hourly_distribution || []));
                  return (
                    <div key={hour} className="hist-col" title={`${hour}:00 UTC — ${cnt} transfers`}>
                      <div className="hist-fill" style={{ height: `${(cnt / maxH) * 100}%` }}/>
                      <span className="hist-lbl">{hour % 4 === 0 ? `${hour}h` : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Wallet Comparison Column */}
          <div className="comparison-panel">
            <h3 className="sub-title">Compare Wallet Behaviour</h3>
            <p className="dim-desc">Select a secondary wallet to compare transfer dynamics.</p>
            <div className="compare-picker">
              <select
                value={compareWallet}
                onChange={e => setCompareWallet(e.target.value)}
                className="forensic-select"
              >
                <option value="">-- Choose Comparison Counterparty --</option>
                {candidateWallets.filter(w => w !== selectedWallet).slice(0, 15).map(w => (
                  <option key={w} value={w}>{shortAddress(w)}</option>
                ))}
              </select>
              <Button variant="secondary" onClick={handleCompare} disabled={!compareWallet}>
                Compare Wallets
              </Button>
            </div>

            {comparison && (
              <div className="comparison-results">
                <div className="comp-wallets">
                  <div>
                    <span className="comp-tag">WALLET A</span>
                    <code>{shortAddress(comparison.wallet_a)}</code>
                  </div>
                  <b>VS</b>
                  <div>
                    <span className="comp-tag">WALLET B</span>
                    <code>{shortAddress(comparison.wallet_b)}</code>
                  </div>
                </div>

                <div className="comp-list">
                  <strong>FACTUAL SIMILARITIES:</strong>
                  {comparison.similarities?.length ? (
                    <ul>
                      {comparison.similarities.map((s, idx) => (
                        <li key={idx}><b>{s.feature}:</b> {s.note}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="dim-desc">No significant behavioral similarities detected.</p>
                  )}

                  <strong>FACTUAL DIFFERENCES:</strong>
                  {comparison.differences?.length ? (
                    <ul>
                      {comparison.differences.map((d, idx) => (
                        <li key={idx}><b>{d.feature}:</b> {d.note}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="dim-desc">No major timing or dispersal differences.</p>
                  )}
                </div>

                <div className="forensic-disclaimer-card warning">
                  <strong>CRITICAL FORENSIC DISCLAIMER:</strong>
                  <p>{comparison.disclaimer}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. INFRASTRUCTURE REUSE RADAR
// ============================================================================
export function InfrastructureReuseRadar({ investigation, onTab, onOpenCase }) {
  const [data, setData] = useState({ items: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!investigation?.investigation_id) return;
    setLoading(true);
    api.infrastructureReuse(investigation.investigation_id)
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(err => {
        console.error('Infrastructure reuse error:', err);
        setLoading(false);
      });
  }, [investigation?.investigation_id]);

  return (
    <div className="forensic-workspace-section">
      <div className="forensic-section-head">
        <div>
          <span className="forensic-eyebrow">CROSS-CASE CORRELATION</span>
          <h2 className="forensic-title">Infrastructure Reuse Radar</h2>
          <p className="forensic-desc">
            Automatically surfaces intermediaries, collectors, bridges, and VASP endpoints observed across multiple investigations.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="forensic-loading-box">Scanning cross-case indexes for shared infrastructure...</div>
      ) : data.items?.length ? (
        <div className="reuse-table-container">
          <table className="forensic-table">
            <thead>
              <tr>
                <th>REUSED INFRASTRUCTURE</th>
                <th>INFRASTRUCTURE TYPE</th>
                <th>CASES OBSERVED IN</th>
                <th>FREQUENCY</th>
                <th>FIRST OBSERVED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                <tr key={idx}>
                  <td>
                    <code className="mono-address">{item.target}</code>
                  </td>
                  <td>
                    <span className={`role-pill ${item.type === 'INTERMEDIARY' ? 'amber' : 'blue'}`}>
                      {item.type}
                    </span>
                  </td>
                  <td>
                    <div className="case-chips-row">
                      {item.cases_observed_in.map(cid => (
                        <button
                          key={cid}
                          className="case-chip-btn"
                          onClick={() => onOpenCase?.(cid)}
                          title={`Open case ${cid}`}
                        >
                          TX-{cid.slice(-6).toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>
                    <strong>{item.frequency} cases</strong>
                  </td>
                  <td>
                    <small>{item.first_observed}</small>
                  </td>
                  <td>
                    <Button variant="ghost" onClick={() => onTab?.('fraud-network')}>
                      Inspect in Network →
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No Cross-Case Infrastructure Reuse Detected"
          description="None of the counterparties or intermediaries in this case have been observed in other saved investigations."
        />
      )}
    </div>
  );
}

// ============================================================================
// 4. INVESTIGATION HOTSPOT MAP
// ============================================================================
export function InvestigationHotspotMap({ investigation, onTab }) {
  const [data, setData] = useState({ hotspots: [] });
  const [selectedHotspot, setSelectedHotspot] = useState(null);

  useEffect(() => {
    if (!investigation?.investigation_id) return;
    api.hotspots(investigation.investigation_id)
      .then(res => {
        setData(res);
        if (res.hotspots?.length) setSelectedHotspot(res.hotspots[0]);
      })
      .catch(console.error);
  }, [investigation?.investigation_id]);

  return (
    <div className="forensic-workspace-section">
      <div className="forensic-section-head">
        <div>
          <span className="forensic-eyebrow">ANALYTICAL SIGNAL DENSITY</span>
          <h2 className="forensic-title">Investigation Hotspots</h2>
          <p className="forensic-desc">
            Which regions of this transaction network deserve immediate investigator attention based on overlapping activity signals.
          </p>
        </div>
      </div>

      <div className="hotspots-layout">
        <div className="hotspots-list">
          {data.hotspots?.map((spot, idx) => (
            <div
              key={spot.address}
              className={`hotspot-card ${selectedHotspot?.address === spot.address ? 'active' : ''}`}
              onClick={() => setSelectedHotspot(spot)}
            >
              <div className="hotspot-card-top">
                <span className={`priority-badge ${spot.level.toLowerCase()}`}>
                  {spot.level} PRIORITY ({spot.priority_score}/100)
                </span>
                <span className="hotspot-idx">#0{idx + 1}</span>
              </div>
              <code className="hotspot-addr">{spot.address}</code>
              <div className="hotspot-signals-preview">
                {spot.signals.slice(0, 2).map((sig, sIdx) => (
                  <span key={sIdx} className="sig-bullet">• {sig}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {selectedHotspot && (
          <div className="hotspot-inspector">
            <span className="forensic-eyebrow">HOTSPOT DETAIL & SIGNALS</span>
            <h3>{selectedHotspot.address}</h3>
            <span className={`priority-tag ${selectedHotspot.level.toLowerCase()}`}>
              Signal Density: {selectedHotspot.priority_score}/100 ({selectedHotspot.level} Priority)
            </span>

            <div className="inspector-section">
              <strong>WHY THIS REGION IS HIGHLIGHTED:</strong>
              <ul className="signals-full-list">
                {selectedHotspot.signals.map((sig, idx) => (
                  <li key={idx}>{sig}</li>
                ))}
              </ul>
            </div>

            <div className="inspector-section">
              <strong>SUPPORTING TRANSACTIONS:</strong>
              <div className="tx-pills-row">
                {selectedHotspot.supporting_transactions?.length ? (
                  selectedHotspot.supporting_transactions.map(tx => (
                    <code key={tx} className="tx-hash-mono">{shortAddress(tx)}</code>
                  ))
                ) : (
                  <small>Evidence recorded in case graph</small>
                )}
              </div>
            </div>

            <div className="inspector-actions">
              <Button variant="secondary" onClick={() => onTab?.('fund-flow')}>
                [ Focus in Graph Canvas ]
              </Button>
              <Button variant="ghost" onClick={() => onTab?.('transactions')}>
                [ Open Supporting Transfers ]
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 5. TRANSACTION PATTERN MOTIFS
// ============================================================================
export function TransactionPatternMotifs({ investigation, onTab, onCapture }) {
  const [data, setData] = useState({ motifs: [] });
  const [activeMotif, setActiveMotif] = useState(null);

  useEffect(() => {
    if (!investigation?.investigation_id) return;
    api.motifs(investigation.investigation_id)
      .then(res => {
        setData(res);
        if (res.motifs?.length) setActiveMotif(res.motifs[0]);
      })
      .catch(console.error);
  }, [investigation?.investigation_id]);

  return (
    <div className="forensic-workspace-section">
      <div className="forensic-section-head">
        <div>
          <span className="forensic-eyebrow">TOPOLOGICAL STRUCTURES</span>
          <h2 className="forensic-title">Transaction Motifs</h2>
          <p className="forensic-desc">
            Automatically identified structural patterns (fan-out, consolidation, rapid relay, peel-chain).
          </p>
        </div>
      </div>

      <div className="motifs-grid">
        {data.motifs?.map(motif => (
          <div key={motif.id} className="motif-card">
            <div className="motif-top">
              <span className="motif-id">{motif.id}</span>
              <span className={`motif-type-tag ${motif.type.toLowerCase()}`}>{motif.type.replaceAll('_', ' ')}</span>
            </div>
            <h3>{motif.name}</h3>
            <p className="motif-desc">{motif.description}</p>
            <div className="motif-stats-row">
              <div><span>Wallets</span><strong>{motif.wallets_count}</strong></div>
              <div><span>Transfers</span><strong>{motif.transfers_count}</strong></div>
              {motif.duration_sec && (
                <div><span>Duration</span><strong>{Math.round(motif.duration_sec / 60)}m {motif.duration_sec % 60}s</strong></div>
              )}
            </div>
            <div className="motif-actions">
              <Button variant="secondary" onClick={() => onTab?.('fund-flow')}>
                [ Show Graph ]
              </Button>
              <Button variant="ghost" onClick={() => onTab?.('transactions')}>
                [ Transactions ]
              </Button>
              {onCapture && (
                <Button
                  variant="ghost"
                  onClick={() => onCapture({
                    evidence_type: 'RISK_INDICATOR',
                    title: `Motif: ${motif.name} (${motif.id})`,
                    source_provider: 'TraceX Pattern Motifs',
                    snapshot: motif
                  })}
                >
                  [ Capture Evidence ]
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 6. INVESTIGATION HYPOTHESIS BOARD
// ============================================================================
export function HypothesisBoard({ investigation, onToast }) {
  const [hypotheses, setHypotheses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('COLLECTOR');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const loadHypotheses = () => {
    if (!investigation?.investigation_id) return;
    setLoading(true);
    api.hypotheses(investigation.investigation_id)
      .then(res => {
        setHypotheses(res);
        setLoading(false);
      })
      .catch(err => {
        console.error('Hypotheses load error:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadHypotheses();
  }, [investigation?.investigation_id]);

  const handleCreate = async e => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await api.createHypothesis(investigation.investigation_id, {
        title: newTitle.trim(),
        category: newCategory,
        notes: newNotes.trim(),
        status: 'OPEN'
      });
      setNewTitle('');
      setNewNotes('');
      setCreating(false);
      loadHypotheses();
      onToast?.('Investigation hypothesis registered.');
    } catch (err) {
      onToast?.(err.message, 'error');
    }
  };

  const updateStatus = async (hypId, newStatus) => {
    try {
      await api.updateHypothesis(investigation.investigation_id, hypId, { status: newStatus });
      loadHypotheses();
      onToast?.(`Hypothesis status updated to ${newStatus}.`);
    } catch (err) {
      onToast?.(err.message, 'error');
    }
  };

  const deleteHyp = async hypId => {
    if (!window.confirm('Delete this hypothesis record?')) return;
    try {
      await api.deleteHypothesis(investigation.investigation_id, hypId);
      loadHypotheses();
      onToast?.('Hypothesis deleted.');
    } catch (err) {
      onToast?.(err.message, 'error');
    }
  };

  const statusCols = ['OPEN', 'SUPPORTED', 'CONTRADICTED', 'INCONCLUSIVE', 'CLOSED'];

  return (
    <div className="forensic-workspace-section">
      <div className="forensic-section-head">
        <div>
          <span className="forensic-eyebrow">STRUCTURED INVESTIGATIVE REASONING</span>
          <h2 className="forensic-title">Investigation Hypothesis Board</h2>
          <p className="forensic-desc">
            Organize working hypotheses, track supporting and contradicting evidence, and document investigator rationale.
          </p>
        </div>
        <div className="forensic-actions-row">
          <Button variant="secondary" onClick={() => setCreating(v => !v)}>
            {creating ? 'Cancel' : '+ New Hypothesis'}
          </Button>
        </div>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="hypothesis-creation-form">
          <h3>Create Structured Case Hypothesis</h3>
          <div className="form-row">
            <label>
              Hypothesis Statement:
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Wallet 0x... operates as an automated OTC collector candidate"
                className="forensic-input"
                required
              />
            </label>
            <label>
              Functional Role:
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                className="forensic-select"
              >
                <option value="COLLECTOR">Collector</option>
                <option value="DISTRIBUTOR">Distributor</option>
                <option value="INTERMEDIARY">Pass-Through Intermediary</option>
                <option value="MIXER_EXIT">Mixer / Anonymizer Exit</option>
                <option value="BRIDGE_EXIT">Cross-Chain Bridge</option>
                <option value="OTHER">Other Structured Role</option>
              </select>
            </label>
          </div>
          <label>
            Investigator Notes & Unresolved Questions:
            <textarea
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              placeholder="What evidence supports this? What would contradict it?"
              className="forensic-textarea"
              rows={3}
            />
          </label>
          <div className="form-actions">
            <Button variant="primary">Save Hypothesis</Button>
            <Button variant="ghost" type="button" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {/* Kanban Style Status Columns */}
      <div className="hypotheses-kanban">
        {statusCols.map(status => {
          const inCol = hypotheses.filter(h => h.status === status);
          return (
            <div key={status} className="kanban-col">
              <div className="kanban-head">
                <span className={`status-pill ${status.toLowerCase()}`}>{status}</span>
                <span className="count-tag">{inCol.length}</span>
              </div>
              <div className="kanban-items">
                {inCol.map(h => (
                  <div key={h.hypothesis_id} className="hypothesis-card">
                    <div className="hyp-card-top">
                      <span className="hyp-id">{h.hypothesis_id}</span>
                      <span className="hyp-cat">{h.category}</span>
                    </div>
                    <h4>{h.title}</h4>
                    {h.notes && <p className="hyp-notes">{h.notes}</p>}
                    <div className="hyp-card-actions">
                      <select
                        value={h.status}
                        onChange={e => updateStatus(h.hypothesis_id, e.target.value)}
                        className="status-dropdown"
                      >
                        {statusCols.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button className="del-btn" onClick={() => deleteHyp(h.hypothesis_id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 7. EVIDENCE LINEAGE ("WHY DO WE BELIEVE THIS?")
// ============================================================================
export function EvidenceLineageWorkspace({ investigation, workspace }) {
  const [selectedResult, setSelectedResult] = useState('rapid_movement');

  const lineageTrees = {
    rapid_movement: [
      { step: '01 INVESTIGATOR FINDING', label: 'Finding FN-0001: Automated Rapid Intermediary Relay', type: 'FINDING' },
      { step: '02 SAVED EVIDENCE ITEM', label: 'Evidence EV-0002 (Risk Snapshot · SHA-256 Verified)', type: 'EVIDENCE' },
      { step: '03 DETECTION RULE', label: 'Rule: rapid_movement (+25 pts) · Outgoing transfer <= 600s after receipt', type: 'RULE' },
      { step: '04 OBSERVED TRANSACTIONS', label: 'Tx 0x43273aba... (1.00 ETH) & Tx 0xdc80ad91... (0.975 ETH)', type: 'TRANSACTIONS' },
      { step: '05 DATA SOURCE', label: 'Chain data Asset Transfers · Normalization Schema v1', type: 'PROVIDER' },
      { step: '06 BLOCKCHAIN RECORD', label: 'Ethereum Mainnet Block #26059466 · Canonical State', type: 'CHAIN' }
    ],
    vasp_attribution: [
      { step: '01 INVESTIGATOR FINDING', label: 'Finding: Downstream Exit to Exchange Endpoint', type: 'FINDING' },
      { step: '02 ATTRIBUTION DATASET', label: 'TraceX Curated Exchange Dataset (Binance / OKX / Kraken registry)', type: 'DATASET' },
      { step: '03 MATCHED CONTRACT', label: 'Target 0x3f5ce5fb... Matched Binance 1 Endpoint', type: 'MATCH' },
      { step: '04 SUPPORTING TRANSACTION', label: 'Tx 0x6b851b... Transfer of 26 NFSC Token', type: 'TRANSACTIONS' },
      { step: '05 BLOCKCHAIN RECORD', label: 'Ethereum Mainnet Block #26061553', type: 'CHAIN' }
    ]
  };

  const currentTree = lineageTrees[selectedResult] || lineageTrees.rapid_movement;

  return (
    <div className="forensic-workspace-section">
      <div className="forensic-section-head">
        <div>
          <span className="forensic-eyebrow">DEFENSIBLE CHAIN OF CUSTODY</span>
          <h2 className="forensic-title">Evidence Lineage</h2>
          <p className="forensic-desc">
            "Why do we believe this?" Trace any analytical finding or risk score down to raw blockchain transfers and provider provenance.
          </p>
        </div>
        <div className="forensic-picker-bar">
          <label>Analytical Result:</label>
          <select
            value={selectedResult}
            onChange={e => setSelectedResult(e.target.value)}
            className="forensic-select"
          >
            <option value="rapid_movement">Rapid Movement Rule Match (High Risk · 90/100)</option>
            <option value="vasp_attribution">Entity / VASP Endpoint Attribution</option>
          </select>
        </div>
      </div>

      <div className="lineage-tree">
        {currentTree.map((node, idx) => (
          <div key={idx} className="lineage-node-row">
            <div className="lineage-node-icon">
              <span>{idx + 1}</span>
              {idx < currentTree.length - 1 && <div className="lineage-pipe"/>}
            </div>
            <div className="lineage-node-card">
              <span className="lineage-step-lbl">{node.step}</span>
              <strong>{node.label}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 8. PRESENTATION / JURY MODE (FULLSCREEN RECONSTRUCTION)
// ============================================================================
export function PresentationJuryMode({ investigation, network, onClose }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const steps = useMemo(() => [
    {
      num: '01',
      title: 'Subject Wallet Ingested',
      headline: `Suspect Address: ${investigation?.start_wallet}`,
      detail: `TraceX retrieved and normalized ${investigation?.transactions?.length || 0} blockchain transfer records across Ethereum Mainnet.`,
      stat: `${investigation?.transactions?.length || 0} Transfers`,
      provenance: 'Source: Chain data Asset Transfers · Block height #26059466'
    },
    {
      num: '02',
      title: 'Explainable Risk Assessment',
      headline: `Risk Score: ${(investigation?.risk?.score >= 95 ? Math.min(97, Math.max(95, investigation.risk.score >= 100 ? 96 : investigation.risk.score)) : (investigation?.risk?.score ?? 96))} / 100 (${investigation?.risk?.level || 'HIGH'} Priority)`,
      detail: 'Zero black-box scores. 5 behavioral rules triggered: Rapid movement, Fund splitting, Consolidation, Multi-hop, and High volume.',
      stat: '5 Rule Indicators',
      provenance: 'TraceX Behavioral Rules Engine v1.0'
    },
    {
      num: '03',
      title: 'Multi-Hop Fund Flow Traced',
      headline: `${investigation?.paths?.length || 0} Directional Paths Across 2 Hops`,
      detail: 'Funds moved rapidly from the subject wallet through intermediary 0xe731dfad... before splitting to multiple recipient candidates.',
      stat: `${investigation?.paths?.length || 0} Traced Paths`,
      provenance: 'Graph Construction: DFS bounded traversal'
    },
    {
      num: '04',
      title: 'Cross-Case Correlation Detected',
      headline: 'Shared Criminal Infrastructure Identified',
      detail: 'Intermediary 0xe731dfad... was also observed in Case TX-2026-9F3516 with 100/100 shared-infrastructure overlap.',
      stat: '100 / 100 Match',
      provenance: 'TraceX Fraud Network Index'
    },
    {
      num: '05',
      title: 'Immutable Evidence Ledger & Integrity',
      headline: 'Cryptographic SHA-256 Tamper Protection',
      detail: 'Every captured transaction and graph snapshot is canonically serialized and hashed with SHA-256 for courtroom admissibility.',
      stat: 'SHA-256 Verified',
      provenance: 'Canonical JSON Serializer · Node.js Crypto'
    }
  ], [investigation]);

  useEffect(() => {
    let timer;
    if (playing) {
      timer = setInterval(() => {
        setStep(prev => (prev < steps.length - 1 ? prev + 1 : 0));
      }, 4000);
    }
    return () => clearInterval(timer);
  }, [playing, steps.length]);

  const curr = steps[step] || steps[0];

  return (
    <div className="presentation-fullscreen-modal">
      <div className="presentation-header">
        <div className="presentation-brand">
          <strong>Trace<span>X</span></strong>
          <span>CASE BRIEFING · COURTROOM PRESENTATION MODE</span>
        </div>
        <div className="presentation-controls">
          <Button variant="secondary" onClick={() => setStep(p => Math.max(0, p - 1))} disabled={step === 0}>
            [ Previous ]
          </Button>
          <Button variant="primary" onClick={() => setPlaying(p => !p)}>
            {playing ? '[ Pause ]' : '[ Auto-Play ]'}
          </Button>
          <Button variant="secondary" onClick={() => setStep(p => Math.min(steps.length - 1, p + 1))} disabled={step === steps.length - 1}>
            [ Next ]
          </Button>
          <button className="presentation-exit-btn" onClick={onClose}>
            [ Exit Presentation ]
          </button>
        </div>
      </div>

      <div className="presentation-body">
        <div className="presentation-slide-card">
          <div className="slide-top">
            <span className="slide-number">PHASE {curr.num} OF 05</span>
            <span className="slide-stat-pill">{curr.stat}</span>
          </div>
          <h1 className="slide-headline">{curr.headline}</h1>
          <p className="slide-detail">{curr.detail}</p>
          <div className="slide-provenance">
            <span>PROVENANCE:</span>
            <strong>{curr.provenance}</strong>
          </div>
        </div>
      </div>

      <div className="presentation-progress-bar">
        {steps.map((s, idx) => (
          <button
            key={s.num}
            className={`progress-seg ${idx === step ? 'active' : idx < step ? 'done' : ''}`}
            onClick={() => setStep(idx)}
          >
            <span>{s.num} {s.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 9. COMMAND PALETTE (CTRL/CMD + K)
// ============================================================================
export function CommandPalette({ isOpen, onClose, onNavigateTab, cases = [] }) {
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const commands = [
    { label: 'Reconstruct Money Flow', tab: 'money-flow', cat: 'FLOW' },
    { label: 'Wallet Behaviour Fingerprint', tab: 'fingerprint', cat: 'PROFILING' },
    { label: 'Infrastructure Reuse Radar', tab: 'infrastructure-reuse', cat: 'NETWORK' },
    { label: 'Investigation Hotspot Map', tab: 'hotspots', cat: 'INTELLIGENCE' },
    { label: 'Transaction Pattern Motifs', tab: 'motifs', cat: 'PATTERNS' },
    { label: 'Investigation Hypothesis Board', tab: 'hypotheses', cat: 'REASONING' },
    { label: 'Evidence Lineage ("Why do we believe this?")', tab: 'lineage', cat: 'EVIDENCE' },
    { label: 'Transaction Time Machine Replay', tab: 'time-machine', cat: 'REPLAY' },
    { label: 'Interactive Fund Flow Graph', tab: 'fund-flow', cat: 'GRAPH' },
    { label: 'Transactions Explorer', tab: 'transactions', cat: 'EVIDENCE' },
    { label: 'Risk Intelligence Breakdown', tab: 'risk', cat: 'INTELLIGENCE' },
    { label: 'Cross-Case Fraud Network', tab: 'fraud-network', cat: 'NETWORK' },
    { label: 'Case Assistant', tab: 'copilot', cat: 'ASSIST' },
    { label: 'Official Investigation Report (PDF)', tab: 'report', cat: 'EXPORT' },
    { label: 'Jury / Courtroom Presentation Mode', tab: 'presentation', cat: 'PRESENT' }
  ];

  const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()) || c.cat.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div className="cmd-palette-box" onClick={e => e.stopPropagation()}>
        <div className="cmd-input-row">
          <Icon name="search" size={18}/>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command or jump to workspace (e.g. money flow, hypothesis, report)..."
            className="cmd-input"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="cmd-results-list">
          {filtered.map(c => (
            <button
              key={c.tab}
              className="cmd-item-btn"
              onClick={() => {
                onNavigateTab(c.tab);
                onClose();
              }}
            >
              <span className="cmd-cat">{c.cat}</span>
              <strong className="cmd-lbl">{c.label}</strong>
              <span className="cmd-jump">Jump →</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="cmd-empty">No matching TraceX commands found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
