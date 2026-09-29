import React, { useMemo, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { Badge, CopyValue, Drawer } from "./Primitives.jsx";
import { formatAmount, formatDate, shortAddress, unique } from "../utils.js";

const palette = {
  suspect: { fill: "#ff6978", stroke: "#ffc0c7" },
  SUSPECT_WALLET: { fill: "#ff6978", stroke: "#ffc0c7" },
  wallet: { fill: "#3183ff", stroke: "#9ac5ff" },
  WALLET: { fill: "#3183ff", stroke: "#9ac5ff" },
  INTERMEDIARY: { fill: "#f3a83b", stroke: "#ffe0a8" },
  hub: { fill: "#f3a83b", stroke: "#ffe0a8" },
  exchange: { fill: "#20b892", stroke: "#9aefd9" },
  EXCHANGE_VASP: { fill: "#20b892", stroke: "#9aefd9" },
  CASE: { fill: "#8c6eff", stroke: "#cfc4ff" },
  bridge: { fill: "#25c6da", stroke: "#c4f8ff" },
};
const kind = (node) => String(node?.type || "wallet");
function layoutGraph(graph) {
  const nodes = graph?.nodes || [],
    edges = graph?.edges || [],
    levels = new Map(nodes.map((node) => [node.id, 0])),
    degree = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => {
    levels.set(
      edge.target,
      Math.max(levels.get(edge.target) || 0, Number(edge.hop) || 1),
    );
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  });
  const columns = new Map();
  nodes.forEach((node) => {
    let level = kind(node) === "CASE" ? -1 : levels.get(node.id) || 0;
    if (!columns.has(level)) columns.set(level, []);
    columns.get(level).push(node);
  });
  const keys = [...columns.keys()].sort((a, b) => a - b),
    width = 1180,
    height = Math.max(
      650,
      ...[...columns.values()].map((items) => items.length * 54 + 170),
    ),
    byId = new Map();
  keys.forEach((key, column) =>
    columns
      .get(key)
      .forEach((node, row) =>
        byId.set(node.id, {
          ...node,
          x:
            keys.length === 1
              ? width / 2
              : 110 + (column / (keys.length - 1)) * (width - 220),
          y: 85 + ((row + 1) / (columns.get(key).length + 1)) * (height - 170),
          degree: degree.get(node.id) || 0,
        }),
      ),
  );
  return { nodes: [...byId.values()], byId, width, height };
}

