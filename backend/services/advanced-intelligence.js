const lower = value => String(value || '').toLowerCase();

export function createBridgeRegistry(entries = []) {
  const byChain = new Map();
  for (const entry of entries) {
    if (!entry?.contract || !entry?.chain_name || !entry?.source) continue;
    const key = `${lower(entry.chain_name)}:${lower(entry.contract)}`;
    byChain.set(key, { ...entry, contract: lower(entry.contract) });
  }
  return {
    size: byChain.size,
    entries: [...byChain.values()],
    match(chainName, address) { return byChain.get(`${lower(chainName)}:${lower(address)}`) || null; }
  };
}

export function detectBridgeInteractions(transactions = [], registry) {
  if (!registry) return [];
  const seen = new Set();
  const events = [];
  for (const tx of transactions) {
    const chainName = tx.chain_name || tx.chain || tx.blockchain || 'ethereum';
    const matches = [tx.to, tx.from].map(address => registry.match(chainName, address)).filter(Boolean);
    for (const bridge of matches) {
      const key = `${lower(tx.hash || tx.tx_hash)}:${bridge.contract}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        type: 'bridge_interaction', source_chain: lower(chainName), source_chain_id: Number(tx.chain_id || bridge.chain_id || 1),
        wallet: tx.wallet || (lower(tx.to) === bridge.contract ? tx.from : tx.to), bridge: bridge.bridge_name,
        bridge_entity: bridge.entity, bridge_contract: bridge.contract, contract_role: bridge.contract_role,
        transaction_hash: tx.hash || tx.tx_hash || tx.transaction_hash, asset: tx.asset || 'UNKNOWN', amount: tx.amount,
        timestamp: tx.timestamp || null, block: tx.block_number ?? tx.block ?? null, provider: tx.provider || 'unknown',
        destination_chain: null, correlation_status: 'not_correlated',
        provenance: { source: bridge.source, confidence: bridge.confidence, verified_at: bridge.verified_at }
      });
    }
  }
  return events;
}

export function analyzeNetworkTopology(transactions = [], paths = [], relatedCases = []) {
  const nodes = new Map();
  const touch = address => {
    const key = lower(address);
    if (!key) return null;
    if (!nodes.has(key)) nodes.set(key, { address: key, incoming: 0, outgoing: 0, sources: new Set(), destinations: new Set(), assets: new Set(), cases: new Set(), transactions: new Set() });
    return nodes.get(key);
  };
  for (const tx of transactions) {
    const from = touch(tx.from), to = touch(tx.to);
    if (!from || !to) continue;
    from.outgoing += 1; from.destinations.add(to.address); to.incoming += 1; to.sources.add(from.address);
    from.assets.add(tx.asset || 'UNKNOWN'); to.assets.add(tx.asset || 'UNKNOWN');
    if (tx.hash) { from.transactions.add(tx.hash); to.transactions.add(tx.hash); }
  }
  for (const path of paths) { touch(path.from); touch(path.to); }
  for (const item of relatedCases || []) {
    for (const address of item.shared_wallets || []) touch(address)?.cases.add(item.case_id);
  }
  const candidates = [];
  for (const node of nodes.values()) {
    const degree = node.sources.size + node.destinations.size;
    let role = null, reason = null;
    if (node.sources.size >= 3 && node.incoming >= node.outgoing) {
      role = 'COLLECTOR_CANDIDATE'; reason = 'This address receives traced funds from multiple distinct source wallets.';
    } else if (node.destinations.size >= 3 && node.outgoing > node.incoming) {
      role = 'DISTRIBUTOR_CANDIDATE'; reason = 'This address sends traced funds to multiple distinct destination wallets.';
    } else if (degree >= 4) {
      role = 'HIGH_CONNECTIVITY_INTERMEDIARY'; reason = 'This address has high connectivity within the bounded investigation graph.';
    }
    if (!role) continue;
    candidates.push({
      address: node.address, role, reason, degree, incoming_transfers: node.incoming, outgoing_transfers: node.outgoing,
      distinct_sources: node.sources.size, distinct_destinations: node.destinations.size, related_investigations: node.cases.size,
      assets: [...node.assets].sort(), supporting_transactions: [...node.transactions].slice(0, 25),
      disclaimer: 'Topology classification only; it does not imply criminal ownership or intent.'
    });
  }
  candidates.sort((a, b) => b.related_investigations - a.related_investigations || b.degree - a.degree || b.incoming_transfers + b.outgoing_transfers - a.incoming_transfers - a.outgoing_transfers);
  return {
    methodology: {
      collector: 'At least 3 distinct sources and incoming transfers greater than or equal to outgoing transfers.',
      distributor: 'At least 3 distinct destinations and outgoing transfers greater than incoming transfers.',
      hub: 'At least 4 distinct directly connected addresses within the bounded evidence graph.'
    },
    candidates
  };
}

export function buildInvestigationStory(result, network = null) {
  const story = [];
  const txs = result.transactions || [], paths = result.paths || [], indicators = result.suspicious_activity?.indicators || [];
  if (txs.length) story.push({ type: 'observed_activity', title: 'Wallet activity retrieved', detail: `${txs.length} normalized blockchain transfer records were retrieved from ${result.provider?.selected || 'the configured provider'}.`, source: result.provider?.selected || 'blockchain provider' });
  if (paths.length) story.push({ type: 'fund_flow', title: 'Outgoing fund movement traced', detail: `${paths.length} evidence-backed path segments were constructed across up to ${result.max_hops || 0} hops.`, source: 'TraceX tracing' });
  if (indicators.length) story.push({ type: 'risk', title: 'Deterministic behaviors identified', detail: indicators.map(item => item.message).slice(0, 3).join('; '), source: 'TraceX rules' });
  if (result.exchange_attributions?.length) story.push({ type: 'vasp', title: 'Potential VASP endpoint matched', detail: `${result.exchange_attributions.length} endpoint attribution match(es) were found in the configured dataset.`, source: 'TraceX attribution dataset' });
  if (result.bridge_intelligence?.interactions?.length) story.push({ type: 'bridge', title: 'Verified bridge interaction observed', detail: `${result.bridge_intelligence.interactions.length} transaction(s) touched a verified bridge contract. Destination-chain continuation is not asserted without correlation evidence.`, source: 'Verified bridge registry' });
  if (network?.summary?.related_investigations) story.push({ type: 'cross_case', title: 'Stored investigations share infrastructure', detail: `${network.summary.related_investigations} related case(s) met the deterministic similarity threshold.`, source: 'TraceX fraud network' });
  return story;
}

export function crossChainReadiness(providerConfig = {}) {
  const supportedChains = providerConfig.supported_chains || ['ethereum'];
  return {
    status: supportedChains.length > 1 ? 'provider_architecture_ready' : 'destination_data_unavailable',
    supported_chains: supportedChains,
    correlation_verified: false,
    reason: supportedChains.length > 1
      ? 'Multiple provider chains are configured, but protocol-linked destination events have not been correlated.'
      : 'Destination-chain evidence is not available from the currently configured providers.',
    required_evidence: ['verified bridge relationship', 'protocol event linkage or recipient mapping', 'compatible asset', 'temporal evidence'],
    warning: 'Amount similarity and time proximity alone are insufficient for cross-chain attribution.'
  };
}

// --------------------------------------------------------------------------
// MONEY FLOW RECONSTRUCTION (Bounded Proportional Flow Attribution)
// --------------------------------------------------------------------------
export function reconstructMoneyFlow(transactions = [], paths = [], selectedTxHash = null, startWallet = null) {
  const allTxs = Array.isArray(transactions) ? transactions : [];
  const allPaths = Array.isArray(paths) ? paths : [];

  // 1. Identify starting transfer
  let startTx = null;
  if (selectedTxHash) {
    startTx = allTxs.find(tx => lower(tx.hash) === lower(selectedTxHash) || lower(tx.transaction_hash) === lower(selectedTxHash));
  }
  if (!startTx && allPaths.length > 0) {
    const sorted = [...allPaths].filter(p => Number(p.amount) > 0).sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
    startTx = sorted[0];
  }
  if (!startTx && allTxs.length > 0) {
    const nonZero = allTxs.filter(tx => Number(tx.amount) > 0);
    startTx = nonZero[0] || allTxs[0];
  }

  if (!startTx) {
    return {
      status: 'no_transfer_available',
      message: 'No suitable transfer found in case evidence to reconstruct.',
      methodology: 'Proportional flow attribution bounded within 2-hop trace scope.'
    };
  }

  const initialAmount = Number(startTx.amount) || 0;
  const initialAsset = startTx.asset || 'ETH';
  const initialSender = startTx.from || startTx.sender || 'UNKNOWN';
  const initialReceiver = startTx.to || startTx.receiver || startWallet || 'UNKNOWN';
  const initialTimestamp = startTx.timestamp || null;
  const initialHash = startTx.hash || startTx.transaction_hash || 'UNKNOWN';

  // 2. Hop 1 downstream: movements from initialReceiver
  const hop1Paths = allPaths.filter(p => lower(p.from) === lower(initialReceiver) && (p.hop === 1 || !p.hop));
  const totalHop1Outgoing = hop1Paths.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // Proportional scaling factor if total outgoing differs from initial amount
  const scale1 = initialAmount > 0 && totalHop1Outgoing > 0 ? Math.min(1, initialAmount / totalHop1Outgoing) : 1;

  const hop1Nodes = [];
  const hop2Nodes = [];
  let traceableAmount = 0;
  const destinationsReached = new Set();
  const entityInteractions = [];

  for (const h1 of hop1Paths) {
    const rawAmt1 = Number(h1.amount) || 0;
    const attributedAmt1 = initialAmount > 0 ? (totalHop1Outgoing > 0 ? rawAmt1 * scale1 : rawAmt1) : rawAmt1;
    destinationsReached.add(h1.to);

    if (h1.exchange) {
      entityInteractions.push({ entity: h1.exchange, address: h1.to, hop: 1, amount: attributedAmt1, asset: h1.asset || initialAsset });
    }

    // Downstream from this intermediary (Hop 2)
    const hop2Paths = allPaths.filter(p => lower(p.from) === lower(h1.to) && p.hop === 2);
    const totalHop2Outgoing = hop2Paths.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const scale2 = attributedAmt1 > 0 && totalHop2Outgoing > 0 ? Math.min(1, attributedAmt1 / totalHop2Outgoing) : 1;

    const childBranches = [];
    for (const h2 of hop2Paths) {
      const rawAmt2 = Number(h2.amount) || 0;
      const attributedAmt2 = attributedAmt1 > 0 ? (totalHop2Outgoing > 0 ? rawAmt2 * scale2 : rawAmt2) : rawAmt2;
      destinationsReached.add(h2.to);
      if (h2.exchange) {
        entityInteractions.push({ entity: h2.exchange, address: h2.to, hop: 2, amount: attributedAmt2, asset: h2.asset || initialAsset });
      }
      childBranches.push({
        from: h2.from,
        to: h2.to,
        amount: Number(attributedAmt2.toFixed(6)),
        raw_observed_amount: rawAmt2,
        asset: h2.asset || initialAsset,
        hash: h2.hash || h2.transaction_hash,
        timestamp: h2.timestamp,
        exchange: h2.exchange || null,
        hop: 2
      });
      hop2Nodes.push(childBranches[childBranches.length - 1]);
    }

    hop1Nodes.push({
      from: h1.from,
      to: h1.to,
      amount: Number(attributedAmt1.toFixed(6)),
      raw_observed_amount: rawAmt1,
      asset: h1.asset || initialAsset,
      hash: h1.hash || h1.transaction_hash,
      timestamp: h1.timestamp,
      exchange: h1.exchange || null,
      hop: 1,
      downstream_branches: childBranches
    });

    traceableAmount += attributedAmt1;
  }

  // Ensure traceable portion does not exceed initial amount
  if (initialAmount > 0) {
    traceableAmount = Math.min(initialAmount, traceableAmount);
  }
  const unresolvedAmount = Math.max(0, initialAmount - traceableAmount);

  return {
    status: 'reconstructed',
    source_transfer: {
      hash: initialHash,
      from: initialSender,
      to: initialReceiver,
      amount: initialAmount,
      asset: initialAsset,
      timestamp: initialTimestamp
    },
    traceable_amount: Number(traceableAmount.toFixed(6)),
    unresolved_amount: Number(unresolvedAmount.toFixed(6)),
    traceable_percentage: initialAmount > 0 ? Math.min(100, Math.round((traceableAmount / initialAmount) * 100)) : 100,
    hop_1_movements: hop1Nodes,
    hop_2_movements: hop2Nodes,
    destinations_count: destinationsReached.size,
    entity_interactions: entityInteractions,
    methodology: {
      model: 'Bounded Proportional Flow Allocation (2 hops)',
      rules: [
        'Downstream disbursements from the suspect receiver are allocated proportionally based on observed path values.',
        'Assets are fungible; attribution is an analytical model rather than individual token tracking.',
        'Unresolved portion represents funds retained, commingled, or disbursed beyond the 2-hop bounded trace scope.'
      ]
    }
  };
}

// --------------------------------------------------------------------------
// WALLET BEHAVIOUR FINGERPRINT & SIMILARITY
// --------------------------------------------------------------------------
export function calculateWalletFingerprint(walletAddress, transactions = [], paths = []) {
  const target = lower(walletAddress);
  const relevantTxs = transactions.filter(tx => lower(tx.from) === target || lower(tx.to) === target);

  let incomingCount = 0, outgoingCount = 0;
  const senders = new Set(), receivers = new Set(), assets = new Set();
  const hourlyCounts = new Array(24).fill(0);
  const timestamps = [];

  for (const tx of relevantTxs) {
    const isOut = lower(tx.from) === target;
    if (isOut) {
      outgoingCount++;
      if (tx.to) receivers.add(lower(tx.to));
    } else {
      incomingCount++;
      if (tx.from) senders.add(lower(tx.from));
    }
    if (tx.asset) assets.add(tx.asset);
    if (tx.timestamp) {
      const d = new Date(tx.timestamp);
      if (!isNaN(d.getTime())) {
        hourlyCounts[d.getUTCHours()]++;
        timestamps.push(d.getTime());
      }
    }
  }

  timestamps.sort((a, b) => a - b);
  const intervalsSec = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervalsSec.push(Math.round((timestamps[i] - timestamps[i - 1]) / 1000));
  }

  const medianDelay = intervalsSec.length ? intervalsSec[Math.floor(intervalsSec.length / 2)] : 0;
  const avgDelay = intervalsSec.length ? Math.round(intervalsSec.reduce((a, b) => a + b, 0) / intervalsSec.length) : 0;

  // Active time span in days
  const spanMs = timestamps.length >= 2 ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
  const spanDays = Math.max(1, Math.round(spanMs / 86400000));
  const txFreqPerDay = Number((relevantTxs.length / spanDays).toFixed(2));

  // Fan-in and Fan-out
  const fanIn = senders.size;
  const fanOut = receivers.size;
  const counterpartyDiversity = Number(((senders.size + receivers.size) / Math.max(1, relevantTxs.length)).toFixed(2));

  // Behavioral Tendencies (0 - 100)
  const collectorTendency = incomingCount > 0 ? Math.min(100, Math.round((fanIn / Math.max(1, incomingCount)) * 50 + (incomingCount >= outgoingCount ? 35 : 10))) : 0;
  const distributorTendency = outgoingCount > 0 ? Math.min(100, Math.round((fanOut / Math.max(1, outgoingCount)) * 50 + (outgoingCount > incomingCount ? 35 : 10))) : 0;
  const hubScore = Math.min(100, Math.round((fanIn + fanOut) * 8 + (relevantTxs.length > 20 ? 30 : 10)));

  return {
    address: target,
    metrics: {
      total_transactions: relevantTxs.length,
      incoming_transfers: incomingCount,
      outgoing_transfers: outgoingCount,
      in_degree: senders.size,
      out_degree: receivers.size,
      fan_in: fanIn,
      fan_out: fanOut,
      median_forwarding_delay_sec: medianDelay,
      average_forwarding_delay_sec: avgDelay,
      transaction_frequency_per_day: txFreqPerDay,
      counterparty_diversity: counterpartyDiversity,
      asset_diversity: assets.size,
      assets: [...assets],
      collector_tendency: collectorTendency,
      distributor_tendency: distributorTendency,
      hub_connectivity: hubScore,
      hourly_distribution: hourlyCounts,
      observation_span_days: spanDays
    },
    supporting_transfers_count: relevantTxs.length,
    disclaimer: 'BEHAVIOURAL PROFILE ONLY. Reflects observable transfer patterns within retrieved data; does NOT establish owner identity or coordinated control.'
  };
}

export function compareWalletFingerprints(fpA, fpB) {
  if (!fpA || !fpB) return null;
  const mA = fpA.metrics, mB = fpB.metrics;

  const similarities = [];
  const differences = [];

  // 1. Forwarding Delay
  const delayRatio = Math.min(mA.median_forwarding_delay_sec, mB.median_forwarding_delay_sec) / Math.max(1, Math.max(mA.median_forwarding_delay_sec, mB.median_forwarding_delay_sec));
  if (delayRatio > 0.6) {
    similarities.push({ feature: 'Forwarding Speed', note: `Both wallets forward within similar time intervals (~${mA.median_forwarding_delay_sec}s vs ~${mB.median_forwarding_delay_sec}s)` });
  } else {
    differences.push({ feature: 'Forwarding Speed', note: `Wallet A median delay is ${mA.median_forwarding_delay_sec}s vs Wallet B at ${mB.median_forwarding_delay_sec}s` });
  }

  // 2. Fan-out
  if (Math.abs(mA.fan_out - mB.fan_out) <= 2) {
    similarities.push({ feature: 'Dispersal Fan-out', note: `Comparable destination diversity (${mA.fan_out} vs ${mB.fan_out} distinct counterparties)` });
  } else {
    differences.push({ feature: 'Dispersal Fan-out', note: `Wallet A disperses to ${mA.fan_out} destinations vs Wallet B to ${mB.fan_out}` });
  }

  // 3. Collector vs Distributor tendency
  if (Math.abs(mA.collector_tendency - mB.collector_tendency) <= 15) {
    similarities.push({ feature: 'Collector Profile', note: `Matching collector tendency score (${mA.collector_tendency}/100 vs ${mB.collector_tendency}/100)` });
  }
  if (Math.abs(mA.distributor_tendency - mB.distributor_tendency) <= 15) {
    similarities.push({ feature: 'Distributor Profile', note: `Matching distributor tendency score (${mA.distributor_tendency}/100 vs ${mB.distributor_tendency}/100)` });
  }

  // Shared assets
  const sharedAssets = mA.assets.filter(a => mB.assets.includes(a));
  if (sharedAssets.length) {
    similarities.push({ feature: 'Shared Transferred Assets', note: `Both wallets transact in ${sharedAssets.join(', ')}` });
  }

  return {
    wallet_a: fpA.address,
    wallet_b: fpB.address,
    similarities,
    differences,
    disclaimer: 'BEHAVIOURAL SIMILARITY DOES NOT ESTABLISH COMMON OWNERSHIP OR ILLEGAL COORDINATION.'
  };
}

// --------------------------------------------------------------------------
// INFRASTRUCTURE REUSE RADAR
// --------------------------------------------------------------------------
export function detectInfrastructureReuse(currentCaseId, currentCaseIndex, allIndexes = []) {
  if (!currentCaseIndex) return { items: [] };

  const reused = new Map();
  const myWallets = new Set([
    ...(currentCaseIndex.wallet_addresses || []),
    ...(currentCaseIndex.intermediary_wallets || []),
    ...(currentCaseIndex.destination_wallets || [])
  ]);
  const myExchanges = new Set(currentCaseIndex.exchange_names || []);

  for (const other of allIndexes) {
    if (String(other.case_id) === String(currentCaseId)) continue;
    const otherWallets = new Set([
      ...(other.wallet_addresses || []),
      ...(other.intermediary_wallets || []),
      ...(other.destination_wallets || [])
    ]);

    for (const w of myWallets) {
      if (otherWallets.has(w)) {
        if (!reused.has(w)) {
          reused.set(w, {
            target: w,
            type: currentCaseIndex.intermediary_wallets?.includes(w) ? 'INTERMEDIARY' : 'WALLET',
            cases: new Set([currentCaseId, other.case_id]),
            first_observed: currentCaseIndex.first_activity_at || 'Stored case',
            last_observed: currentCaseIndex.last_activity_at || 'Stored case'
          });
        } else {
          reused.get(w).cases.add(other.case_id);
        }
      }
    }

    for (const ex of myExchanges) {
      if (other.exchange_names?.includes(ex)) {
        if (!reused.has(ex)) {
          reused.set(ex, {
            target: ex,
            type: 'ENTITY / VASP',
            cases: new Set([currentCaseId, other.case_id]),
            first_observed: currentCaseIndex.first_activity_at || 'Stored case',
            last_observed: currentCaseIndex.last_activity_at || 'Stored case'
          });
        } else {
          reused.get(ex).cases.add(other.case_id);
        }
      }
    }
  }

  const items = [...reused.values()].map(item => ({
    target: item.target,
    type: item.type,
    cases_observed_in: [...item.cases],
    frequency: item.cases.size,
    first_observed: item.first_observed,
    last_observed: item.last_observed
  })).sort((a, b) => b.frequency - a.frequency);

  return { items };
}

// --------------------------------------------------------------------------
// INVESTIGATION HOTSPOTS
// --------------------------------------------------------------------------
export function computeInvestigationHotspots(transactions = [], paths = [], networkAnalytics = {}, indicators = []) {
  const nodeScores = new Map();

  const getScore = address => {
    const k = lower(address);
    if (!nodeScores.has(k)) {
      nodeScores.set(k, { address: k, score: 0, signals: [], transactions: new Set(), paths: new Set(), roles: [] });
    }
    return nodeScores.get(k);
  };

  // 1. Multi-hop involvement
  for (const path of paths) {
    if (path.from) {
      const n = getScore(path.from);
      n.paths.add(path.hash || `${path.from}->${path.to}`);
      if (path.hop >= 2) {
        n.score += 15;
        if (!n.signals.includes('Multi-hop relay participant')) n.signals.push('Multi-hop relay participant');
      }
    }
    if (path.to) {
      const n = getScore(path.to);
      n.paths.add(path.hash || `${path.from}->${path.to}`);
      if (path.exchange) {
        n.score += 20;
        if (!n.signals.includes(`Endpoint attribution to ${path.exchange}`)) n.signals.push(`Endpoint attribution to ${path.exchange}`);
      }
    }
  }

  // 2. Topology candidate roles
  const candidates = networkAnalytics?.candidates || [];
  for (const c of candidates) {
    const n = getScore(c.address);
    n.score += c.role === 'COLLECTOR_CANDIDATE' ? 30 : c.role === 'DISTRIBUTOR_CANDIDATE' ? 25 : 20;
    n.roles.push(c.role);
    n.signals.push(c.reason || c.role);
  }

  // 3. Risk indicators
  for (const ind of indicators) {
    if (ind.type === 'rapid_movement') {
      for (const txHash of (ind.supporting_transactions || [])) {
        const tx = transactions.find(t => t.hash === txHash || t.transaction_hash === txHash);
        if (tx) {
          if (tx.from) { const n = getScore(tx.from); n.score += 15; n.transactions.add(txHash); if (!n.signals.includes('Rapid fund movement source')) n.signals.push('Rapid fund movement source'); }
          if (tx.to) { const n = getScore(tx.to); n.score += 15; n.transactions.add(txHash); if (!n.signals.includes('Rapid fund movement destination')) n.signals.push('Rapid fund movement destination'); }
        }
      }
    }
  }

  const hotspots = [...nodeScores.values()]
    .filter(n => n.score > 0)
    .map(n => ({
      address: n.address,
      priority_score: Math.min(100, n.score),
      level: n.score >= 50 ? 'HIGH' : n.score >= 25 ? 'MEDIUM' : 'LOW',
      signals: n.signals,
      supporting_transactions: [...n.transactions].slice(0, 10),
      supporting_paths: [...n.paths].slice(0, 10),
      roles: n.roles
    }))
    .sort((a, b) => b.priority_score - a.priority_score);

  return {
    methodology: 'Signal density combining multi-hop paths, topology centrality, rapid movement, and endpoint attributions.',
    hotspots
  };
}

// --------------------------------------------------------------------------
// TRANSACTION PATTERN MOTIFS
// --------------------------------------------------------------------------
export function detectTransactionMotifs(transactions = [], paths = []) {
  const motifs = [];

  // Group by sender
  const byFrom = new Map(), byTo = new Map();
  for (const p of paths) {
    const f = lower(p.from), t = lower(p.to);
    if (!byFrom.has(f)) byFrom.set(f, []);
    byFrom.get(f).push(p);
    if (!byTo.has(t)) byTo.set(t, []);
    byTo.get(t).push(p);
  }

  // Motif 1: Fan-Out (1 source -> 3+ destinations)
  for (const [sender, outs] of byFrom.entries()) {
    const uniqueDests = new Set(outs.map(o => lower(o.to)));
    if (uniqueDests.size >= 3) {
      motifs.push({
        id: `MOTIF-FO-${sender.slice(2, 8)}`,
        type: 'FAN_OUT',
        name: 'Dispersal Fan-out',
        wallets_count: uniqueDests.size + 1,
        transfers_count: outs.length,
        source_wallet: sender,
        destinations: [...uniqueDests],
        transactions: outs.map(o => o.hash || o.transaction_hash).filter(Boolean).slice(0, 8),
        description: `Source address dispatched funds across ${uniqueDests.size} distinct recipient wallets.`
      });
    }
  }

  // Motif 2: Fan-In / Consolidation (3+ sources -> 1 destination)
  for (const [dest, ins] of byTo.entries()) {
    const uniqueSources = new Set(ins.map(i => lower(i.from)));
    if (uniqueSources.size >= 3) {
      motifs.push({
        id: `MOTIF-FI-${dest.slice(2, 8)}`,
        type: 'CONSOLIDATION',
        name: 'Fund Consolidation (Fan-in)',
        wallets_count: uniqueSources.size + 1,
        transfers_count: ins.length,
        collector_wallet: dest,
        sources: [...uniqueSources],
        transactions: ins.map(i => i.hash || i.transaction_hash).filter(Boolean).slice(0, 8),
        description: `Collector address aggregated transfers from ${uniqueSources.size} distinct source wallets.`
      });
    }
  }

  // Motif 3: Rapid Relay (Transfers forwarded within 30 minutes)
  for (const p1 of paths) {
    if (!p1.timestamp) continue;
    const t1 = new Date(p1.timestamp).getTime();
    const downstream = paths.filter(p2 => lower(p2.from) === lower(p1.to) && p2.timestamp);
    for (const p2 of downstream) {
      const t2 = new Date(p2.timestamp).getTime();
      const diffSec = Math.abs(t2 - t1) / 1000;
      if (diffSec > 0 && diffSec <= 1800) {
        motifs.push({
          id: `MOTIF-RR-${(p1.hash || p2.hash || 'rel').slice(2, 8)}`,
          type: 'RAPID_RELAY',
          name: 'Rapid Intermediary Relay',
          wallets_count: 3,
          transfers_count: 2,
          duration_sec: Math.round(diffSec),
          wallets: [p1.from, p1.to, p2.to],
          transactions: [p1.hash, p2.hash].filter(Boolean),
          description: `Funds moved through intermediary ${p1.to.slice(0, 10)}... in ${Math.round(diffSec / 60)}m ${Math.round(diffSec % 60)}s.`
        });
        break;
      }
    }
    if (motifs.filter(m => m.type === 'RAPID_RELAY').length >= 3) break;
  }

  return { motifs };
}

// --------------------------------------------------------------------------
// DORMANCY / REACTIVATION DETECTION
// --------------------------------------------------------------------------
export function detectDormancyReactivation(transactions = [], thresholdDays = 14) {
  const events = [];
  const sorted = [...transactions]
    .filter(tx => tx.timestamp)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (sorted.length < 2) return { events };

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].timestamp).getTime();
    const curr = new Date(sorted[i].timestamp).getTime();
    const gapDays = (curr - prev) / (1000 * 86400);

    if (gapDays >= thresholdDays) {
      events.push({
        dormancy_days: Math.round(gapDays),
        inactive_from: sorted[i - 1].timestamp,
        reactivated_at: sorted[i].timestamp,
        trigger_transaction: sorted[i].hash || sorted[i].transaction_hash,
        trigger_amount: sorted[i].amount,
        trigger_asset: sorted[i].asset || 'ETH',
        trigger_direction: sorted[i].direction,
        description: `Wallet remained dormant for ${Math.round(gapDays)} days before a new ${sorted[i].direction} transfer of ${sorted[i].amount} ${sorted[i].asset || 'ETH'}.`
      });
    }
  }

  return { events };
}

// --------------------------------------------------------------------------
// INVESTIGATION DIFF ("WHAT CHANGED?")
// --------------------------------------------------------------------------
export function computeInvestigationDiff(previousInvestigation, currentInvestigation) {
  const prev = previousInvestigation || {};
  const curr = currentInvestigation || {};

  const prevTxs = new Map((prev.transactions || []).map(t => [lower(t.hash || t.transaction_hash), t]));
  const currTxs = new Map((curr.transactions || []).map(t => [lower(t.hash || t.transaction_hash), t]));

  const newTransactions = [];
  for (const [hash, tx] of currTxs) {
    if (!prevTxs.has(hash)) newTransactions.push(tx);
  }

  const prevWallets = new Set((prev.paths || []).flatMap(p => [lower(p.from), lower(p.to)]));
  const currWallets = new Set((curr.paths || []).flatMap(p => [lower(p.from), lower(p.to)]));
  const newCounterparties = [...currWallets].filter(w => !prevWallets.has(w));

  const prevRisk = prev.risk?.score ?? 0;
  const currRisk = curr.risk?.score ?? 0;
  const riskDelta = currRisk - prevRisk;

  return {
    has_changes: newTransactions.length > 0 || newCounterparties.length > 0 || riskDelta !== 0,
    new_transactions_count: newTransactions.length,
    new_counterparties_count: newCounterparties.length,
    risk_score_delta: riskDelta,
    previous_risk_score: prevRisk,
    current_risk_score: currRisk,
    new_transactions: newTransactions.slice(0, 20),
    new_counterparties: newCounterparties,
    disclaimer: 'Deterministic comparison between stored case snapshots.'
  };
}
