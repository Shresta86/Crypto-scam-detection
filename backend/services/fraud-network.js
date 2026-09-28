const lower = value => String(value || '').toLowerCase();
const isAddress = value => /^0x[a-f0-9]{40}$/.test(lower(value));
const unique = values => [...new Set((values || []).filter(Boolean))];
const intersection = (left, right) => {
  const rightSet = new Set(right || []);
  return unique((left || []).filter(value => rightSet.has(value)));
};

export const SIMILARITY_WEIGHTS = Object.freeze({
  shared_suspect_wallet: 35,
  shared_intermediary: 25,
  shared_destination: 20,
  shared_exchange: 15,
  shared_counterparty: 10,
  overlapping_transfer_path: 10
});

export function caseLabel(caseId) {
  return `CASE-${String(caseId).slice(-6).toUpperCase()}`;
}

function transferReference(item, caseId) {
  return {
    case_id: String(caseId),
    tx_hash: item.hash || item.transaction_hash || item.tx_hash || null,
    from: item.from || item.sender || null,
    to: item.to || item.receiver || null,
    asset: item.asset || item.token_symbol || 'ETH',
    amount: Number(item.amount ?? item.value ?? 0),
    timestamp: item.timestamp || null,
    hop: Number(item.hop ?? 0),
    provider: item.provider || null
  };
}

export function buildCaseNetworkIndex(investigation) {
  const data = investigation?.result_json || investigation || {};
  const caseId = String(investigation?._id || data.investigation_id || investigation?.case_id || '');
  const suspect = lower(data.start_wallet || investigation?.wallet_address);
  const paths = Array.isArray(data.paths) ? data.paths : [];
  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  const sourceWallets = new Set(paths.map(path => lower(path.from)).filter(isAddress));
  const intermediaryWallets = unique(paths.map(path => lower(path.to)).filter(address => isAddress(address) && sourceWallets.has(address) && address !== suspect && !pathExchange(paths, address)));
  const destinationWallets = unique(paths.map(path => lower(path.to)).filter(address => isAddress(address) && !intermediaryWallets.includes(address)));
  const counterpartyWallets = unique(transactions.map(tx => lower(tx.counterparty)).filter(isAddress));
  const walletAddresses = unique([
    suspect,
    ...paths.flatMap(path => [lower(path.from), lower(path.to)]),
    ...counterpartyWallets
  ].filter(isAddress));
  const exchangeEntities = new Map();
  for (const path of paths) if (path.exchange && isAddress(path.to)) exchangeEntities.set(`${lower(path.exchange)}|${lower(path.to)}`, { name: String(path.exchange), address: lower(path.to) });
  for (const item of data.exchange_attributions || []) if (item.exchange) exchangeEntities.set(`${lower(item.exchange)}|${lower(item.address)}`, { name: String(item.exchange), address: lower(item.address) || null });
  const exchangeList = [...exchangeEntities.values()];
  const roles = new Map(walletAddresses.map(address => [address, new Set()]));
  if (suspect) roles.get(suspect)?.add('suspect');
  intermediaryWallets.forEach(address => roles.get(address)?.add('intermediary'));
  destinationWallets.forEach(address => roles.get(address)?.add('destination'));
  counterpartyWallets.forEach(address => roles.get(address)?.add('counterparty'));
  exchangeList.forEach(entity => { if (entity.address && roles.has(entity.address)) roles.get(entity.address).add('exchange_endpoint'); });

  const evidenceByWallet = new Map(walletAddresses.map(address => [address, []]));
  const evidenceItems = [...paths, ...transactions];
  const evidenceSeen = new Set();
  for (const item of evidenceItems) {
    const ref = transferReference(item, caseId);
    const refKey = [lower(ref.tx_hash), lower(ref.from), lower(ref.to), lower(ref.asset), ref.amount].join('|');
    for (const address of unique([lower(ref.from), lower(ref.to), lower(item.counterparty)].filter(isAddress))) {
      const evidenceKey = `${address}|${refKey}`;
      if (evidenceSeen.has(evidenceKey)) continue;
      evidenceSeen.add(evidenceKey);
      const bucket = evidenceByWallet.get(address);
      if (bucket && bucket.length < 5) bucket.push(ref);
    }
  }

  const pathEvidence = [];
  const pathSeen = new Set();
  for (const path of paths) {
    const ref = transferReference(path, caseId);
    const key = [lower(ref.tx_hash), lower(ref.from), lower(ref.to), lower(ref.asset), ref.amount].join('|');
    if (!pathSeen.has(key)) { pathSeen.add(key); pathEvidence.push({ ...ref, exchange: path.exchange || null }); }
  }
  const pathSignatures = unique(pathEvidence.map(path => `${lower(path.from)}>${lower(path.to)}|${lower(path.asset)}`));
  const timestamps = evidenceItems.map(item => new Date(item.timestamp).valueOf()).filter(Number.isFinite);
  return {
    case_id: caseId,
    case_label: caseLabel(caseId),
    investigated_at: data.timestamp || investigation?.timestamp || null,
    suspect_wallet: suspect,
    wallet_addresses: walletAddresses,
    intermediary_wallets: intermediaryWallets,
    destination_wallets: destinationWallets,
    counterparty_wallets: counterpartyWallets,
    exchange_names: unique(exchangeList.map(item => lower(item.name))),
    exchange_keys: unique(exchangeList.map(item => `${lower(item.name)}|${lower(item.address)}`)),
    exchange_entities: exchangeList,
    assets: unique(transactions.map(tx => String(tx.asset || tx.token_symbol || 'ETH').toUpperCase())),
    path_signatures: pathSignatures,
    wallet_evidence: [...roles].map(([address, walletRoles]) => ({ address, roles: [...walletRoles], evidence: evidenceByWallet.get(address) || [] })),
    path_evidence: pathEvidence,
    first_activity_at: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
    last_activity_at: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
    updated_at: new Date()
  };
}

