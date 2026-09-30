import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  useReactFlow,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  getBezierPath,
  EdgeLabelRenderer,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import {
  Search, Maximize2, Minimize2, Crosshair, ZoomIn, ZoomOut,
  SlidersHorizontal, Shield, ExternalLink, ArrowRight, Check,
  Copy, Eye, EyeOff, Layers, Activity, ChevronRight, X
} from 'lucide-react';
import '../fundflow.css';

// ─── Palette & Typologies ──────────────────────────────────────────────
const ROLE_THEMES = {
  suspect: {
    color: '#ef4444',
    bg: '#1c0e12',
    border: '#ef4444',
    label: 'Suspect',
    icon: '🚨'
  },
  hub: {
    color: '#f59e0b',
    bg: '#1c1503',
    border: '#f59e0b',
    label: 'Intermediary Hub',
    icon: '⚡'
  },
  intermediary: {
    color: '#f59e0b',
    bg: '#1c1503',
    border: '#f59e0b',
    label: 'Intermediary',
    icon: '🔄'
  },
  exchange: {
    color: '#10b981',
    bg: '#021a10',
    border: '#10b981',
    label: 'VASP / Exchange',
    icon: '🏦',
    isCashOut: true
  },
  bridge: {
    color: '#a855f7',
    bg: '#160824',
    border: '#a855f7',
    label: 'Bridge Contract',
    icon: '🌉'
  },
  mixer: {
    color: '#f97316',
    bg: '#1c1005',
    border: '#f97316',
    label: 'Privacy Mixer',
    icon: '🌪️'
  },
  case: {
    color: '#6366f1',
    bg: '#0c0f24',
    border: '#6366f1',
    label: 'Linked Case',
    icon: '📁'
  },
  group: {
    color: '#38bdf8',
    bg: '#0c1a2e',
    border: '#38bdf8',
    label: 'Grouped Wallets',
    icon: '👥'
  },
  wallet: {
    color: '#64748b',
    bg: '#0d131f',
    border: '#475569',
    label: 'Wallet',
    icon: '👛'
  }
};

function getRoleTheme(type = '') {
  const t = String(type).toLowerCase();
  if (t.includes('suspect')) return ROLE_THEMES.suspect;
  if (t.includes('exchange') || t.includes('vasp')) return ROLE_THEMES.exchange;
  if (t.includes('bridge')) return ROLE_THEMES.bridge;
  if (t.includes('mixer') || t.includes('tornado')) return ROLE_THEMES.mixer;
  if (t.includes('hub')) return ROLE_THEMES.hub;
  if (t.includes('intermediary')) return ROLE_THEMES.intermediary;
  if (t.includes('case')) return ROLE_THEMES.case;
  if (t.includes('group')) return ROLE_THEMES.group;
  return ROLE_THEMES.wallet;
}

function shortAddr(addr = '', pre = 6, suf = 4) {
  if (!addr) return '';
  if (addr.length <= pre + suf + 2) return addr;
  return `${addr.slice(0, pre)}…${addr.slice(-suf)}`;
}

function formatAmount(amt, asset = 'ETH') {
  if (amt == null) return `0.00 ${asset}`;
  const n = Number(amt);
  if (n === 0) return `0 ${asset}`;
  if (n < 0.0001) return `<0.0001 ${asset}`;
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M ${asset}`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K ${asset}`;
  return `${n.toFixed(2)} ${asset}`;
}

