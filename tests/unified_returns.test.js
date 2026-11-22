import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import {
  isUnifiedReturnsFile,
  classifyReturnType,
  parseRscanDate,
  parseUnifiedReturnsRows
} from '../lib/unifiedReturnsParser.js';

test('Unified Returns: isUnifiedReturnsFile detection', () => {
  // Positive cases
  assert.equal(isUnifiedReturnsFile(['platform', 'return_type', 'Store', 'sku']), true);
  assert.equal(isUnifiedReturnsFile(['Sub Order No', 'return_type', 'awb']), true);
  assert.equal(isUnifiedReturnsFile({ platform: 'MEESHO', return_type: 'RETURN', sku: 'abc' }), true);
  assert.equal(isUnifiedReturnsFile({ 'Sub Order No': '123', status: 'Return', Store: 'Ornexa' }), true);

  // Negative cases (standard 3-column excel)
  assert.equal(isUnifiedReturnsFile(['SKU', 'Quantity', 'Company']), false);
  assert.equal(isUnifiedReturnsFile(['Style Id', 'Qty', 'Seller Name']), false);
  assert.equal(isUnifiedReturnsFile({ SKU: 'xyz', Quantity: 5, Company: 'Test' }), false);
});

test('Unified Returns: classifyReturnType handles all known types', () => {
  // RTO types
  assert.equal(classifyReturnType('Courier Return (RTO)'), 'rto');
  assert.equal(classifyReturnType('Courier_Return (Snapdeal)'), 'rto');
  assert.equal(classifyReturnType('Courier_Return'), 'rto');
  assert.equal(classifyReturnType('RTO'), 'rto');

  // Customer Return types
  assert.equal(classifyReturnType('Customer Return'), 'customer');
  assert.equal(classifyReturnType('RETURN'), 'customer');
  assert.equal(classifyReturnType('RETURN (Snapdeal)'), 'customer');
  assert.equal(classifyReturnType('EXCHANGE'), 'customer');
  assert.equal(classifyReturnType('Buyer_Return'), 'customer');
  assert.equal(classifyReturnType('Buyer_Return (Snapdeal)'), 'customer');
  assert.equal(classifyReturnType('POST_EXCHANGE_RETURN'), 'customer');

  // Unknown / irrelevant
  assert.equal(classifyReturnType('Delivered'), null);
  assert.equal(classifyReturnType(''), null);
  assert.equal(classifyReturnType(null), null);
});

test('Unified Returns: parseRscanDate formats correctly', () => {
  assert.equal(parseRscanDate('19-11-2026  07:20 PM'), '2026-11-19');
  assert.equal(parseRscanDate('19-11-2026'), '2026-11-19');
  assert.equal(parseRscanDate('19/11/2026 14:00'), '2026-11-19');
  assert.equal(parseRscanDate('2026-11-19'), '2026-11-19');
  assert.equal(parseRscanDate(''), null);
  assert.equal(parseRscanDate(null), null);
});

test('Unified Returns: parseUnifiedReturnsRows synthetic deduplication and categorization', () => {
  const rows = [
    // Meesho RTO
    {
      platform: 'MEESHO',
      return_type: 'Courier Return (RTO)',
      'Sub Order No': 'SO_1',
      awb: 'AWB_1',
      platform_id: 'seller1@test.com',
      listing_sku: 'SKU_1',
      rscan_time: '19-11-2026 10:00 AM'
    },
    // Duplicate of previous packet (should be skipped)
    {
      platform: 'MEESHO',
      return_type: 'RTO',
      'Sub Order No': 'SO_1',
      awb: 'AWB_1',
      platform_id: 'seller1@test.com',
      listing_sku: 'SKU_1',
      rscan_time: '19-11-2026 10:05 AM'
    },
    // Meesho Customer Return
    {
      platform: 'MEESHO',
      return_type: 'Customer Return',
      'Sub Order No': 'SO_2',
      awb: 'AWB_2',
      platform_id: 'seller1@test.com',
      listing_sku: 'SKU_2',
      rscan_time: '19-11-2026 11:00 AM'
    },
    // Snapdeal RTO
    {
      platform: 'SNAPDEAL',
      return_type: 'Courier_Return',
      'Sub Order No': 'SO_3',
      awb: 'AWB_3',
      Store: 'SNAP_STORE_1',
      listing_sku: 'SKU_3',
      rscan_time: '19-11-2026 12:00 PM'
    },
    // Snapdeal Customer Return
    {
      platform: 'SNAPDEAL',
      return_type: 'Buyer_Return',
      'Sub Order No': 'SO_4',
      awb: 'AWB_4',
      Store: 'SNAP_STORE_1',
      listing_sku: 'SKU_4',
      rscan_time: '19-11-2026 01:00 PM'
    }
  ];

  const emailMappings = [
    { email: 'seller1@test.com', companyName: 'MEESHO_COMPANY_1' }
  ];

  const result = parseUnifiedReturnsRows(rows, { emailMappings });

  assert.equal(result.duplicatesSkipped, 1);
  assert.equal(result.counts.meeshoReturns, 1);
  assert.equal(result.counts.meeshoCustomerReturns, 1);
  assert.equal(result.counts.snapdealReturns, 1);
  assert.equal(result.counts.snapdealCustomerReturns, 1);
  assert.equal(result.counts.total, 4);
  assert.equal(result.primaryDate, '2026-11-19');

  // Verify company mapping
  assert.equal(result.meeshoReturns[0].companyName, 'MEESHO_COMPANY_1');
  assert.equal(result.snapdealReturns[0].companyName, 'SNAP_STORE_1');
});

