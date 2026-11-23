/**
 * Utility functions for parsing Snapdeal PDF invoices for SKU Inventory Reconciliation.
 */

import {
  isGenuineCompanyName,
  DEFAULT_IGNORED_COMPANIES,
  normalizeCanonicalCompanyName
} from '../lib/companyNameUtils.js';

/**
 * Checks a candidate string against an originMap (e.g. Master SKU map).
 */
function checkOrigin(raw, originMap) {
  if (!originMap || originMap.size === 0 || !raw) return null;
  const clean = raw.replace(/^[:|,]+|[:|,]+$/g, '').trim().toLowerCase();
  if (originMap.has(clean)) return raw.replace(/^[:|,]+|[:|,]+$/g, '').trim();
  const norm = clean.replace(/\s+/g, ' ');
  if (originMap.has(norm)) return raw.replace(/^[:|,]+|[:|,]+$/g, '').trim();
  return null;
}

/**
 * Extracts ALL items (SKU and Quantity) from a Snapdeal invoice / shipping label page.
 * Supports multi-item pages where multiple SKUs are listed with individual quantities.
 * Returns: [{ sku: string, qty: number }]
 */
export function extractSnapdealItems(lines, pageText = '', pageNum = 1, originMap = null) {
  const items = [];

  // 1. Check for "SKU CODE: <SKU>" blocks in Tax Invoice
  const skuCodeIndices = [];
  lines.forEach((line, idx) => {
    if (/SKU\s*CODE\s*:/i.test(line)) {
      skuCodeIndices.push(idx);
    }
  });

  if (skuCodeIndices.length > 0) {
    for (let k = 0; k < skuCodeIndices.length; k++) {
      const idx = skuCodeIndices[k];
      const line = lines[idx];
      const match = line.match(/SKU\s*CODE\s*:\s*(.+)$/i);
      let val = '';
      if (match && match[1]) {
        val = match[1].split(/\b(?:COLOR|PACK|ORDER|HSN|SUBORDER|SIZE|QTY|RATE)\b/i)[0];
        val = val.replace(/^[:|,]+|[:|,]+$/g, '').trim();
      }

      let sku = val;
      if (originMap && originMap.size > 0 && val) {
        const matched = checkOrigin(val, originMap);
        if (matched) {
          sku = matched;
        } else {
          const tokens = val.split(/\s+/).filter(Boolean);
          let testSku = '';
          for (let t = 0; t < tokens.length; t++) {
            testSku = t === 0 ? tokens[0] : `${testSku} ${tokens[t]}`;
            const tokenMatched = checkOrigin(testSku, originMap);
            if (tokenMatched) {
              sku = testSku;
              break;
            }
          }
        }
      }

      // Quantity for this SKU:
      // Look forward up to the next SKU CODE or up to 10 lines
      const nextIdx = (k + 1 < skuCodeIndices.length) ? skuCodeIndices[k + 1] : Math.min(idx + 10, lines.length);
      let qty = 1;
      let qtyFound = false;

      for (let j = idx + 1; j < nextIdx; j++) {
        const l = lines[j].trim();
        // Check for line starting with quantity followed by price e.g. "1 389.08 389.08" or "2 328.32 656.64"
        const qtyRateMatch = l.match(/^(\d+)\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?/);
        if (qtyRateMatch) {
          const q = parseInt(qtyRateMatch[1], 10);
          if (q > 0 && q < 1000) {
            qty = q;
            qtyFound = true;
            break;
          }
        }
        // Or if previous line was HSN: \d+, and current line starts with number
        if (/HSN\s*:/i.test(lines[j - 1] || '')) {
          const singleNumMatch = l.match(/^(\d+)(?:\s+|$)/);
          if (singleNumMatch) {
            const q = parseInt(singleNumMatch[1], 10);
            if (q > 0 && q < 1000) {
              qty = q;
              qtyFound = true;
              break;
            }
          }
        }
      }

      // If only 1 SKU on the page and table qty wasn't found or was 1, check TOTAL ITEMS
      if (skuCodeIndices.length === 1 && !qtyFound) {
        const totalItemsMatch = (pageText || lines.join(' ')).match(/TOTAL\s*ITEMS\s*(\d+)/i);
        if (totalItemsMatch) {
          const q = parseInt(totalItemsMatch[1], 10);
          if (!Number.isNaN(q) && q > 0) qty = q;
        }
      }

      if (sku) {
        items.push({ sku, qty });
      }
    }
  }

  // 2. If no items from SKU CODE, check shipping label table rows containing '|'
  if (items.length === 0) {
    const pipeLineIndex = lines.findIndex(line =>
      line.includes('|') && !/PRODUCT\s+NAME|SUBORDER\s+CODE/i.test(line.slice(line.indexOf('|') + 1))
    );
    if (pipeLineIndex > -1) {
      const line = lines[pipeLineIndex];
      const afterPipe = line.slice(line.indexOf('|') + 1).trim();

      let candidate = '';
      if (afterPipe.length > 0) {
        candidate = afterPipe;
      } else if (pipeLineIndex + 1 < lines.length) {
        candidate = lines[pipeLineIndex + 1]?.trim() || '';
      }

      if (candidate) {
        let qty = 1;
        const endNumMatch = candidate.match(/\s+(\d+)\s*$/);
        if (endNumMatch) {
          qty = parseInt(endNumMatch[1], 10);
        }

        const tokens = candidate.split(/\s+/).filter(Boolean);
        let sku = '';

        if (originMap && originMap.size > 0) {
          let testSku = '';
          for (let t = 0; t < Math.min(tokens.length, 6); t++) {
            testSku = t === 0 ? tokens[0] : `${testSku} ${tokens[t]}`;
            const matched = checkOrigin(testSku, originMap);
            if (matched) {
              sku = testSku;
              break;
            }
          }
        }

        if (!sku) {
          const withoutQty = candidate.replace(/\s+\d+\s*$/, '').trim();
          if (withoutQty) {
            const partsByDoubleSpace = withoutQty.split(/\s{2,}/);
            if (partsByDoubleSpace[0]) {
              const cleanPart = partsByDoubleSpace[0].replace(/^[:|,]+|[:|,]+$/g, '').trim();
              if (cleanPart) sku = cleanPart;
            }
            if (!sku) sku = withoutQty.replace(/^[:|,]+|[:|,]+$/g, '').trim();
          }
        }

        if (sku) {
          items.push({ sku, qty: (Number.isNaN(qty) || qty <= 0) ? 1 : qty });
        }
      }
    }
  }

  // 3. Fallback: Check lines after SUBORDER CODE or PRODUCT NAME header
  if (items.length === 0) {
    const headerIndex = lines.findIndex(line =>
      /SUBORDER\s+CODE|PRODUCT\s+NAME/i.test(line)
    );
    if (headerIndex > -1) {
      for (let j = headerIndex + 1; j < Math.min(headerIndex + 5, lines.length); j++) {
        const row = lines[j]?.trim();
        if (!row || /^(?:QUANTITY|SELLER|GSTIN|PRICE|TOTAL|MRP|ITEM|CASH|AMOUNT)/i.test(row)) continue;

        const tokens = row.split(/\s+/).filter(Boolean);
        let sku = '';

        if (originMap && originMap.size > 0) {
          let testSku = '';
          for (let t = 0; t < Math.min(tokens.length, 6); t++) {
            testSku = t === 0 ? tokens[0] : `${testSku} ${tokens[t]}`;
            const matched = checkOrigin(testSku, originMap);
            if (matched) {
              sku = testSku;
              break;
            }
          }
        }

        if (!sku) {
          const cleanRow = row.replace(/\s+\d+\s*$/, '').trim();
          const parts = cleanRow.split(/\s{2,}/);
          if (parts[0] && !parts[0].includes(':') && parts[0].length > 1) {
            sku = parts[0].replace(/^[:|,]+|[:|,]+$/g, '').trim();
          } else if (tokens[0] && !tokens[0].includes(':') && tokens[0].length > 1) {
            sku = tokens[0].replace(/^[:|,]+|[:|,]+$/g, '').trim();
          }
        }

        if (sku) {
          items.push({ sku, qty: 1 });
          break;
        }
      }
    }
  }

  if (items.length === 0) {
    items.push({ sku: `Page_${pageNum}`, qty: 1 });
  }

  return items;
}

