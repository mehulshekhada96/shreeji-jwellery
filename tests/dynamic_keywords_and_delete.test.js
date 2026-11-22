import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyReturnType,
  parseUnifiedReturnsRows,
  DEFAULT_RETURN_KEYWORDS
} from '../lib/unifiedReturnsParser.js';

test('Dynamic Keywords: DEFAULT_RETURN_KEYWORDS contains RET as customer return', () => {
  assert.equal(DEFAULT_RETURN_KEYWORDS['RET'], 'customer');
  assert.equal(DEFAULT_RETURN_KEYWORDS['RETURN'], 'customer');
  assert.equal(DEFAULT_RETURN_KEYWORDS['FIRST_RET'], 'customer');
  assert.equal(DEFAULT_RETURN_KEYWORDS['SECOND_RET'], 'customer');
  assert.equal(DEFAULT_RETURN_KEYWORDS['RTO'], 'rto');
  assert.equal(DEFAULT_RETURN_KEYWORDS['COURIER_RETURN'], 'rto');
});

test('Dynamic Keywords: classifyReturnType resolves RET correctly', () => {
  assert.equal(classifyReturnType('RET'), 'customer');
  assert.equal(classifyReturnType('ret'), 'customer');
  assert.equal(classifyReturnType(' RET '), 'customer');
});

test('Dynamic Keywords: custom dynamic keyword mapping overrides default', () => {
  // If user explicitly maps a custom code
  const customMap = {
    'REPLACEMENT_CODE': 'customer',
    'LOST_IN_TRANSIT': 'rto'
  };
  assert.equal(classifyReturnType('REPLACEMENT_CODE', customMap), 'customer');
  assert.equal(classifyReturnType('LOST_IN_TRANSIT', customMap), 'rto');
});

test('Dynamic Keywords: parseUnifiedReturnsRows flags unrecognized words', () => {
  const rows = [
    {
      platform: 'MEESHO',
      return_type: 'SPECIAL_RET_EVENT',
      'Sub Order No': 'SO_UNKNOWN_1',
      awb: 'AWB_U1',
      Store: 'TEST_SELLER',
      listing_sku: 'SKU_U1'
    }
  ];

  const parsed = parseUnifiedReturnsRows(rows, { defaultDate: '2026-11-22' });
  assert.ok(parsed.unrecognizedReturnTypes.includes('SPECIAL_RET_EVENT'));
  assert.equal(parsed.counts.total, 0, 'Unrecognized rows should not be added until mapped');

  // Once mapped:
  const parsedWithMapping = parseUnifiedReturnsRows(rows, {
    defaultDate: '2026-11-22',
    customKeywords: { 'SPECIAL_RET_EVENT': 'customer' }
  });
  assert.equal(parsedWithMapping.unrecognizedReturnTypes.length, 0);
  assert.equal(parsedWithMapping.counts.meeshoCustomerReturns, 1);
  assert.equal(parsedWithMapping.counts.total, 1);
});
