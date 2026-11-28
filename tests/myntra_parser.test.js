import { test } from 'node:test';
import assert from 'node:assert/strict';

function getCleanMyntraSku(rawStr) {
  if (!rawStr) return '';
  let str = String(rawStr).trim();
  if (str.startsWith('[') && str.endsWith(']')) {
    str = str.substring(1, str.length - 1).trim();
  }
  const match = str.match(/^(.*?)\s*-\s*(\d+)?$/);
  if (match && (match[2] === undefined || /^\d+$/.test(match[2]))) {
    return match[1].trim();
  }
  return str;
}

function parseMyntraItems(lines, isTaxInvoice = false, textContentItems = null) {
  const items = [];
  const seen = new Set();

  const isAddressOrExcluded = (str) => {
    if (!str) return true;
    if (/\b(?:SURAT|GUJARAT|INDIA|DELHI|MUMBAI|MAHARASHTRA|RAJASTHAN|KERALA|ODISHA|BIHAR|PUNJAB|HARYANA|BENGAL|PRADESH|TAMIL|KARNATAKA|PLOT|PARK|STREET|ROAD|NAGAR|ASHRAM|SELLER|DETAILS|PPMP|RXMI|SUPPLY|NATURE|INVOICE|ORDER|PACKETID|CUSTOMER|BUYER|DECLARATION|RETURN|UNDELIVERED|PURCHASE|AMOUNT|DISCOUNT|TAXABLE|CGST|SGST|IGST|TOTAL|AUTHORIZED|SIGNATORY|CONTACTUS|CARE|APP|NORMAL|FWD|COD|PREPAID|MYNTRA|NULL|EK_E2E|DE_E2E|HSN|GSTIN|COSMETIC\s*KING|NORDIC\s*CREATION|VARNI\s*JEWELS|ZXRIZ|LAFORWORD|SHREEJI)\b/i.test(str)) {
      return true;
    }
    if (/PPMP|RXMI/i.test(str)) return true;
    if (str.includes(',') || /\b\d{5,6}\b/.test(str)) return true;
    if (/^(?:ON|COD|PREPAID|NORMAL\s*-\s*Fwd)$/i.test(str)) return true;
    if (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(str)) return true;
    return false;
  };

  const addItem = (cleanSku, qty = 1, isBracketed = false, x = undefined, y = undefined) => {
    if (!cleanSku || cleanSku.length < 2 || cleanSku.length > 40) return;
    if (isAddressOrExcluded(cleanSku)) return;
    if (qty > 50) return;

    const existing = items.find(it => it.sku.toLowerCase() === cleanSku.toLowerCase());
    if (existing) {
      existing.qty += qty;
      if (x !== undefined && existing.x === undefined) existing.x = x;
      if (y !== undefined && existing.y === undefined) existing.y = y;
    } else {
      items.push({ 
        sku: cleanSku, 
        displaySku: cleanSku, 
        searchStr: cleanSku, 
        qty,
        x,
        y
      });
    }
  };

  if (isTaxInvoice) {
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const invoiceItemMatch = trimmed.match(/[A-Za-z0-9]+\(([A-Za-z0-9_\.\-\s]+)\)\s*-\s*/);
      if (invoiceItemMatch) {
        const candidateSku = invoiceItemMatch[1].trim();
        let qty = 1;
        for (let k = i + 1; k < Math.min(i + 5, lines.length); k++) {
          const rowLine = (lines[k] || '').trim();
          const qtyMatch = rowLine.match(/^(\d+)\s+Rs\s+/i);
          if (qtyMatch) {
            qty = parseInt(qtyMatch[1], 10) || 1;
            break;
          }
        }
        addItem(getCleanMyntraSku(candidateSku), qty, false);
      }
    }
    return items;
  }

  if (textContentItems && textContentItems.length > 0) {
    const boxItems = textContentItems.filter(item => {
      const x = item.transform ? item.transform[4] : 0;
      const y = item.transform ? item.transform[5] : 0;
      return x < 150 && y >= 80 && y <= 185 && item.str.trim();
    });

    for (const item of boxItems) {
      const trimmed = item.str.trim();
      if (!trimmed || isAddressOrExcluded(trimmed)) continue;

      const slashMatch = trimmed.match(/^([A-Za-z0-9_\.\-]+(?:\s+[A-Za-z0-9_\.\-]+)*)\s*\/\s*(?:Onesize|Free\s*Size|Free|FS|OS|Pack|Set|Pcs|Piece|Standard|XXXL|XXL|XL|XS|[SML]|[0-9]+(?:\s*(?:mm|cm|inch|in|m|kg|g|ml))?|[0-9]+)\s*(?:-\s*(\d+))?$/i);
      if (slashMatch) {
        const qty = slashMatch[2] ? parseInt(slashMatch[2], 10) : 1;
        addItem(getCleanMyntraSku(slashMatch[1].trim()), qty, false, item.transform[4], item.transform[5]);
        continue;
      }

      const hyphenMatch = trimmed.match(/^([A-Za-z0-9_\.]{2,35}(?:\s+[A-Za-z0-9_\.]{2,35})?)\s*-\s*([1-9]\d{0,1})?$/);
      if (hyphenMatch) {
        const qty = hyphenMatch[2] ? parseInt(hyphenMatch[2], 10) : 1;
        addItem(getCleanMyntraSku(hyphenMatch[1].trim()), qty, false, item.transform[4], item.transform[5]);
        continue;
      }

      const bareMatch = trimmed.match(/^([A-Za-z0-9_\.]{2,35}(?:\s+[A-Za-z0-9_\.]{1,35})?)$/);
      if (bareMatch) {
        addItem(getCleanMyntraSku(bareMatch[1].trim()), 1, false, item.transform[4], item.transform[5]);
        continue;
      }
    }
  }

  if (items.length === 0 && lines && lines.length > 0) {
    const sellerIdx = lines.findIndex(l => /Seller Details|PPMP|PRODUCT NAME QUANTITY/i.test(l));
    const candidateLines = sellerIdx !== -1 ? lines.slice(sellerIdx) : lines;

    for (const line of candidateLines) {
      const trimmed = line.trim();
      if (!trimmed || isAddressOrExcluded(trimmed)) continue;

      const bracketMatches = [...trimmed.matchAll(/\[\s*([A-Za-z0-9_\-\/\.\s\+&,]+?)\s*\]/g)];
      if (bracketMatches.length > 0) {
        for (const match of bracketMatches) {
          const inside = match[1].trim();
          if (!inside.includes(')-(') && !inside.toLowerCase().includes('page')) {
            const parts = inside.includes('+') ? inside.split('+') 
                        : inside.includes(',') ? inside.split(',') 
                        : inside.includes('&') ? inside.split('&') 
                        : [inside];
            for (const part of parts) {
              let qty = 1;
              const matchQty = part.match(/-\s*(\d+)$/);
              if (matchQty) qty = parseInt(matchQty[1], 10) || 1;
              const cleanSku = getCleanMyntraSku(part);
              addItem(cleanSku, qty, true);
            }
          }
        }
        continue;
      }

      const slashMatch = trimmed.match(/^([A-Za-z0-9_\.\-]+(?:\s+[A-Za-z0-9_\.\-]+)*)\s*\/\s*(?:Onesize|Free\s*Size|Free|FS|OS|Pack|Set|Pcs|Piece|Standard|XXXL|XXL|XL|XS|[SML]|[0-9]+(?:\s*(?:mm|cm|inch|in|m|kg|g|ml))?|[0-9]+)\s*(?:-\s*(\d+))?$/i);
      if (slashMatch) {
        const candidateSku = slashMatch[1].trim();
        const qty = slashMatch[2] ? parseInt(slashMatch[2], 10) : 1;
        addItem(getCleanMyntraSku(candidateSku), qty, false);
        continue;
      }

      const hyphenMatch = trimmed.match(/^([A-Za-z0-9_\.]{2,35}(?:\s+[A-Za-z0-9_\.]{2,35})?)\s*-\s*([1-9]\d{0,1})?$/);
      if (hyphenMatch) {
        const candidateSku = hyphenMatch[1].trim();
        const qty = hyphenMatch[2] ? parseInt(hyphenMatch[2], 10) : 1;
        addItem(getCleanMyntraSku(candidateSku), qty, false);
        continue;
      }

      const bareMatch = trimmed.match(/^([A-Za-z0-9_\.]{2,35}(?:\s+[A-Za-z0-9_\.]{1,35})?)$/);
      if (bareMatch) {
        const candidateSku = bareMatch[1].trim();
        addItem(getCleanMyntraSku(candidateSku), 1, false);
        continue;
      }
    }
  }

  return items;
}

