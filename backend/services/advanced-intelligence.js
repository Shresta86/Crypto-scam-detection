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