test('Unified Returns: Real Order Report CSV validation matches Gaurav numbers', () => {
  const csvPath = '/Users/mehulshekhada/.gemini/antigravity/brain/b2b86074-32e9-4a20-835e-1f976246d16c/.user_uploaded/media_1795261761412_276d597f.csv';
  if (!fs.existsSync(csvPath)) {
    console.log('Skipping real CSV test: file not found on disk');
    return;
  }

  const fileBuf = fs.readFileSync(csvPath);
  const wb = XLSX.read(fileBuf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  assert.equal(rows.length, 1067);
  assert.equal(isUnifiedReturnsFile(rows[0]), true);

  const result = parseUnifiedReturnsRows(rows, { defaultDate: '2026-11-19' });

  // Exactly Gaurav's numbers:
  // Meesho RTO: 489
  // Meesho Customer: 525
  // Snapdeal RTO: 46
  // Snapdeal Customer: 5
  // Duplicates filtered: 2
  // Total RTO: 489 + 46 = 535
  // Total Customer: 525 + 5 = 530
  // Total saved: 1065
  assert.equal(result.duplicatesSkipped, 2, 'Should skip exactly 2 duplicate scans');
  assert.equal(result.counts.meeshoReturns, 489, 'Meesho RTO must be 489');
  assert.equal(result.counts.meeshoCustomerReturns, 525, 'Meesho Customer Return must be 525');
  assert.equal(result.counts.snapdealReturns, 46, 'Snapdeal RTO must be 46');
  assert.equal(result.counts.snapdealCustomerReturns, 5, 'Snapdeal Customer Return must be 5');
  assert.equal(result.counts.meeshoReturns + result.counts.snapdealReturns, 535, 'Total RTO must be 535');
  assert.equal(result.counts.meeshoCustomerReturns + result.counts.snapdealCustomerReturns, 530, 'Total Customer Return must be 530');
  assert.equal(result.counts.total, 1065, 'Total processed returns must be 1065');
  assert.equal(result.primaryDate, '2026-11-19', 'Primary date must be 2026-11-19');
});

test('Unified Returns: Option 2 user selected date priority override', () => {
  const rows = [
    {
      platform: 'MEESHO',
      return_type: 'Courier Return (RTO)',
      'Sub Order No': 'SO_OPT2_1',
      awb: 'AWB_OPT2_1',
      Store: 'TEST_STORE',
      listing_sku: 'SKU_OPT2',
      rscan_time: '19-11-2026 10:00 AM'
    }
  ];

  // User explicitly selects 2026-11-22 in the calendar UI
  const result = parseUnifiedReturnsRows(rows, {
    defaultDate: '2026-11-22',
    useSelectedDateOnly: true
  });

  assert.equal(result.primaryDate, '2026-11-22', 'Primary date must match user selected date');
  assert.equal(result.meeshoReturns[0].date, '2026-11-22', 'Order date must be set to user selected date');
});

test('Unified Returns: Multi-platform parsing including Flipkart and Myntra', () => {
  const multiPlatformRows = [
    // 1. Meesho RTO
    {
      platform: 'MEESHO',
      return_type: 'Courier Return (RTO)',
      'Sub Order No': 'SO_MEESHO_RTO',
      awb: 'AWB_M_RTO',
      Store: 'ORNEXA ENTERPRISE',
      listing_sku: 'SKU_MEESHO_1',
      rscan_time: '22-11-2026 10:00 AM'
    },
    // 2. Meesho Customer Return
    {
      platform: 'MEESHO',
      return_type: 'Customer Return',
      'Sub Order No': 'SO_MEESHO_CUST',
      awb: 'AWB_M_CUST',
      Store: 'ORNEXA ENTERPRISE',
      listing_sku: 'SKU_MEESHO_2',
      rscan_time: '22-11-2026 10:15 AM'
    },
    // 3. Snapdeal RTO
    {
      platform: 'SNAPDEAL',
      return_type: 'Courier_Return',
      'Sub Order No': 'SO_SNAP_RTO',
      awb: 'AWB_S_RTO',
      Store: 'NYALKARAN COSMO',
      listing_sku: 'SKU_SNAP_1',
      rscan_time: '22-11-2026 10:30 AM'
    },
    // 4. Snapdeal Customer Return
    {
      platform: 'SNAPDEAL',
      return_type: 'Buyer_Return',
      'Sub Order No': 'SO_SNAP_CUST',
      awb: 'AWB_S_CUST',
      Store: 'NYALKARAN COSMO',
      listing_sku: 'SKU_SNAP_2',
      rscan_time: '22-11-2026 10:45 AM'
    },
    // 5. Flipkart RTO
    {
      platform: 'FLIPKART',
      return_type: 'Courier Return (RTO)',
      'Sub Order No': 'SO_FK_RTO',
      awb: 'AWB_FK_RTO',
      Store: 'FLIPKART_STORE_1',
      listing_sku: 'SKU_FK_1',
      rscan_time: '22-11-2026 11:00 AM'
    },
    // 6. Flipkart Customer Return
    {
      platform: 'FLIPKART',
      return_type: 'Customer Return',
      'Sub Order No': 'SO_FK_CUST',
      awb: 'AWB_FK_CUST',
      Store: 'FLIPKART_STORE_1',
      listing_sku: 'SKU_FK_2',
      rscan_time: '22-11-2026 11:15 AM'
    },
    // 7. Myntra RTO
    {
      platform: 'MYNTRA',
      return_type: 'Courier_Return',
      'Sub Order No': 'SO_MYN_RTO',
      awb: 'AWB_MYN_RTO',
      Store: 'MYNTRA_STORE_1',
      listing_sku: 'SKU_MYN_1',
      rscan_time: '22-11-2026 11:30 AM'
    },
    // 8. Myntra Customer Return
    {
      platform: 'MYNTRA',
      return_type: 'RETURN',
      'Sub Order No': 'SO_MYN_CUST',
      awb: 'AWB_MYN_CUST',
      Store: 'MYNTRA_STORE_1',
      listing_sku: 'SKU_MYN_2',
      rscan_time: '22-11-2026 11:45 AM'
    }
  ];

  const result = parseUnifiedReturnsRows(multiPlatformRows, {
    defaultDate: '2026-11-22',
    useSelectedDateOnly: true
  });

  // Verify counts across all 4 platforms:
  assert.equal(result.counts.meeshoReturns, 1);
  assert.equal(result.counts.meeshoCustomerReturns, 1);
  assert.equal(result.counts.snapdealReturns, 1);
  assert.equal(result.counts.snapdealCustomerReturns, 1);
  assert.equal(result.counts.flipkartReturns, 1);
  assert.equal(result.counts.flipkartCustomerReturns, 1);
  assert.equal(result.counts.myntraReturns, 1);
  assert.equal(result.counts.myntraCustomerReturns, 1);
  assert.equal(result.counts.total, 8);

  // Verify platform assignment
  assert.equal(result.flipkartReturns[0].sku, 'SKU_FK_1');
  assert.equal(result.flipkartCustomerReturns[0].sku, 'SKU_FK_2');
  assert.equal(result.myntraReturns[0].sku, 'SKU_MYN_1');
  assert.equal(result.myntraCustomerReturns[0].sku, 'SKU_MYN_2');
});