test('getCleanMyntraSku preserves hyphenated alphanumeric SKUs and only strips trailing quantities', () => {
  assert.equal(getCleanMyntraSku('2F-DMBJ-ZCPH'), '2F-DMBJ-ZCPH');
  assert.equal(getCleanMyntraSku('jw_613_DC_ZXRIZ'), 'jw_613_DC_ZXRIZ');
  assert.equal(getCleanMyntraSku('qc_53 - 2'), 'qc_53');
  assert.equal(getCleanMyntraSku('qc_53 -'), 'qc_53');
  assert.equal(getCleanMyntraSku('[el_1711 - 1]'), 'el_1711');
});

test('Myntra Parser: Never captures PIN codes or seller address lines as SKUs', () => {
  const invoiceLines = [
    'Tax Invoice',
    'Bill From: Ship From:',
    'COSMETIC KING ',
    'Plot No-5, Navkar Business Park-2, Navagam, Near Jivan Jyot ',
    'Manav Ashram, Kamrej, Surat, Surat, Gujarat, 394185, Surat, ',
    'GUJARAT-394185',
    'GSTIN Number:  24DBAPD3920E1ZE',
    'ZXRZJWST148711386(jw_613_DC_ZXRIZ) - ZXRIZ Gold-Plated Beaded Necklace, Size: ONESIZE',
    '1 Rs 1999.00 Rs 811.00 Rs 1153.40'
  ];

  const items = parseMyntraItems(invoiceLines, true);
  assert.equal(items.length, 1);
  assert.equal(items[0].sku, 'jw_613_DC_ZXRIZ');
  assert.equal(items[0].qty, 1);
  assert.ok(!items.some(i => i.sku.includes('GUJARAT') || i.qty > 50));
});

