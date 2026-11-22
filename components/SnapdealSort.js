import { useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { FaDatabase, FaCheckCircle, FaFileExcel, FaTimes, FaTrash } from 'react-icons/fa';
import { isGenuineCompanyName } from '../lib/companyNameUtils';

export default function SnapdealSort({
  allowed,
  loading,
  setLoading,
  setError,
  setSuccess,
  setStatus,
  loadPdfJs,
  readFileAsArrayBuffer,
  readFileAsText,
  parseCSV,
  parseExcel,
  findHeaderKeyInsensitive,
  reconstructLinesFromTextItems,
  masterSkus = [],
}) {
  const [selectedSnapdealPdfFile, setSelectedSnapdealPdfFile] = useState(null);
  const [selectedSnapdealCsvFile, setSelectedSnapdealCsvFile] = useState(null);
  const [hasCsvFile, setHasCsvFile] = useState(false);
  const [showManualCsv, setShowManualCsv] = useState(false);

  function extractSnapdealSKU(lines, i, originMap = null) {
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

  function extractSnapdealQuantity(lines, pageText = '') {
    // 1. Check for "TOTAL ITEMS <n>" in header block (present on all Snapdeal shipping labels)
    const totalItemsMatch = (pageText || lines.join(' ')).match(/TOTAL\s*ITEMS\s*(\d+)/i);
    if (totalItemsMatch) {
      const q = parseInt(totalItemsMatch[1], 10);
      if (!Number.isNaN(q) && q > 0) return q;
    }

    // 2. Check the table row (the quantity is the last integer column in the product table)
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

    // 3. Fallback: every shipping label has at least 1 item
    return 1;
  }

  function extractSnapdealCompany(lines) {
    const cleanName = (name) => {
      if (!name) return null;
      let s = name.replace(/^[:|,\-\s]+|[:|,\-\s]+$/g, '').trim();
      if (!isGenuineCompanyName(s)) return null;
      return s;
    };

    // 1. Table row with SELLER and GSTIN:
    // e.g. "el_1002_b NYALKARAN COSMO  24CPHPD1557F3Z6 1"
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

  const handleSnapdealSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setStatus('Preparing files...');

    try {
      const pdfFile = event.target.pdf_snapdeal.files[0];
      const csvFile = (showManualCsv || !masterSkus || masterSkus.length === 0)
        ? (event.target.csv_snapdeal?.files?.[0] || selectedSnapdealCsvFile || null)
        : null;
      if (!pdfFile) throw new Error('Please select a PDF file');

      const isExcel = csvFile && /\.(xlsx|xls)$/i.test(csvFile.name);
      const [pdfjsLib, pdfArrayBuffer, csvData] = await (async () => {
        const [lib, pdfBuf] = await Promise.all([
          loadPdfJs(),
          readFileAsArrayBuffer(pdfFile)
        ]);
        if (!csvFile) {
          if (masterSkus && masterSkus.length > 0) {
            return [lib, pdfBuf, masterSkus.map(s => ({ SKU: s.sku, Origin: s.origin, Size: s.size }))];
          }
          return [lib, pdfBuf, []];
        }
        if (isExcel) {
          const dataBuf = await readFileAsArrayBuffer(csvFile);
          setStatus('Parsing Excel...');
          const data = parseExcel(dataBuf);
          return [lib, pdfBuf, data];
        }
        setStatus('Parsing CSV...');
        const csvText = await readFileAsText(csvFile);
        return [lib, pdfBuf, parseCSV(csvText)];
      })();

      let skuKey = null;
      let originKey = null;

      if (csvData.length) {
        skuKey =
          (findHeaderKeyInsensitive && findHeaderKeyInsensitive(csvData[0], 'SKU')) ||
          Object.keys(csvData[0]).find(k => k.trim().toLowerCase() === 'sku') ||
          'SKU';
        originKey =
          (findHeaderKeyInsensitive &&
            (findHeaderKeyInsensitive(csvData[0], 'Origin') ||
              findHeaderKeyInsensitive(csvData[0], 'origin'))) ||
          Object.keys(csvData[0]).find(k => k.trim().toLowerCase() === 'origin') ||
          'Origin';
      }

      // Fast O(1) lookup Map for origin mapping (case-insensitive & trimmed)
      const originMap = new Map();
      if (csvData.length && skuKey && originKey) {
        for (const row of csvData) {
          const rawSku = String(row[skuKey] || '').trim();
          if (rawSku) {
            const lowerK = rawSku.toLowerCase();
            const originVal = String(row[originKey] || '').trim();
            if (!originMap.has(lowerK)) {
              originMap.set(lowerK, originVal);
            }
            const normK = lowerK.replace(/\s+/g, ' ');
            if (!originMap.has(normK)) {
              originMap.set(normK, originVal);
            }
          }
        }
      }

      setStatus('Reading PDF...');
      const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;

      const pageData = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const lines = reconstructLinesFromTextItems(textContent.items || []);
        const pageText = (textContent.items || []).map(item => item.str || '').join(' ').toUpperCase();

        // Skip packing slip error pages
        if (/PACKSLIP\s+PRINT\s+FAILED|PRINT\s+FAILED/i.test(pageText)) {
          continue;
        }

        const sku = extractSnapdealSKU(lines, i, originMap);
        const qty = extractSnapdealQuantity(lines, pageText);
        const company = extractSnapdealCompany(lines) || 'Zzzzz';

        // Pure invoice page has TAX INVOICE but does not have shipping label keywords
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

        let originName = 'Unknown Origin';
        const cleanSku = String(sku || '').trim().toLowerCase();
        const normSku = cleanSku.replace(/\s+/g, ' ');
        if (originMap.has(cleanSku)) {
          originName = originMap.get(cleanSku) || originName;
        } else if (originMap.has(normSku)) {
          originName = originMap.get(normSku) || originName;
        }

        pageData.push({ pageNumber: i, sku, qty, originName, company });
      }

      const UNKNOWN_ORIGIN = 'Unknown Origin';
      const isUnknown = (o) => (o || '') === UNKNOWN_ORIGIN;
      const hasValidCsv = Boolean(csvData && csvData.length > 0);

      pageData.sort((a, b) => {
        if (hasValidCsv) {
          // 1) Known origins first, Unknown Origin last
          const aUnknown = isUnknown(a.originName);
          const bUnknown = isUnknown(b.originName);
          if (aUnknown !== bUnknown) return aUnknown ? 1 : -1; // known first (a unknown → a after b)

          // 2) Both Unknown Origin: sort by SKU
          if (aUnknown && bUnknown) {
            return (a.sku || '').localeCompare(b.sku || '');
          }

          // 3) Both known: sort by origin name, then qty, then company
          if (a.originName !== b.originName) return a.originName.localeCompare(b.originName);
          if (a.qty !== b.qty) return a.qty - b.qty;
          return (a.company || '').localeCompare(b.company || '');
        } else {
          // No CSV: sort by quantity, then SKU, then company
          if (a.qty !== b.qty) return a.qty - b.qty;
          if (a.sku !== b.sku) return a.sku.localeCompare(b.sku);
          return (a.company || '').localeCompare(b.company || '');
        }
      });

      // Track first occurrence of each origin (with CSV) or SKU (no CSV) to show total qty badge
      const firstOriginIndex = {};
      const originTotalQty = {};
      const firstSkuIndex = {};
      const skuTotalQty = {};

      pageData.forEach((page, i) => {
        if (hasValidCsv) {
          if (firstOriginIndex[page.originName] === undefined) firstOriginIndex[page.originName] = i;
          originTotalQty[page.originName] = (originTotalQty[page.originName] || 0) + (page.qty || 0);
        } else {
          if (firstSkuIndex[page.sku || ''] === undefined) firstSkuIndex[page.sku || ''] = i;
          skuTotalQty[page.sku || ''] = (skuTotalQty[page.sku || ''] || 0) + (page.qty || 0);
        }
      });

      setStatus('Building output PDF...');

      const sourcePdfDoc = await PDFDocument.load(pdfArrayBuffer);
      const outPdf = await PDFDocument.create();
      const font = await outPdf.embedFont(StandardFonts.HelveticaBold);

      const { width, height } = sourcePdfDoc.getPage(0).getSize();

      for (let i = 0; i < pageData.length; i++) {
        const pageInfo = pageData[i];
        const page = await pdf.getPage(pageInfo.pageNumber);
        const textContent = await page.getTextContent();
        const pageText = (textContent.items || []).map(it => it.str || '').join(' ').toUpperCase();

        const hasInvoice = /TAX\s+INVOICE/i.test(pageText);
        const hasShippingLabel =
          /CASH\s+TO\s+BE\s+COLLECTED|AMOUNT\s+ALREADY\s+PAID/i.test(pageText) ||
          /SELLER\s+ADDRESS|SHIPPED\s+FROM/i.test(pageText) ||
          /DELIVERY\s+ADDRESS/i.test(pageText) ||
          /SNAPDEAL\s+REFERENCE/i.test(pageText) ||
          /SUBORDER\s+CODE|PRODUCT\s+NAME/i.test(pageText);
        const isCombinedPage = hasInvoice && hasShippingLabel;
        const cropWidth = isCombinedPage ? width * 0.45 : width;

        let minY = height;
        for (const item of textContent.items || []) {
          if (item.str && Number(item.str) === pageInfo.pageNumber) {
            continue;
          }
          if (item.transform?.length >= 6 && item.transform[4] < cropWidth) {
            minY = Math.min(minY, item.transform[5]);
          }
        }

        const cropBottom = isCombinedPage ? Math.max(0, minY - 40) : 0;
        const cropHeight = height - cropBottom;

        const [copied] = await outPdf.copyPages(sourcePdfDoc, [pageInfo.pageNumber - 1]);
        if (isCombinedPage) {
          copied.setCropBox(0, cropBottom, cropWidth, cropHeight);
        }

        const labelText = hasValidCsv
          ? `Origin: ${pageInfo.originName}`
          : `SKU: ${pageInfo.sku} | Qty: ${pageInfo.qty}`;
        const textY = isCombinedPage ? cropBottom + 10 : 10;
        copied.drawText(labelText, {
          x: 10,
          y: textY,
          size: 14,
          font,
          color: rgb(0, 0, 0),
        });

        // On first page of each origin (with CSV) or each SKU (no CSV), show total qty badge
        const isFirstOfOrigin = hasValidCsv && firstOriginIndex[pageInfo.originName] === i && pageInfo.originName !== 'Unknown Origin';
        const isFirstOfSku = !hasValidCsv && firstSkuIndex[pageInfo.sku || ''] === i;
        const totalQty = isFirstOfOrigin
          ? originTotalQty[pageInfo.originName]
          : isFirstOfSku
            ? skuTotalQty[pageInfo.sku || '']
            : null;
        if (totalQty != null) {
          const totalText = `Total Qty: ${totalQty}`;
          const totalWidth = font.widthOfTextAtSize(totalText, 14);
          copied.drawText(totalText, {
            x: cropWidth - totalWidth - 20,
            y: cropBottom + 10,
            size: 14,
            font,
            color: rgb(0, 0, 1),
          });
        }

        outPdf.addPage(copied);
      }

      const outBytes = await outPdf.save();
      const url = URL.createObjectURL(new Blob([outBytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfFile.name.replace(/\.pdf$/i, '') + '_sorted.pdf';
      link.click();

      setSuccess(true);
      setStatus('Done. File downloaded.');
    } catch (err) {
      setError(err.message || 'Processing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      {allowed === false && (
        <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-sm text-yellow-700">This feature is disabled for your company. Please contact your admin.</p>
        </div>
      )}
      <form onSubmit={handleSnapdealSubmit} encType="multipart/form-data" className="space-y-6">
        <div>
          <label htmlFor="pdf_snapdeal" className="block text-sm font-medium text-gray-700 mb-2">
            Upload PDF File <span className="text-red-500">*</span>
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-blue-400 transition-colors">
            <div className="space-y-1 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex text-sm text-gray-600">
                <label htmlFor="pdf_snapdeal" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                  <span>Upload a file</span>
                  <input
                    type="file"
                    id="pdf_snapdeal"
                    name="pdf_snapdeal"
                    accept=".pdf"
                    required
                    onChange={(e) => {
                      const file = e.target.files[0];
                      setSelectedSnapdealPdfFile(file);
                    }}
                    className="sr-only"
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">PDF up to 25MB</p>
              {selectedSnapdealPdfFile && (
                <div className="mt-3 flex items-center gap-2 text-blue-900 bg-blue-50 p-2 rounded">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">Selected:</span>
                  <span className="truncate text-sm">{selectedSnapdealPdfFile.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div>
          {masterSkus && masterSkus.length > 0 ? (
            <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-blue-50/80 p-3.5 sm:p-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-600 text-white rounded-lg shadow-xs flex-shrink-0">
                    <FaDatabase className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-900">Company Master File</span>
                      <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-300 inline-flex items-center gap-1">
                        <FaCheckCircle className="w-3 h-3 text-emerald-600" />
                        {masterSkus.length.toLocaleString()} SKUs Loaded
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {selectedSnapdealCsvFile
                        ? "⚠️ Manual file uploaded below will override Master File for this run."
                        : "✓ Automatically mapping Origin from Company Master File."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto bg-white/80 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-blue-200 shadow-2xs">
                  <span className="text-xs font-semibold text-gray-700">Add manual file:</span>
                  <button
                      type="button"
                      role="switch"
                      aria-checked={showManualCsv}
                      onClick={() => {
                        const next = !showManualCsv;
                        setShowManualCsv(next);
                        if (!next) {
                          setSelectedSnapdealCsvFile(null);
                          setHasCsvFile(false);
                        }
                      }}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        showManualCsv ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          showManualCsv ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

              {/* Expandable Manual CSV/Excel Upload Area */}
              {showManualCsv && (
                <div className="mt-3 pt-3 border-t border-blue-200/80">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="csv_snapdeal" className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Upload Override CSV or Excel File (Optional)
                    </label>
                    {selectedSnapdealCsvFile && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSnapdealCsvFile(null);
                          setHasCsvFile(false);
                        }}
                        className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 font-medium cursor-pointer"
                      >
                        <FaTimes className="w-3 h-3" />
                        <span>Remove file</span>
                      </button>
                    )}
                  </div>
                  <div className={`flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors bg-white ${
                    selectedSnapdealCsvFile ? 'border-green-400 bg-green-50/50' : 'border-gray-300 hover:border-blue-400'
                  }`}>
                    <div className="space-y-1 text-center w-full">
                      {selectedSnapdealCsvFile ? (
                        <div className="flex items-center justify-center gap-2 text-green-900">
                          <FaFileExcel className="w-5 h-5 text-green-600" />
                          <span className="text-sm font-semibold truncate">{selectedSnapdealCsvFile.name}</span>
                          <span className="text-xs text-gray-500">({(selectedSnapdealCsvFile.size / 1024).toFixed(1)} KB)</span>
                        </div>
                      ) : (
                        <>
                          <svg className="mx-auto h-10 w-10 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <div className="flex justify-center text-sm text-gray-600">
                            <label htmlFor="csv_snapdeal" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                              <span>Upload a file</span>
                            </label>
                            <p className="pl-1">or drag and drop</p>
                          </div>
                          <p className="text-xs text-gray-500">CSV or Excel (.xlsx, .xls)</p>
                        </>
                      )}
                    </div>
                  </div>
                  <input
                    type="file"
                    id="csv_snapdeal"
                    name="csv_snapdeal"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files[0] || null;
                      setSelectedSnapdealCsvFile(file);
                      setHasCsvFile(e.target.files.length > 0);
                    }}
                    className="sr-only"
                  />
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                <label htmlFor="csv_snapdeal" className="block text-sm font-medium text-gray-700">
                  Upload CSV or Excel (Optional)
                </label>
                <span className="text-sm text-gray-500">Required columns: <strong>SKU</strong>, <strong>Origin</strong>.</span>
              </div>
              <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg transition-colors ${
                selectedSnapdealCsvFile ? 'border-green-400 bg-green-50' : 'hover:border-blue-400'
              }`}>
                <div className="space-y-1 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex text-sm text-gray-600">
                    <label htmlFor="csv_snapdeal" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                      <span>Upload a file</span>
                      <input
                        type="file"
                        id="csv_snapdeal"
                        name="csv_snapdeal"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => {
                          const file = e.target.files[0] || null;
                          setSelectedSnapdealCsvFile(file);
                          setHasCsvFile(e.target.files.length > 0);
                        }}
                        className="sr-only"
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">CSV or Excel (.xlsx, .xls)</p>
                  {selectedSnapdealCsvFile && (
                    <div className="mt-3 flex items-center gap-2 text-green-900 bg-green-50 p-2 rounded">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="font-medium">Selected:</span>
                      <span className="truncate text-sm">{selectedSnapdealCsvFile.name}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 p-2.5 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-800">
                  ℹ Without CSV or Master File, sorting will be done by quantity, SKU, and company.
                </p>
              </div>
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || allowed === false || allowed === null || !selectedSnapdealPdfFile}
          className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            'Process Snapdeal PDF'
          )}
        </button>
      </form>
    </div>
  );
}