function pathExchange(paths, address) {
  return paths.some(path => lower(path.to) === address && Boolean(path.exchange));
}

function walletEvidence(index, addresses) {
  const wanted = new Set(addresses);
  return (index.wallet_evidence || [])
    .filter(item => wanted.has(item.address))
    .slice(0, 20)
    .map(item => ({ address: item.address, roles: item.roles || [], transactions: item.evidence || [] }));
}

export function compareCaseIndexes(seed, candidate) {
  if (String(seed.case_id) === String(candidate.case_id)) return null;
  const reasons = [];
  const relationshipTypes = [];
  const sharedWallets = intersection(seed.wallet_addresses, candidate.wallet_addresses);
  const sharedIntermediaries = intersection(seed.intermediary_wallets, candidate.intermediary_wallets);
  const sharedDestinations = intersection(seed.destination_wallets, candidate.destination_wallets);
  const sharedExchanges = intersection(seed.exchange_names, candidate.exchange_names);
  const sharedPaths = intersection(seed.path_signatures, candidate.path_signatures);
  const roleAddresses = new Set([...sharedIntermediaries, ...sharedDestinations]);
  const sharedCounterparties = intersection(seed.counterparty_wallets, candidate.counterparty_wallets).filter(address => !roleAddresses.has(address) && address !== seed.suspect_wallet);

  const addReason = (type, values, label) => {
    if (!values.length) return;
    const points = SIMILARITY_WEIGHTS[type];
    const sample = values.slice(0, 10);
    const suffix = values.length > sample.length ? ` (+${values.length - sample.length} more)` : '';
    relationshipTypes.push(type);
    reasons.push({ type, points, values: sample, total_matches: values.length, message: `${label}: ${sample.slice(0, 5).join(', ')}${suffix}` });
  };
  if (seed.suspect_wallet && seed.suspect_wallet === candidate.suspect_wallet) addReason('shared_suspect_wallet', [seed.suspect_wallet], 'Same investigated wallet');
  addReason('shared_intermediary', sharedIntermediaries, 'Common intermediary');
  addReason('shared_destination', sharedDestinations, 'Shared destination wallet');
  addReason('shared_exchange', sharedExchanges, 'Shared exchange/VASP');
  addReason('shared_counterparty', sharedCounterparties, 'Shared transaction counterparty');
  addReason('overlapping_transfer_path', sharedPaths, 'Overlapping transfer path');
  const similarityScore = Math.min(100, reasons.reduce((sum, reason) => sum + reason.points, 0));
  if (!similarityScore) return null;
  return {
    case_id: String(candidate.case_id),
    case_label: candidate.case_label || caseLabel(candidate.case_id),
    suspect_wallet: candidate.suspect_wallet,
    investigated_at: candidate.investigated_at || null,
    similarity_score: similarityScore,
    relationship_types: relationshipTypes,
    reasons,
    shared_wallets: sharedWallets,
    shared_intermediaries: sharedIntermediaries,
    shared_destinations: sharedDestinations,
    shared_counterparties: sharedCounterparties,
    shared_entities: sharedExchanges.map(name => ({ type: 'EXCHANGE_VASP', name })),
    overlapping_paths: sharedPaths,
    evidence: {
      seed_case: walletEvidence(seed, sharedWallets),
      related_case: walletEvidence(candidate, sharedWallets)
    }
  };
}