export function extractSnapdealSKU(lines, i, originMap = null) {
  const items = extractSnapdealItems(lines, '', i, originMap);
  return items[0]?.sku || `Page_${i}`;
}

export function extractSnapdealQuantity(lines, pageText = '') {
  const totalItemsMatch = (pageText || lines.join(' ')).match(/TOTAL\s*ITEMS\s*(\d+)/i);
  if (totalItemsMatch) {
    const q = parseInt(totalItemsMatch[1], 10);
    if (!Number.isNaN(q) && q > 0) return q;
  }

  const pipeLineIndex = lines.findIndex(line => line.includes('|'));
  if (pipeLineIndex > -1) {
    for (let j = pipeLineIndex; j < Math.min(pipeLineIndex + 3, lines.length); j++) {
      const line = lines[j]?.trim();
      const endNumMatch = line?.match(/\s+(\d+)\s*$/);
      if (endNumMatch) {
        const q = parseInt(endNumMatch[1], 10);
        if (!Number.isNaN(q) && q > 0 && q < 1000) return q;
      }
    }
  }

  return 1;
}

export function extractSnapdealCompany(lines, pageText = '') {
  const cleanName = (name) => {
    if (!name) return null;
    let s = name.replace(/^[:|,\-\s]+|[:|,\-\s]+$/g, '').trim();
    if (!isGenuineCompanyName(s)) return null;
    return normalizeCanonicalCompanyName(s);
  };

  // 1. Table row with SELLER and GSTIN:
  for (const line of lines) {
    const gstinMatch = line.match(/(.+?)\s+([0-9]{2}[A-Z0-9]{13})\b/i);
    if (gstinMatch) {
      const beforeGstin = gstinMatch[1].trim();
      const parts = beforeGstin.split(/\s{2,}/);
      if (parts.length > 1) {
        const candidate = cleanName(parts[parts.length - 1]);
        if (candidate) return candidate;
      }
      const pipeIdx = beforeGstin.lastIndexOf('|');
      const textAfterPipe = pipeIdx > -1 ? beforeGstin.slice(pipeIdx + 1).trim() : beforeGstin;
      const tokens = textAfterPipe.split(/\s+/).filter(Boolean);
      if (tokens.length >= 2) {
        const companyTokens = tokens.slice(1).join(' ');
        const candidate = cleanName(companyTokens);
        if (candidate) return candidate;
      }
    }
  }

  // 2. Line immediately following "SELLER ADDRESS"
  const sellerAddrIndex = lines.findIndex(l => /SELLER\s+ADDRESS/i.test(l));
  if (sellerAddrIndex > -1) {
    for (let j = sellerAddrIndex + 1; j < Math.min(sellerAddrIndex + 3, lines.length); j++) {
      const candidate = cleanName(lines[j]);
      if (candidate && !/PLOT|SHOP|FLAT|ROOM|BLOCK|BUILDING|NEAR|ROAD|STREET|SURAT|AHMEDABAD|DELHI|MUMBAI|PIN/i.test(candidate)) {
        return candidate;
      }
    }
  }

  // 3. Tax Invoice "For <COMPANY>" or "SELLER BUYER"
  for (const line of lines) {
    const forMatch = line.match(/^For\s+([A-Za-z0-9\s.,'&_-]+?)(?:\s+Authorised|\s*$)/i);
    if (forMatch) {
      const candidate = cleanName(forMatch[1]);
      if (candidate) return candidate;
    }
  }
  const sellerBuyerIndex = lines.findIndex(l => /SELLER\s+BUYER/i.test(l));
  if (sellerBuyerIndex > -1) {
    const candidate = cleanName(lines[sellerBuyerIndex + 1]);
    if (candidate) return candidate;
  }

  // 4. Return Address / Return to / Ship from
  const returnMarkerIndex = lines.findIndex(line =>
    /if undelivered|return address|return to|ship from/i.test(line)
  );
  if (returnMarkerIndex > -1) {
    for (let j = returnMarkerIndex + 1; j < Math.min(returnMarkerIndex + 4, lines.length); j++) {
      const candidate = cleanName(lines[j]?.split(',')[0]);
      if (candidate && !/^\d+$/.test(candidate)) {
        return candidate;
      }
    }
  }

  // 5. Fallback: Check pageText for canonical brand indicators
  const fullTextUpper = (pageText || lines.join(' ')).toUpperCase();
  if (/CHINTAN\s+LALLUBHAI|DHANKECHA|ZXRIZ|ZXIRZ/i.test(fullTextUpper)) {
    return 'ZXRIZ';
  }
  if (/NORDIC\s+CREATION/i.test(fullTextUpper)) {
    return 'NORDIC CREATION';
  }

  return 'Unknown Company';
}

/**
 * Parses a Snapdeal shipping PDF and returns grouped inventory results:
 * { companyName: { sku1: totalQty1, sku2: totalQty2, ... }, ... }
 */
export async function parseSnapdealPDF({
  pdfFile,
  loadPdfJs,
  readFileAsArrayBuffer,
  reconstructLinesFromTextItems,
  onProgress,
}) {
  if (onProgress) onProgress(5, 'Reading Snapdeal PDF file...');

  const [pdfjsLib, pdfArrayBuffer] = await Promise.all([
    loadPdfJs(),
    readFileAsArrayBuffer(pdfFile),
  ]);

  if (onProgress) onProgress(10, 'Loading PDF library...');
  const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const results = {};

  for (let i = 1; i <= totalPages; i++) {
    const progress = 15 + Math.floor(((i / totalPages) * 75));
    if (onProgress) onProgress(progress, `Extracting data from page ${i} of ${totalPages}...`);

    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const lines = reconstructLinesFromTextItems(textContent.items || []);
    const pageText = (textContent.items || []).map(item => item.str || '').join(' ').toUpperCase();

    // Skip packing slip error pages
    if (/PACKSLIP\s+PRINT\s+FAILED|PRINT\s+FAILED/i.test(pageText)) {
      continue;
    }

    const items = extractSnapdealItems(lines, pageText, i);
    const companyName = extractSnapdealCompany(lines, pageText);

    // Skip pages where no genuine seller company name was identified
    if (!companyName || !isGenuineCompanyName(companyName)) {
      continue;
    }

    const hasInvoice = /TAX\s+INVOICE/i.test(pageText);
    const hasShippingLabel =
      /CASH\s+TO\s+BE\s+COLLECTED|AMOUNT\s+ALREADY\s+PAID/i.test(pageText) ||
      /SELLER\s+ADDRESS|SHIPPED\s+FROM/i.test(pageText) ||
      /DELIVERY\s+ADDRESS/i.test(pageText) ||
      /SNAPDEAL\s+REFERENCE/i.test(pageText) ||
      /SUBORDER\s+CODE|PRODUCT\s+NAME/i.test(pageText);
    if (hasInvoice && !hasShippingLabel) {
      continue;
    }

    const validItems = items.filter(it => it.sku && !it.sku.startsWith('Page_'));
    if (validItems.length === 0) continue;

    if (!results[companyName]) {
      results[companyName] = {};
    }

    for (const item of validItems) {
      const validQty = (Number.isNaN(item.qty) || item.qty <= 0) ? 1 : item.qty;
      results[companyName][item.sku] = (results[companyName][item.sku] || 0) + validQty;
    }
  }

  if (Object.keys(results).length === 0) {
    throw new Error('No valid Snapdeal labels found in this PDF. Make sure you are uploading a Snapdeal shipping label PDF.');
  }

  return results;
}
