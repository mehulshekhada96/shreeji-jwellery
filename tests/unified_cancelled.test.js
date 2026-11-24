import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import * as XLSX from 'xlsx';
import {
  isUnifiedCancelledFile,
  parseDateString,
  isCancelledRow,
  parseUnifiedCancelledRows
} from '../lib/unifiedCancelledParser.js';

test('isUnifiedCancelledFile detects unified orders / cancelled report format', () => {
  const rowWithPlatform = {
    platform: 'MEESHO',
    Store: 'Ornexa Enterprise',
    status: 'CANCELLED',
    'Sub Order No': '356030659549701056_1',
    listing_sku: 'op_1050'
  };
  assert.equal(isUnifiedCancelledFile(rowWithPlatform), true);

  const rowWithKeysArray = ['Store', 'credits', 'platform', 'status', 'Sub Order No', 'listing_sku'];
  assert.equal(isUnifiedCancelledFile(rowWithKeysArray), true);

  const rowNonUnified = {
    'Style Id': 'op_1050',
    Quantity: 1,
    Company: 'Ornexa Enterprise'
  };
  assert.equal(isUnifiedCancelledFile(rowNonUnified), false);
});

test('isCancelledRow accurately flags cancelled orders', () => {
  assert.equal(isCancelledRow({ status: 'CANCELLED' }), true);
  assert.equal(isCancelledRow({ status: 'Cancelled' }), true);
  assert.equal(isCancelledRow({ status: 'CANCELED' }), true);
  assert.equal(isCancelledRow({ cscan: 'YES' }), true);
  assert.equal(isCancelledRow({ packet_scan_status: 'CANCELLED' }), true);
  assert.equal(isCancelledRow({ status: 'DELIVERED', cscan: 'NO' }), false);
  assert.equal(isCancelledRow({ status: 'SHIPPED' }), false);
  assert.equal(isCancelledRow({}), false);
});

test('parseDateString handles multiple formats', () => {
  assert.equal(parseDateString('24-11-2026 11:34 AM'), '2026-11-24');
  assert.equal(parseDateString('22-11-2026'), '2026-11-22');
  assert.equal(parseDateString('2026-11-24'), '2026-11-24');
  assert.equal(parseDateString(''), null);
});

test('parseUnifiedCancelledRows on user uploaded CSV file', () => {
  const csvPath = '/Users/mehulshekhada/.gemini/antigravity/brain/b2b86074-32e9-4a20-835e-1f976246d16c/.user_uploaded/media_1795524307413_061ea179.csv';
  assert.equal(fs.existsSync(csvPath), true, 'CSV sample file must exist');

  const buf = fs.readFileSync(csvPath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  assert.equal(rows.length, 25, 'CSV must have 25 rows');

  const result = parseUnifiedCancelledRows(rows, {
    defaultDate: '2026-11-24',
    useSelectedDateOnly: true
  });

  assert.equal(result.success, true);
  assert.equal(result.primaryDate, '2026-11-24');
  assert.equal(result.counts.total, 25);
  assert.equal(result.counts.meeshoCancelled, 22);
  assert.equal(result.counts.snapdealCancelled, 3);
  assert.equal(result.counts.flipkartCancelled, 0);
  assert.equal(result.counts.myntraCancelled, 0);
  assert.equal(result.unmapped.length, 0, 'All genuine companies should be resolved');

  // Verify first Meesho cancelled order
  const firstMeesho = result.meeshoCancelled[0];
  assert.equal(firstMeesho.companyName, 'Ornexa Enterprise');
  assert.equal(firstMeesho.sku, 'op_1050');
  assert.equal(firstMeesho.quantity, 1);
  assert.equal(firstMeesho.subOrderNo, '356030659549701056_1');
  assert.equal(firstMeesho.date, '2026-11-24');

  // Verify first Snapdeal cancelled order
  const firstSnapdeal = result.snapdealCancelled[0];
  assert.equal(firstSnapdeal.companyName, 'CHINTAN LALLUBHAI DHANKECHA');
  assert.equal(firstSnapdeal.sku, 'svs_1019');
  assert.equal(firstSnapdeal.quantity, 1);
  assert.equal(firstSnapdeal.subOrderNo, '76580835293');
  assert.equal(firstSnapdeal.date, '2026-11-24');
});

test('parseUnifiedCancelledRows deduplicates identical rows', () => {
  const row = {
    platform: 'MEESHO',
    Store: 'ZXRIZ',
    status: 'CANCELLED',
    'Sub Order No': 'SUB123',
    awb: 'AWB999',
    listing_sku: 'SKU_ABC',
    qty: 1
  };

  const rows = [row, { ...row }, { ...row, 'Sub Order No': 'SUB124' }];
  const result = parseUnifiedCancelledRows(rows, { defaultDate: '2026-11-24' });

  assert.equal(result.counts.total, 2);
  assert.equal(result.duplicatesSkipped, 1);
});

test('parseUnifiedCancelledRows resolves company from emailMappings and flags non-genuine stores', () => {
  const rows = [
    {
      platform: 'FLIPKART',
      Store: 'PACKSLIP PRINT FAILED',
      platform_id: 'flipkart_store@domain.com',
      status: 'CANCELLED',
      'Sub Order No': 'FK123',
      listing_sku: 'FK_SKU_1',
      qty: 1
    },
    {
      platform: 'MYNTRA',
      Store: 'PACKSLIP PRINT FAILED',
      platform_id: 'COD',
      status: 'CANCELLED',
      'Sub Order No': 'MYN123',
      listing_sku: 'MYN_SKU_1',
      qty: 1
    }
  ];

  const emailMappings = [
    { email: 'flipkart_store@domain.com', companyName: 'Flipkart Genuine Seller' }
  ];

  const result = parseUnifiedCancelledRows(rows, {
    emailMappings,
    defaultDate: '2026-11-24'
  });

  assert.equal(result.counts.flipkartCancelled, 1);
  assert.equal(result.flipkartCancelled[0].companyName, 'Flipkart Genuine Seller');
  assert.equal(result.unmapped.length, 1);
  assert.equal(result.unmapped[0].store, 'PACKSLIP PRINT FAILED');
});
