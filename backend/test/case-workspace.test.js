import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedSnapshot, caseCompleteness, integrityHash, validateStatusTransition } from '../services/case-workspace.js';

const base = { evidence_id: 'EV-0001', case_id: '65f3a0b8c5f8a34d9b1e0001', evidence_type: 'TRANSACTION', title: 'Observed transfer', source_type: 'provider', source_provider: 'Alchemy', source_reference: '0xabc', captured_at: '2026-09-29 12:00:00 UTC', transaction_hash: '0x123', snapshot: { amount: '1.25', asset: 'ETH' } };

test('evidence integrity hash is stable across object key ordering and changes on mutation', () => {
  assert.equal(integrityHash(base), integrityHash({ ...base, snapshot: { asset: 'ETH', amount: '1.25' } }));
  assert.notEqual(integrityHash(base), integrityHash({ ...base, snapshot: { amount: '2.00', asset: 'ETH' } }));
});

test('bounded snapshots retain object data without accepting oversized payloads', () => {
  assert.deepEqual(boundedSnapshot('TRANSACTION', { transaction_hash: '0xabc', value: 5 }), { transaction_hash: '0xabc' });
  assert.throws(() => boundedSnapshot('EXTERNAL_INTELLIGENCE', { reports: 'x'.repeat(51000) }), /snapshot_too_large/);
});

test('case workflow allows controlled close and reopen transitions', () => {
  assert.equal(validateStatusTransition('NEW', 'ACTIVE'), true);
  assert.equal(validateStatusTransition('ACTIVE', 'ESCALATED'), true);
  assert.equal(validateStatusTransition('ESCALATED', 'CLOSED'), true);
  assert.equal(validateStatusTransition('CLOSED', 'ACTIVE'), true);
  assert.equal(validateStatusTransition('NEW', 'ESCALATED'), false);
});

test('case completeness exposes missing investigator workflow steps', () => {
  const value = caseCompleteness({ investigation: { transactions: [1], risk: { score: 10 }, external_intelligence: {} }, evidenceCount: 0, noteCount: 0, findingCount: 0, monitoring: false, reportGenerated: false });
  assert.ok(value.completed < value.total);
  assert.ok(value.steps.some(item => item.id === 'evidence_selected' && !item.complete));
  assert.ok(value.steps.some(item => item.id === 'report_generated' && item.optional));
});