// ─── Custom Node Component (180x56 Cards) ──────────────────────────────
function CardNode({ data, selected }) {
  const theme = getRoleTheme(data.type);
  const isSource = Boolean(data.isSource);
  const isGroup = Boolean(data.isGroup);
  const zoom = data.zoom || 1;

  // Level of detail: show simplified pill if zoom is far out
  if (zoom < 0.52) {
    return (
      <div
        className={`ffg-node-pill ${selected ? 'selected' : ''}`}
        style={{ borderColor: theme.color }}
      >
        <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
        <span>{theme.icon}</span>
        <span>{data.label || shortAddr(data.address)}</span>
        <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      </div>
    );
  }

  return (
    <div
      className={`ffg-node-card ${isSource ? 'source-node pulse-suspect' : ''} ${isGroup ? 'group-card' : ''} ${selected ? 'selected' : ''} ${data.isDimmed ? 'dimmed' : ''} ${data.isFlash ? 'flash-search' : ''}`}
      onClick={() => data.onSelect?.(data)}
      onDoubleClick={() => data.onDoubleClick?.(data)}
      onMouseEnter={e => data.onHover?.(e, data)}
      onMouseLeave={data.onLeave}
      style={{
        width: isSource ? 210 : 180,
      }}
    >
      {isGroup && (
        <>
          <div className="ffg-group-stack-layer" />
          <div className="ffg-group-stack-layer2" />
        </>
      )}

      <div className="ffg-node-stripe" style={{ background: theme.color }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      <div className="ffg-node-head">
        <div className="ffg-node-role-badge" style={{ color: theme.color, background: `${theme.color}20` }}>
          <span>{theme.icon}</span>
          <span>{isGroup ? `${data.count} Wallets` : (data.roleTitle || theme.label)}</span>
        </div>
        {theme.isCashOut && <span className="ffg-cashout-tag">CASH-OUT</span>}
        {isGroup && <span className="ffg-group-count">{data.isExpanded ? 'Collapse' : 'Expand'}</span>}
      </div>

      <div className="ffg-node-label" title={data.address || data.label}>
        {data.displayLabel || data.label || shortAddr(data.address)}
      </div>

      <div className="ffg-node-foot">
        <span>{isGroup ? 'Total Aggregated' : (isSource ? 'Outflow' : 'Received')}</span>
        <span className="ffg-node-amount" style={{ color: theme.color }}>
          {formatAmount(data.amount || data.totalIn || 0, data.asset || 'ETH')}
        </span>
      </div>

      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

// ─── Custom Edge Component (With Animated Particles) ───────────────────
function AnimatedFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data = {},
  selected,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const value = Number(data.amount) || 0;
  // Sqrt scale thickness 1.5px to 8px
  const strokeWidth = Math.max(1.5, Math.min(8, Math.sqrt(Math.max(0, value)) * 2 + 1.5));

  // Color by asset
  const asset = (data.asset || 'ETH').toUpperCase();
  const edgeColor = asset === 'ETH' ? '#38bdf8' : (asset === 'USDT' || asset === 'USDC' ? '#10b981' : '#a78bfa');
  const isMainPath = Boolean(data.isMainPath);
  const isDimmed = Boolean(data.isDimmed);

  // Speed and particle count based on value
  const duration = Math.max(1.2, Math.min(3.5, 4 - Math.log10(value + 1)));

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={edgeColor}
        strokeWidth={isMainPath ? strokeWidth + 1 : strokeWidth}
        strokeOpacity={isDimmed ? 0.2 : (isMainPath ? 0.9 : 0.6)}
        strokeDasharray={data.isDerived ? '5 5' : undefined}
        style={{ cursor: 'pointer' }}
        onClick={() => data.onClick?.(data)}
        onMouseEnter={e => data.onHover?.(e, data)}
        onMouseLeave={data.onLeave}
      />

      {!isDimmed && (
        <circle r={isMainPath ? 3.5 : 2.5} fill={isMainPath ? '#fef08a' : edgeColor} filter="url(#ffg-glow)">
          <animateMotion dur={`${duration}s`} repeatCount="indefinite" path={edgePath} />
        </circle>
      )}

      {(data.showLabel || selected) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={`ffg-edge-pill ${selected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''}`}
            onClick={() => data.onClick?.(data)}
            onMouseEnter={e => data.onHover?.(e, data)}
            onMouseLeave={data.onLeave}
          >
            {formatAmount(data.amount, data.asset)}
            {data.count && data.count > 1 ? ` · ${data.count} tx` : ''}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { cardNode: CardNode };
const edgeTypes = { flowEdge: AnimatedFlowEdge };

// ─── Unified FundFlowGraph Inner Component ─────────────────────────────
function FundFlowGraphInner({
  graph = { nodes: [], edges: [] },
  title = 'Fund-flow knowledge graph',
  transactions = [],
  network,
  onCapture,
  onShowTransactions,
  onOpenCase,
  mode = 'wallet',
}) {
  const reactFlow = useReactFlow();
  const containerRef = useRef(null);

  // Filter States
  const [query, setQuery] = useState('');
  const [assetFilter, setAssetFilter] = useState('all');
  const [hopFilter, setHopFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [showDust, setShowDust] = useState(false);
  const [showAllFlows, setShowAllFlows] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  // Interactive States
  const [selectedEntity, setSelectedEntity] = useState(null); // { type: 'node' | 'edge', data }
  const [hoveredEntity, setHoveredEntity] = useState(null);
  const [flashedNodeId, setFlashedNodeId] = useState(null);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Available unique assets and entities
  const availableAssets = useMemo(() => {
    const set = new Set();
    (graph.edges || []).forEach(e => { if (e.asset) set.add(e.asset); });
    return Array.from(set);
  }, [graph.edges]);

  const availableEntities = useMemo(() => {
    const set = new Set();
    (graph.nodes || []).forEach(n => { if (n.type) set.add(n.type); });
    return Array.from(set);
  }, [graph.nodes]);

  // ─── STEP 1 & 2: Process, Filter, Aggregate & Dagre Layout ───────────
  const { layoutedNodes, layoutedEdges, hopHeaders, stats, mainPathEdgeIds } = useMemo(() => {
    const rawNodes = graph.nodes || [];
    const rawEdges = graph.edges || [];

    if (!rawNodes.length) {
      return { layoutedNodes: [], layoutedEdges: [], hopHeaders: [], stats: { totalEth: 0, nodeCount: 0 }, mainPathEdgeIds: new Set() };
    }

    // 1. Identify Suspect / Source Node
    const suspectNode = rawNodes.find(n =>
      String(n.type).toLowerCase().includes('suspect') ||
      n.is_suspect ||
      n.analytics?.role === 'COLLECTOR_CANDIDATE' ||
      n.label === 'Suspect Wallet'
    ) || rawNodes[0];

    const sourceId = suspectNode?.id;

    // 2. Compute hops from source using BFS
    const hopMap = new Map();
    if (sourceId) hopMap.set(sourceId, 0);

    const adj = new Map();
    rawEdges.forEach(e => {
      const u = e.source || e.from;
      const v = e.target || e.to;
      if (!adj.has(u)) adj.set(u, []);
      adj.get(u).push(v);
    });

    const queue = sourceId ? [sourceId] : [];
    while (queue.length > 0) {
      const u = queue.shift();
      const nextHops = adj.get(u) || [];
      nextHops.forEach(v => {
        if (!hopMap.has(v)) {
          hopMap.set(v, (hopMap.get(u) || 0) + 1);
          queue.push(v);
        }
      });
    }

    // 3. Filter raw edges (Dust Filter & Toolbar Filters)
    const validEdges = rawEdges.filter(e => {
      const amt = Number(e.amount) || 0;
      const asset = (e.asset || 'ETH').toUpperCase();

      // Dust filter (< 0.001 ETH or 0)
      if (!showDust && (amt === 0 || (asset === 'ETH' && amt < 0.001))) {
        return false;
      }
      if (assetFilter !== 'all' && e.asset !== assetFilter) return false;
      if (hopFilter !== 'all' && Number(e.hop) !== Number(hopFilter)) return false;
      return true;
    });

    // 4. Merge Parallel Edges between same wallet pairs
    const pairMap = new Map();
    validEdges.forEach(e => {
      const u = e.source || e.from;
      const v = e.target || e.to;
      const key = `${u}->${v}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, {
          id: `edge:${key}`,
          source: u,
          target: v,
          amount: 0,
          asset: e.asset || 'ETH',
          count: 0,
          hop: e.hop || hopMap.get(v) || 1,
          hashes: [],
          type: e.type,
          timestamps: [],
        });
      }
      const item = pairMap.get(key);
      item.amount += Number(e.amount) || 0;
      item.count += 1;
      if (e.hash) item.hashes.push(e.hash);
      if (e.timestamp) item.timestamps.push(e.timestamp);
    });

    const mergedEdges = Array.from(pairMap.values());

    // 5. Connect node pool and determine out-degrees
    const nodeInMap = new Map();
    const nodeOutMap = new Map();
    mergedEdges.forEach(e => {
      nodeOutMap.set(e.source, (nodeOutMap.get(e.source) || 0) + 1);
      nodeInMap.set(e.target, (nodeInMap.get(e.target) || 0) + 1);
    });

    // 6. Aggregate Leaf Wallets: Sibling leaves from same hub with in-degree 1 and out-degree 0
    const parentToLeaves = new Map();
    rawNodes.forEach(n => {
      const inDeg = nodeInMap.get(n.id) || 0;
      const outDeg = nodeOutMap.get(n.id) || 0;
      if (inDeg === 1 && outDeg === 0 && n.id !== sourceId && !String(n.type).toLowerCase().includes('exchange')) {
        const parentEdge = mergedEdges.find(e => e.target === n.id);
        if (parentEdge) {
          const parentId = parentEdge.source;
          if (!parentToLeaves.has(parentId)) parentToLeaves.set(parentId, []);
          parentToLeaves.get(parentId).push({ node: n, edge: parentEdge });
        }
      }
    });

    const groupedNodeIds = new Set();
    const virtualGroupNodes = [];
    const virtualGroupEdges = [];

    parentToLeaves.forEach((leaves, parentId) => {
      if (leaves.length > 2) {
        const groupId = `group:${parentId}:leaves`;
        const isExpanded = expandedGroups.has(groupId);
        if (!isExpanded) {
          const totalVal = leaves.reduce((sum, l) => sum + (Number(l.edge.amount) || 0), 0);
          leaves.forEach(l => groupedNodeIds.add(l.node.id));

          virtualGroupNodes.push({
            id: groupId,
            label: `${leaves.length} destination wallets`,
            displayLabel: `${leaves.length} Dest. Wallets`,
            type: 'group',
            isGroup: true,
            isExpanded: false,
            count: leaves.length,
            amount: totalVal,
            asset: leaves[0].edge.asset || 'ETH',
            hop: (hopMap.get(parentId) || 0) + 1,
            members: leaves.map(l => l.node),
          });

          virtualGroupEdges.push({
            id: `edge:${parentId}->${groupId}`,
            source: parentId,
            target: groupId,
            amount: totalVal,
            asset: leaves[0].edge.asset || 'ETH',
            count: leaves.length,
            hop: (hopMap.get(parentId) || 0) + 1,
          });
        }
      }
    });

    // 7. Filter visible nodes
    let visibleNodes = rawNodes.filter(n => {
      if (groupedNodeIds.has(n.id)) return false;
      if (entityFilter !== 'all' && n.type !== entityFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const matches = (n.address && n.address.toLowerCase().includes(q)) ||
          (n.label && n.label.toLowerCase().includes(q)) ||
          (n.id && n.id.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    }).map(n => ({
      ...n,
      hop: hopMap.get(n.id) ?? (n.hop || 1),
      isSource: n.id === sourceId,
    }));

    visibleNodes = [...visibleNodes, ...virtualGroupNodes];

    // If too many nodes (> 25), prioritize top 25 by value
    if (visibleNodes.length > 28) {
      visibleNodes.sort((a, b) => {
        if (a.isSource) return -1;
        if (b.isSource) return 1;
        return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      });
      const topSet = new Set(visibleNodes.slice(0, 25).map(n => n.id));
      topSet.add(sourceId);
      visibleNodes = visibleNodes.filter(n => topSet.has(n.id));
    }

    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    // 8. Rebuild edges among visible nodes
    let activeEdges = [...mergedEdges.filter(e => !groupedNodeIds.has(e.target)), ...virtualGroupEdges]
      .filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

    // 9. Main Laundering Path Calculation (Find max-value route from source to destination)
    const mainPathEdgeIds = new Set();
    if (sourceId) {
      let curr = sourceId;
      const visited = new Set([curr]);
      for (let step = 0; step < 4; step++) {
        const outEdges = activeEdges.filter(e => e.source === curr && !visited.has(e.target));
        if (!outEdges.length) break;
        outEdges.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
        const bestEdge = outEdges[0];
        mainPathEdgeIds.add(bestEdge.id);
        curr = bestEdge.target;
        visited.add(curr);
      }
    }

    // 10. Dagre LR Layout with structured Hop columns
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: 'LR',
      nodesep: 48,
      ranksep: 220,
      edgesep: 25,
      marginx: 40,
      marginy: 60,
    });

    visibleNodes.forEach(n => {
      g.setNode(n.id, {
        width: n.isSource ? 210 : 180,
        height: 64,
      });
    });

    activeEdges.forEach(e => {
      g.setEdge(e.source, e.target);
    });

    dagre.layout(g);

    // Compute hop column averages
    const hopXBuckets = new Map();
    const layoutedNodes = visibleNodes.map(n => {
      const pos = g.node(n.id) || { x: 100, y: 100 };
      const hop = n.hop ?? 0;
      if (!hopXBuckets.has(hop)) hopXBuckets.set(hop, []);
      hopXBuckets.get(hop).push(pos.x);

      return {
        id: n.id,
        type: 'cardNode',
        position: { x: pos.x - (n.isSource ? 105 : 90), y: pos.y - 32 },
        data: {
          ...n,
          isFlash: flashedNodeId === n.id,
          isDimmed: !showAllFlows && mainPathEdgeIds.size > 0 && !mainPathEdgeIds.has(n.id),
        },
      };
    });

    // Top 10 edges get permanent label
    const sortedEdges = [...activeEdges].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
    const topEdgeIds = new Set(sortedEdges.slice(0, 10).map(e => e.id));

    const layoutedEdges = activeEdges.map(e => {
      const isMain = mainPathEdgeIds.has(e.id);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'flowEdge',
        data: {
          ...e,
          isMainPath: isMain,
          isDimmed: !showAllFlows && mainPathEdgeIds.size > 0 && !isMain,
          showLabel: topEdgeIds.has(e.id),
        },
      };
    });

    // Column headers
    const hopHeaders = [];
    const HOP_NAMES = ['SOURCE', 'HOP 1 (INTERMEDIARY)', 'HOP 2 (LAYERING)', 'HOP 3 (CASH-OUT)', 'HOP 4 (DESTINATION)'];
    hopXBuckets.forEach((xs, hop) => {
      const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
      hopHeaders.push({
        hop,
        avgX,
        label: HOP_NAMES[hop] || `HOP ${hop}`,
      });
    });

    // Real Corrected Totals
    const totalEth = activeEdges.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    return {
      layoutedNodes,
      layoutedEdges,
      hopHeaders,
      stats: {
        totalEth,
        nodeCount: visibleNodes.length,
        edgeCount: activeEdges.length,
        dustHidden: rawEdges.length - validEdges.length,
      },
      mainPathEdgeIds,
    };
  }, [graph, query, assetFilter, hopFilter, entityFilter, showDust, showAllFlows, expandedGroups, flashedNodeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Sync state when layouted items update
  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  // ─── Auto-Fit on Load, Filter, and Container Resize ──────────────────
  const fitViewSmooth = useCallback((duration = 500) => {
    if (reactFlow) {
      reactFlow.fitView({ padding: 0.08, minZoom: 0.6, maxZoom: 1.3, duration });
    }
  }, [reactFlow]);

  useEffect(() => {
    const t = setTimeout(() => fitViewSmooth(500), 80);
    return () => clearTimeout(t);
  }, [layoutedNodes.length, fitViewSmooth]);

  // Container ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timer;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => fitViewSmooth(350), 100);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [fitViewSmooth]);

  // Keyboard shortcut: 'F' key fits view, 'Esc' clears selection
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'f' || e.key === 'F') {
        fitViewSmooth(400);
      } else if (e.key === 'Escape') {
        setSelectedEntity(null);
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fitViewSmooth]);

  // ─── Interaction Handlers ────────────────────────────────────────────
  const handleNodeClick = useCallback((nodeData) => {
    if (nodeData.isGroup) {
      // Toggle group expansion
      const groupId = nodeData.id;
      setExpandedGroups(prev => {
        const next = new Set(prev);
        if (next.has(groupId)) next.delete(groupId);
        else next.add(groupId);
        return next;
      });
      return;
    }

    setSelectedEntity({ type: 'node', data: nodeData });
    setDrawerOpen(true);

    if (nodeData.position) {
      reactFlow.setCenter(nodeData.position.x + 90, nodeData.position.y + 32, {
        duration: 400,
        zoom: Math.max(reactFlow.getZoom(), 0.9),
      });
    }
  }, [reactFlow]);

  const handleEdgeClick = useCallback((edgeData) => {
    setSelectedEntity({ type: 'edge', data: edgeData });
    setDrawerOpen(true);
  }, []);

  // Search Address Handler
  const handleSearchChange = (val) => {
    setQuery(val);
    if (!val) return;
    const target = nodes.find(n =>
      n.id.toLowerCase().includes(val.toLowerCase()) ||
      (n.data?.address && n.data.address.toLowerCase().includes(val.toLowerCase())) ||
      (n.data?.label && n.data.label.toLowerCase().includes(val.toLowerCase()))
    );
    if (target) {
      setFlashedNodeId(target.id);
      reactFlow.setCenter(target.position.x + 90, target.position.y + 32, {
        duration: 450,
        zoom: 1.1,
      });
      setTimeout(() => setFlashedNodeId(null), 1500);
    }
  };

  // Wire node/edge callbacks into data objects
  const interactiveNodes = useMemo(() => {
    const zoom = reactFlow.getZoom();
    return nodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        zoom,
        onSelect: handleNodeClick,
        onDoubleClick: (d) => {
          reactFlow.setCenter(n.position.x + 90, n.position.y + 32, { duration: 350, zoom: 1.2 });
        },
        onHover: (e, d) => setHoveredEntity({ type: 'node', data: d }),
        onLeave: () => setHoveredEntity(null),
      },
    }));
  }, [nodes, reactFlow, handleNodeClick]);

  const interactiveEdges = useMemo(() => {
    return edges.map(e => ({
      ...e,
      data: {
        ...e.data,
        onClick: handleEdgeClick,
        onHover: (evt, d) => setHoveredEntity({ type: 'edge', data: d }),
        onLeave: () => setHoveredEntity(null),
      },
    }));
  }, [edges, handleEdgeClick]);

  return (
    <div
      ref={containerRef}
      className={`fund-flow-container ${isFullScreen ? 'fullscreen' : ''}`}
    >
      {/* SVG Filter for High-Impact Glowing Particles */}
      <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
        <defs>
          <filter id="ffg-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* ─── 1. TOP COMMAND TOOLBAR ─── */}
      <div className="ffg-toolbar">
        <div className="ffg-toolbar-left">
          <span className="ffg-title-tag">{title}</span>
          <span className="ffg-stats-badge">
            <strong>{stats.nodeCount}</strong> entities · <strong>{stats.edgeCount}</strong> paths · <strong>{formatAmount(stats.totalEth)}</strong>
          </span>

          {/* Search Box (Min 260px, never clipped) */}
          <div className="ffg-search-wrap">
            <Search size={14} className="ffg-search-icon" />
            <input
              type="text"
              className="ffg-search-input"
              placeholder="Find wallet address or label..."
              value={query}
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>

          {/* Asset Filter */}
          <select
            className="ffg-select"
            value={assetFilter}
            onChange={e => setAssetFilter(e.target.value)}
          >
            <option value="all">All Assets</option>
            {availableAssets.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Hop Filter */}
          <select
            className="ffg-select"
            value={hopFilter}
            onChange={e => setHopFilter(e.target.value)}
          >
            <option value="all">All Hops</option>
            <option value="1">Hop 1</option>
            <option value="2">Hop 2</option>
            <option value="3">Hop 3</option>
          </select>

          {/* Entity Filter */}
          <select
            className="ffg-select"
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            {availableEntities.map(ent => (
              <option key={ent} value={ent}>{ent.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div className="ffg-toolbar-right">
          {/* Dust Toggle */}
          <button
            className={`ffg-btn ${showDust ? 'active' : ''}`}
            onClick={() => setShowDust(d => !d)}
            title="Toggle micro transfers and 0-value dust"
          >
            {showDust ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>{showDust ? 'Hide Dust' : `Show Dust (${stats.dustHidden})`}</span>
          </button>

          {/* Main Laundering Path Toggle */}
          <button
            className={`ffg-btn ${showAllFlows ? 'active' : ''}`}
            onClick={() => setShowAllFlows(f => !f)}
            title="Toggle all flows vs main critical laundering path"
          >
            <Layers size={13} />
            <span>{showAllFlows ? 'All Flows' : 'Main Path'}</span>
          </button>

          {/* Fit Button */}
          <button
            className="ffg-btn ffg-btn-icon"
            onClick={() => fitViewSmooth(450)}
            title="Fit Entire Graph to Viewport (Press F)"
          >
            <Crosshair size={14} />
          </button>

          {/* Zoom Buttons */}
          <button
            className="ffg-btn ffg-btn-icon"
            onClick={() => reactFlow.zoomIn({ duration: 250 })}
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <button
            className="ffg-btn ffg-btn-icon"
            onClick={() => reactFlow.zoomOut({ duration: 250 })}
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>

          {/* Fullscreen Toggle */}
          <button
            className={`ffg-btn ffg-btn-icon ${isFullScreen ? 'active' : ''}`}
            onClick={() => setIsFullScreen(fs => !fs)}
            title={isFullScreen ? 'Exit Full Screen' : 'Full Screen Graph'}
          >
            {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* ─── 2. GRAPH VIEWPORT & CANVAS ─── */}
      <div className="ffg-viewport">
        {/* Hop Column Headers Overlay */}
        <div className="ffg-hop-columns">
          {hopHeaders.map(h => (
            <div
              key={h.hop}
              className="ffg-hop-header"
              style={{
                left: `${h.avgX * reactFlow.getZoom() + (reactFlow.getViewport()?.x || 0)}px`,
              }}
            >
              {h.label}
            </div>
          ))}
        </div>

        <div className="ffg-rf-anchor">
          <ReactFlow
            nodes={interactiveNodes}
            edges={interactiveEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            minZoom={0.25}
            maxZoom={2.4}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background color="#1e293b" gap={24} size={1} />
          </ReactFlow>
        </div>

        {/* Bottom Minimap */}
        {minimapOpen && (
          <div className="ffg-minimap-wrap">
            <MiniMap
              nodeColor={n => getRoleTheme(n.data?.type).color}
              maskColor="rgba(7, 9, 14, 0.85)"
              style={{ width: 160, height: 100, background: '#0b101c' }}
            />
          </div>
        )}
      </div>

      {/* ─── 3. DETAILS DRAWER & INTELLIGENCE INSPECTOR ─── */}
      {drawerOpen && selectedEntity && (
        <aside className="ffg-drawer">
          <div className="ffg-drawer-head">
            <div className="ffg-drawer-title">
              <Activity size={15} color="#38bdf8" />
              <span>{selectedEntity.type === 'node' ? 'Entity Intelligence' : 'Transfer Evidence'}</span>
            </div>
            <button
              className="ffg-btn ffg-btn-icon"
              onClick={() => setDrawerOpen(false)}
              title="Close Drawer (Esc)"
            >
              <X size={14} />
            </button>
          </div>

          <div className="ffg-drawer-body">
            {selectedEntity.type === 'node' ? (
              <>
                <div className="ffg-kv-row">
                  <span className="ffg-kv-label">Role Classification</span>
                  <div className="ffg-node-role-badge" style={{ color: getRoleTheme(selectedEntity.data.type).color }}>
                    {selectedEntity.data.roleTitle || getRoleTheme(selectedEntity.data.type).label}
                  </div>
                </div>

                <div className="ffg-kv-row">
                  <span className="ffg-kv-label">Wallet Address</span>
                  <span className="ffg-kv-val">{selectedEntity.data.address || selectedEntity.data.id}</span>
                </div>

                <div className="ffg-kv-row">
                  <span className="ffg-kv-label">Total Received / Outflow</span>
                  <strong style={{ color: '#38bdf8' }}>
                    {formatAmount(selectedEntity.data.amount || selectedEntity.data.totalIn || 0, selectedEntity.data.asset)}
                  </strong>
                </div>

                {selectedEntity.data.analytics && (
                  <>
                    <div className="ffg-kv-row">
                      <span className="ffg-kv-label">Distinct Counterparties</span>
                      <span className="ffg-kv-val">
                        {selectedEntity.data.analytics.distinct_sources || 0} Sources · {selectedEntity.data.analytics.distinct_destinations || 0} Destinations
                      </span>
                    </div>

                    <div className="ffg-kv-row">
                      <span className="ffg-kv-label">Topological Profile</span>
                      <span className="ffg-kv-val">{selectedEntity.data.analytics.reason}</span>
                    </div>
                  </>
                )}

                <div className="ffg-drawer-actions">
                  {onCapture && (
                    <button
                      className="ffg-action-btn ffg-action-primary"
                      onClick={() => onCapture({
                        evidence_type: 'WALLET',
                        title: `Wallet: ${selectedEntity.data.address || selectedEntity.data.id}`,
                        wallet_address: selectedEntity.data.address || selectedEntity.data.id,
                        snapshot: selectedEntity.data,
                      })}
                    >
                      <Check size={14} />
                      <span>Capture as Case Evidence</span>
                    </button>
                  )}

                  {onShowTransactions && (
                    <button
                      className="ffg-action-btn ffg-action-secondary"
                      onClick={() => onShowTransactions(selectedEntity.data.address || selectedEntity.data.id)}
                    >
                      <ExternalLink size={14} />
                      <span>Filter in Transactions Explorer</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="ffg-kv-row">
                  <span className="ffg-kv-label">Transferred Amount</span>
                  <strong style={{ color: '#38bdf8', fontSize: 16 }}>
                    {formatAmount(selectedEntity.data.amount, selectedEntity.data.asset)}
                  </strong>
                </div>

                <div className="ffg-kv-row">
                  <span className="ffg-kv-label">Sender (Source)</span>
                  <span className="ffg-kv-val">{selectedEntity.data.source}</span>
                </div>

                <div className="ffg-kv-row">
                  <span className="ffg-kv-label">Recipient (Target)</span>
                  <span className="ffg-kv-val">{selectedEntity.data.target}</span>
                </div>

                <div className="ffg-kv-row">
                  <span className="ffg-kv-label">Transaction Count</span>
                  <span className="ffg-kv-val">{selectedEntity.data.count || 1} on-chain transfer(s)</span>
                </div>

                {selectedEntity.data.hashes && selectedEntity.data.hashes.length > 0 && (
                  <div className="ffg-kv-row">
                    <span className="ffg-kv-label">Transaction Hash</span>
                    <span className="ffg-kv-val">{selectedEntity.data.hashes[0]}</span>
                  </div>
                )}

                <div className="ffg-drawer-actions">
                  {onCapture && (
                    <button
                      className="ffg-action-btn ffg-action-primary"
                      onClick={() => onCapture({
                        evidence_type: 'TRACED_PATH',
                        title: `Path: ${shortAddr(selectedEntity.data.source)} → ${shortAddr(selectedEntity.data.target)} (${formatAmount(selectedEntity.data.amount, selectedEntity.data.asset)})`,
                        wallet_address: selectedEntity.data.source,
                        snapshot: selectedEntity.data,
                      })}
                    >
                      <Check size={14} />
                      <span>Capture Path as Evidence</span>
                    </button>
                  )}

                  {onShowTransactions && selectedEntity.data.hashes?.[0] && (
                    <button
                      className="ffg-action-btn ffg-action-secondary"
                      onClick={() => onShowTransactions(selectedEntity.data.hashes[0])}
                    >
                      <ExternalLink size={14} />
                      <span>Inspect On-Chain Hash</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

// ─── Exported Wrapper with ReactFlowProvider ───────────────────────────
export default function FundFlowGraph(props) {
  return (
    <ReactFlowProvider>
      <FundFlowGraphInner {...props} />
    </ReactFlowProvider>
  );
}

export { FundFlowGraph };
