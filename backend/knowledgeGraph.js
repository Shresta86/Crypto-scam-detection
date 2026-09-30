import mongoose from 'mongoose';
import { createHash } from 'node:crypto';

const knowledgeGraphNodeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: [
      'Wallet', 'Contract', 'Transaction', 'Token', 'Entity', 'Bridge',
      'Mixer', 'ThreatReport', 'Case', 'Pattern', 'Alert', 'Note',
      'Finding', 'Hypothesis', 'Evidence'
    ]
  },
  first_seen: String,
  last_seen: String,
  source: { type: String, default: 'tracex' },
  risk_level: { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NEUTRAL'], default: 'NEUTRAL' },
  risk_score: { type: Number, default: 0 },
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const knowledgeGraphEdgeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  source_node: { type: String, required: true },
  target_node: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: [
      'SENT_TO', 'INTERACTED_WITH', 'ATTRIBUTED_TO', 'BRIDGED_VIA',
      'REPORTED_IN', 'APPEARS_IN_CASE', 'EXHIBITS_PATTERN', 'TRIGGERED_ALERT',
      'SUPPORTS', 'CONTRADICTS', 'DOCUMENTED_BY', 'SHARES_COUNTERPARTY_WITH'
    ]
  },
  timestamp: String,
  provenance: { type: String, required: true, enum: ['Observed', 'Derived', 'Hypothesis'] },
  confidence: { type: String, required: true, enum: ['High', 'Medium', 'Low'], default: 'High' },
  confidence_reason: { type: String, default: '' },
  evidence_refs: [{
    type: { type: String, default: 'tx_hash' },
    id: String,
    description: String
  }],
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const caseKnowledgeGraphSchema = new mongoose.Schema({
  case_id: { type: String, required: true, index: true },
  version: { type: Number, required: true, default: 1 },
  graph_hash: { type: String, required: true },
  status: { type: String, enum: ['IDLE', 'BUILDING', 'READY', 'FAILED'], default: 'IDLE' },
  current_stage: { type: Number, default: 0 },
  error_message: String,
  stage_status: {
    stage_1: { status: { type: String, default: 'PENDING' }, node_count: { type: Number, default: 0 }, edge_count: { type: Number, default: 0 }, duration_ms: { type: Number, default: 0 } },
    stage_2: { status: { type: String, default: 'PENDING' }, node_count: { type: Number, default: 0 }, edge_count: { type: Number, default: 0 }, duration_ms: { type: Number, default: 0 } },
    stage_3: { status: { type: String, default: 'PENDING' }, node_count: { type: Number, default: 0 }, edge_count: { type: Number, default: 0 }, duration_ms: { type: Number, default: 0 } },
    stage_4: { status: { type: String, default: 'PENDING' }, node_count: { type: Number, default: 0 }, edge_count: { type: Number, default: 0 }, duration_ms: { type: Number, default: 0 } }
  },
  nodes: [knowledgeGraphNodeSchema],
  edges: [knowledgeGraphEdgeSchema],
  metadata: {
    built_at: String,
    total_nodes: { type: Number, default: 0 },
    total_edges: { type: Number, default: 0 },
    observed_edges: { type: Number, default: 0 },
    derived_edges: { type: Number, default: 0 },
    hypothesis_edges: { type: Number, default: 0 }
  }
}, { timestamps: true, versionKey: false });

caseKnowledgeGraphSchema.index({ case_id: 1, version: -1 });

export const CaseKnowledgeGraph = mongoose.models.CaseKnowledgeGraph || mongoose.model('CaseKnowledgeGraph', caseKnowledgeGraphSchema);

// In-memory active build tracking for live stage progress polling
const activeBuildJobs = new Map();

function edgeHash(source, target, type) {
  return createHash('sha256').update(`${source}:${target}:${type}`).digest('hex').substring(0, 16);
}

function canonicalJson(obj) {
  if (Array.isArray(obj)) return obj.map(canonicalJson);
  if (obj && typeof obj === 'object') {
    const sorted = {};
    Object.keys(obj).sort().forEach(k => {
      sorted[k] = canonicalJson(obj[k]);
    });
    return sorted;
  }
  return obj;
}

