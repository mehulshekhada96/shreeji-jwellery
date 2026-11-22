import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isGenuineCompanyName,
  DEFAULT_IGNORED_COMPANIES,
  NON_GENUINE_COMPANY_REGEX,
  buildIgnoredCompanyDbFilter
} from '../lib/companyNameUtils.js';

import {
  extractSnapdealSKU,
  extractSnapdealQuantity,
  extractSnapdealCompany
} from '../utils/snapdealInventoryParser.js';

test('Suite 1: isGenuineCompanyName validation', async (t) => {
  await t.test('rejects marketplace error banners and workflow artifacts', () => {
    assert.equal(isGenuineCompanyName('PACKSLIP PRINT FAILED FOR ONE OR MORE PACKAGES'), false);
    assert.equal(isGenuineCompanyName('PACKSLIP PRINT FAILED'), false);
    assert.equal(isGenuineCompanyName('TAX INVOICE'), false);
    assert.equal(isGenuineCompanyName('DELIVERY ADDRESS'), false);
    assert.equal(isGenuineCompanyName('SELLER ADDRESS'), false);
    assert.equal(isGenuineCompanyName('SHIPPED FROM'), false);
    assert.equal(isGenuineCompanyName('TOTAL ITEMS'), false);
    assert.equal(isGenuineCompanyName('CASH TO BE COLLECTED'), false);
  });

  await t.test('rejects payment modes and calculation totals', () => {
    assert.equal(isGenuineCompanyName('COD'), false);
    assert.equal(isGenuineCompanyName('PREPAID'), false);
    assert.equal(isGenuineCompanyName('CASH ON DELIVERY'), false);
    assert.equal(isGenuineCompanyName('TOTAL'), false);
    assert.equal(isGenuineCompanyName('GRAND TOTAL'), false);
    assert.equal(isGenuineCompanyName('SUBTOTAL'), false);
  });

  await t.test('rejects standalone courier names', () => {
    assert.equal(isGenuineCompanyName('DELHIVERY'), false);
    assert.equal(isGenuineCompanyName('SHADOWFAX'), false);
    assert.equal(isGenuineCompanyName('EKART'), false);
    assert.equal(isGenuineCompanyName('XPRESSBEES'), false);
    assert.equal(isGenuineCompanyName('BLUEDART'), false);
  });

  await t.test('rejects long sentence text and conversational phrases', () => {
    assert.equal(isGenuineCompanyName('THIS IS A VERY LONG TEXT THAT IS DEFINITELY NOT A COMPANY'), false);
    assert.equal(isGenuineCompanyName('PLEASE VISIT OUR WEBSITE FOR MORE DETAILS'), false);
  });

  await t.test('accepts genuine business seller company names', () => {
    assert.equal(isGenuineCompanyName('NORDIC CREATION'), true);
    assert.equal(isGenuineCompanyName('ZXRIZ'), true);
    assert.equal(isGenuineCompanyName('NYALKARAN COSMO'), true);
    assert.equal(isGenuineCompanyName('SHREEJI'), true);
    assert.equal(isGenuineCompanyName('JAY KHODAL CREATION'), true);
    assert.equal(isGenuineCompanyName('Cosmetic King'), true);
    assert.equal(isGenuineCompanyName('AKIRA_FASHION'), true);
  });
});

test('Suite 2: Database Filter buildIgnoredCompanyDbFilter', async (t) => {
  await t.test('generates valid $not regex that blocks non-genuine names', () => {
    const filter = buildIgnoredCompanyDbFilter(DEFAULT_IGNORED_COMPANIES);
    assert.ok(filter.$not instanceof RegExp);

    const regex = filter.$not;
    assert.equal(regex.test('PACKSLIP PRINT FAILED FOR ONE OR MORE PACKAGES'), true);
    assert.equal(regex.test('COD'), true);
    assert.equal(regex.test('PREPAID'), true);
    assert.equal(regex.test('TOTAL'), true);
    assert.equal(regex.test('TAX INVOICE'), true);

    // Genuine company names should NOT match the rejection pattern
    assert.equal(regex.test('NORDIC CREATION'), false);
    assert.equal(regex.test('ZXRIZ'), false);
    assert.equal(regex.test('NYALKARAN COSMO'), false);
  });
});

test('Suite 3: Snapdeal SKU Extraction (Multi-word & Origin Map)', async (t) => {
  const originMap = new Map();
  originMap.set('double mor er', 'DOUBLE MOR ORIGIN');
  originMap.set('140 vali+ multi keri', 'KERI ORIGIN');
  originMap.set('el_1002_b', 'EARRING ORIGIN');

  await t.test('extracts multi-word SKU from product table row with pipe', () => {
    const lines = [
      'SUBORDER CODE | PRODUCT NAME SELLER GSTIN QTY',
      'SO123456 | DOUBLE MOR ER 1',
      'NYALKARAN COSMO 24CPHPD1557F3Z6'
    ];
    const sku = extractSnapdealSKU(lines, 1, originMap);
    assert.equal(sku, 'DOUBLE MOR ER');
  });

  await t.test('extracts multi-word SKU containing special chars', () => {
    const lines = [
      'SUBORDER CODE | PRODUCT NAME SELLER GSTIN QTY',
      'SO999999 | 140 VALI+ MULTI KERI 2'
    ];
    const sku = extractSnapdealSKU(lines, 1, originMap);
    assert.equal(sku, '140 VALI+ MULTI KERI');
  });

  await t.test('extracts standard alphanumeric SKU', () => {
    const lines = [
      'SUBORDER CODE | PRODUCT NAME SELLER GSTIN QTY',
      'SO555555 | el_1002_b 3'
    ];
    const sku = extractSnapdealSKU(lines, 1, originMap);
    assert.equal(sku, 'el_1002_b');
  });

  await t.test('extracts SKU from SKU CODE: prefix in tax invoice / Type 2 label', () => {
    const lines = [
      'TAX INVOICE',
      'SKU CODE: DOUBLE MOR ER COLOR: GOLD PACK: 1',
      'ORDER DATE: 2026-11-15'
    ];
    const sku = extractSnapdealSKU(lines, 1, originMap);
    assert.equal(sku, 'DOUBLE MOR ER');
  });
});

