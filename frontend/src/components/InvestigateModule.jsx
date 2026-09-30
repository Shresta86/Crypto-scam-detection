/**
 * InvestigateModule.jsx
 * =====================
 * Sovereign Crypto-Forensics Command Centre for TraceX (SIH26183).
 * Enterprise-grade multi-hop fund flow visualization platform.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useReactFlow,
  useViewport,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  getBezierPath,
  EdgeLabelRenderer,
  MiniMap,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../investigate.css';
import dagre from 'dagre';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, AlertTriangle, Search, Layers, Eye, GitBranch,
  ChevronRight, ChevronLeft, Activity, Zap, Target,
  Clock, Database, ArrowRight, ExternalLink, X, Terminal,
  Network, BarChart3, FileText, Lock, Unlock, Crosshair,
  TrendingUp, RefreshCw, Maximize2, Minimize2, Copy, Check,
  Play, Pause, FastForward, Sparkles, Filter, Info, Briefcase,
  ShieldAlert, Users, Compass
} from 'lucide-react';
import { getDataset, getDatasetList } from '../data/mockInvestigations.js';


/* ────────── CONSTANTS & HELPERS ────────── */
const CHAIN_COLORS = {
  ETH: '#60A5FA',
  USDT: '#34D399',
  BTC: '#FBBF24',
  TRX: '#F87171',
};

const NODE_COLORS = {
  SUSPECT_WALLET: { bg: '#1c0a0a', border: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)', icon: '🔴', accent: '#ef4444' },
  INTERMEDIARY: { bg: '#1c1503', border: '#f59e0b', glow: 'rgba(245, 158, 11, 0.3)', icon: '🟡', accent: '#f59e0b' },
  EXCHANGE_VASP: { bg: '#021a10', border: '#10b981', glow: 'rgba(16, 185, 129, 0.4)', icon: '🟢', accent: '#10b981' },
  WALLET: { bg: '#0b1120', border: '#64748b', glow: 'rgba(100, 116, 139, 0.2)', icon: '⬜', accent: '#94a3b8' },
  bridge: { bg: '#07162c', border: '#3b82f6', glow: 'rgba(59, 130, 246, 0.3)', icon: '🔵', accent: '#3b82f6' },
};

const TYPOLOGY_ICONS = {
  'task-scam': Target,
  'pig-butchering': TrendingUp,
  'job-scam': Briefcase,
  'ransomware': ShieldAlert,
};

function shortAddr(addr, pre = 6, suf = 4) {
  if (!addr || addr.length < pre + suf + 2) return addr || '???';
  return `${addr.slice(0, pre)}…${addr.slice(-suf)}`;
}

function formatETH(val) {
  if (val == null) return '0.00';
  return Number(val).toFixed(2);
}


/* ────────── DAGRE LR LAYOUT (Node 220x84, Ranksep 200, Nodesep 70) ────────── */
function layoutGraph(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: 200, edgesep: 35 });

  nodes.forEach(n => g.setNode(n.id, { width: 220, height: 84 }));
  edges.forEach(e => g.setEdge(e.source, e.target));

  dagre.layout(g);

  const layoutedNodes = nodes.map(n => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - 110, y: pos.y - 42 },
    };
  });

  return { nodes: layoutedNodes, edges };
}