export async function buildCaseKnowledgeGraph(caseDoc, context = {}) {
  const caseId = String(caseDoc._id);
  const result = caseDoc.result_json || {};
  const suspectWallet = String(caseDoc.wallet_address || result.start_wallet || '').toLowerCase();

  // Initialize job progress tracking
  const jobState = {
    case_id: caseId,
    status: 'BUILDING',
    current_stage: 1,
    stage_status: {
      stage_1: { status: 'RUNNING', node_count: 0, edge_count: 0, duration_ms: 0 },
      stage_2: { status: 'PENDING', node_count: 0, edge_count: 0, duration_ms: 0 },
      stage_3: { status: 'PENDING', node_count: 0, edge_count: 0, duration_ms: 0 },
      stage_4: { status: 'PENDING', node_count: 0, edge_count: 0, duration_ms: 0 }
    },
    nodes: new Map(),
    edges: new Map()
  };
  activeBuildJobs.set(caseId, jobState);

  const addNode = (node) => {
    if (!node || !node.id) return;
    if (!jobState.nodes.has(node.id)) {
      jobState.nodes.set(node.id, {
        attributes: {},
        source: 'tracex',
        risk_level: 'NEUTRAL',
        risk_score: 0,
        ...node
      });
    } else {
      const existing = jobState.nodes.get(node.id);
      jobState.nodes.set(node.id, {
        ...existing,
        ...node,
        attributes: { ...existing.attributes, ...node.attributes }
      });
    }
  };

  const addEdge = (edge) => {
    if (!edge || !edge.source_node || !edge.target_node || !edge.type) return;
    const id = edge.id || `edge:${edgeHash(edge.source_node, edge.target_node, edge.type)}`;
    if (!jobState.edges.has(id)) {
      jobState.edges.set(id, {
        id,
        evidence_refs: [],
        attributes: {},
        confidence: 'High',
        confidence_reason: 'Automated deterministic verification',
        ...edge
      });
    }
  };

  try {
    // -------------------------------------------------------------
    // STAGE 1: CHAIN FACTS (Wallets, Contracts, Transactions, Tokens)
    // -------------------------------------------------------------
    const s1Start = Date.now();
    jobState.current_stage = 1;
    jobState.stage_status.stage_1.status = 'RUNNING';

    // 1a. Suspect Wallet Node
    if (suspectWallet) {
      addNode({
        id: `wallet:${suspectWallet}`,
        label: suspectWallet,
        type: 'Wallet',
        source: 'blockchain_rpc',
        risk_level: String(caseDoc.risk_level || 'HIGH').toUpperCase(),
        risk_score: Number(caseDoc.risk_score || 85),
        attributes: {
          is_suspect: true,
          case_reference: caseDoc.case_reference || caseId,
          blockchain: caseDoc.blockchain || 'ethereum'
        }
      });
    }

    // 1b. Transactions & Transfers
    const transactions = Array.isArray(result.transactions) ? result.transactions : [];
    const tokensObserved = new Set(['ETH']);

    transactions.forEach((tx) => {
      const fromAddr = String(tx.from || '').toLowerCase();
      const toAddr = String(tx.to || tx.counterparty || '').toLowerCase();
      const txHash = tx.hash || tx.transaction_hash;
      const asset = (tx.asset || 'ETH').toUpperCase();
      tokensObserved.add(asset);

      // Add wallets
      if (fromAddr) {
        addNode({
          id: `wallet:${fromAddr}`,
          label: fromAddr,
          type: 'Wallet',
          source: 'alchemy_rpc',
          attributes: {
            first_seen: tx.timestamp,
            role: fromAddr === suspectWallet ? 'SUSPECT' : 'COUNTERPARTY'
          }
        });
      }

      if (toAddr) {
        const isContract = tx.is_contract || tx.contract_call;
        addNode({
          id: `${isContract ? 'contract' : 'wallet'}:${toAddr}`,
          label: toAddr,
          type: isContract ? 'Contract' : 'Wallet',
          source: 'alchemy_rpc',
          attributes: {
            first_seen: tx.timestamp,
            role: toAddr === suspectWallet ? 'SUSPECT' : 'COUNTERPARTY'
          }
        });
      }

      // Add Transaction Node if hash exists
      if (txHash) {
        const txNodeId = `tx:${txHash.toLowerCase()}`;
        addNode({
          id: txNodeId,
          label: `${txHash.substring(0, 10)}…`,
          type: 'Transaction',
          source: 'ethereum_mempool_archive',
          first_seen: tx.timestamp,
          attributes: {
            hash: txHash,
            block: tx.block_number,
            amount: tx.amount,
            asset,
            timestamp: tx.timestamp
          }
        });

        // Edge: From Wallet -> Transaction
        if (fromAddr) {
          addEdge({
            source_node: `wallet:${fromAddr}`,
            target_node: txNodeId,
            type: 'INTERACTED_WITH',
            timestamp: tx.timestamp,
            provenance: 'Observed',
            confidence: 'High',
            confidence_reason: `Confirmed transaction broadcast from sender ${fromAddr}`,
            evidence_refs: [{ type: 'tx_hash', id: txHash, description: 'Raw on-chain receipt' }],
            attributes: { role: 'sender' }
          });
        }

        // Edge: Transaction -> To Wallet
        if (toAddr) {
          addEdge({
            source_node: txNodeId,
            target_node: `wallet:${toAddr}`,
            type: 'SENT_TO',
            timestamp: tx.timestamp,
            provenance: 'Observed',
            confidence: 'High',
            confidence_reason: `Confirmed value transfer of ${tx.amount || '0'} ${asset} to recipient`,
            evidence_refs: [{ type: 'tx_hash', id: txHash, description: 'Direct transfer receipt' }],
            attributes: { amount: tx.amount, asset, tx_hash: txHash }
          });
        }
      } else if (fromAddr && toAddr) {
        // Direct value edge if tx hash was omitted
        addEdge({
          source_node: `wallet:${fromAddr}`,
          target_node: `wallet:${toAddr}`,
          type: 'SENT_TO',
          timestamp: tx.timestamp,
          provenance: 'Observed',
          confidence: 'High',
          confidence_reason: `Observed transfer of ${tx.amount || '0'} ${asset}`,
          evidence_refs: [],
          attributes: { amount: tx.amount, asset }
        });
      }
    });

    // 1c. Token Nodes
    tokensObserved.forEach((tok) => {
      addNode({
        id: `token:${tok}`,
        label: tok,
        type: 'Token',
        source: 'token_registry',
        attributes: { symbol: tok, standard: tok === 'ETH' ? 'Native' : 'ERC-20' }
      });
    });

    jobState.stage_status.stage_1 = {
      status: 'COMPLETED',
      node_count: jobState.nodes.size,
      edge_count: jobState.edges.size,
      duration_ms: Date.now() - s1Start
    };

    // -------------------------------------------------------------
    // STAGE 2: ATTRIBUTION (Entities, Bridges, Mixers, Threat Reports)
    // -------------------------------------------------------------
    const s2Start = Date.now();
    jobState.current_stage = 2;
    jobState.stage_status.stage_2.status = 'RUNNING';

    const s1NodesCount = jobState.nodes.size;
    const s1EdgesCount = jobState.edges.size;

    // 2a. Exchanges & VASPs
    const exchangeMap = context.identifyExchange || (() => null);
    for (const [nodeId, node] of Array.from(jobState.nodes.entries())) {
      if (node.type === 'Wallet') {
        const addr = node.id.replace('wallet:', '');
        const exchangeName = exchangeMap(addr);
        if (exchangeName) {
          const entityId = `entity:${exchangeName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
          addNode({
            id: entityId,
            label: exchangeName,
            type: 'Entity',
            source: 'tracex_vasp_directory',
            risk_level: 'LOW',
            attributes: { category: 'Centralized Exchange / VASP', verified_regulatory: true }
          });

          addEdge({
            source_node: nodeId,
            target_node: entityId,
            type: 'ATTRIBUTED_TO',
            provenance: 'Derived',
            confidence: 'High',
            confidence_reason: `Address matches known custody deposit infrastructure for ${exchangeName}`,
            evidence_refs: [{ type: 'rule_id', id: 'VASP_DEPOSIT_MATCH', description: `Cluster identified as ${exchangeName}` }]
          });
        }
      }
    }

    // 2b. Bridges
    const bridges = Array.isArray(result.bridges) ? result.bridges : [];
    bridges.forEach((b) => {
      const bridgeName = b.bridge || b.name || 'Cross-Chain Bridge';
      const bridgeNodeId = `bridge:${bridgeName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      addNode({
        id: bridgeNodeId,
        label: bridgeName,
        type: 'Bridge',
        source: 'bridge_registry',
        attributes: { protocol: bridgeName, destination_chain: b.dest_chain || 'Unknown' }
      });

      if (b.wallet) {
        addEdge({
          source_node: `wallet:${String(b.wallet).toLowerCase()}`,
          target_node: bridgeNodeId,
          type: 'BRIDGED_VIA',
          timestamp: b.timestamp,
          provenance: 'Derived',
          confidence: 'High',
          confidence_reason: `Cross-chain token deposit identified through ${bridgeName}`,
          evidence_refs: b.tx_hash ? [{ type: 'tx_hash', id: b.tx_hash, description: 'Bridge lock event' }] : []
        });
      }
    });

    // 2c. Privacy Mixers (e.g. Tornado Cash)
    if (result.mixer || result.tornado_cash) {
      const mixerNodeId = 'mixer:tornado_cash';
      addNode({
        id: mixerNodeId,
        label: 'Tornado.Cash Protocol',
        type: 'Mixer',
        source: 'ofac_sdn_list',
        risk_level: 'CRITICAL',
        risk_score: 100,
        attributes: { ofac_sanctioned: true, privacy_pool: 'Anonymity set' }
      });

      if (suspectWallet) {
        addEdge({
          source_node: `wallet:${suspectWallet}`,
          target_node: mixerNodeId,
          type: 'INTERACTED_WITH',
          provenance: 'Observed',
          confidence: 'High',
          confidence_reason: 'Direct call to Tornado Cash mixer pool contract',
          evidence_refs: [{ type: 'rule_id', id: 'OFAC_SANCTIONED_MIXER', description: 'Mixer interaction observed' }]
        });
      }
    }

    // 2d. Threat Intelligence Reports (Chainabuse, ScamSniffer)
    const threatIntel = result.external_intelligence?.chainabuse || result.threat_intel;
    if (threatIntel && (threatIntel.reports_count > 0 || threatIntel.total_reports > 0 || threatIntel.scam_type)) {
      const threatNodeId = `threat:${suspectWallet}`;
      addNode({
        id: threatNodeId,
        label: `Chainabuse #${threatIntel.reports_count || 1} (${threatIntel.scam_type || 'Fraud'})`,
        type: 'ThreatReport',
        source: 'chainabuse_api',
        risk_level: 'CRITICAL',
        risk_score: 95,
        attributes: {
          scam_category: threatIntel.scam_type || 'Phishing / Investment Scam',
          reports_count: threatIntel.reports_count || 1,
          verified: true
        }
      });

      addEdge({
        source_node: `wallet:${suspectWallet}`,
        target_node: threatNodeId,
        type: 'REPORTED_IN',
        provenance: 'Derived',
        confidence: 'High',
        confidence_reason: `Wallet flagged in community fraud database with ${threatIntel.reports_count || 1} incident reports`,
        evidence_refs: [{ type: 'threat_id', id: suspectWallet, description: 'Chainabuse complaint filing' }]
      });
    }

    jobState.stage_status.stage_2 = {
      status: 'COMPLETED',
      node_count: jobState.nodes.size - s1NodesCount,
      edge_count: jobState.edges.size - s1EdgesCount,
      duration_ms: Date.now() - s2Start
    };

    // -------------------------------------------------------------
    // STAGE 3: ANALYSIS (Patterns, Shared Counterparties, Cross-Case, Alerts)
    // -------------------------------------------------------------
    const s3Start = Date.now();
    jobState.current_stage = 3;
    jobState.stage_status.stage_3.status = 'RUNNING';

    const s2NodesCount = jobState.nodes.size;
    const s2EdgesCount = jobState.edges.size;

    // 3a. Forensic Behavioral Patterns
    const indicators = Array.isArray(caseDoc.indicators) ? caseDoc.indicators : (result.indicators || []);
    indicators.forEach((ind, index) => {
      const patternId = `pattern:${ind.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      addNode({
        id: patternId,
        label: ind.replace(/_/g, ' '),
        type: 'Pattern',
        source: 'tracex_rule_engine',
        risk_level: 'HIGH',
        attributes: { rule_code: ind }
      });

      if (suspectWallet) {
        addEdge({
          source_node: `wallet:${suspectWallet}`,
          target_node: patternId,
          type: 'EXHIBITS_PATTERN',
          provenance: 'Derived',
          confidence: 'High',
          confidence_reason: `Automated graph topology evaluation matched pattern ${ind}`,
          evidence_refs: [{ type: 'rule_id', id: ind, description: `Rule ${ind} triggered on trace` }]
        });
      }
    });

    // 3b. Cross-Case Convergence & Related Cases
    if (context.CaseNetworkIndex) {
      const relatedIndex = await context.CaseNetworkIndex.find({
        case_id: { $ne: caseId },
        $or: [
          { suspect_wallet: suspectWallet },
          { intermediary_wallets: suspectWallet },
          { counterparty_wallets: suspectWallet }
        ]
      }).limit(5).lean();

      relatedIndex.forEach((otherCase) => {
        const otherCaseNodeId = `case:${otherCase.case_id}`;
        addNode({
          id: otherCaseNodeId,
          label: otherCase.case_label || `Case ${otherCase.case_id.substring(0, 8)}`,
          type: 'Case',
          source: 'tracex_case_index',
          risk_level: 'HIGH',
          attributes: { related_case_id: otherCase.case_id, suspect_wallet: otherCase.suspect_wallet }
        });

        addEdge({
          source_node: `wallet:${suspectWallet}`,
          target_node: otherCaseNodeId,
          type: 'APPEARS_IN_CASE',
          provenance: 'Derived',
          confidence: 'High',
          confidence_reason: `Identical wallet appears in concurrent investigation ${otherCase.case_label || otherCase.case_id}`,
          evidence_refs: [{ type: 'evidence_id', id: otherCase.case_id, description: 'Cross-case network index match' }]
        });
      });
    }

    // 3c. SOC Live Monitoring Alerts
    if (context.Alert) {
      const alerts = await context.Alert.find({
        $or: [{ investigation_id: caseId }, { wallet_address: suspectWallet }]
      }).limit(10).lean();

      alerts.forEach((alert) => {
        const alertNodeId = `alert:${alert._id}`;
        addNode({
          id: alertNodeId,
          label: alert.title || 'Security Alert',
          type: 'Alert',
          source: 'soc_monitor_stream',
          risk_level: String(alert.severity || 'MEDIUM').toUpperCase(),
          first_seen: alert.timestamp || alert.created_at,
          attributes: { alert_type: alert.alert_type, status: alert.status }
        });

        addEdge({
          source_node: `wallet:${suspectWallet}`,
          target_node: alertNodeId,
          type: 'TRIGGERED_ALERT',
          timestamp: alert.timestamp || alert.created_at,
          provenance: 'Derived',
          confidence: 'High',
          confidence_reason: `Rule engine condition evaluated to true: ${alert.title}`,
          evidence_refs: alert.transaction_hash ? [{ type: 'tx_hash', id: alert.transaction_hash, description: 'Alert event transaction' }] : []
        });
      });
    }

    jobState.stage_status.stage_3 = {
      status: 'COMPLETED',
      node_count: jobState.nodes.size - s2NodesCount,
      edge_count: jobState.edges.size - s2EdgesCount,
      duration_ms: Date.now() - s3Start
    };

    // -------------------------------------------------------------
    // STAGE 4: CASE WORK (Notes, Findings, Hypotheses, Evidence Items)
    // -------------------------------------------------------------
    const s4Start = Date.now();
    jobState.current_stage = 4;
    jobState.stage_status.stage_4.status = 'RUNNING';

    const s3NodesCount = jobState.nodes.size;
    const s3EdgesCount = jobState.edges.size;

    // 4a. Hashed Evidence Ledger Items
    if (context.EvidenceItem) {
      const evidenceList = await context.EvidenceItem.find({ case_id: caseId }).limit(50).lean();
      evidenceList.forEach((ev) => {
        const evNodeId = `evidence:${ev.evidence_id || ev._id}`;
        addNode({
          id: evNodeId,
          label: ev.title || `Evidence ${ev.evidence_type}`,
          type: 'Evidence',
          source: ev.source_provider || 'investigator_ledger',
          attributes: {
            evidence_type: ev.evidence_type,
            integrity_hash: ev.integrity_hash,
            captured_at: ev.captured_at
          }
        });

        // Link to wallet or tx if specified
        if (ev.wallet_address && jobState.nodes.has(`wallet:${ev.wallet_address.toLowerCase()}`)) {
          addEdge({
            source_node: `wallet:${ev.wallet_address.toLowerCase()}`,
            target_node: evNodeId,
            type: 'DOCUMENTED_BY',
            provenance: 'Derived',
            confidence: 'High',
            confidence_reason: `Investigator preserved cryptographic snapshot: ${ev.integrity_hash?.substring(0, 16)}…`,
            evidence_refs: [{ type: 'evidence_id', id: ev.evidence_id || String(ev._id), description: 'Immutable evidence ledger record' }]
          });
        }
      });
    }

    // 4b. Investigator Notes
    if (context.InvestigatorNote) {
      const notes = await context.InvestigatorNote.find({ case_id: caseId }).limit(20).lean();
      notes.forEach((note) => {
        const noteNodeId = `note:${note.note_id || note._id}`;
        addNode({
          id: noteNodeId,
          label: `Note by ${note.author || 'Investigator'}`,
          type: 'Note',
          source: 'investigator_entry',
          attributes: { content: note.content, note_type: note.note_type, author: note.author }
        });

        if (suspectWallet) {
          addEdge({
            source_node: `wallet:${suspectWallet}`,
            target_node: noteNodeId,
            type: 'DOCUMENTED_BY',
            provenance: 'Hypothesis',
            confidence: 'Medium',
            confidence_reason: `Investigative memorandum filed by ${note.author || 'analyst'}`,
            evidence_refs: [{ type: 'note_id', id: note.note_id || String(note._id), description: 'Case dossier note' }]
          });
        }
      });
    }

    // 4c. Investigator Findings
    if (context.InvestigatorFinding) {
      const findings = await context.InvestigatorFinding.find({ case_id: caseId }).limit(20).lean();
      findings.forEach((finding) => {
        const findingNodeId = `finding:${finding.finding_id || finding._id}`;
        addNode({
          id: findingNodeId,
          label: finding.title || 'Investigative Finding',
          type: 'Finding',
          source: 'investigator_finding',
          attributes: { classification: finding.classification, description: finding.description }
        });

        if (suspectWallet) {
          addEdge({
            source_node: `wallet:${suspectWallet}`,
            target_node: findingNodeId,
            type: 'DOCUMENTED_BY',
            provenance: 'Derived',
            confidence: 'High',
            confidence_reason: `Finding verified under classification: ${finding.classification}`,
            evidence_refs: []
          });
        }
      });
    }

    // 4d. Hypotheses
    if (context.InvestigatorHypothesis) {
      const hypotheses = await context.InvestigatorHypothesis.find({ case_id: caseId }).limit(10).lean();
      hypotheses.forEach((hyp) => {
        const hypNodeId = `hypothesis:${hyp.hypothesis_id || hyp._id}`;
        addNode({
          id: hypNodeId,
          label: hyp.title || 'Case Hypothesis',
          type: 'Hypothesis',
          source: 'investigator_theory',
          attributes: { status: hyp.status, category: hyp.category }
        });

        if (suspectWallet) {
          addEdge({
            source_node: `wallet:${suspectWallet}`,
            target_node: hypNodeId,
            type: hyp.status === 'CONTRADICTED' ? 'CONTRADICTS' : 'SUPPORTS',
            provenance: 'Hypothesis',
            confidence: 'Medium',
            confidence_reason: `Investigator testable theory marked ${hyp.status}`,
            evidence_refs: []
          });
        }
      });
    }

    jobState.stage_status.stage_4 = {
      status: 'COMPLETED',
      node_count: jobState.nodes.size - s3NodesCount,
      edge_count: jobState.edges.size - s3EdgesCount,
      duration_ms: Date.now() - s4Start
    };

    // -------------------------------------------------------------
    // CANONICAL SERIALIZATION & HASHING
    // -------------------------------------------------------------
    const finalNodes = Array.from(jobState.nodes.values()).sort((a, b) => a.id.localeCompare(b.id));
    const finalEdges = Array.from(jobState.edges.values()).sort((a, b) => a.id.localeCompare(b.id));

    const canonicalGraphData = canonicalJson({
      nodes: finalNodes.map(n => ({ id: n.id, label: n.label, type: n.type })),
      edges: finalEdges.map(e => ({ source: e.source_node, target: e.target_node, type: e.type, provenance: e.provenance }))
    });

    const graphHash = createHash('sha256').update(JSON.stringify(canonicalGraphData)).digest('hex');

    // Query previous version
    const prevVersion = await CaseKnowledgeGraph.findOne({ case_id: caseId }).sort({ version: -1 }).select('version').lean();
    const nextVersion = (prevVersion?.version || 0) + 1;

    const observedEdges = finalEdges.filter(e => e.provenance === 'Observed').length;
    const derivedEdges = finalEdges.filter(e => e.provenance === 'Derived').length;
    const hypothesisEdges = finalEdges.filter(e => e.provenance === 'Hypothesis').length;

    const snapshot = new CaseKnowledgeGraph({
      case_id: caseId,
      version: nextVersion,
      graph_hash: graphHash,
      status: 'READY',
      current_stage: 4,
      stage_status: jobState.stage_status,
      nodes: finalNodes,
      edges: finalEdges,
      metadata: {
        built_at: new Date().toISOString(),
        total_nodes: finalNodes.length,
        total_edges: finalEdges.length,
        observed_edges: observedEdges,
        derived_edges: derivedEdges,
        hypothesis_edges: hypothesisEdges
      }
    });

    await snapshot.save();
    jobState.status = 'READY';
    jobState.version = nextVersion;
    jobState.graph_hash = graphHash;
    jobState.snapshot = snapshot;

    return snapshot;
  } catch (error) {
    jobState.status = 'FAILED';
    jobState.error_message = error.message;
    throw error;
  }
}

export function getActiveBuildJob(caseId) {
  return activeBuildJobs.get(String(caseId)) || null;
}

export async function getLatestKnowledgeGraph(caseId, version) {
  const query = { case_id: String(caseId) };
  if (version) query.version = Number(version);
  return CaseKnowledgeGraph.findOne(query).sort({ version: -1 }).lean();
}

export async function getKnowledgeGraphHistory(caseId) {
  return CaseKnowledgeGraph.find({ case_id: String(caseId) })
    .sort({ version: -1 })
    .select('version graph_hash metadata status createdAt')
    .lean();
}

// -------------------------------------------------------------
// DETERMINISTIC GRAPH QUERY ENGINE (Evidence path & neighbors)
// -------------------------------------------------------------
export function findShortestPath(nodes, edges, startId, endId) {
  const adj = new Map();
  edges.forEach(e => {
    if (!adj.has(e.source_node)) adj.set(e.source_node, []);
    if (!adj.has(e.target_node)) adj.set(e.target_node, []);
    adj.get(e.source_node).push({ target: e.target_node, edge: e });
    adj.get(e.target_node).push({ target: e.source_node, edge: e }); // bidirectional traversal
  });

  const queue = [[startId]];
  const visited = new Set([startId]);

  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];

    if (current === endId) {
      // Reconstruct edges in path
      const pathEdges = [];
      for (let i = 0; i < path.length - 1; i++) {
        const u = path[i], v = path[i + 1];
        const matchingEdge = edges.find(e =>
          (e.source_node === u && e.target_node === v) ||
          (e.source_node === v && e.target_node === u)
        );
        if (matchingEdge) pathEdges.push(matchingEdge);
      }
      return { pathNodes: path, pathEdges };
    }

    const neighbors = adj.get(current) || [];
    for (const { target } of neighbors) {
      if (!visited.has(target)) {
        visited.add(target);
        queue.push([...path, target]);
      }
    }
  }

  return null;
}