function networkNodeType(address, indexes) {
  if (indexes.some(index => index.exchange_entities?.some(item => item.address === address))) return 'EXCHANGE_VASP';
  if (indexes.some(index => index.suspect_wallet === address)) return 'SUSPECT_WALLET';
  if (indexes.some(index => index.intermediary_wallets?.includes(address))) return 'INTERMEDIARY';
  return 'WALLET';
}

export function buildFraudNetworkGraph(seed, relatedIndexes, relationships) {
  const indexes = [seed, ...relatedIndexes];
  const nodes = new Map();
  const edges = [];
  const edgeKeys = new Set();
  const addNode = node => { if (!nodes.has(node.id)) nodes.set(node.id, node); };
  const addEdge = edge => {
    const key = edge.id || [edge.source, edge.target, edge.type, edge.tx_hash || edge.case_id || ''].join('|');
    if (!edgeKeys.has(key)) { edgeKeys.add(key); edges.push({ id: key, ...edge }); }
  };
  for (const index of indexes) {
    const caseNode = `case:${index.case_id}`;
    const suspectNode = `wallet:${index.suspect_wallet}`;
    addNode({ id: caseNode, type: 'CASE', label: index.case_label || caseLabel(index.case_id), case_id: String(index.case_id), wallet: index.suspect_wallet });
    addNode({ id: suspectNode, type: 'SUSPECT_WALLET', label: index.suspect_wallet, address: index.suspect_wallet });
    addEdge({ source: caseNode, target: suspectNode, type: 'INVESTIGATES', case_id: String(index.case_id) });
    for (const path of index.path_evidence || []) {
      if (!isAddress(path.from) || !isAddress(path.to)) continue;
      const source = `wallet:${path.from}`, target = `wallet:${path.to}`;
      const entity = index.exchange_entities?.find(item => item.address === path.to);
      addNode({ id: source, type: networkNodeType(path.from, indexes), label: path.from, address: path.from });
      addNode({ id: target, type: networkNodeType(path.to, indexes), label: entity?.name || path.to, address: path.to, entity: entity?.name || null });
      addEdge({ source, target, type: 'TRANSFERRED_TO', case_id: String(index.case_id), tx_hash: path.tx_hash, asset: path.asset, amount: path.amount, timestamp: path.timestamp, hop: path.hop, provider: path.provider });
    }
  }
  for (const relationship of relationships) {
    addEdge({ source: `case:${seed.case_id}`, target: `case:${relationship.case_id}`, type: 'SHARES_INFRASTRUCTURE_WITH', similarity_score: relationship.similarity_score, relationship_types: relationship.relationship_types });
  }
  return { nodes: [...nodes.values()], edges };
}

export class FraudNetworkService {
  constructor({ InvestigationModel, NetworkIndexModel, minScore = 15, maxRelatedCases = 25 } = {}) {
    this.InvestigationModel = InvestigationModel;
    this.NetworkIndexModel = NetworkIndexModel;
    this.minScore = Number(minScore) || 15;
    this.maxRelatedCases = Math.max(1, Number(maxRelatedCases) || 25);
  }

