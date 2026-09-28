import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCaseNetworkIndex, buildFraudNetworkGraph, compareCaseIndexes, SIMILARITY_WEIGHTS
} from '../services/fraud-network.js';

// TEST DATA ONLY. These fixtures are never written to the application database.
const addresses = {
  a: '0x1111111111111111111111111111111111111111',
  b: '0x2222222222222222222222222222222222222222',
  x: '0x3333333333333333333333333333333333333333',
  y: '0x4444444444444444444444444444444444444444',
  z: '0x5555555555555555555555555555555555555555',
  exchange1: '0x6666666666666666666666666666666666666666',
  exchange2: '0x7777777777777777777777777777777777777777'
};
const ids = { a: 'aaaaaaaaaaaaaaaaaaaaaaaa', b: 'bbbbbbbbbbbbbbbbbbbbbbbb', c: 'cccccccccccccccccccccccc' };

function fixture(id, suspect, paths = [], transactions = [], exchanges = []) {
  return {
    _id: id,
    wallet_address: suspect,
    result_json: {
      test_data: true,
      investigation_id: id,
      start_wallet: suspect,
      timestamp: '2026-09-28 12:00:00 UTC',
      paths,
      transactions,
      exchange_attributions: exchanges
    }
  };
}

function path(hash, from, to, hop = 1, exchange = null, asset = 'ETH') {
  return { hash, from, to, hop, exchange, asset, amount: 1, timestamp: '2026-09-28 12:00:00 UTC', provider: 'test' };
}

function tx(hash, wallet, counterparty) {
  return { hash, from: wallet, to: counterparty, wallet, counterparty, direction: 'OUT', asset: 'ETH', amount: 1, timestamp: '2026-09-28 12:00:00 UTC', provider: 'test' };
}

test('unrelated cases produce no relationship', () => {
  const a = buildCaseNetworkIndex(fixture(ids.a, addresses.a, [path('0xa1', addresses.a, addresses.x)]));
  const b = buildCaseNetworkIndex(fixture(ids.b, addresses.b, [path('0xb1', addresses.b, addresses.y)]));
  assert.equal(compareCaseIndexes(a, b), null);
});

test('same investigated wallet is detected case-insensitively', () => {
  const a = buildCaseNetworkIndex(fixture(ids.a, addresses.a.toUpperCase(), []));
  const b = buildCaseNetworkIndex(fixture(ids.b, addresses.a, []));
  const relationship = compareCaseIndexes(a, b);
  assert.equal(relationship.similarity_score, SIMILARITY_WEIGHTS.shared_suspect_wallet);
  assert.deepEqual(relationship.shared_wallets, [addresses.a]);
});

test('common intermediary includes supporting transaction evidence', () => {
  const a = buildCaseNetworkIndex(fixture(ids.a, addresses.a, [path('0xa1', addresses.a, addresses.x), path('0xa2', addresses.x, addresses.z, 2)]));
  const b = buildCaseNetworkIndex(fixture(ids.b, addresses.b, [path('0xb1', addresses.b, addresses.x), path('0xb2', addresses.x, addresses.y, 2)]));
  const relationship = compareCaseIndexes(a, b);
  assert.deepEqual(relationship.shared_intermediaries, [addresses.x]);
  assert.equal(relationship.reasons.find(reason => reason.type === 'shared_intermediary').points, 25);
  assert.equal(relationship.evidence.seed_case[0].transactions[0].tx_hash, '0xa1');
  assert.equal(relationship.evidence.related_case[0].transactions[0].tx_hash, '0xb1');
});

test('same exchange entity is detected across different endpoint addresses', () => {
  const a = buildCaseNetworkIndex(fixture(ids.a, addresses.a, [path('0xa1', addresses.a, addresses.exchange1, 1, 'Binance')]));
  const b = buildCaseNetworkIndex(fixture(ids.b, addresses.b, [path('0xb1', addresses.b, addresses.exchange2, 1, 'binance')]));
  const relationship = compareCaseIndexes(a, b);
  assert.equal(relationship.similarity_score, 15);
  assert.deepEqual(relationship.shared_entities, [{ type: 'EXCHANGE_VASP', name: 'binance' }]);
});

test('multiple independent signals increase score using fixed type weights', () => {
  const pathsA = [path('0xa1', addresses.a, addresses.x), path('0xshared', addresses.x, addresses.exchange1, 2, 'Binance')];
  const pathsB = [path('0xb1', addresses.b, addresses.x), path('0xshared', addresses.x, addresses.exchange1, 2, 'Binance')];
  const a = buildCaseNetworkIndex(fixture(ids.a, addresses.a, pathsA));
  const b = buildCaseNetworkIndex(fixture(ids.b, addresses.b, pathsB));
  const relationship = compareCaseIndexes(a, b);
  const expected = SIMILARITY_WEIGHTS.shared_intermediary + SIMILARITY_WEIGHTS.shared_destination + SIMILARITY_WEIGHTS.shared_exchange + SIMILARITY_WEIGHTS.overlapping_transfer_path;
  assert.equal(relationship.similarity_score, expected);
  assert.equal(relationship.reasons.reduce((sum, item) => sum + item.points, 0), expected);
});

test('a case is excluded from matching itself', () => {
  const index = buildCaseNetworkIndex(fixture(ids.a, addresses.a, [path('0xa1', addresses.a, addresses.x)]));
  assert.equal(compareCaseIndexes(index, index), null);
});

test('duplicate transfers do not inflate signal-type score', () => {
  const duplicate = path('0xdup', addresses.a, addresses.x);
  const a = buildCaseNetworkIndex(fixture(ids.a, addresses.a, [duplicate, duplicate], [tx('0xdup', addresses.a, addresses.x), tx('0xdup', addresses.a, addresses.x)]));
  const b = buildCaseNetworkIndex(fixture(ids.b, addresses.b, [path('0xb1', addresses.b, addresses.x)], [tx('0xb1', addresses.b, addresses.x)]));
  const relationship = compareCaseIndexes(a, b);
  assert.equal(relationship.reasons.filter(reason => reason.type === 'shared_destination').length, 1);
  assert.equal(relationship.reasons.find(reason => reason.type === 'shared_destination').points, 20);
});

test('fraud-network graph has typed case, wallet, intermediary, exchange, and concrete edges', () => {
  const seed = buildCaseNetworkIndex(fixture(ids.a, addresses.a, [path('0xa1', addresses.a, addresses.x), path('0xa2', addresses.x, addresses.exchange1, 2, 'Binance')]));
  const related = buildCaseNetworkIndex(fixture(ids.b, addresses.b, [path('0xb1', addresses.b, addresses.x), path('0xb2', addresses.x, addresses.exchange1, 2, 'Binance')]));
  const relationship = compareCaseIndexes(seed, related);
  const graph = buildFraudNetworkGraph(seed, [related], [relationship]);
  const nodeTypes = new Set(graph.nodes.map(node => node.type));
  const edgeTypes = new Set(graph.edges.map(edge => edge.type));
  for (const type of ['CASE', 'SUSPECT_WALLET', 'INTERMEDIARY', 'EXCHANGE_VASP']) assert.ok(nodeTypes.has(type));
  for (const type of ['INVESTIGATES', 'TRANSFERRED_TO', 'SHARES_INFRASTRUCTURE_WITH']) assert.ok(edgeTypes.has(type));
  assert.ok(graph.edges.some(edge => edge.type === 'TRANSFERRED_TO' && edge.tx_hash === '0xa1'));
});
