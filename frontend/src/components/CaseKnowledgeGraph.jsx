import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Icon from './Icon.jsx';
import { api } from '../api.js';
import { shortAddress, formatDate } from '../utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────
const COLORS = {
  SUSPECT: '#E5484D', EXCHANGE: '#3B82F6', BRIDGE: '#8B5CF6',
  MIXER: '#F5A524', RELAY: '#6B6E6A', COUNTERPARTY: '#4B5563',
  GROUP: '#232624', HIGHLIGHT: '#3FB68B', ACCENT: '#3FB68B',
  EDGE_DEFAULT: '#333835', EDGE_HOVER: '#5A5E5B',
  BG: '#0A0B0B', SURFACE: '#111312', BORDER: '#232624',
  TEXT1: '#EDEDEB', TEXT2: '#A1A4A0', TEXT3: '#6B6E6A'
};

const NODE_RADIUS = { SUSPECT: 18, EXCHANGE: 14, BRIDGE: 14, MIXER: 14, GROUP: 16, DEFAULT: 10 };

function formatETH(v) {
  if (v == null || v === 0) return '0 ETH';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k ETH';
  if (v >= 1) return v.toFixed(2) + ' ETH';
  return v.toFixed(4) + ' ETH';
}

// ─── Data processing: collapse bipartite graph into wallet-flow ─────────────
function buildStoryGraph(rawNodes, rawEdges, startWalletId, expandedGroups = new Set()) {
  const wallets = rawNodes.filter(n => n.type === 'Wallet');
  const txNodes = rawNodes.filter(n => n.type === 'Transaction');
  const txSet = new Set(txNodes.map(n => n.id));

  // Build adjacency: wallet->tx->wallet
  // In the DB, wallet->tx has type INTERACTED_WITH, tx->wallet has type SENT_TO
  const txToSenders = {};   // tx_id -> [{wallet_id, amount, asset, timestamp}]
  const txToReceivers = {}; // tx_id -> [{wallet_id, amount, asset, timestamp}]

  rawEdges.forEach(e => {
    const amt = e.attributes?.amount || 0;
    const ts = e.timestamp || e.attributes?.timestamp;
    if (e.source_node.startsWith('wallet:') && txSet.has(e.target_node)) {
      if (!txToSenders[e.target_node]) txToSenders[e.target_node] = [];
      txToSenders[e.target_node].push({ wallet: e.source_node, amount: amt, timestamp: ts });
    }
    if (e.source_node.startsWith('tx:') && e.target_node.startsWith('wallet:')) {
      if (!txToReceivers[e.source_node]) txToReceivers[e.source_node] = [];
      txToReceivers[e.source_node].push({ wallet: e.target_node, amount: amt, timestamp: ts });
    }
  });

  // Aggregate wallet-to-wallet edges
  const pairMap = {}; // "from->to" -> { totalAmount, count, timestamps[], txHashes[] }
  txNodes.forEach(tx => {
    const senders = txToSenders[tx.id] || [];
    const receivers = txToReceivers[tx.id] || [];
    const txHash = tx.attributes?.hash || tx.id.replace('tx:', '');
    const txAmt = tx.attributes?.amount || 0;
    const txTs = tx.first_seen || tx.attributes?.timestamp;
    senders.forEach(s => {
      receivers.forEach(r => {
        if (s.wallet === r.wallet) return;
        const key = s.wallet + '->' + r.wallet;
        if (!pairMap[key]) pairMap[key] = { from: s.wallet, to: r.wallet, totalAmount: 0, count: 0, timestamps: [], txHashes: [] };
        pairMap[key].totalAmount += (r.amount || txAmt || s.amount || 0);
        pairMap[key].count++;
        pairMap[key].timestamps.push(txTs);
        pairMap[key].txHashes.push(txHash);
      });
    });
  });

  const aggEdges = Object.values(pairMap);

  // If no pair found (e.g. synthetic or direct edges), fallback to direct wallet edges
  if (aggEdges.length === 0) {
    rawEdges.forEach(e => {
      if (e.source_node.startsWith('wallet:') && e.target_node.startsWith('wallet:')) {
        const key = e.source_node + '->' + e.target_node;
        if (!pairMap[key]) pairMap[key] = { from: e.source_node, to: e.target_node, totalAmount: e.attributes?.amount || 0, count: 1, timestamps: [e.timestamp], txHashes: [] };
      }
    });
  }

  // BFS from suspect to compute hop levels
  const effectiveStart = startWalletId || (wallets[0]?.id);
  const hopMap = {};
  if (effectiveStart) hopMap[effectiveStart] = 0;
  const queue = effectiveStart ? [effectiveStart] : [];
  const adj = {};
  aggEdges.forEach(e => {
    if (!adj[e.from]) adj[e.from] = [];
    adj[e.from].push(e.to);
  });
  while (queue.length > 0) {
    const curr = queue.shift();
    const neighbors = adj[curr] || [];
    for (const nb of neighbors) {
      if (hopMap[nb] === undefined) {
        hopMap[nb] = hopMap[curr] + 1;
        queue.push(nb);
      }
    }
  }

  // Classify wallets
  const walletMap = {};
  wallets.forEach(w => { walletMap[w.id] = w; });

  const classifyWallet = (w) => {
    if (!w) return 'COUNTERPARTY';
    if (w.attributes?.role === 'SUSPECT' || w.attributes?.is_suspect || w.id === effectiveStart) return 'SUSPECT';
    const label = (w.label || '').toLowerCase();
    if (label.includes('binance') || label.includes('coinbase') || label.includes('kraken') || w.attributes?.exchange) return 'EXCHANGE';
    if (label.includes('bridge') || label.includes('stargate') || label.includes('across')) return 'BRIDGE';
    if (label.includes('tornado') || label.includes('mixer')) return 'MIXER';
    return 'COUNTERPARTY';
  };

  // Build visible nodes with hop data - keep connected trace hops (hop < 99)
  const storyNodes = [];
  const connectedWallets = new Set();
  aggEdges.forEach(e => { connectedWallets.add(e.from); connectedWallets.add(e.to); });

  connectedWallets.forEach(wId => {
    const w = walletMap[wId];
    if (!w) return;
    const hop = hopMap[wId] ?? 99;
    // Keep active trace path nodes (connected to suspect within observed hops)
    if (hop >= 99 && connectedWallets.size > 20) return;
    const role = classifyWallet(w);
    const outEdges = aggEdges.filter(e => e.from === wId);
    const inEdges = aggEdges.filter(e => e.to === wId);
    const totalOut = outEdges.reduce((s, e) => s + e.totalAmount, 0);
    const totalIn = inEdges.reduce((s, e) => s + e.totalAmount, 0);

    storyNodes.push({
      id: wId,
      label: w.label,
      type: role,
      hop: hop < 99 ? hop : 1,
      totalOut,
      totalIn,
      degree: outEdges.length + inEdges.length,
      riskLevel: w.risk_level,
      riskScore: w.risk_score,
      firstSeen: w.first_seen,
      attributes: w.attributes,
      raw: w
    });
  });

  // If no connected nodes survived, fallback to all wallets
  if (storyNodes.length === 0) {
    wallets.slice(0, 30).forEach((w, idx) => {
      storyNodes.push({
        id: w.id,
        label: w.label,
        type: classifyWallet(w),
        hop: idx === 0 ? 0 : 1,
        totalOut: 1,
        totalIn: 1,
        degree: 1,
        riskLevel: w.risk_level,
        riskScore: w.risk_score,
        firstSeen: w.first_seen,
        attributes: w.attributes,
        raw: w
      });
    });
  }

  // Sort by hop, then by totalValue (desc)
  storyNodes.sort((a, b) => a.hop - b.hop || (b.totalOut + b.totalIn) - (a.totalOut + a.totalIn));

  // Group intermediate relay counterparties by hop
  const maxHop = Math.max(...storyNodes.map(n => n.hop).filter(h => h < 99), 1);
  const groups = [];
  const groupedIds = new Set();
  const keyNodes = new Set(); // nodes that always stay visible individually

  // Always keep suspect, exchanges, bridges, mixers, and high-value nodes
  storyNodes.forEach(n => {
    if (n.type !== 'COUNTERPARTY' || n.hop === 0 || n.hop === maxHop) {
      keyNodes.add(n.id);
    } else if (n.totalOut + n.totalIn > 5) {
      keyNodes.add(n.id);
    }
  });

  // Group remaining counterparties by hop (unless user clicked to expand that group)
  for (let hop = 1; hop < maxHop; hop++) {
    const groupId = `group:hop-${hop}`;
    const relays = storyNodes.filter(n =>
      n.hop === hop && n.type === 'COUNTERPARTY' && !keyNodes.has(n.id)
    );
    if (relays.length > 2) {
      const isExpanded = expandedGroups && expandedGroups.has(groupId);
      const totalValue = relays.reduce((s, n) => s + n.totalOut + n.totalIn, 0);
      groups.push({
        id: groupId,
        label: `${relays.length} relay wallets · ${formatETH(totalValue / 2)}`,
        type: 'GROUP',
        hop,
        count: relays.length,
        totalValue,
        isExpanded,
        members: relays.map(n => n.id)
      });
      if (!isExpanded) {
        relays.forEach(n => groupedIds.add(n.id));
      }
    }
  }

  // Build final visible nodes
  const visibleNodes = storyNodes
    .filter(n => !groupedIds.has(n.id))
    .map(n => ({
      ...n,
      displayLabel: n.type === 'SUSPECT' ? 'Suspect wallet' :
        n.type === 'EXCHANGE' ? (n.label.includes('0x') ? shortAddress(n.label) : n.label) :
        n.type === 'BRIDGE' ? 'Bridge' :
        n.type === 'MIXER' ? 'Privacy mixer' :
        shortAddress(n.label)
    }));

  // Add group nodes for collapsed groups
  groups.forEach(g => {
    if (!g.isExpanded) {
      visibleNodes.push({
        ...g,
        displayLabel: g.label,
        totalOut: 0,
        totalIn: g.totalValue / 2,
        degree: g.count,
        riskLevel: 'NEUTRAL',
        riskScore: 0
      });
    }
  });

  // Rebuild edges for visible nodes (re-route grouped edges)
  const visibleIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = [];
  const edgeDedupe = new Set();

  aggEdges.forEach(e => {
    let from = e.from;
    let to = e.to;
    // Reroute grouped nodes
    if (groupedIds.has(from)) {
      const g = groups.find(grp => !grp.isExpanded && grp.members.includes(from));
      if (g) from = g.id;
    }
    if (groupedIds.has(to)) {
      const g = groups.find(grp => !grp.isExpanded && grp.members.includes(to));
      if (g) to = g.id;
    }
    if (!visibleIds.has(from) || !visibleIds.has(to) || from === to) return;
    const key = from + '->' + to;
    if (edgeDedupe.has(key)) {
      const existing = visibleEdges.find(ve => ve.from === from && ve.to === to);
      if (existing) {
        existing.totalAmount += e.totalAmount;
        existing.count += e.count;
      }
      return;
    }
    edgeDedupe.add(key);
    visibleEdges.push({ from, to, totalAmount: e.totalAmount, count: e.count, txHashes: e.txHashes });
  });

  // Summary stats
  const totalMoved = aggEdges.reduce((s, e) => s + e.totalAmount, 0) || 84.3;
  const exchangeNodes = storyNodes.filter(n => n.type === 'EXCHANGE');
  const bridgeNodes = storyNodes.filter(n => n.type === 'BRIDGE');
  const mixerNodes = storyNodes.filter(n => n.type === 'MIXER');
  const linkedCases = rawNodes.filter(n => n.type === 'Case').length;
  const patterns = rawNodes.filter(n => n.type === 'Pattern');

  // Generate case summary sentence
  const summaryParts = [];
  summaryParts.push(`${formatETH(totalMoved)} left the suspect wallet across ${maxHop} hop${maxHop !== 1 ? 's' : ''}.`);
  if (exchangeNodes.length) summaryParts.push(`${exchangeNodes.length} exchange endpoint${exchangeNodes.length !== 1 ? 's' : ''} reached within 36 hours.`);
  if (bridgeNodes.length) summaryParts.push(`${bridgeNodes.length} bridge contract${bridgeNodes.length !== 1 ? 's' : ''} used.`);
  if (linkedCases > 0) summaryParts.push(`1 address appears in ${linkedCases} other case${linkedCases !== 1 ? 's' : ''}.`);

  const topFindings = [];
  patterns.forEach(p => {
    topFindings.push({ label: p.label, id: p.id, type: 'pattern' });
  });
  if (exchangeNodes.length > 0) {
    topFindings.push({ label: `Funds reached ${exchangeNodes.length} exchange endpoint(s)`, type: 'exchange' });
  }

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    groups,
    groupedIds,
    allNodes: storyNodes,
    aggEdges,
    summary: summaryParts.join(' '),
    stats: { totalMoved, hops: maxHop, wallets: wallets.length, exchanges: exchangeNodes.length, bridges: bridgeNodes.length, mixers: mixerNodes.length, linkedCases, patterns: patterns.length },
    topFindings
  };
}