test('Myntra Parser: Extracts bare SKU correctly on Shipping Label with spatial coordinates', () => {
  const textContentItems = [
    { str: 'EK_E2E', transform: [1, 0, 0, 1, 8, 421] },
    { str: 'COSMETIC KING', transform: [1, 0, 0, 1, 209, 196] },
    { str: '394185, Surat - 394185, GUJARAT, India', transform: [1, 0, 0, 1, 8, 197] },
    { str: 'jw_613_DC_ZXRIZ', transform: [1, 0, 0, 1, 6, 171] }
  ];

  const items = parseMyntraItems([], false, textContentItems);
  assert.equal(items.length, 1);
  assert.equal(items[0].sku, 'jw_613_DC_ZXRIZ');
  assert.equal(items[0].qty, 1);
  assert.equal(items[0].x, 6);
  assert.equal(items[0].y, 171);
});

test('Myntra Parser: Extracts slash sizes and hyphenated SKUs correctly', () => {
  const lines1 = ['Seller Details...', 'ZXRIZ_PPMP_RXMI', 'ON', 'qc_25 / Pack'];
  const items1 = parseMyntraItems(lines1, false);
  assert.equal(items1.length, 1);
  assert.equal(items1[0].sku, 'qc_25');
  assert.equal(items1[0].qty, 1);

  const lines2 = ['Seller Details...', 'COD', 'el_1711 - 2'];
  const items2 = parseMyntraItems(lines2, false);
  assert.equal(items2.length, 1);
  assert.equal(items2[0].sku, 'el_1711');
  assert.equal(items2[0].qty, 2);
});

test('Myntra Parser: Correctly accumulates multi-quantity for identical SKU in invoices and labels', () => {
  // Test Invoice with 2 rows of same SKU
  const invoiceLines = [
    'LOODJWST119752185(qc_52) - LAFORWORD Gold-Plated Studded & Beaded Jewellery Set, Size: PACK',
    'HSN: 71171100, 3.0% IGST',
    '1 Rs 3000.00 Rs 2267.00 Rs 0.00 Rs 711.65 Rs 21.35 Rs 733.00',
    'LOODJWST119752185(qc_52) - LAFORWORD Gold-Plated Studded & Beaded Jewellery Set, Size: PACK',
    'HSN: 71171100, 3.0% IGST',
    '1 Rs 3000.00 Rs 2267.00 Rs 0.00 Rs 711.65 Rs 21.35 Rs 733.00',
    'TOTAL Rs 6000.00 Rs 4534.00 Rs 0.00 Rs 1423.30 Rs 42.70 Rs 1466.00'
  ];
  const invItems = parseMyntraItems(invoiceLines, true);
  assert.equal(invItems.length, 1);
  assert.equal(invItems[0].sku, 'qc_52');
  assert.equal(invItems[0].qty, 2);

  // Test Label with 2 lines of same SKU in bounding box
  const textContentItems = [
    { str: 'EK_E2E', transform: [1, 0, 0, 1, 8, 421] },
    { str: 'qc_52 / Pack', transform: [1, 0, 0, 1, 6, 171.45] },
    { str: 'qc_52 / Pack', transform: [1, 0, 0, 1, 6, 159.45] }
  ];
  const lblItems = parseMyntraItems([], false, textContentItems);
  assert.equal(lblItems.length, 1);
  assert.equal(lblItems[0].sku, 'qc_52');
  assert.equal(lblItems[0].qty, 2);
});