  async indexInvestigation(investigation) {
    const index = buildCaseNetworkIndex(investigation);
    await this.NetworkIndexModel.findOneAndUpdate({ case_id: index.case_id }, index, { upsert: true, new: true, setDefaultsOnInsert: true });
    return index;
  }

  async ensureIndex(caseId) {
    let index = await this.NetworkIndexModel.findOne({ case_id: String(caseId) }).lean();
    if (index) return index;
    const investigation = await this.InvestigationModel.findById(caseId).lean();
    if (!investigation) return null;
    return this.indexInvestigation(investigation);
  }

  async backfillMissingIndexes() {
    const indexed = new Set((await this.NetworkIndexModel.distinct('case_id')).map(String));
    const investigationIds = (await this.InvestigationModel.distinct('_id')).map(String);
    const missingIds = investigationIds.filter(id => !indexed.has(id));
    if (!missingIds.length) return 0;
    const investigations = await this.InvestigationModel.find({ _id: { $in: missingIds } }).select('wallet_address timestamp result_json').lean();
    for (const investigation of investigations) await this.indexInvestigation(investigation);
    return investigations.length;
  }

  candidateQuery(seed) {
    const signals = [
      ['wallet_addresses', seed.wallet_addresses],
      ['intermediary_wallets', seed.intermediary_wallets],
      ['destination_wallets', seed.destination_wallets],
      ['counterparty_wallets', seed.counterparty_wallets],
      ['exchange_names', seed.exchange_names],
      ['path_signatures', seed.path_signatures]
    ].filter(([, values]) => values?.length).map(([field, values]) => ({ [field]: { $in: values } }));
    return { case_id: { $ne: String(seed.case_id) }, ...(signals.length ? { $or: signals } : { case_id: '__no_candidates__' }) };
  }

  async similarCases(caseId, { minScore = this.minScore } = {}) {
    const seed = await this.ensureIndex(caseId);
    if (!seed) return null;
    const candidates = await this.NetworkIndexModel.find(this.candidateQuery(seed)).lean();
    const similar = candidates.map(candidate => compareCaseIndexes(seed, candidate))
      .filter(item => item && item.similarity_score >= minScore)
      .sort((a, b) => b.similarity_score - a.similarity_score || a.case_id.localeCompare(b.case_id))
      .slice(0, this.maxRelatedCases);
    return { case_id: String(seed.case_id), case_label: seed.case_label, minimum_score: minScore, similar_cases: similar };
  }

  async fraudNetwork(caseId) {
    const result = await this.similarCases(caseId);
    if (!result) return null;
    const seed = await this.ensureIndex(caseId);
    const relatedIds = result.similar_cases.map(item => item.case_id);
    const relatedIndexes = relatedIds.length ? await this.NetworkIndexModel.find({ case_id: { $in: relatedIds } }).lean() : [];
    const graph = buildFraudNetworkGraph(seed, relatedIndexes, result.similar_cases);
    const sharedWallets = unique(result.similar_cases.flatMap(item => item.shared_wallets));
    const sharedIntermediaries = unique(result.similar_cases.flatMap(item => item.shared_intermediaries));
    const sharedDestinations = unique(result.similar_cases.flatMap(item => item.shared_destinations));
    const sharedVasps = unique(result.similar_cases.flatMap(item => item.shared_entities.map(entity => entity.name)));
    return {
      seed_case: { case_id: String(seed.case_id), case_label: seed.case_label, suspect_wallet: seed.suspect_wallet, investigated_at: seed.investigated_at },
      related_cases: result.similar_cases,
      summary: {
        related_investigations: result.similar_cases.length,
        shared_wallets: sharedWallets.length,
        common_intermediaries: sharedIntermediaries.length,
        shared_destinations: sharedDestinations.length,
        shared_vasp_destinations: sharedVasps.length
      },
      shared_infrastructure: {
        wallets: sharedWallets,
        intermediaries: sharedIntermediaries,
        destinations: sharedDestinations,
        exchanges_vasps: sharedVasps
      },
      evidence: result.similar_cases.map(item => ({ case_id: item.case_id, reasons: item.reasons, evidence: item.evidence })),
      relationships: result.similar_cases,
      graph
    };
  }
}