export default function GraphCanvas({
  graph,
  title = "Fund-flow graph",
  mode = "wallet",
  onOpenCase,
  transactions = [],
  network,
  replayState,
}) {
  const [selected, setSelected] = useState(null),
    [query, setQuery] = useState(""),
    [asset, setAsset] = useState("all"),
    [hop, setHop] = useState("all"),
    [entity, setEntity] = useState("all"),
    [scale, setScale] = useState(1),
    [hovered, setHovered] = useState(null),
    [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const host = useRef(null),
    svgRef = useRef(null);
  const assets = unique((graph?.edges || []).map((edge) => edge.asset)),
    entities = unique((graph?.nodes || []).map(kind));
  const filtered = useMemo(() => {
    const edges = (graph?.edges || []).filter(
        (edge) =>
          (asset === "all" || edge.asset === asset) &&
          (hop === "all" || Number(edge.hop) === Number(hop)),
      ),
      connected = new Set(edges.flatMap((edge) => [edge.source, edge.target])),
      matches = (graph?.nodes || []).filter(
        (node) =>
          (entity === "all" || kind(node) === entity) &&
          (!query ||
            String(node.address || node.wallet || node.label || node.id)
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
      ids = new Set(
        query || entity !== "all"
          ? matches.map((node) => node.id)
          : connected.size
            ? connected
            : (graph?.nodes || []).map((node) => node.id),
      );
    return {
      nodes: (graph?.nodes || []).filter((node) => ids.has(node.id)),
      edges: edges.filter(
        (edge) => ids.has(edge.source) && ids.has(edge.target),
      ),
    };
  }, [graph, asset, hop, entity, query]);
  const layout = useMemo(() => layoutGraph(filtered), [filtered]),
    relatedFor = (address) =>
      (network?.related_cases || []).filter((item) =>
        item.shared_wallets?.includes(String(address || "").toLowerCase()),
      ),
    transactionsFor = (node) =>
      transactions.filter((tx) =>
        [tx.from, tx.to, tx.counterparty, tx.wallet].some(
          (value) =>
            String(value || "").toLowerCase() ===
            String(node.address || node.wallet || node.id || "").toLowerCase(),
        ),
      );

  const downloadGraph = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "graph"}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printGraph = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const graphWindow = window.open("", "_blank");
    if (!graphWindow) return;
    const source = new XMLSerializer().serializeToString(svg);
    graphWindow.document.write(`<!doctype html><html><head><title>${title}</title><style>body{margin:24px;font:14px system-ui;color:#102033}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px;color:#526579}svg{display:block;width:100%;max-height:85vh}@page{size:landscape;margin:12mm}</style></head><body><h1>${title}</h1><p>${filtered.nodes.length} entities · ${filtered.edges.length} relationships</p>${source}<script>window.onload=()=>window.print();</script></body></html>`);
    graphWindow.document.close();
  };
  return (
    <div className="graph-module" ref={host}>
      <div className="graph-toolbar">
        <div>
          <span className="eyebrow">Interactive intelligence map</span>
          <h3>{title}</h3>
          <p>
            {filtered.nodes.length} entities · {filtered.edges.length} evidence
            relationships
          </p>
        </div>
        <div className="graph-tools">
          <label className="graph-search">
            <Icon name="search" size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find wallet"
            />
          </label>
          <select
            value={asset}
            onChange={(event) => setAsset(event.target.value)}
          >
            <option value="all">All assets</option>
            {assets.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select value={hop} onChange={(event) => setHop(event.target.value)}>
            <option value="all">All hops</option>
            {[1, 2, 3].map((value) => (
              <option key={value} value={value}>
                Hop {value}
              </option>
            ))}
          </select>
          <select
            value={entity}
            onChange={(event) => setEntity(event.target.value)}
          >
            <option value="all">All entities</option>
            {entities.map((value) => (
              <option key={value}>{value.replaceAll("_", " ")}</option>
            ))}
          </select>
          <button
            className="icon-button"
            onClick={() => setScale((value) => Math.min(1.8, value + 0.15))}
            title="Zoom in"
            aria-label="Zoom graph in"
          >
            <Icon name="zoomIn" />
          </button>
          <button className="icon-button" onClick={() => setScale(1)} title="Fit entire graph to screen" aria-label="Fit entire graph to screen">
            <Icon name="target" />
          </button>
          <button
            className="icon-button"
            onClick={() => host.current?.requestFullscreen?.()}
            title="Open graph fullscreen"
            aria-label="Open graph fullscreen"
          >
            <Icon name="external" />
          </button>
          <button className="graph-action" onClick={downloadGraph} title="Download graph as SVG">
            <Icon name="download" /> <span>Download</span>
          </button>
          <button className="graph-action graph-action-print" onClick={printGraph} title="Print graph or save as PDF">
            <Icon name="print" /> <span>Print / PDF</span>
          </button>
        </div>
      </div>
      <div className="graph-stage">
        {!filtered.nodes.length ? (
          <div className="graph-empty">
            No graph entities match the active filters.
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              transform: `scale(${scale})`,
            }}
          >
            <defs>
              <marker
                id={`arrow-${mode}`}
                markerWidth="8"
                markerHeight="8"
                refX="8"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" fill="#607998" />
              </marker>
            </defs>
            {filtered.edges.map((edge, index) => {
              const source = layout.byId.get(edge.source),
                target = layout.byId.get(edge.target);
              if (!source || !target) return null;
              const active =
                (selected?.type === "edge" && selected.data === edge) ||
                (selected?.type === "node" &&
                  [edge.source, edge.target].includes(selected.data.id));
              return (
                <g
                  key={edge.id || `${edge.source}-${edge.target}-${index}`}
                  className={`graph-edge ${active ? "focused" : ""} ${selected && !active ? "faded" : ""}`}
                  style={{ opacity: edge.opacity ?? 1, transition: "opacity 0.3s ease" }}
                  onClick={() => setSelected({ type: "edge", data: edge })}
                  onMouseEnter={(e) => { setHovered({ type: "edge", data: edge }); setMousePos({ x: e.clientX, y: e.clientY }); }}
                  onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHovered(null)}
                >
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    markerEnd={`url(#arrow-${mode})`}
                  />
                  {edge.isActive && (
                    <circle r="4" fill="#ffaa00" className="particle">
                      <animateMotion
                        path={`M${source.x},${source.y} L${target.x},${target.y}`}
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                  {edge.asset && (
                    <text
                      x={(source.x + target.x) / 2}
                      y={(source.y + target.y) / 2 - 8}
                    >
                      {edge.asset}
                    </text>
                  )}
                </g>
              );
            })}
            {layout.nodes.map((node) => {
              const colors = palette[kind(node)] || palette.wallet,
                radius = Math.min(28, 15 + node.degree * 0.8),
                isCase = kind(node) === "CASE",
                isExchange = ["exchange", "EXCHANGE_VASP"].includes(kind(node)),
                isBridge = kind(node) === "bridge",
                focused =
                  (selected?.type === "node" && selected.data.id === node.id) ||
                  (selected?.type === "edge" &&
                    [selected.data.source, selected.data.target].includes(
                      node.id,
                    )),
                inspect = () => setSelected({ type: "node", data: node });
              return (
                <g
                  key={node.id}
                  className={`graph-node ${focused ? "focused" : selected ? "faded" : ""}`}
                  transform={`translate(${node.x} ${node.y})`}
                  style={{ opacity: node.opacity ?? 1, transition: "opacity 0.3s ease", cursor: 'pointer' }}
                  onClick={inspect}
                  onMouseEnter={(e) => { setHovered({ type: "node", data: node }); setMousePos({ x: e.clientX, y: e.clientY }); }}
                  onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHovered(null)}
                  onKeyDown={(event) => {
                    if (["Enter", " "].includes(event.key)) {
                      event.preventDefault();
                      inspect();
                    }
                  }}
                  tabIndex="0"
                  role="button"
                >
                  <circle className="focus-halo" r={radius + 10} />
                  {isCase ? (
                    <rect
                      x="-38"
                      y="-21"
                      width="76"
                      height="42"
                      rx="10"
                      fill={colors.fill}
                      stroke={colors.stroke}
                    />
                  ) : isExchange ? (
                    <path
                      d={`M${-radius},0 L${-radius / 2},${-radius * 0.85} L${radius / 2},${-radius * 0.85} L${radius},0 L${radius / 2},${radius * 0.85} L${-radius / 2},${radius * 0.85}Z`}
                      fill={colors.fill}
                      stroke={colors.stroke}
                    />
                  ) : isBridge ? (
                    <rect
                      x={-radius * 0.72}
                      y={-radius * 0.72}
                      width={radius * 1.44}
                      height={radius * 1.44}
                      rx="6"
                      transform="rotate(45)"
                      fill={colors.fill}
                      stroke={colors.stroke}
                    />
                  ) : (
                    <circle
                      r={radius}
                      fill={colors.fill}
                      stroke={colors.stroke}
                    />
                  )}
                  <text className="node-label" y={isCase ? 5 : radius + 21}>
                    {isCase
                      ? node.label
                      : isBridge
                        ? node.label
                        : shortAddress(
                            node.entity ||
                              node.address ||
                              node.label ||
                              node.id,
                            6,
                            4,
                          )}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        <div className="graph-legend">
          {Object.entries(
            mode === "network"
              ? {
                  CASE: palette.CASE,
                  SUSPECT: palette.SUSPECT_WALLET,
                  WALLET: palette.WALLET,
                  INTERMEDIARY: palette.INTERMEDIARY,
                  VASP: palette.EXCHANGE_VASP,
                }
              : {
                  SUSPECT: palette.suspect,
                  WALLET: palette.wallet,
                  HUB: palette.hub,
                  BRIDGE: palette.bridge,
                  VASP: palette.exchange,
                },
          ).map(([label, color]) => (
            <span key={label}>
              <i style={{ background: color.fill }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      {hovered && (
        <div 
          className="graph-tooltip" 
          style={{ 
            position: 'fixed', 
            top: mousePos.y + 15, 
            left: mousePos.x + 15, 
            background: 'var(--panel-bg, #1a2332)', 
            border: '1px solid var(--border, #314259)',
            padding: '12px',
            borderRadius: '6px',
            pointerEvents: 'none',
            zIndex: 1000,
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            minWidth: '200px'
          }}
        >
          {hovered.type === 'edge' ? (
             <>
               <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase' }}>TRANSACTION</div>
               <div style={{ marginBottom: '8px' }}><strong>{shortAddress(hovered.data.source)} → {shortAddress(hovered.data.target)}</strong></div>
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '12px' }}>
                 <span style={{ color: '#94a3b8' }}>Amount:</span>
                 <span>{formatAmount(hovered.data.amount)} {hovered.data.asset}</span>
                 <span style={{ color: '#94a3b8' }}>Time:</span>
                 <span>{formatDate(hovered.data.timestamp)}</span>
               </div>
             </>
          ) : (
             <>
               <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase' }}>{kind(hovered.data)}</div>
               <div style={{ marginBottom: '8px' }}><strong>{shortAddress(hovered.data.address || hovered.data.wallet || hovered.data.id)}</strong></div>
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '12px' }}>
                 <span style={{ color: '#94a3b8' }}>Observed TXs:</span>
                 <span>{transactionsFor(hovered.data).length}</span>
               </div>
             </>
          )}
        </div>
      )}
      {selected?.type === "edge" && (
        <div className="path-focus-strip">
          <span>
            <Icon name="target" />
          </span>
          <div>
            <small>
              Focused evidence path · Hop {selected.data.hop ?? "—"}
            </small>
            <strong>
              {shortAddress(selected.data.source)} →{" "}
              {shortAddress(selected.data.target)}
            </strong>
          </div>
          <b>
            {formatAmount(selected.data.amount)} {selected.data.asset}
          </b>
          <em>{formatDate(selected.data.timestamp)}</em>
          <button onClick={() => setSelected(null)}>Clear focus</button>
        </div>
      )}
      <Drawer
        title={
          selected?.type === "edge"
            ? "Transfer evidence"
            : selected?.data?.label || "Wallet intelligence"
        }
        subtitle={
          selected?.type === "edge"
            ? selected.data.tx_hash || selected.data.hash || selected.data.type
            : kind(selected?.data)
        }
        onClose={() => setSelected(null)}
      >
        {selected?.type === "edge" ? (
          <EdgeInspector edge={selected.data} />
        ) : selected?.type === "node" ? (
          <NodeInspector
            node={selected.data}
            transactions={transactionsFor(selected.data)}
            related={relatedFor(selected.data.address)}
            onOpenCase={onOpenCase}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="evidence-row">
      <span>{label}</span>
      <div>{children ?? "Not available"}</div>
    </div>
  );
}
function EdgeInspector({ edge }) {
  return (
    <div className="evidence-list">
      <Row label="Relationship">
        <Badge tone="blue">
          {String(edge.type || "TRANSFERRED_TO").replaceAll("_", " ")}
        </Badge>
      </Row>
      <Row label="Transaction">
        {edge.tx_hash || edge.hash ? (
          <CopyValue value={edge.tx_hash || edge.hash} />
        ) : (
          "Derived relationship"
        )}
      </Row>
      <Row label="From">
        <CopyValue value={edge.from || edge.source} />
      </Row>
      <Row label="To">
        <CopyValue value={edge.to || edge.target} />
      </Row>
      <Row label="Asset">{edge.asset || "Not applicable"}</Row>
      <Row label="Amount">
        {edge.amount == null ? "Not available" : formatAmount(edge.amount)}
      </Row>
      <Row label="Timestamp">{formatDate(edge.timestamp)}</Row>
      <Row label="Hop">{edge.hop ?? "Not applicable"}</Row>
      <Row label="Provider">{edge.provider || "TraceX derived"}</Row>
      {edge.similarity_score != null && (
        <Row label="Similarity">{edge.similarity_score}/100</Row>
      )}
    </div>
  );
}
function NodeInspector({ node, transactions, related, onOpenCase }) {
  const incoming = transactions.filter((tx) => tx.direction === "IN").length,
    outgoing = transactions.filter((tx) => tx.direction === "OUT").length,
    assets = unique(transactions.map((tx) => tx.asset));
  return (
    <>
      <div className="evidence-list">
        <Row label="Address">
          {node.address || node.wallet ? (
            <CopyValue value={node.address || node.wallet} compact={false} />
          ) : (
            node.id
          )}
        </Row>
        <Row label="Role">
          <Badge
            tone={
              kind(node).includes("SUSPECT")
                ? "danger"
                : kind(node).includes("EXCHANGE")
                  ? "success"
                  : kind(node) === "bridge"
                    ? "purple"
                    : "blue"
            }
          >
            {node.analytics?.role?.replaceAll("_", " ") ||
              kind(node).replaceAll("_", " ")}
          </Badge>
        </Row>
        <Row label="Observed transfers">{transactions.length}</Row>
        <Row label="Direction">
          {incoming} incoming · {outgoing} outgoing
        </Row>
        <Row label="Assets">{assets.join(", ") || "No transaction sample"}</Row>
        <Row label="Related cases">{related.length}</Row>
        {node.analytics && (
          <>
            <Row label="Distinct sources">
              {node.analytics.distinct_sources}
            </Row>
            <Row label="Distinct destinations">
              {node.analytics.distinct_destinations}
            </Row>
            <Row label="Topology reason">{node.analytics.reason}</Row>
          </>
        )}
        {node.bridge && (
          <>
            <Row label="Bridge entity">{node.bridge.bridge}</Row>
            <Row label="Cross-chain status">
              Destination chain not correlated
            </Row>
            <Row label="Provenance">{node.bridge.provenance?.confidence}</Row>
          </>
        )}
      </div>
      {node.case_id && onOpenCase && (
        <button
          className="button button-primary drawer-action"
          onClick={() => onOpenCase(node.case_id)}
        >
          Open investigation <Icon name="arrow" />
        </button>
      )}
    </>
  );
}
