import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BlockchainProviderService, normalizeAlchemyTransfer, normalizeEtherscanTransaction
} from '../services/blockchain.js';
import { ChainabuseService } from '../services/threat-intelligence.js';
import { applyGroundingGuard, buildCopilotEvidence, GroqCopilotService } from '../services/copilot.js';
import { intelligence, traceWallet } from '../server.js';

const wallet = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';

test('Alchemy normalizes native ETH without losing raw value', () => {
  const tx = normalizeAlchemyTransfer({
    hash: '0xnative', category: 'external', from: wallet, to: other, blockNum: '0x7b',
    value: 1, asset: 'ETH', rawContract: { value: '0xde0b6b3a7640000', decimal: '0x12' },
    metadata: { blockTimestamp: '2026-09-28T12:00:00.000Z' }
  }, wallet);
  assert.equal(tx.asset, 'ETH');
  assert.equal(tx.amount, 1);
  assert.equal(tx.raw_amount, '0xde0b6b3a7640000');
  assert.equal(tx.block_number, 123);
  assert.equal(tx.provider, 'alchemy');
  assert.equal(tx.direction, 'OUT');
});

test('Alchemy and Etherscan normalize ERC-20 decimals and never label tokens ETH', () => {
  const alchemy = normalizeAlchemyTransfer({
    hash: '0xtoken-a', category: 'erc20', from: other, to: wallet, blockNum: '0x7b', asset: 'USDT',
    rawContract: { value: '0x3b9aca00', decimal: '0x6', address: '0x3333333333333333333333333333333333333333' },
    metadata: { blockTimestamp: '2026-09-28T12:00:00.000Z' }
  }, wallet);
  const etherscan = normalizeEtherscanTransaction({
    hash: '0xtoken-e', from: wallet, to: other, value: '1000000000', tokenDecimal: '6', tokenSymbol: 'USDT',
    contractAddress: '0x3333333333333333333333333333333333333333', blockNumber: '123', timeStamp: '1790596800'
  }, wallet, 'ERC20_TRANSFER');
  for (const tx of [alchemy, etherscan]) {
    assert.equal(tx.asset, 'USDT'); assert.equal(tx.amount, 1000); assert.equal(tx.token_decimals, 6);
    assert.equal(tx.asset_type, 'token'); assert.notEqual(tx.asset, 'ETH');
  }
});

test('provider service uses Alchemy first and falls back once to Etherscan', async () => {
  let alchemyCalls = 0, etherscanCalls = 0;
  const service = new BlockchainProviderService({
    alchemy: { configured: true, fetchTransactions: async () => { alchemyCalls += 1; throw Object.assign(new Error('down'), { code: 'timeout' }); } },
    etherscan: { configured: true, fetchTransactions: async () => { etherscanCalls += 1; return [{ hash: '0xok' }]; } },
    logger: { info() {}, warn() {} }
  });
  assert.deepEqual(await service.fetchTransactions(wallet), [{ hash: '0xok' }]);
  assert.deepEqual(await service.fetchTransactions(other), [{ hash: '0xok' }]);
  assert.equal(alchemyCalls, 1);
  assert.equal(etherscanCalls, 2);
  assert.equal(service.summary().fallback_used, true);
});

test('Chainabuse result is persisted and the second lookup uses cache', async () => {
  let apiCalls = 0;
  let stored = null;
  const CacheModel = {
    findOne() { return { lean: async () => stored }; },
    async findOneAndUpdate(query, update) { stored = { ...query, ...update }; return stored; }
  };
  const client = { get: async () => { apiCalls += 1; return { data: { reports: [{ id: 'r1', category: 'PHISHING', confidenceScore: 80 }] } }; } };
  const service = new ChainabuseService({ apiKey: 'test-key', CacheModel, client, ttlHours: 168 });
  const first = await service.screenAddress(wallet);
  const second = await service.screenAddress(wallet);
  assert.equal(first.report_count, 1);
  assert.deepEqual(first.categories, ['PHISHING']);
  assert.equal(second.cached, true);
  assert.equal(apiCalls, 1);
});

