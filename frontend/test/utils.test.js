import test from 'node:test';
import assert from 'node:assert/strict';
import { assetSummary, caseLabel, counterpartySummary, formatAmount, isEthereumAddress, shortAddress } from '../src/utils.js';

// TEST DATA ONLY. These fixtures never enter the application or MongoDB.
test('Ethereum address validation and compact identifiers are deterministic', () => {
  const address = '0x1111111111111111111111111111111111111111';
  assert.equal(isEthereumAddress(address), true);
  assert.equal(isEthereumAddress('0x123'), false);
  assert.equal(shortAddress(address), '0x111111…111111');
  assert.equal(caseLabel('aaaaaaaaaaaaaaaaaa123456'), 'CASE-123456');
});

test('asset summaries keep token and native amounts separate', () => {
  const summary = assetSummary([{ asset: 'ETH', direction: 'IN', amount: 2 }, { asset: 'USDT', direction: 'OUT', amount: 250 }, { asset: 'ETH', direction: 'OUT', amount: 0.5 }]);
  assert.deepEqual(summary.find(item => item.asset === 'ETH'), { asset: 'ETH', incoming: 2, outgoing: 0.5, count: 2 });
  assert.deepEqual(summary.find(item => item.asset === 'USDT'), { asset: 'USDT', incoming: 0, outgoing: 250, count: 1 });
  assert.equal(formatAmount(0.0000002), '2.000e-7');
});

test('counterparty intelligence aggregates observed evidence only', () => {
  const address = '0x2222222222222222222222222222222222222222';
  const result = counterpartySummary([{ counterparty: address, asset: 'ETH', amount: 1, exchange: null }, { counterparty: address.toUpperCase(), asset: 'USDC', amount: 10, exchange: 'Example VASP' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].count, 2);
  assert.deepEqual(result[0].assets, ['ETH', 'USDC']);
  assert.equal(result[0].exchange, 'Example VASP');
});