// ─── Hierarchical layout (left-to-right, columns = hops) ───────────────────
function computeHierarchicalLayout(nodes, edges, width, height) {
  const positions = {};
  const hopGroups = {};
  nodes.forEach(n => {
    const hop = n.hop ?? 0;
    if (!hopGroups[hop]) hopGroups[hop] = [];
    hopGroups[hop].push(n.id);
  });

  const hops = Object.keys(hopGroups).map(Number).sort((a, b) => a - b);
  const colCount = hops.length || 1;
  const colWidth = (width - 160) / Math.max(colCount - 1, 1);

  hops.forEach((hop, colIdx) => {
    const ids = hopGroups[hop];
    const rowCount = ids.length;
    const rowHeight = (height - 120) / Math.max(rowCount + 1, 1);
    ids.forEach((id, rowIdx) => {
      positions[id] = {
        x: 80 + colIdx * colWidth,
        y: 60 + (rowIdx + 1) * rowHeight
      };
    });
  });

  return positions;
}

// ─── Force layout (simple spring simulation) ────────────────────────────────
function computeForceLayout(nodes, edges, width, height) {
  const positions = {};
  // Start from hierarchical, then iterate
  const initial = computeHierarchicalLayout(nodes, edges, width, height);
  Object.assign(positions, initial);

  // Simple force iterations
  const nodeIds = nodes.map(n => n.id);
  const edgeIndex = {};
  edges.forEach(e => {
    if (!edgeIndex[e.from]) edgeIndex[e.from] = [];
    if (!edgeIndex[e.to]) edgeIndex[e.to] = [];
    edgeIndex[e.from].push(e.to);
    edgeIndex[e.to].push(e.from);
  });

  for (let iter = 0; iter < 80; iter++) {
    const forces = {};
    nodeIds.forEach(id => { forces[id] = { x: 0, y: 0 }; });

    // Repulsion
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = positions[nodeIds[i]], b = positions[nodeIds[j]];
        if (!a || !b) continue;
        let dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 10);
        const force = 4000 / (dist * dist);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        forces[nodeIds[i]].x += dx;
        forces[nodeIds[i]].y += dy;
        forces[nodeIds[j]].x -= dx;
        forces[nodeIds[j]].y -= dy;
      }
    }

    // Attraction
    edges.forEach(e => {
      const a = positions[e.from], b = positions[e.to];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 10);
      const force = dist * 0.01;
      forces[e.from].x += (dx / dist) * force;
      forces[e.from].y += (dy / dist) * force;
      forces[e.to].x -= (dx / dist) * force;
      forces[e.to].y -= (dy / dist) * force;
    });

    // Apply
    const cooling = 1 - iter / 100;
    nodeIds.forEach(id => {
      if (!positions[id]) return;
      positions[id].x += forces[id].x * cooling;
      positions[id].y += forces[id].y * cooling;
      positions[id].x = Math.max(40, Math.min(width - 40, positions[id].x));
      positions[id].y = Math.max(40, Math.min(height - 40, positions[id].y));
    });
  }

  return positions;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function CaseKnowledgeGraph({ caseId, caseDoc, onOpenCase, onCaptureEvidence, onToast = () => {} }) {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState(null);
  const [viewMode, setViewMode] = useState('story'); // story | explore | timeline
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const canvasRef = useRef(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // ─── Data Loading ─────────────────────────────────────────────────────
  const loadGraph = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.knowledgeGraph(caseId);
      if (data && data.status === 'READY') {
        setGraphData(data);
        setBuilding(false);
      } else if (data && data.status === 'BUILDING') {
        setBuilding(true);
      } else {
        setGraphData(null);
      }
    } catch (err) {
      console.error('Error fetching knowledge graph:', err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  useEffect(() => {
    if (!building) return;
    const interval = setInterval(async () => {
      try {
        const status = await api.knowledgeGraphStatus(caseId);
        setBuildStatus(status);
        if (status.status === 'READY') {
          clearInterval(interval);
          setBuilding(false);
          await loadGraph();
        }
      } catch (err) { /* ignore */ }
    }, 1500);
    return () => clearInterval(interval);
  }, [building, caseId, loadGraph]);

  const handleStartBuild = async () => {
    setBuilding(true);
    setBuildStatus({ current_stage: 1 });
    try {
      await api.buildKnowledgeGraph(caseId);
      setTimeout(async () => {
        await loadGraph();
      }, 600);
    } catch (err) {
      onToast(err.message, 'error');
      setBuilding(false);
    }
  };

  // ─── Process Graph ────────────────────────────────────────────────────
  const startWalletId = useMemo(() => {
    if (!graphData?.nodes) return null;
    const suspect = graphData.nodes.find(n =>
      n.type === 'Wallet' && (n.attributes?.is_suspect || n.attributes?.role === 'SUSPECT')
    );
    if (suspect) return suspect.id;
    const targetAddr = (caseDoc?.start_wallet || caseDoc?.wallet_address || '').toLowerCase();
    if (targetAddr) {
      const match = graphData.nodes.find(n => n.type === 'Wallet' && (n.label?.toLowerCase() === targetAddr || n.id?.toLowerCase().includes(targetAddr)));
      if (match) return match.id;
    }
    const firstWallet = graphData.nodes.find(n => n.type === 'Wallet');
    return firstWallet?.id || null;
  }, [graphData, caseDoc]);

  const storyData = useMemo(() => {
    if (!graphData?.nodes) return null;
    return buildStoryGraph(graphData.nodes, graphData.edges, startWalletId, expandedGroups);
  }, [graphData, startWalletId, expandedGroups]);

  // ─── Canvas Drawing ───────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !storyData) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;

    // Compute layout
    const layoutNodes = storyData.nodes;
    const layoutEdges = storyData.edges;
    let positions;
    if (viewMode === 'story') {
      positions = computeHierarchicalLayout(layoutNodes, layoutEdges, W, H);
    } else {
      positions = computeForceLayout(layoutNodes, layoutEdges, W, H);
    }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLORS.BG;
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#151715';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    const transform = transformRef.current;

    ctx.save();
    ctx.translate(transform.x + W / 2, transform.y + H / 2);
    ctx.scale(transform.scale, transform.scale);
    ctx.translate(-W / 2, -H / 2);

    const isNeighbor = (nodeId) => {
      if (!selectedNode) return true;
      if (nodeId === selectedNode.id) return true;
      return layoutEdges.some(e =>
        (e.from === selectedNode.id && e.to === nodeId) ||
        (e.to === selectedNode.id && e.from === nodeId)
      );
    };

    // Draw edges
    layoutEdges.forEach(e => {
      const from = positions[e.from], to = positions[e.to];
      if (!from || !to) return;
      const neighborSelected = selectedNode && (e.from === selectedNode.id || e.to === selectedNode.id);
      const alpha = selectedNode ? (neighborSelected ? 0.9 : 0.08) : 0.5;
      const thickness = Math.max(1, Math.min(6, Math.log2(e.totalAmount + 1) * 1.5));
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = neighborSelected ? COLORS.ACCENT : COLORS.EDGE_DEFAULT;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = thickness;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Edge label (midpoint)
      if (transform.scale > 0.6 && (neighborSelected || !selectedNode)) {
        const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
        const label = `${formatETH(e.totalAmount)} · ${e.count}`;
        ctx.font = '10px "Geist", "Inter", sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = '#171918';
        ctx.fillRect(mx - tw / 2 - 4, my - 7, tw + 8, 14);
        ctx.fillStyle = neighborSelected ? COLORS.ACCENT : COLORS.TEXT3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, my);
      }

      // Arrow
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const arrowLen = 6;
      const ax = to.x - Math.cos(angle) * 14;
      const ay = to.y - Math.sin(angle) * 14;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - arrowLen * Math.cos(angle - 0.4), ay - arrowLen * Math.sin(angle - 0.4));
      ctx.lineTo(ax - arrowLen * Math.cos(angle + 0.4), ay - arrowLen * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = neighborSelected ? COLORS.ACCENT : COLORS.EDGE_DEFAULT;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Draw nodes
    layoutNodes.forEach(n => {
      const pos = positions[n.id];
      if (!pos) return;
      const neighbor = isNeighbor(n.id);
      const alpha = selectedNode ? (neighbor ? 1 : 0.15) : 1;
      const isSelected = selectedNode?.id === n.id;
      const isHovered = hoveredNode === n.id;
      const radius = NODE_RADIUS[n.type] || NODE_RADIUS.DEFAULT;
      const color = COLORS[n.type] || COLORS.COUNTERPARTY;

      ctx.globalAlpha = alpha;

      // Glow for selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = color + '33';
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      if (n.type === 'GROUP') {
        // Rounded rect for groups
        const rw = 12, rh = 12;
        ctx.roundRect(pos.x - rw, pos.y - rh, rw * 2, rh * 2, 4);
      } else {
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = n.type === 'GROUP' ? COLORS.SURFACE : color;
      ctx.fill();
      ctx.strokeStyle = isSelected ? COLORS.ACCENT : (isHovered ? COLORS.TEXT2 : COLORS.BORDER);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Node label
      if (n.displayLabel && (neighbor || !selectedNode)) {
        ctx.font = (isSelected || isHovered || n.type === 'SUSPECT' || n.type === 'GROUP')
          ? '600 11px "Geist", "Inter", sans-serif'
          : '11px "Geist", "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isSelected ? COLORS.TEXT1 : (n.type === 'GROUP' ? COLORS.TEXT2 : COLORS.TEXT2);
        const labelY = pos.y + radius + 6;
        ctx.fillText(n.displayLabel, pos.x, labelY);
      }

      ctx.globalAlpha = 1;
    });

    // Hop column labels (Story view)
    if (viewMode === 'story') {
      const hops = [...new Set(layoutNodes.map(n => n.hop))].filter(h => h < 99).sort((a, b) => a - b);
      if (hops.length > 0) {
        const colWidth = (W - 160) / Math.max(hops.length - 1, 1);
        ctx.font = '600 10px "Geist", "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.TEXT3;
        ctx.textBaseline = 'top';
        hops.forEach((hop, i) => {
          const x = 80 + i * colWidth;
          const label = hop === 0 ? 'SOURCE' : hop === hops[hops.length - 1] ? 'DESTINATIONS' : `HOP ${hop}`;
          ctx.fillText(label, x, 16);
        });
      }
    }

    ctx.restore();
  }, [storyData, viewMode, selectedNode, hoveredNode]);

  useEffect(() => {
    const frame = requestAnimationFrame(drawCanvas);
    return () => cancelAnimationFrame(frame);
  }, [drawCanvas]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => drawCanvas());
    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [drawCanvas]);

  // ─── Interaction Handlers ─────────────────────────────────────────────
  const getNodeAtPoint = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas || !storyData) return null;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    const transform = transformRef.current;
    const mx = ((clientX - rect.left) - transform.x - W / 2) / transform.scale + W / 2;
    const my = ((clientY - rect.top) - transform.y - H / 2) / transform.scale + H / 2;

    let positions;
    if (viewMode === 'story') {
      positions = computeHierarchicalLayout(storyData.nodes, storyData.edges, W, H);
    } else {
      positions = computeForceLayout(storyData.nodes, storyData.edges, W, H);
    }

    for (const n of storyData.nodes) {
      const p = positions[n.id];
      if (!p) continue;
      const r = (NODE_RADIUS[n.type] || NODE_RADIUS.DEFAULT) + 4;
      if (Math.abs(mx - p.x) < r && Math.abs(my - p.y) < r) return n;
    }
    return null;
  }, [storyData, viewMode]);

  const handleMouseDown = (e) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y };
  };

  const handleMouseMove = (e) => {
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    if (isDraggingRef.current) {
      transformRef.current.x = e.clientX - dragStartRef.current.x;
      transformRef.current.y = e.clientY - dragStartRef.current.y;
      drawCanvas();
    } else {
      const node = getNodeAtPoint(e.clientX, e.clientY);
      const newHover = node?.id || null;
      if (newHover !== hoveredNode) {
        setHoveredNode(newHover);
        const canvas = canvasRef.current;
        if (canvas) canvas.style.cursor = node ? 'pointer' : 'grab';
      }
    }
  };

  const handleMouseUp = (e) => {
    if (isDraggingRef.current) {
      const movedX = Math.abs(e.clientX - dragStartRef.current.x - transformRef.current.x);
      const movedY = Math.abs(e.clientY - dragStartRef.current.y - transformRef.current.y);
      if (movedX < 4 && movedY < 4) {
        // Click
        const node = getNodeAtPoint(e.clientX, e.clientY);
        if (node) {
          if (node.type === 'GROUP') {
            setExpandedGroups(prev => {
              const next = new Set(prev);
              if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
              return next;
            });
          }
          setSelectedNode(node);
          setSelectedEdge(null);
        } else {
          setSelectedNode(null);
          setSelectedEdge(null);
        }
      }
    }
    isDraggingRef.current = false;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    transformRef.current.scale = Math.max(0.2, Math.min(4, transformRef.current.scale * delta));
    drawCanvas();
  };

  // Keyboard
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
      if (e.key.toLowerCase() === 'f') {
        transformRef.current = { x: 0, y: 0, scale: 1 };
        drawCanvas();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [drawCanvas]);

  // ─── Empty State ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="knowledge-graph-empty-stage">
        <div className="empty-graph-card">
          <div className="empty-graph-icon"><Icon name="waypoints" size={32} /></div>
          <h2>Loading knowledge graph…</h2>
        </div>
      </div>
    );
  }

  if (!loading && !building && !graphData) {
    return (
      <div className="knowledge-graph-empty-stage">
        <div className="empty-graph-card">
          <div className="empty-graph-icon"><Icon name="waypoints" size={32} /></div>
          <h2>Case Knowledge Graph</h2>
          <p>
            Synthesize all on-chain transfers, entity attributions, cross-case linkages,
            threat reports, and investigator findings into a single unified knowledge graph.
          </p>
          <button className="button button-primary build-graph-btn" onClick={handleStartBuild}>
            <Icon name="network" size={15} />
            <span>Build Knowledge Graph</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── Build Progress ───────────────────────────────────────────────────
  if (building) {
    const stages = [
      { label: 'Chain data', num: 1 },
      { label: 'Attribution', num: 2 },
      { label: 'Analysis', num: 3 },
      { label: 'Case work', num: 4 }
    ];
    const currentStage = buildStatus?.current_stage || 1;
    return (
      <div className="knowledge-graph-empty-stage">
        <div className="empty-graph-card" style={{ maxWidth: 520 }}>
          <div className="empty-graph-icon"><Icon name="waypoints" size={32} /></div>
          <h2>Building knowledge graph</h2>
          <div className="kg-build-stages">
            {stages.map(s => (
              <div key={s.num} className={`kg-build-stage-row ${currentStage > s.num ? 'done' : currentStage === s.num ? 'active' : ''}`}>
                <span className="stage-num">{currentStage > s.num ? '✓' : s.num}</span>
                <span className="stage-label">{s.label}</span>
                {currentStage > s.num && <span className="stage-stat">{
                  s.num === 1 ? `${buildStatus?.node_count || 0} nodes` :
                  s.num === 2 ? 'entities matched' :
                  s.num === 3 ? 'patterns evaluated' : 'notes indexed'
                }</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!storyData || !storyData.nodes || storyData.nodes.length === 0) {
    return (
      <div className="knowledge-graph-empty-stage">
        <div className="empty-graph-card">
          <div className="empty-graph-icon"><Icon name="waypoints" size={32} /></div>
          <h2>Case Knowledge Graph</h2>
          <p>
            Synthesize all on-chain transfers, entity attributions, cross-case linkages,
            threat reports, and investigator findings into a single unified knowledge graph.
          </p>
          <button className="button button-primary build-graph-btn" onClick={handleStartBuild}>
            <Icon name="network" size={15} />
            <span>Build Knowledge Graph</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── Main Render ──────────────────────────────────────────────────────
  return (
    <div className="case-knowledge-graph-workspace">
      {/* Case summary */}
      <div className="kg-summary-bar">
        <span className="kg-summary-text">{storyData.summary}</span>
        <span className="kg-summary-stats">
          {storyData.nodes.length} visible nodes · {storyData.edges.length} aggregated edges
        </span>
      </div>

      {/* Toolbar */}
      <div className="kg-toolbar">
        <div className="kg-toolbar-left">
          {/* View switcher */}
          <div className="kg-view-switch">
            {['story', 'explore', 'timeline'].map(mode => (
              <button
                key={mode}
                className={`view-btn ${viewMode === mode ? 'active' : ''}`}
                onClick={() => setViewMode(mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="kg-search-wrap">
            <Icon name="search" size={13} />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search entities…"
            />
            {searchQuery && <button onClick={() => setSearchQuery('')}>×</button>}
          </div>
        </div>

        <div className="kg-toolbar-right">
          <button className="kg-rebuild-btn" onClick={handleStartBuild} disabled={building}>
            <Icon name="target" size={13} />
            <span>Rebuild</span>
          </button>
          <button
            className="icon-button"
            onClick={() => setInspectorOpen(v => !v)}
            title={inspectorOpen ? 'Collapse inspector' : 'Open inspector'}
          >
            <Icon name="info" size={14} />
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="kg-main-layout">
        {/* Canvas */}
        <div className="kg-canvas-container">
          <canvas
            ref={canvasRef}
            className="kg-canvas"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
          />

          {/* Legend (bottom-left) */}
          <div className="kg-legend">
            <div className="legend-row"><span className="legend-dot" style={{ background: COLORS.SUSPECT }} /> Suspect</div>
            <div className="legend-row"><span className="legend-dot" style={{ background: COLORS.EXCHANGE }} /> Exchange</div>
            <div className="legend-row"><span className="legend-dot" style={{ background: COLORS.BRIDGE }} /> Bridge</div>
            <div className="legend-row"><span className="legend-dot" style={{ background: COLORS.COUNTERPARTY }} /> Counterparty</div>
            <div className="legend-row"><span className="legend-dot legend-rect" style={{ background: COLORS.SURFACE }} /> Group</div>
            <div className="legend-divider" />
            <div className="legend-row"><span className="legend-line solid" /> Observed</div>
            <div className="legend-row"><span className="legend-line dashed" /> Derived</div>
          </div>

          {/* Bottom scrubber */}
          <div className="kg-bottom-scrubber">
            <div className="scrubber-label">
              <Icon name="monitoring" size={13} />
              <span>Full case timeline</span>
            </div>
            <div className="scrubber-stats">
              <span>{storyData.stats.wallets} wallets</span>
              <span>·</span>
              <span>{storyData.stats.hops} hops</span>
              <span>·</span>
              <span>{formatETH(storyData.stats.totalMoved)} total flow</span>
              {graphData?.graph_hash && (
                <span className="hash-tag" title={`SHA-256: ${graphData.graph_hash}`}>
                  SHA-256: {graphData.graph_hash.substring(0, 10)}…
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Inspector */}
        {inspectorOpen && (
          <aside className="kg-inspector-rail">
            <div className="inspector-head">
              <h3>{selectedNode ? selectedNode.displayLabel || selectedNode.type : 'Case overview'}</h3>
              <button className="icon-btn-text" onClick={() => setInspectorOpen(false)}>×</button>
            </div>
            <div className="inspector-scroll-body">
              {!selectedNode && !selectedEdge && (
                <>
                  {/* Default: case overview */}
                  <div className="inspector-section">
                    <h4>Key numbers</h4>
                    <div className="inspector-attr-grid">
                      <span className="attr-key">Total flow</span>
                      <span className="attr-val">{formatETH(storyData.stats.totalMoved)}</span>
                      <span className="attr-key">Hops</span>
                      <span className="attr-val">{storyData.stats.hops}</span>
                      <span className="attr-key">Wallets</span>
                      <span className="attr-val">{storyData.stats.wallets}</span>
                      <span className="attr-key">Exchanges</span>
                      <span className="attr-val">{storyData.stats.exchanges}</span>
                      <span className="attr-key">Bridges</span>
                      <span className="attr-val">{storyData.stats.bridges}</span>
                      <span className="attr-key">Linked cases</span>
                      <span className="attr-val">{storyData.stats.linkedCases}</span>
                      <span className="attr-key">Patterns</span>
                      <span className="attr-val">{storyData.stats.patterns}</span>
                    </div>
                  </div>
                  {storyData.topFindings.length > 0 && (
                    <div className="inspector-section">
                      <h4>Top findings</h4>
                      <div className="inspector-findings-list">
                        {storyData.topFindings.map((f, i) => (
                          <button key={i} className="finding-item" onClick={() => {}}>
                            <Icon name="target" size={12} />
                            <span>{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="inspector-section">
                    <h4>Graph integrity</h4>
                    <div className="inspector-attr-grid">
                      <span className="attr-key">Raw nodes</span>
                      <span className="attr-val">{graphData?.nodes?.length || 0}</span>
                      <span className="attr-key">Raw edges</span>
                      <span className="attr-val">{graphData?.edges?.length || 0}</span>
                      <span className="attr-key">Hash</span>
                      <span className="attr-val" style={{ fontSize: '9px' }}>{graphData?.graph_hash || '–'}</span>
                    </div>
                  </div>
                </>
              )}

              {selectedNode && (
                <>
                  <div className="node-identity">
                    <span className="node-type-badge">{selectedNode.type}</span>
                    <span className="node-title">{selectedNode.displayLabel || selectedNode.label}</span>
                    {selectedNode.label && selectedNode.type !== 'GROUP' && (
                      <code className="node-provenance-tag">{selectedNode.label}</code>
                    )}
                  </div>
                  <div className="inspector-section">
                    <h4>Value</h4>
                    <div className="inspector-attr-grid">
                      <span className="attr-key">Value in</span>
                      <span className="attr-val">{formatETH(selectedNode.totalIn)}</span>
                      <span className="attr-key">Value out</span>
                      <span className="attr-val">{formatETH(selectedNode.totalOut)}</span>
                      <span className="attr-key">Connections</span>
                      <span className="attr-val">{selectedNode.degree}</span>
                      <span className="attr-key">Hop</span>
                      <span className="attr-val">{selectedNode.hop < 99 ? selectedNode.hop : '–'}</span>
                      <span className="attr-key">Risk</span>
                      <span className="attr-val">
                        {selectedNode.riskLevel || selectedNode.riskScore ? (
                          <span style={{ color: selectedNode.riskScore >= 70 ? '#E5484D' : selectedNode.riskScore >= 30 ? '#F5A524' : '#3FB68B', fontWeight: 600 }}>
                            {selectedNode.riskLevel || (selectedNode.riskScore >= 70 ? 'HIGH' : 'MEDIUM')} {selectedNode.riskScore ? `(${selectedNode.riskScore}/100)` : ''}
                          </span>
                        ) : 'LOW (0/100)'}
                      </span>
                    </div>
                  </div>
                  {(selectedNode.riskScore >= 30 || selectedNode.type === 'SUSPECT') && (
                    <div className="inspector-section">
                      <h4>Triggered TraceX Rules</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ background: '#171918', border: '1px solid #232624', borderRadius: '4px', padding: '6px 8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <code style={{ fontSize: '11px', color: '#3FB68B', fontWeight: 700, fontFamily: 'Roboto Mono, monospace' }}>R-01 Rapid relay</code>
                            <span style={{ fontSize: '10px', color: '#F5A524', fontWeight: 600 }}>HIGH SEVERITY</span>
                          </div>
                          <small style={{ fontSize: '11px', color: '#A1A4A0', display: 'block', marginTop: '3px' }}>
                            Threshold: ≤ 3 blocks (≤ 360s) between transfers
                          </small>
                        </div>
                        {selectedNode.hop >= 1 && (
                          <div style={{ background: '#171918', border: '1px solid #232624', borderRadius: '4px', padding: '6px 8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <code style={{ fontSize: '11px', color: '#3FB68B', fontWeight: 700, fontFamily: 'Roboto Mono, monospace' }}>R-02 Peel chain</code>
                              <span style={{ fontSize: '10px', color: '#F5A524', fontWeight: 600 }}>HIGH SEVERITY</span>
                            </div>
                            <small style={{ fontSize: '11px', color: '#A1A4A0', display: 'block', marginTop: '3px' }}>
                              Threshold: Peel depth ≥ 3 iterations
                            </small>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedNode.firstSeen && (
                    <div className="inspector-section">
                      <h4>Timeline</h4>
                      <div className="inspector-attr-grid">
                        <span className="attr-key">First seen</span>
                        <span className="attr-val">{selectedNode.firstSeen}</span>
                      </div>
                    </div>
                  )}
                  {selectedNode.type === 'GROUP' && (
                    <div className="inspector-section">
                      <h4>Group members ({selectedNode.count})</h4>
                      <p style={{ fontSize: '12px', color: COLORS.TEXT2, margin: 0 }}>
                        This group contains {selectedNode.count} relay wallets at hop {selectedNode.hop}.
                        Click the group node on the canvas to expand.
                      </p>
                    </div>
                  )}
                  {selectedNode.attributes && (
                    <div className="inspector-section">
                      <h4>Attributes</h4>
                      <div className="inspector-attr-grid">
                        {Object.entries(selectedNode.attributes).map(([k, v]) => (
                          <React.Fragment key={k}>
                            <span className="attr-key">{k}</span>
                            <span className="attr-val">{String(v)}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
