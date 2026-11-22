/**
 * Utility functions for parsing Snapdeal PDF invoices for SKU Inventory Reconciliation.
 */

import { isGenuineCompanyName, DEFAULT_IGNORED_COMPANIES } from '../lib/companyNameUtils.js';

export function extractSnapdealSKU(lines, i, originMap = null) {
  const checkOrigin = (raw) => {
    if (!originMap || originMap.size === 0 || !raw) return null;
    const clean = raw.replace(/^[:|,]+|[:|,]+$/g, '').trim().toLowerCase();
    if (originMap.has(clean)) return raw.replace(/^[:|,]+|[:|,]+$/g, '').trim();
    const norm = clean.replace(/\s+/g, ' ');
    if (originMap.has(norm)) return raw.replace(/^[:|,]+|[:|,]+$/g, '').trim();
    return null;
  };

  // 1. Check for "SKU CODE: <SKU>" (common in tax invoices and combined Type 2 pages)
  for (const line of lines) {
    const match = line.match(/SKU\s*CODE\s*:\s*(.+)$/i);
    if (match && match[1]) {
      let val = match[1].split(/\b(?:COLOR|PACK|ORDER|HSN|SUBORDER|SIZE|QTY|RATE)\b/i)[0];
      val = val.replace(/^[:|,]+|[:|,]+$/g, '').trim();
      if (val) {
        if (originMap && originMap.size > 0) {
          const matched = checkOrigin(val);
          if (matched) return matched;
          const tokens = val.split(/\s+/).filter(Boolean);
          let testSku = '';
          for (let t = 0; t < tokens.length; t++) {
            testSku = t === 0 ? tokens[0] : `${testSku} ${tokens[t]}`;
            const tokenMatched = checkOrigin(testSku);
            if (tokenMatched) return testSku;
          }
        }
        return val;
      }
    }
  }

  // 2. Search for a line containing '|' (used in both SUBORDER CODE and PRODUCT NAME tables on shipping labels, skipping header rows)
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
      const tokens = candidate.split(/\s+/).filter(Boolean);

      // If we have an originMap, check if any prefix of tokens matches a known master SKU
      if (originMap && originMap.size > 0) {
        let testSku = '';
        for (let t = 0; t < Math.min(tokens.length, 6); t++) {
          testSku = t === 0 ? tokens[0] : `${testSku} ${tokens[t]}`;
          const matched = checkOrigin(testSku);
          if (matched) return testSku;
        }
      }

      // Remove trailing quantity digit: e.g. "DOUBLE MOR ER 1" -> "DOUBLE MOR ER", "el_1101 1" -> "el_1101"
      const withoutQty = candidate.replace(/\s+\d+\s*$/, '').trim();
      if (withoutQty) {
        const partsByDoubleSpace = withoutQty.split(/\s{2,}/);
        if (partsByDoubleSpace[0]) {
          const cleanPart = partsByDoubleSpace[0].replace(/^[:|,]+|[:|,]+$/g, '').trim();
          if (cleanPart) return cleanPart;
        }
        return withoutQty.replace(/^[:|,]+|[:|,]+$/g, '').trim();
      }

      const cleanFirstToken = (tokens[0] || '').replace(/^[:|,]+|[:|,]+$/g, '').trim();
      if (cleanFirstToken) return cleanFirstToken;
    }
  }

  // 3. Fallback: Check lines after SUBORDER CODE or PRODUCT NAME header
  const headerIndex = lines.findIndex(line =>
    /SUBORDER\s+CODE|PRODUCT\s+NAME/i.test(line)
  );
  if (headerIndex > -1) {
    for (let j = headerIndex + 1; j < Math.min(headerIndex + 5, lines.length); j++) {
      const row = lines[j]?.trim();
      if (!row || /^(?:QUANTITY|SELLER|GSTIN|PRICE|TOTAL|MRP|ITEM|CASH|AMOUNT)/i.test(row)) continue;

      const tokens = row.split(/\s+/).filter(Boolean);
      if (originMap && originMap.size > 0) {
        let testSku = '';
        for (let t = 0; t < Math.min(tokens.length, 6); t++) {
          testSku = t === 0 ? tokens[0] : `${testSku} ${tokens[t]}`;
          const matched = checkOrigin(testSku);
          if (matched) return testSku;
        }
      }

      const cleanRow = row.replace(/\s+\d+\s*$/, '').trim();
      const parts = cleanRow.split(/\s{2,}/);
      if (parts[0] && !parts[0].includes(':') && parts[0].length > 1) {
        const firstPart = parts[0].replace(/^[:|,]+|[:|,]+$/g, '').trim();
        if (firstPart) return firstPart;
      }

      if (tokens[0] && !tokens[0].includes(':') && tokens[0].length > 1) {
        return tokens[0].replace(/^[:|,]+|[:|,]+$/g, '').trim();
      }
    }
  }

  return `Page_${i}`;
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

export function extractSnapdealCompany(lines) {
  const cleanName = (name) => {
    if (!name) return null;
    let s = name.replace(/^[:|,\-\s]+|[:|,\-\s]+$/g, '').trim();
    if (!isGenuineCompanyName(s)) return null;
    return s;
  };

  // 1. Table row with SELLER and GSTIN:
  // e.g. "PRODUCT NAME SELLER GSTIN QUANTITY" or "SUBORDER CODE SELLER GSTIN QUANTITY"
  // Row: "el_1002_b NYALKARAN COSMO  24CPHPD1557F3Z6 1"
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

    const sku = extractSnapdealSKU(lines, i);
    const qty = extractSnapdealQuantity(lines, pageText);
    const companyName = extractSnapdealCompany(lines);

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
    const hasNoValidSKU = sku.startsWith('Page_');
    if (hasNoValidSKU) continue;

    if (!results[companyName]) {
      results[companyName] = {};
    }

    const validQty = (Number.isNaN(qty) || qty <= 0) ? 1 : qty;
    results[companyName][sku] = (results[companyName][sku] || 0) + validQty;
  }

  if (Object.keys(results).length === 0) {
    throw new Error('No valid Snapdeal labels found in this PDF. Make sure you are uploading a Snapdeal shipping label PDF.');
  }

  return results;
}