test('Copilot sends only constructed TraceX evidence and returns model answer', async () => {
  let requestBody = null;
  const client = {
    get: async () => ({ data: { data: [{ id: 'openai/gpt-oss-20b', active: true }] } }),
    post: async (_url, body) => { requestBody = body; return { data: { choices: [{ message: { content: 'Evidence is limited.' } }] } }; }
  };
  const caseData = { investigation_id: 'case-1', start_wallet: wallet, risk: { score: 20 }, transactions: [{ hash: '0xabc', from: wallet, to: other, asset: 'ETH', amount: 1 }], paths: [] };
  const service = new GroqCopilotService({ apiKey: 'test-key', client });
  const result = await service.answer('Summarize this investigation.', caseData);
  assert.equal(result.answer, 'Evidence is limited.');
  assert.equal(result.model, 'openai/gpt-oss-20b');
  assert.match(requestBody.messages[1].content, /0xabc/);
  assert.doesNotMatch(requestBody.messages[1].content, /test-key/);
  assert.equal(buildCopilotEvidence(caseData).transaction_sample.length, 1);
});

test('Chainabuse evidence adds an explainable supporting-intelligence score', () => {
  const transactions = [1, 2, 3].map(index => ({ wallet, direction: 'OUT', counterparty: `0x${String(index).padStart(40, '0')}`, timestamp: `2026-09-28 12:0${index}:00 UTC` }));
  const result = intelligence(transactions, [], { status: 'available', report_count: 2 });
  const external = result.risk.breakdown.find(item => item.type === 'external_reported_activity');
  assert.equal(external.points, 20);
  assert.equal(external.source, 'external_intelligence');
  assert.match(result.risk.disclaimer, /not proof/i);
});

test('multi-hop path evidence preserves separate ETH and ERC-20 assets', async () => {
  const service = {
    fetchTransactions: async () => [
      { hash: '0xeth', from: wallet, to: other, counterparty: other, direction: 'OUT', amount: 1, raw_amount: '1000000000000000000', asset: 'ETH', type: 'normal', provider: 'alchemy' },
      { hash: '0xusdt', from: wallet, to: other, counterparty: other, direction: 'OUT', amount: 10, raw_amount: '10000000', asset: 'USDT', token_contract: '0x3333333333333333333333333333333333333333', type: 'ERC20_TRANSFER', provider: 'alchemy' }
    ],
    summary: () => ({ selected: 'alchemy' })
  };
  const result = await traceWallet(wallet, 0, 8, service);
  assert.deepEqual(result.paths.map(path => path.asset), ['ETH', 'USDT']);
  assert.deepEqual(result.paths.map(path => path.hash), ['0xeth', '0xusdt']);
});

test('Copilot grounding guard replaces unsupported criminal claims and unavailable-report assertions', () => {
  const evidence = buildCopilotEvidence({
    start_wallet: wallet, transactions: [], paths: [], risk: { score: 20, level: 'LOW' },
    suspicious_activity: { indicators: [{ message: 'External reported activity', points: 20, source: 'external_intelligence' }] },
    external_intelligence: { chainabuse: { status: 'unavailable' } }
  });
  const guarded = applyGroundingGuard('This is a money-laundering operation with no Chainabuse reports.', 'Why?', evidence);
  assert.equal(guarded.groundingGuardApplied, true);
  assert.doesNotMatch(guarded.answer, /money.laundering|no Chainabuse reports/i);
  assert.match(guarded.answer, /report status is unknown/i);
});

test('Copilot receives deterministic fraud-network evidence and rejects invented case IDs', async () => {
  let requestBody = null;
  const relatedId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  const inventedId = 'dddddddddddddddddddddddd';
  const client = {
    get: async () => ({ data: { data: [{ id: 'openai/gpt-oss-20b', active: true }] } }),
    post: async (_url, body) => { requestBody = body; return { data: { choices: [{ message: { content: `Related case ${inventedId} shares infrastructure.` } }] } }; }
  };
  const investigation = {
    investigation_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', start_wallet: wallet, transactions: [], paths: [], risk: { score: 0, level: 'LOW' },
    fraud_network: { summary: { related_investigations: 1 }, related_cases: [{ case_id: relatedId, case_label: 'CASE-BBBBBB', similarity_score: 25, reasons: [{ message: `Common intermediary: ${other}`, points: 25 }], shared_wallets: [other], shared_intermediaries: [other], shared_destinations: [], shared_entities: [], evidence: {} }] }
  };
  const result = await new GroqCopilotService({ apiKey: 'test-key', client }).answer('Which cases are related?', investigation);
  assert.match(requestBody.messages[1].content, new RegExp(relatedId));
  assert.equal(result.grounding_guard_applied, true);
  assert.doesNotMatch(result.answer, new RegExp(inventedId));
  assert.match(result.answer, /CASE-BBBBBB/);
});