test('Suite 4: Snapdeal Quantity Extraction', async (t) => {
  await t.test('extracts quantity from TOTAL ITEMS header', () => {
    const lines = ['SNAPDEAL COURIER', 'DELIVERY ADDRESS', 'TOTAL ITEMS 5'];
    const qty = extractSnapdealQuantity(lines, 'SNAPDEAL COURIER TOTAL ITEMS 5');
    assert.equal(qty, 5);
  });

  await t.test('extracts quantity from table row ending digit', () => {
    const lines = [
      'SUBORDER CODE | PRODUCT NAME SELLER GSTIN QTY',
      'SO123456 | el_1002_b 3'
    ];
    const qty = extractSnapdealQuantity(lines, '');
    assert.equal(qty, 3);
  });

  await t.test('defaults to 1 when no quantity is explicitly specified', () => {
    const lines = ['SUBORDER CODE | el_1002_b'];
    const qty = extractSnapdealQuantity(lines, '');
    assert.equal(qty, 1);
  });
});

test('Suite 5: Snapdeal Company Extraction', async (t) => {
  await t.test('extracts genuine seller from GSTIN product row', () => {
    const lines = [
      'SUBORDER CODE | PRODUCT NAME SELLER GSTIN QUANTITY',
      'SO1001 | el_1002_b NYALKARAN COSMO 24CPHPD1557F3Z6 1'
    ];
    const comp = extractSnapdealCompany(lines);
    assert.equal(comp, 'NYALKARAN COSMO');
  });

  await t.test('extracts genuine seller from SELLER ADDRESS line', () => {
    const lines = [
      'SELLER ADDRESS:',
      'NORDIC CREATION',
      'PLOT 45, DIAMOND PARK, SURAT 395006'
    ];
    const comp = extractSnapdealCompany(lines);
    assert.equal(comp, 'NORDIC CREATION');
  });

  await t.test('extracts genuine seller from For <COMPANY> signatory line', () => {
    const lines = [
      'TAX INVOICE',
      'For ZXRIZ Authorised Signatory'
    ];
    const comp = extractSnapdealCompany(lines);
    assert.equal(comp, 'ZXRIZ');
  });

  await t.test('does NOT match buyer address containing Shreeji or Jay Khodal', () => {
    const lines = [
      'DELIVERY ADDRESS:',
      'KUMAR PATEL',
      'B-202, SHREEJI ENCLAVE, NEAR JAY KHODAL COMPLEX',
      'AHMEDABAD 380015',
      'SELLER ADDRESS:',
      'NORDIC CREATION',
      'SURAT 395006'
    ];
    const comp = extractSnapdealCompany(lines);
    assert.equal(comp, 'NORDIC CREATION');
  });
});

test('Suite 6: Error Page & Label Type Detection RegEx', async (t) => {
  await t.test('detects packslip print failed error pages', () => {
    const errorPageText = 'SNAPDEAL PACKSLIP PRINT FAILED FOR ONE OR MORE PACKAGES ERROR CODE 500';
    const isError = /PACKSLIP\s+PRINT\s+FAILED|PRINT\s+FAILED/i.test(errorPageText);
    assert.equal(isError, true);
  });

  await t.test('detects Type 2 combined label with whitespace variations', () => {
    const pageText = 'TAX INVOICE   DELIVERY   ADDRESS   SELLER   ADDRESS';
    const hasInvoice = /TAX\s+INVOICE/i.test(pageText);
    const hasShippingLabel =
      /CASH\s+TO\s+BE\s+COLLECTED|AMOUNT\s+ALREADY\s+PAID/i.test(pageText) ||
      /SELLER\s+ADDRESS|SHIPPED\s+FROM/i.test(pageText) ||
      /DELIVERY\s+ADDRESS/i.test(pageText) ||
      /SNAPDEAL\s+REFERENCE/i.test(pageText) ||
      /SUBORDER\s+CODE|PRODUCT\s+NAME/i.test(pageText);

    assert.equal(hasInvoice, true);
    assert.equal(hasShippingLabel, true);
  });
});

test('Suite 7: Platform Query Isolation Logic', async (t) => {
  await t.test('builds isolated platform query for meesho vs snapdeal', () => {
    const buildPlatformQuery = (platform) => {
      const q = {};
      if (platform === 'meesho') {
        q.platform = { $in: ['meesho', null, ''] };
      } else if (platform) {
        q.platform = platform;
      }
      return q;
    };

    const snapdealQuery = buildPlatformQuery('snapdeal');
    assert.equal(snapdealQuery.platform, 'snapdeal');

    const meeshoQuery = buildPlatformQuery('meesho');
    assert.deepEqual(meeshoQuery.platform, { $in: ['meesho', null, ''] });
  });
});

