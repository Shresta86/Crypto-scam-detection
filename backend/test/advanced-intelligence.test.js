import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeNetworkTopology, buildInvestigationStory, createBridgeRegistry,
  crossChainReadiness, detectBridgeInteractions,
  reconstructMoneyFlow, calculateWalletFingerprint, compareWalletFingerprints,
  detectInfrastructureReuse, computeInvestigationHotspots, detectTransactionMotifs,
  detectDormancyReactivation, computeInvestigationDiff
} from '../services/advanced-intelligence.js';

const a = '0x1111111111111111111111111111111111111111';
const b = '0x2222222222222222222222222222222222222222';
const c = '0x3333333333333333333333333333333333333333';
const d = '0x4444444444444444444444444444444444444444';
const bridge = '0x5555555555555555555555555555555555555555';
const registry = createBridgeRegistry([{ chain_id: 1, chain_name: 'ethereum', contract: bridge, bridge_name: 'Verified Test Bridge', entity: 'Test SpokePool', source: 'https://official.example/contracts', confidence: 'verified_official_registry' }]);

test('bridge detection emits provenance-backed evidence for exact contract matches', () => {
  const [event] = detectBridgeInteractions([{ chain_id: 1, chain_name: 'ethereum', wallet: a, from: a, to: bridge, hash: '0xabc', asset: 'USDC', amount: 25, provider: 'alchemy' }], registry);
  assert.equal(event.type, 'bridge_interaction');
  assert.equal(event.bridge_contract, bridge);
  assert.equal(event.destination_chain, null);
  assert.equal(event.correlation_status, 'not_correlated');
  assert.match(event.provenance.source, /^https:/);
});

test('bridge detection produces no false positive for unknown addresses or another chain', () => {
  assert.deepEqual(detectBridgeInteractions([{ chain_name: 'ethereum', from: a, to: b, hash: '0x1' }], registry), []);
  assert.deepEqual(detectBridgeInteractions([{ chain_name: 'arbitrum', from: a, to: bridge, hash: '0x2' }], registry), []);
});

test('network analytics identifies collector candidates from real edge topology', () => {
  const txs = [a, b, c].map((from, index) => ({ from, to: d, hash: `0x${index}`, asset: 'ETH' }));
  const result = analyzeNetworkTopology(txs, []);
  const candidate = result.candidates.find(item => item.address === d);
  assert.equal(candidate.role, 'COLLECTOR_CANDIDATE');
  assert.equal(candidate.distinct_sources, 3);
  assert.match(candidate.disclaimer, /does not imply/i);
});

test('network analytics identifies distributor candidates', () => {
  const txs = [b, c, d].map((to, index) => ({ from: a, to, hash: `0x${index}`, asset: 'USDT' }));
  const candidate = analyzeNetworkTopology(txs, []).candidates.find(item => item.address === a);
  assert.equal(candidate.role, 'DISTRIBUTOR_CANDIDATE');
  assert.equal(candidate.distinct_destinations, 3);
});

test('cross-chain readiness refuses correlation with an Ethereum-only provider', () => {
  const result = crossChainReadiness({ supported_chains: ['ethereum'] });
  assert.equal(result.status, 'destination_data_unavailable');
  assert.equal(result.correlation_verified, false);
});

test('investigation story contains only supplied deterministic evidence', () => {
  const story = buildInvestigationStory({ transactions: [{ hash: '0x1' }], paths: [], max_hops: 2, provider: { selected: 'alchemy' }, suspicious_activity: { indicators: [] } });
  assert.equal(story.length, 1);
  assert.equal(story[0].type, 'observed_activity');
  assert.doesNotMatch(JSON.stringify(story), /vasp|bridge/i);
});

test('reconstructMoneyFlow computes bounded proportional attribution', () => {
  const txs = [{ hash: '0xstart', from: a, to: b, amount: 10, asset: 'USDT', timestamp: '2026-09-28 10:00:00 UTC' }];
  const paths = [
    { from: b, to: c, amount: 4, asset: 'USDT', hop: 1, hash: '0xh1a', timestamp: '2026-09-28 10:05:00 UTC' },
    { from: b, to: d, amount: 6, asset: 'USDT', hop: 1, hash: '0xh1b', timestamp: '2026-09-28 10:10:00 UTC' },
    { from: c, to: bridge, amount: 2, asset: 'USDT', hop: 2, hash: '0xh2a', timestamp: '2026-09-28 10:15:00 UTC' }
  ];
  const flow = reconstructMoneyFlow(txs, paths, '0xstart', b);
  assert.equal(flow.status, 'reconstructed');
  assert.equal(flow.source_transfer.amount, 10);
  assert.equal(flow.hop_1_movements.length, 2);
  assert.equal(flow.hop_2_movements.length, 1);
  assert.equal(flow.traceable_amount, 10);
  assert.equal(flow.unresolved_amount, 0);
  assert.match(flow.methodology.model, /Proportional Flow/i);
});

test('wallet fingerprint computes behavioral metrics with non-ownership disclaimer', () => {
  const txs = [
    { from: a, to: b, amount: 1, asset: 'ETH', timestamp: '2026-09-28 10:00:00 UTC' },
    { from: a, to: c, amount: 2, asset: 'ETH', timestamp: '2026-09-28 10:15:00 UTC' },
    { from: d, to: a, amount: 5, asset: 'ETH', timestamp: '2026-09-28 09:30:00 UTC' }
  ];
  const fp = calculateWalletFingerprint(a, txs, []);
  assert.equal(fp.address, a);
  assert.equal(fp.metrics.total_transactions, 3);
  assert.equal(fp.metrics.out_degree, 2);
  assert.equal(fp.metrics.in_degree, 1);
  assert.match(fp.disclaimer, /does NOT establish owner identity/i);
});

test('transaction motifs identify fan-out and rapid relay', () => {
  const paths = [
    { from: a, to: b, hash: '0x1', timestamp: '2026-09-28 10:00:00 UTC' },
    { from: a, to: c, hash: '0x2', timestamp: '2026-09-28 10:01:00 UTC' },
    { from: a, to: d, hash: '0x3', timestamp: '2026-09-28 10:02:00 UTC' },
    { from: b, to: bridge, hash: '0x4', timestamp: '2026-09-28 10:10:00 UTC' }
  ];
  const { motifs } = detectTransactionMotifs([], paths);
  assert.ok(motifs.some(m => m.type === 'FAN_OUT'));
  assert.ok(motifs.some(m => m.type === 'RAPID_RELAY'));
});

test('investigation diff detects new transactions and counterparties', () => {
  const prev = { transactions: [{ hash: '0x1' }], paths: [{ from: a, to: b }] };
  const curr = { transactions: [{ hash: '0x1' }, { hash: '0x2' }], paths: [{ from: a, to: b }, { from: b, to: c }] };
  const diff = computeInvestigationDiff(prev, curr);
  assert.equal(diff.new_transactions_count, 1);
  assert.equal(diff.new_counterparties_count, 1);
  assert.deepEqual(diff.new_counterparties, [c]);
});