/* ────────── LIVE FLOW EDGE COMPONENT ────────── */
function LiveFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data = {},
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const asset = data.asset || 'ETH';
  const edgeColor = data.isDerived ? '#c084fc' : (CHAIN_COLORS[asset] || CHAIN_COLORS.ETH);
  const amount = Number(data.amount || 1);
  
  const baseWidth = Math.max(2, Math.min(5.5, 1.8 + Math.log10(amount + 1) * 2));
  const isPlaybackActive = data.isPlaybackActive;
  const isHighlighted = data.isHighlighted;
  const isDimmed = data.isDimmed;
  const strokeWidth = isPlaybackActive ? baseWidth + 2.5 : isHighlighted ? baseWidth + 1.5 : baseWidth;
  const strokeOpacity = isDimmed ? 0.15 : isPlaybackActive ? 1 : isHighlighted ? 0.95 : 0.6;

  const particleCount = amount > 10 ? 4 : amount > 3 ? 3 : 2;
  const duration = 2.5 / (data.playbackSpeed || 1);
  const particles = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => ({
      delay: (i * (duration / particleCount)).toFixed(2),
    }));
  }, [particleCount, duration]);

  const showLabel = data.zoom == null || data.zoom >= 0.55;

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={edgeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeDasharray={data.isDerived ? '5 5' : undefined}
        markerEnd={markerEnd}
        className="forensic-base-edge"
        onMouseEnter={e => data.onHover?.(e, data)}
        onMouseLeave={data.onLeave}
      />

      {!data.isDerived && !isDimmed && (
        <path
          d={edgePath}
          fill="none"
          stroke={edgeColor}
          strokeWidth={strokeWidth}
          strokeDasharray="6 6"
          strokeOpacity={isPlaybackActive ? 1 : 0.8}
          className="forensic-edge-dash"
        />
      )}

      {!isDimmed && particles.map((p, idx) => (
        <circle
          key={idx}
          r={isPlaybackActive ? 4 : 2.5}
          fill={isPlaybackActive ? '#ffffff' : edgeColor}
          filter="url(#particle-glow)"
          opacity={isPlaybackActive ? 1 : 0.9}
        >
          <animateMotion
            dur={`${duration}s`}
            repeatCount="indefinite"
            path={edgePath}
            begin={`${p.delay}s`}
          />
        </circle>
      ))}

      {showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={`forensic-edge-label ${isDimmed ? 'dimmed' : ''} ${isPlaybackActive ? 'active-playback' : ''}`}
            onMouseEnter={e => data.onHover?.(e, data)}
            onMouseLeave={data.onLeave}
            onClick={() => data.onClick?.(data)}
          >
            {formatETH(data.amount)} <small style={{ color: edgeColor }}>{asset}</small>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}


/* ────────── FORENSIC NODE COMPONENT ────────── */
function ForensicNode({ data, selected }) {
  const [copied, setCopied] = useState(false);
  const colors = NODE_COLORS[data.nodeType] || NODE_COLORS.WALLET;
  const zoom = data.zoom || 1;

  const copyAddress = e => {
    e.stopPropagation();
    if (data.address) {
      navigator.clipboard.writeText(data.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const isSuspect = data.nodeType === 'SUSPECT_WALLET' || (data.nodeType === 'INTERMEDIARY' && data.label?.includes('Mixer'));
  const isExchange = data.nodeType === 'EXCHANGE_VASP';
  const pulseClass = isSuspect ? 'node-pulse-suspect' : isExchange ? 'node-pulse-exchange' : '';

  if (zoom < 0.55) {
    return (
      <>
        <Handle type="target" position={Position.Left} className="forensic-handle" />
        <div
          className={`fn-simplified ${selected ? 'selected' : ''} ${data.isDimmed ? 'dimmed' : ''}`}
          style={{ borderColor: colors.border, background: colors.bg }}
          onMouseEnter={e => data.onHover?.(e, data)}
          onMouseLeave={data.onLeave}
        >
          <span>{colors.icon}</span>
          <span>{data.label || shortAddr(data.address)}</span>
        </div>
        <Handle type="source" position={Position.Right} className="forensic-handle" />
      </>
    );
  }

  return (
    <>
      <Handle type="target" position={Position.Left} className="forensic-handle" />
      <div
        className={`forensic-node ${selected ? 'selected' : ''} ${pulseClass} ${data.isDimmed ? 'dimmed' : ''} ${data.isPathHighlighted ? 'path-highlighted' : ''}`}
        style={{
          '--node-border': colors.border,
          '--node-bg': colors.bg,
          '--node-glow': colors.glow,
          '--node-accent': colors.accent,
        }}
        onMouseEnter={e => data.onHover?.(e, data)}
        onMouseLeave={data.onLeave}
      >
        <div className="fn-header">
          <div className="fn-badge-row">
            <span
              className="fn-type-badge"
              style={{
                background: colors.border + '22',
                color: colors.accent,
                borderColor: colors.border,
              }}
            >
              {(data.nodeType || 'WALLET').replace(/_/g, ' ')}
            </span>
            <span className="fn-chain-chip">ETH</span>
          </div>
          {data.entity ? (
            <span className="fn-entity-name" title={data.entity}>
              {data.entity}
            </span>
          ) : (
            data.hop !== undefined && (
              <span className="fn-hop-badge">
                <GitBranch size={9} />
                Hop {data.hop}
              </span>
            )
          )}
        </div>

        <div className="fn-title" title={data.label}>
          {data.label}
        </div>

        <div className="fn-footer">
          <div className="fn-addr-wrap">
            <span>{shortAddr(data.address)}</span>
            <button className="fn-copy-btn" onClick={copyAddress} title="Copy address">
              {copied ? <Check size={11} style={{ color: '#10b981' }} /> : <Copy size={11} />}
            </button>
          </div>
          {data.entity && data.hop !== undefined && (
            <span className="fn-hop-badge">Hop {data.hop}</span>
          )}
        </div>

        {zoom > 1.2 && (
          <div className="fn-detail-extra">
            <span>Risk Status: {data.nodeType === 'SUSPECT_WALLET' ? 'ELEVATED' : 'ANALYZED'}</span>
            <span>Block Validated</span>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="forensic-handle" />
    </>
  );
}

const nodeTypes = { forensicNode: ForensicNode };
const edgeTypes = { liveFlow: LiveFlowEdge };


/* ────────── INNER CANVAS WORKSPACE ────────── */
function ForensicCanvasInner({
  dataset,
  layerFilters,
  maxHopFilter,
  selectedNode,
  setSelectedNode,
  selectedEdge,
  setSelectedEdge,
  playbackEdgeId,
  playbackSpeed,
  activeTab,
  onOpenDossier,
  fitTrigger,
}) {
  const reactFlow = useReactFlow();
  const { zoom } = useViewport();
  const containerRef = useRef(null);

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState([]);
  const [hoveredEntity, setHoveredEntity] = useState(null);
  const [showMoreHops, setShowMoreHops] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const handleEntityHover = useCallback((e, item) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredEntity({
      item,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
  }, []);

  const handleEntityLeave = useCallback(() => {
    setHoveredEntity(null);
  }, []);

  const connectedIds = useMemo(() => {
    if (!selectedNode || !dataset?.graph) return null;
    const nodeId = selectedNode.id;
    const nodeIds = new Set([nodeId]);
    const edgeIds = new Set();

    dataset.graph.edges.forEach(e => {
      if (e.source === nodeId || e.target === nodeId) {
        edgeIds.add(e.id);
        nodeIds.add(e.source);
        nodeIds.add(e.target);
      }
    });

    return { nodeIds, edgeIds };
  }, [selectedNode, dataset]);

  const rebuildGraph = useCallback(() => {
    if (!dataset?.graph) return;

    const validNodes = dataset.graph.nodes.filter(n => n.hop <= maxHopFilter);
    const validNodeIds = new Set(validNodes.map(n => n.id));

    const validEdges = dataset.graph.edges.filter(e => {
      if (!validNodeIds.has(e.source) || !validNodeIds.has(e.target)) return false;
      const isTransferred = e.type === 'TRANSFERRED_TO' || e.type === 'DEPOSITED_TO';
      if (isTransferred && !layerFilters.observed) return false;
      if (!isTransferred && !layerFilters.derived) return false;
      return true;
    });

    const rawNodes = validNodes.map(n => {
      const isDimmed = connectedIds && !connectedIds.nodeIds.has(n.id);
      const isPathHighlighted = connectedIds && connectedIds.nodeIds.has(n.id);
      return {
        id: n.id,
        type: 'forensicNode',
        data: {
          ...n,
          nodeType: n.type,
          zoom,
          isDimmed,
          isPathHighlighted,
          onHover: handleEntityHover,
          onLeave: handleEntityLeave,
        },
        position: { x: 0, y: 0 },
      };
    });

    const rawEdges = validEdges.map(e => {
      const isDerived = e.type !== 'TRANSFERRED_TO' && e.type !== 'DEPOSITED_TO';
      const isDimmed = connectedIds && !connectedIds.edgeIds.has(e.id);
      const isHighlighted = connectedIds && connectedIds.edgeIds.has(e.id);
      const isPlaybackActive = playbackEdgeId === e.id;

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'liveFlow',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isDerived ? '#c084fc' : (CHAIN_COLORS[e.asset] || CHAIN_COLORS.ETH),
          width: 14,
          height: 14,
        },
        data: {
          ...e,
          isDerived,
          isDimmed,
          isHighlighted,
          isPlaybackActive,
          playbackSpeed,
          zoom,
          onHover: handleEntityHover,
          onLeave: handleEntityLeave,
          onClick: edgeData => {
            setSelectedEdge(edgeData);
            setSelectedNode(null);
            onOpenDossier();
          },
        },
      };
    });

    const { nodes: layouted, edges: layoutedEdges } = layoutGraph(rawNodes, rawEdges);
    setFlowNodes(layouted);
    setFlowEdges(layoutedEdges);
  }, [
    dataset,
    layerFilters,
    maxHopFilter,
    connectedIds,
    playbackEdgeId,
    playbackSpeed,
    zoom,
    handleEntityHover,
    handleEntityLeave,
    setSelectedEdge,
    setSelectedNode,
    onOpenDossier,
    setFlowNodes,
    setFlowEdges,
  ]);

  useEffect(() => {
    rebuildGraph();
  }, [rebuildGraph]);

  const fitReadable = useCallback((duration = 300) => {
    if (!reactFlow) return;
    try {
      reactFlow.fitView({
        padding: 0.12,
        minZoom: 0.35,
        maxZoom: 1.35,
        duration,
      });
      setTimeout(() => {
        const z = reactFlow.getZoom();
        setShowMoreHops(z <= 0.45);
      }, duration + 50);
    } catch (e) {
      // safe fallback
    }
  }, [reactFlow]);

  useEffect(() => {
    if (dataset && flowNodes.length > 0) {
      const t = setTimeout(() => fitReadable(350), 60);
      return () => clearTimeout(t);
    }
  }, [dataset, flowNodes.length, fitReadable]);

  useEffect(() => {
    if (fitTrigger && flowNodes.length > 0) {
      fitReadable(300);
    }
  }, [fitTrigger, flowNodes.length, fitReadable]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timer;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fitReadable(250);
      }, 100);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [fitReadable]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node.data);
    setSelectedEdge(null);
    onOpenDossier();
    reactFlow.setCenter(node.position.x + 110, node.position.y + 42, {
      duration: 350,
      zoom: Math.max(reactFlow.getZoom(), 0.85),
    });
  }, [onOpenDossier, reactFlow, setSelectedEdge, setSelectedNode]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, [setSelectedEdge, setSelectedNode]);

  const hopHeaders = useMemo(() => {
    if (!flowNodes.length) return [];
    const map = new Map();
    flowNodes.forEach(n => {
      const h = n.data?.hop;
      if (h !== undefined) {
        if (!map.has(h)) map.set(h, []);
        map.get(h).push(n.position.x + 110);
      }
    });

    const labels = ['ORIGIN', 'HOP 1 (CONSOLIDATION)', 'HOP 2 (LAYERING)', 'HOP 3 (OFF-RAMP / VASP)', 'HOP 4 (DESTINATION)', 'HOP 5'];
    const res = [];
    map.forEach((xs, hop) => {
      const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
      res.push({ hop, avgX, label: labels[hop] || `HOP ${hop}` });
    });
    return res;
  }, [flowNodes]);

  return (
    <div className="inv-canvas-wrapper" ref={containerRef}>
      <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
        <defs>
          <filter id="particle-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      <div className="inv-rf-absolute-container">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={2.5}
          panOnDrag={!isLocked}
          zoomOnScroll={!isLocked}
        >
          <Background color="#1e293b" gap={24} size={1} />

          <div className="inv-hop-headers-overlay">
            {hopHeaders.map(h => (
              <div
                key={h.hop}
                className="inv-hop-col-header"
                style={{
                  left: `${(h.avgX * zoom) + (reactFlow.getViewport()?.x || 0)}px`,
                }}
              >
                {h.label}
              </div>
            ))}
          </div>
        </ReactFlow>
      </div>

      {showMoreHops && (
        <div className="inv-more-hops-hint">
          <span>Pan canvas for downstream hops</span>
          <ArrowRight size={13} />
        </div>
      )}

      {/* Floating Bottom-Left Zoom Stack */}
      <div className="inv-zoom-stack">
        <button className="inv-zoom-btn" onClick={() => reactFlow.zoomIn({ duration: 250 })} title="Zoom In (+)">
          +
        </button>
        <button className="inv-zoom-btn" onClick={() => reactFlow.zoomOut({ duration: 250 })} title="Zoom Out (-)">
          −
        </button>
        <button className="inv-zoom-btn" onClick={() => fitReadable(300)} title="Fit Readable View (F)">
          <Crosshair size={13} />
        </button>
        <button
          className={`inv-zoom-btn ${isLocked ? 'active' : ''}`}
          onClick={() => setIsLocked(l => !l)}
          title={isLocked ? 'Unlock canvas pan' : 'Lock canvas pan'}
        >
          {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
        <button
          className={`inv-zoom-btn ${minimapOpen ? 'active' : ''}`}
          onClick={() => setMinimapOpen(m => !m)}
          title="Toggle MiniMap"
        >
          <BarChart3 size={12} />
        </button>
      </div>

      {minimapOpen && (
        <div className="inv-minimap-wrap">
          <MiniMap
            nodeColor={n => NODE_COLORS[n.data?.nodeType]?.border || '#64748b'}
            maskColor="rgba(6, 9, 16, 0.75)"
            style={{ width: 160, height: 100, background: '#090e17' }}
          />
        </div>
      )}

      {hoveredEntity && (
        <div
          className="inv-floating-tooltip"
          style={{
            left: `${hoveredEntity.x}px`,
            top: `${hoveredEntity.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {hoveredEntity.item.address ? (
            <>
              <div className="inv-ft-title">{hoveredEntity.item.label || 'Entity Wallet'}</div>
              <div className="inv-ft-row">
                <span>Address</span>
                <code>{shortAddr(hoveredEntity.item.address, 8, 6)}</code>
              </div>
              <div className="inv-ft-row">
                <span>Role</span>
                <strong style={{ color: NODE_COLORS[hoveredEntity.item.nodeType]?.accent }}>
                  {hoveredEntity.item.nodeType?.replace(/_/g, ' ')}
                </strong>
              </div>
              {hoveredEntity.item.hop !== undefined && (
                <div className="inv-ft-row">
                  <span>Hop Depth</span>
                  <span>Hop {hoveredEntity.item.hop}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="inv-ft-title">Fund Transfer</div>
              <div className="inv-ft-row">
                <span>Amount</span>
                <strong style={{ color: '#10b981' }}>
                  {formatETH(hoveredEntity.item.amount)} {hoveredEntity.item.asset || 'ETH'}
                </strong>
              </div>
              <div className="inv-ft-row">
                <span>Type</span>
                <span>{hoveredEntity.item.type?.replace(/_/g, ' ')}</span>
              </div>
              {hoveredEntity.item.timestamp && (
                <div className="inv-ft-row">
                  <span>Timestamp</span>
                  <span>{new Date(hoveredEntity.item.timestamp).toLocaleTimeString()}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}


/* ────────── TRANSACTION LEDGER TAB ────────── */
function LedgerTable({ transactions }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!transactions) return [];
    if (!search) return transactions;
    const q = search.toLowerCase();
    return transactions.filter(t =>
      t.hash?.toLowerCase().includes(q) ||
      t.from?.toLowerCase().includes(q) ||
      t.to?.toLowerCase().includes(q)
    );
  }, [transactions, search]);

  return (
    <div style={{ flex: 1, padding: 18, overflowY: 'auto', background: '#060910' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={14} color="#64748b" />
          <input
            placeholder="Filter by hash, from, or to address..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              color: '#f1f5f9',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 12,
              width: 260,
            }}
          />
        </div>
        <span style={{ fontSize: 11, color: '#64748b' }}>{filtered.length} verified events</span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: 8 }}>TX HASH</th>
            <th style={{ padding: 8 }}>FROM</th>
            <th style={{ padding: 8 }}>TO</th>
            <th style={{ padding: 8 }}>AMOUNT</th>
            <th style={{ padding: 8 }}>ASSET</th>
            <th style={{ padding: 8 }}>HOP</th>
            <th style={{ padding: 8 }}>TIMESTAMP</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((tx, idx) => (
            <tr key={tx.hash || idx} style={{ borderBottom: '1px solid #0f172a' }}>
              <td style={{ padding: 8, color: '#60a5fa' }}>{shortAddr(tx.hash, 8, 4)}</td>
              <td style={{ padding: 8, color: '#94a3b8' }}>{shortAddr(tx.from)}</td>
              <td style={{ padding: 8, color: '#94a3b8' }}>{shortAddr(tx.to)}</td>
              <td style={{ padding: 8, color: '#10b981', fontWeight: 600 }}>{formatETH(tx.amount)}</td>
              <td style={{ padding: 8, color: '#e2e8f0' }}>{tx.asset}</td>
              <td style={{ padding: 8, color: '#f59e0b' }}>H{tx.hop}</td>
              <td style={{ padding: 8, color: '#64748b' }}>{new Date(tx.timestamp).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


/* ────────── TIMELINE VELOCITY TAB ────────── */
function TimelineScatter({ transactions }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !transactions?.length) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    ctx.fillStyle = '#060910';
    ctx.fillRect(0, 0, W, H);

    const pad = { top: 30, right: 30, bottom: 40, left: 60 };
    const pW = W - pad.left - pad.right, pH = H - pad.top - pad.bottom;

    const times = transactions.map(t => new Date(t.timestamp).getTime());
    const amounts = transactions.map(t => Number(t.amount || 0));
    const minT = Math.min(...times), maxT = Math.max(...times);
    const maxA = Math.max(...amounts) * 1.15 || 1;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * pH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    transactions.forEach(t => {
      const time = new Date(t.timestamp).getTime();
      const amt = Number(t.amount || 0);
      const x = pad.left + ((time - minT) / (maxT - minT || 1)) * pW;
      const y = pad.top + (1 - amt / maxA) * pH;

      ctx.fillStyle = CHAIN_COLORS[t.asset] || '#60a5fa';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

  }, [transactions]);

  return (
    <div style={{ flex: 1, padding: 18, background: '#060910', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong style={{ fontSize: 13, color: '#f1f5f9' }}>Temporal Velocity Analysis</strong>
        <span style={{ fontSize: 11, color: '#64748b' }}>X: Timestamp · Y: Transaction Volume (ETH)</span>
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height: 'calc(100% - 30px)', borderRadius: 8 }} />
    </div>
  );
}


/* ────────── MAIN INVESTIGATE MODULE EXPORT ────────── */
export default function InvestigateModule({ initialKey, onBack, onOpenCase, cases = [], currentCase } = {}) {
  const rootRef = useRef(null);
  const datasets = useMemo(() => getDatasetList(), []);
  const [activeKey, setActiveKey] = useState(initialKey || 'task-scam');
  const [dataset, setDataset] = useState(() => getDataset(initialKey || 'task-scam'));

  // Left Sidebar Expand state & ChatGPT-style draggable width
  const [railExpanded, setRailExpanded] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('tracex_sidebar_width');
      return saved ? Math.max(180, Math.min(520, Number(saved))) : 260;
    } catch (e) {
      return 260;
    }
  });
  const [isResizingRail, setIsResizingRail] = useState(false);

  // Right Dossier Drawer state & Draggable width
  const [dossierOpen, setDossierOpen] = useState(false);
  const [dossierWidth, setDossierWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('tracex_dossier_width');
      return saved ? Math.max(280, Math.min(650, Number(saved))) : 360;
    } catch (e) {
      return 360;
    }
  });
  const [isResizingDossier, setIsResizingDossier] = useState(false);

  // Full Screen Feature
  const [isFullScreen, setIsFullScreen] = useState(false);

  // View Mode
  const [activeTab, setActiveTab] = useState('graph'); // graph | ledger | timeline
  const [maxHopFilter, setMaxHopFilter] = useState(6);
  const [layerFilters, setLayerFilters] = useState({ observed: true, derived: true });

  // Search & Query
  const [searchQuery, setSearchQuery] = useState('');
  const [askModalOpen, setAskModalOpen] = useState(false);
  const [askInput, setAskInput] = useState('');

  // Selected Entities
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [typologyExpanded, setTypologyExpanded] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(1);

  // Trace Playback Engine
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const playbackTimeline = useMemo(() => {
    if (!dataset?.graph?.edges) return [];
    return [...dataset.graph.edges]
      .filter(e => e.timestamp)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [dataset]);

  const currentPlaybackEdge = playbackTimeline[playbackIndex] || null;

  // Toggle Full Screen Function (Native Browser Fullscreen + CSS War-Room Mode)
  const toggleFullScreen = useCallback(() => {
    const isCurrentlyFs = Boolean(document.fullscreenElement) || isFullScreen;

    if (!isCurrentlyFs) {
      setIsFullScreen(true);
      if (rootRef.current?.requestFullscreen) {
        rootRef.current.requestFullscreen().catch(() => {
          setIsFullScreen(true);
        });
      }
    } else {
      setIsFullScreen(false);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }

    setTimeout(() => setFitTrigger(c => c + 1), 100);
    setTimeout(() => setFitTrigger(c => c + 1), 300);
  }, [isFullScreen]);

  // Reliable native fullscreen change listener (No stale closure)
  useEffect(() => {
    const handleFsChange = () => {
      const isNativeFs = Boolean(document.fullscreenElement);
      setIsFullScreen(isNativeFs);
      setTimeout(() => setFitTrigger(c => c + 1), 80);
      setTimeout(() => setFitTrigger(c => c + 1), 250);
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  // Draggable Left Sidebar Resizer (ChatGPT Style)
  const startResizingRail = useCallback(e => {
    e.preventDefault();
    setIsResizingRail(true);
  }, []);

  useEffect(() => {
    if (!isResizingRail) return;

    const handleMouseMove = e => {
      const newWidth = e.clientX;
      if (newWidth < 110) {
        setRailExpanded(false);
      } else {
        if (!railExpanded) setRailExpanded(true);
        const clamped = Math.max(180, Math.min(520, newWidth));
        setSidebarWidth(clamped);
      }
    };

    const handleMouseUp = () => {
      setIsResizingRail(false);
      try {
        localStorage.setItem('tracex_sidebar_width', String(sidebarWidth));
      } catch (err) {}
      setFitTrigger(c => c + 1);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingRail, railExpanded, sidebarWidth]);

  // Draggable Right Dossier Resizer
  const startResizingDossier = useCallback(e => {
    e.preventDefault();
    setIsResizingDossier(true);
  }, []);

  useEffect(() => {
    if (!isResizingDossier) return;

    const handleMouseMove = e => {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth < 140) {
        setDossierOpen(false);
      } else {
        const clamped = Math.max(280, Math.min(650, newWidth));
        setDossierWidth(clamped);
      }
    };

    const handleMouseUp = () => {
      setIsResizingDossier(false);
      try {
        localStorage.setItem('tracex_dossier_width', String(dossierWidth));
      } catch (err) {}
      setFitTrigger(c => c + 1);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingDossier, dossierWidth]);

  // Switch Dataset
  const switchDataset = useCallback(key => {
    setActiveKey(key);
    const ds = getDataset(key);
    if (ds) {
      setDataset(ds);
      setSelectedNode(null);
      setSelectedEdge(null);
      setPlaybackIndex(0);
      setIsPlaying(false);
      setTimeout(() => setFitTrigger(c => c + 1), 80);
    }
  }, []);

  // Playback timer tick
  useEffect(() => {
    if (!isPlaying || !playbackTimeline.length) return;
    const intervalTime = 1600 / playbackSpeed;
    const timer = setInterval(() => {
      setPlaybackIndex(prev => {
        if (prev >= playbackTimeline.length - 1) {
          setIsPlaying(false);
          return 0;
        }
        return prev + 1;
      });
    }, intervalTime);
    return () => clearInterval(timer);
  }, [isPlaying, playbackTimeline.length, playbackSpeed]);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handler = e => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'Escape') {
        if (isFullScreen) {
          toggleFullScreen();
        } else if (askModalOpen) {
          setAskModalOpen(false);
        } else if (dossierOpen) {
          setDossierOpen(false);
        } else {
          setSelectedNode(null);
          setSelectedEdge(null);
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.key === 'f' || e.key === 'F') {
        setFitTrigger(c => c + 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullScreen, toggleFullScreen, askModalOpen, dossierOpen]);

  const executeQuery = q => {
    const query = q.toLowerCase();
    setAskModalOpen(false);
    if (!dataset?.graph) return;

    if (query.includes('exchange') || query.includes('vasp') || query.includes('binance')) {
      const target = dataset.graph.nodes.find(n => n.type === 'EXCHANGE_VASP');
      if (target) {
        setSelectedNode(target);
        setDossierOpen(true);
      }
    } else if (query.includes('largest') || query.includes('max')) {
      const maxEdge = [...dataset.graph.edges].sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];
      if (maxEdge) {
        setSelectedEdge(maxEdge);
        setDossierOpen(true);
      }
    } else if (query.includes('suspect') || query.includes('origin')) {
      const suspect = dataset.graph.nodes.find(n => n.type === 'SUSPECT_WALLET');
      if (suspect) {
        setSelectedNode(suspect);
        setDossierOpen(true);
      }
    }
  };

  return (
    <div
      ref={rootRef}
      className={`investigate-module ${isFullScreen ? 'fullscreen-mode' : ''}`}
    >
      {/* ─── 1. LEFT TACTICAL RAIL & SIDEBAR (Advanced, Military/Institutional, ChatGPT-style Resizable) ─── */}
      <aside
        className={`inv-rail ${railExpanded ? 'expanded' : ''} ${isResizingRail ? 'resizing' : ''}`}
        style={railExpanded ? { width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` } : undefined}
      >
        <div className="inv-rail-top">
          {railExpanded ? (
            <div className="inv-rail-header-expanded">
              <span className="inv-rail-title">
                <Compass size={14} color="#38bdf8" />
                Case Radar
              </span>
              <button
                className="inv-rail-toggle-btn"
                onClick={() => setRailExpanded(false)}
                title="Collapse sidebar"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          ) : (
            <button
              className="inv-rail-brand"
              onClick={() => setRailExpanded(true)}
              title="Expand investigation sidebar"
            >
              <Compass size={18} />
            </button>
          )}

          {railExpanded ? (
            <div className="inv-rail-card-list">
              {datasets.map(ds => {
                const IconComp = TYPOLOGY_ICONS[ds.key] || Target;
                return (
                  <div
                    key={ds.key}
                    className={`inv-rail-card ${activeKey === ds.key ? 'active' : ''}`}
                    onClick={() => switchDataset(ds.key)}
                  >
                    <div className="inv-rc-header">
                      <span className="inv-rc-title">
                        <IconComp size={13} color={activeKey === ds.key ? '#38bdf8' : '#94a3b8'} />
                        {ds.label}
                      </span>
                      <span className={`inv-rc-badge risk-${ds.riskLevel?.toLowerCase()}`}>
                        {ds.riskScore}
                      </span>
                    </div>
                    <div className="inv-rc-meta">
                      <span>{ds.id}</span>
                      <span>{ds.nodeCount}N · {ds.edgeCount}E</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            datasets.map(ds => {
              const IconComp = TYPOLOGY_ICONS[ds.key] || Target;
              return (
                <button
                  key={ds.key}
                  className={`inv-rail-icon-btn ${activeKey === ds.key ? 'active' : ''}`}
                  onClick={() => switchDataset(ds.key)}
                  data-tooltip={`${ds.label} · ${ds.riskLevel} (${ds.riskScore}/100)`}
                >
                  <IconComp size={18} />
                </button>
              );
            })
          )}
        </div>

        <div className="inv-rail-bottom">
          <button
            className={`inv-rail-icon-btn ${isFullScreen ? 'active' : ''}`}
            onClick={toggleFullScreen}
            data-tooltip={isFullScreen ? 'Exit Full Screen' : 'Full Screen Graph'}
          >
            {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        {/* Draggable Resizer Handle (ChatGPT-style) */}
        {railExpanded && (
          <div
            className={`inv-sidebar-resizer ${isResizingRail ? 'active' : ''}`}
            onMouseDown={startResizingRail}
            onDoubleClick={() => {
              setSidebarWidth(260);
              try { localStorage.setItem('tracex_sidebar_width', '260'); } catch (e) {}
              setFitTrigger(c => c + 1);
            }}
            title="Drag to resize sidebar width · Double-click to reset (260px)"
          >
            <div className="inv-resizer-grip" />
          </div>
        )}
      </aside>

      {/* ─── 2. MAIN WORKSPACE WITH 2-TIER ORGANIZED TOPBAR ─── */}
      <main className="inv-workspace">
        <div className="inv-topbar-container">
          {/* ROW 1: Case Identity & Global War-Room Actions (40px) */}
          <div className="inv-topbar-row1">
            <div className="inv-tb-row1-left">
              <span className="inv-brand-tag">
                {isFullScreen ? 'FULLSCREEN FORENSIC CANVAS' : 'TraceX Forensic Engine'}
              </span>
              <span className="inv-case-id-tag">{dataset?.id}</span>
              <span className="inv-case-name">{dataset?.label}</span>
              {dataset?.risk && (
                <span className={`inv-case-risk-pill risk-${dataset.risk.level?.toLowerCase()}`}>
                  <Shield size={11} />
                  {dataset.risk.level} {dataset.risk.score}/100
                </span>
              )}
              <span className="inv-chain-pill">ETH MAINNET</span>
            </div>

            <div className="inv-tb-row1-right">
              {/* Fullscreen Graph Button (Toggles between Maximize and Exit) */}
              <button
                className={`inv-btn-fullscreen ${isFullScreen ? 'active-exit' : ''}`}
                onClick={toggleFullScreen}
                title={isFullScreen ? 'Exit Full Screen Mode (Esc)' : 'Open Transaction Graph in Full Screen'}
              >
                {isFullScreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                <span>{isFullScreen ? 'Exit Fullscreen' : 'Full Screen Graph'}</span>
              </button>

              {!isFullScreen && (
                <button
                  className={`inv-btn-intel-toggle ${dossierOpen ? 'active' : ''}`}
                  onClick={() => setDossierOpen(d => !d)}
                  title="Toggle Forensic Intelligence Dossier"
                >
                  <Activity size={13} />
                  <span>Intelligence Dossier</span>
                </button>
              )}
            </div>
          </div>

          {/* ROW 2: Interactive Controls & Graph Filter Bar (42px) */}
          {!isFullScreen && (
            <div className="inv-topbar-row2">
              <div className="inv-tb-row2-left">
                <div className="inv-view-tabs">
                  {[
                    { key: 'graph', label: 'Fund Flow Graph', icon: Network },
                    { key: 'ledger', label: 'Transaction Ledger', icon: BarChart3 },
                    { key: 'timeline', label: 'Timeline Velocity', icon: Clock },
                  ].map(t => (
                    <button
                      key={t.key}
                      className={`inv-view-tab-btn ${activeTab === t.key ? 'active' : ''}`}
                      onClick={() => setActiveTab(t.key)}
                    >
                      <t.icon size={13} />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>

                <div className="inv-tb-divider" />

                <div className="inv-layers-segment">
                  <button
                    className={`inv-layer-toggle-btn ${layerFilters.observed ? 'active' : ''}`}
                    onClick={() => setLayerFilters(l => ({ ...l, observed: !l.observed }))}
                    title="Toggle Direct On-Chain Transfers"
                  >
                    <span className="inv-layer-dot" style={{ background: '#10b981' }} />
                    Observed
                  </button>
                  <button
                    className={`inv-layer-toggle-btn ${layerFilters.derived ? 'active' : ''}`}
                    onClick={() => setLayerFilters(l => ({ ...l, derived: !l.derived }))}
                    title="Toggle Derived/Bridged Obfuscations"
                  >
                    <span className="inv-layer-dot" style={{ background: '#c084fc' }} />
                    Derived
                  </button>
                </div>

                <div className="inv-tb-divider" />

                <div className="inv-hops-segment">
                  <span className="inv-hops-label">HOPS:</span>
                  {[2, 3, 4, 6].map(h => (
                    <button
                      key={h}
                      className={`inv-hop-step-btn ${maxHopFilter === h ? 'active' : ''}`}
                      onClick={() => setMaxHopFilter(h)}
                    >
                      {h === 6 ? 'All' : h}
                    </button>
                  ))}
                </div>

                <div className="inv-search-input-box">
                  <Search size={13} />
                  <input
                    placeholder="Filter wallet or label..."
                    value={searchQuery}
                    onChange={e => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      if (val.length > 2 && dataset?.graph) {
                        const match = dataset.graph.nodes.find(n =>
                          n.address?.toLowerCase().includes(val.toLowerCase()) ||
                          n.label?.toLowerCase().includes(val.toLowerCase())
                        );
                        if (match) setSelectedNode(match);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="inv-tb-row2-right">
                {activeTab === 'graph' && playbackTimeline.length > 0 && (
                  <div className="inv-trace-playback-bar">
                    <button
                      className="inv-play-btn"
                      onClick={() => setIsPlaying(p => !p)}
                      title="Play/Pause Chronological Trail (Space)"
                    >
                      {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                      <span>{isPlaying ? 'Pause' : 'Trace'}</span>
                    </button>

                    <input
                      type="range"
                      className="inv-scrubber-input"
                      min="0"
                      max={playbackTimeline.length - 1}
                      value={playbackIndex}
                      onChange={e => setPlaybackIndex(Number(e.target.value))}
                    />

                    <span className="inv-timestamp-tag">
                      {currentPlaybackEdge?.timestamp
                        ? new Date(currentPlaybackEdge.timestamp).toLocaleTimeString()
                        : `${playbackIndex + 1}/${playbackTimeline.length}`}
                    </span>

                    <button
                      className="inv-speed-toggle-btn"
                      onClick={() => setPlaybackSpeed(s => (s === 1 ? 2 : s === 2 ? 0.5 : 1))}
                      title="Playback Speed"
                    >
                      {playbackSpeed}x
                    </button>
                  </div>
                )}

                <button className="inv-btn-ask-graph" onClick={() => setAskModalOpen(true)}>
                  <Sparkles size={12} />
                  <span>Ask Graph</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* View Workspace: Fund Flow Graph / Ledger / Timeline */}
        {activeTab === 'graph' && (
          <ReactFlowProvider>
            <ForensicCanvasInner
              dataset={dataset}
              layerFilters={layerFilters}
              maxHopFilter={maxHopFilter}
              selectedNode={selectedNode}
              setSelectedNode={setSelectedNode}
              selectedEdge={selectedEdge}
              setSelectedEdge={setSelectedEdge}
              playbackEdgeId={isPlaying ? currentPlaybackEdge?.id : null}
              playbackSpeed={playbackSpeed}
              activeTab={activeTab}
              onOpenDossier={() => setDossierOpen(true)}
              fitTrigger={fitTrigger}
            />
          </ReactFlowProvider>
        )}

        {activeTab === 'ledger' && <LedgerTable transactions={dataset?.transactions} />}
        {activeTab === 'timeline' && <TimelineScatter transactions={dataset?.transactions} />}

        {/* ─── 3. COLLAPSIBLE RIGHT INTELLIGENCE DOSSIER (Adjustable Width) ─── */}
        <AnimatePresence>
          {dossierOpen && !isFullScreen && (
            <motion.aside
              className={`inv-dossier-overlay ${isResizingDossier ? 'resizing' : ''}`}
              style={{ width: `${dossierWidth}px` }}
              initial={{ x: dossierWidth, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: dossierWidth, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            >
              {/* Draggable Dossier Resizer Handle */}
              <div
                className={`inv-dossier-resizer ${isResizingDossier ? 'active' : ''}`}
                onMouseDown={startResizingDossier}
                onDoubleClick={() => {
                  setDossierWidth(360);
                  try { localStorage.setItem('tracex_dossier_width', '360'); } catch (e) {}
                  setFitTrigger(c => c + 1);
                }}
                title="Drag to resize dossier width · Double-click to reset (360px)"
              >
                <div className="inv-resizer-grip" />
              </div>

              <div className="inv-dossier-header">
                <h3>
                  <Activity size={15} color="#38bdf8" />
                  Forensic Dossier
                </h3>
                <button
                  className="inv-ds-drawer-close"
                  onClick={() => setDossierOpen(false)}
                  title="Close (Esc)"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="inv-dossier-content">
                <div className="inv-stat-grid">
                  <div className="inv-stat-tile">
                    <span className="inv-stat-tile-label">TOTAL NODES</span>
                    <span className="inv-stat-tile-val">{dataset?.graph?.nodes?.length || 0}</span>
                  </div>
                  <div className="inv-stat-tile">
                    <span className="inv-stat-tile-label">FUND HOPS</span>
                    <span className="inv-stat-tile-val">
                      {Math.max(...(dataset?.graph?.nodes?.map(n => n.hop) || [0]))}
                    </span>
                  </div>
                  <div className="inv-stat-tile">
                    <span className="inv-stat-tile-label">FLOW TRANSFERS</span>
                    <span className="inv-stat-tile-val">{dataset?.graph?.edges?.length || 0}</span>
                  </div>
                  <div className="inv-stat-tile">
                    <span className="inv-stat-tile-label">ATTRIBUTED VASPS</span>
                    <span className="inv-stat-tile-val" style={{ color: '#10b981' }}>
                      {dataset?.exchangeAttributions?.length || 0}
                    </span>
                  </div>
                </div>

                {dataset?.typology && (
                  <div className="inv-typology-box">
                    <div className="inv-typology-top">
                      <span className="inv-typology-chip">{dataset.typology}</span>
                      <span style={{ fontSize: 10, color: '#64748b' }}>Pattern Profile</span>
                    </div>
                    <p className="inv-typology-desc">
                      {typologyExpanded
                        ? dataset.description
                        : `${dataset.description?.slice(0, 115)}…`}
                    </p>
                    <button
                      className="inv-read-more-btn"
                      onClick={() => setTypologyExpanded(e => !e)}
                    >
                      {typologyExpanded ? 'Show less ↑' : 'Read more ↓'}
                    </button>
                  </div>
                )}

                {dataset?.risk && (
                  <div className="inv-risk-box">
                    <div className="inv-gauge-wrap">
                      <svg viewBox="0 0 140 70" className="inv-gauge-svg">
                        <path
                          d="M10 65 A60 60 0 0 1 130 65"
                          fill="none"
                          stroke="#1e293b"
                          strokeWidth="10"
                          strokeLinecap="round"
                        />
                        <path
                          d="M10 65 A60 60 0 0 1 130 65"
                          fill="none"
                          stroke={
                            dataset.risk.score >= 90
                              ? '#ef4444'
                              : dataset.risk.score >= 75
                              ? '#f59e0b'
                              : '#10b981'
                          }
                          strokeWidth="10"
                          strokeLinecap="round"
                          strokeDasharray={`${(dataset.risk.score / 100) * 188} 188`}
                        />
                      </svg>
                      <div className="inv-gauge-val">{dataset.risk.score}</div>
                    </div>
                    <span
                      className={`inv-risk-badge-label risk-${dataset.risk.level?.toLowerCase()}`}
                    >
                      {dataset.risk.level} SEVERITY
                    </span>

                    <ul className="inv-factors-list">
                      {dataset.risk.factors?.map((f, i) => (
                        <li key={i}>
                          <AlertTriangle size={12} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedNode && (
                  <div className="inv-detail-card">
                    <strong style={{ fontSize: 12, color: '#38bdf8', display: 'block', marginBottom: 8 }}>
                      Selected Entity Detail
                    </strong>
                    <div className="inv-detail-row">
                      <span>Label</span>
                      <strong>{selectedNode.label}</strong>
                    </div>
                    <div className="inv-detail-row">
                      <span>Role</span>
                      <strong style={{ color: NODE_COLORS[selectedNode.nodeType]?.accent }}>
                        {selectedNode.nodeType?.replace(/_/g, ' ')}
                      </strong>
                    </div>
                    <div className="inv-detail-row">
                      <span>Address</span>
                      <code>{shortAddr(selectedNode.address, 10, 6)}</code>
                    </div>
                    {selectedNode.hop !== undefined && (
                      <div className="inv-detail-row">
                        <span>Hop Depth</span>
                        <strong>Hop {selectedNode.hop}</strong>
                      </div>
                    )}
                    {selectedNode.entity && (
                      <div className="inv-detail-row">
                        <span>Attributed VASP</span>
                        <strong style={{ color: '#10b981' }}>{selectedNode.entity}</strong>
                      </div>
                    )}
                  </div>
                )}

                {selectedEdge && (
                  <div className="inv-detail-card">
                    <strong style={{ fontSize: 12, color: '#38bdf8', display: 'block', marginBottom: 8 }}>
                      Selected Flow Detail
                    </strong>
                    <div className="inv-detail-row">
                      <span>Amount</span>
                      <strong style={{ color: '#10b981' }}>
                        {formatETH(selectedEdge.amount)} {selectedEdge.asset || 'ETH'}
                      </strong>
                    </div>
                    <div className="inv-detail-row">
                      <span>Transfer Type</span>
                      <strong>{selectedEdge.type?.replace(/_/g, ' ')}</strong>
                    </div>
                    {selectedEdge.timestamp && (
                      <div className="inv-detail-row">
                        <span>Time</span>
                        <code>{new Date(selectedEdge.timestamp).toLocaleString()}</code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      {/* ─── 4. ASK-THE-GRAPH COMMAND POPOVER MODAL ─── */}
      <AnimatePresence>
        {askModalOpen && (
          <motion.div
            className="inv-ask-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAskModalOpen(false)}
          >
            <motion.div
              className="inv-ask-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="inv-ask-modal-header">
                <span>
                  <Sparkles size={15} />
                  Query Graph Intelligence
                </span>
                <button className="inv-ds-drawer-close" onClick={() => setAskModalOpen(false)}>
                  <X size={15} />
                </button>
              </div>

              <div className="inv-ask-input-row">
                <Search size={14} color="#8b5cf6" />
                <input
                  placeholder="e.g. 'Find Binance', 'Show largest transfer', 'Trace origin to suspect'..."
                  value={askInput}
                  onChange={e => setAskInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && askInput.trim()) {
                      executeQuery(askInput);
                    }
                  }}
                  autoFocus
                />
              </div>

              <div className="inv-ask-chips">
                {[
                  'Find Exchange off-ramps',
                  'Show largest transfer',
                  'Trace origin suspect',
                  'Filter mixer interactions',
                ].map(chip => (
                  <button key={chip} className="inv-ask-chip" onClick={() => executeQuery(chip)}>
                    {chip}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
