/**
 * Utility functions for parsing Snapdeal PDF invoices for SKU Inventory Reconciliation.
 */

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

  // 2. Search for a line containing '|' (used in both SUBORDER CODE and PRODUCT NAME tables on shipping labels)
  const pipeLineIndex = lines.findIndex(line => line.includes('|'));
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

// Known Snapdeal seller companies — used as a reliable fallback match
const KNOWN_COMPANIES = [
  'SHREEJI', 'SHREEJI NEW', 'Cosmetic King', 'AKIRA_FASHION', 'Gajanand_Enterprise',
  'ZXRIZ', 'JEWELL SWERA CREATION', 'BHAKTI CREATION', "LA'KAILASHA", 'ghanshyam_enterprise',
  'FOREIGN FALCON', 'HAYAAT ENTERPRISE', 'SERENA JEWELLERY', 'SAHJANAND ENTERPRISSE',
  'NORDIC CREATION', 'KARMA_ENTERPRISE', 'SUVRAT ENTERPRISE', 'SAHAJ JEWELLERY',
  'JAY KHODAL CREATION', 'SUNSHINECREATION', 'Ornexa Enterprise',
];

export function extractSnapdealCompany(lines) {
  // DEBUG: log lines to console so we can identify the company line
  if (typeof window !== 'undefined') {
    console.log('[SnapdealCompany] First 20 lines:', lines.slice(0, 20));
  }

  // Strategy 1: Find "Return Address" / "Return to" / "If undelivered" — next non-empty line is company
  const returnMarkerIndex = lines.findIndex(line =>
    /if undelivered|return address|return to|ship from/i.test(line)
  );
  if (returnMarkerIndex > -1) {
    for (let j = returnMarkerIndex + 1; j < Math.min(returnMarkerIndex + 4, lines.length); j++) {
      const candidate = lines[j]?.trim();
      if (candidate && candidate.length > 1 && !/^\d+$/.test(candidate)) {
        return candidate.split(',')[0].trim();
      }
    }
  }

  // Strategy 2: Find "Sold By:" / "Seller:" anywhere on the page
  const soldByIndex = lines.findIndex(line => /sold\s*by|seller\s*:/i.test(line));
  if (soldByIndex > -1) {
    const line = lines[soldByIndex];
    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const afterColon = line.substring(colonIndex + 1).trim().split(',')[0].trim();
      if (afterColon && afterColon.length > 1) return afterColon;
    }
    const nextLine = lines[soldByIndex + 1]?.trim();
    if (nextLine && nextLine.length > 1) return nextLine.split(',')[0].trim();
  }

  // Strategy 3: Scan ALL lines for a known company name (case-insensitive match)
  const allText = lines.join('\n').toUpperCase();
  for (const company of KNOWN_COMPANIES) {
    if (allText.includes(company.toUpperCase())) {
      return company;
    }
  }

  // Strategy 4: Skip header/date/invoice lines and return first clean text line
  const skipPattern = /invoice|^\s*date\s*:|tax\s*invoice|suborder|order\s*no|gst|pincode|mobile|phone|^\d{6,}$|[\d]{2}[-\/][A-Za-z]{3}[-\/][\d]{4}|[\d]{2}-[A-Za-z]{3}-[\d]{4}|SC\d+\/|snapdeal/i;
  for (let i = 1; i < Math.min(20, lines.length); i++) {
    const line = lines[i]?.trim();
    if (line && !skipPattern.test(line) && line.length > 2 && line.length < 80) {
      return line;
    }
  }

  // Fallback
  return lines[3]?.trim() || 'Unknown Company';
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

    const sku = extractSnapdealSKU(lines, i);
    const qty = extractSnapdealQuantity(lines, pageText);
    const companyName = extractSnapdealCompany(lines) || 'Unknown Company';

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
