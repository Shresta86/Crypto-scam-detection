import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeNetworkTopology, buildInvestigationStory, createBridgeRegistry,
  crossChainReadiness, detectBridgeInteractions
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
