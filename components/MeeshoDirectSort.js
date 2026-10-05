import { useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Meesho Direct Sort (PDF Only – No Excel Required)
 *
 * Sorting logic:
 *   Single Qty (qty === 1): Sort by SKU → Delivery Partner → Seller Account Name
 *   Multiple Qty (qty > 1): Sort by SKU → Delivery Partner → Seller Account Name
 *   Final groups: Single Qty first, then Multiple Qty.
 *
 * Stamping:
 *   Bottom of each page: First LETTER of Seller Account Name in large bold font only.
 */
export default function MeeshoDirectSort({
  allowed,
  loading,
  setLoading,
  setError,
  setSuccess,
  setStatus,
  loadPdfJs,
  readFileAsArrayBuffer,
  reconstructLinesFromTextItems,
  parseCSV,
  parseExcel,
  findHeaderKeyInsensitive,
  readFileAsText,
}) {
  const [selectedPdfFile, setSelectedPdfFile] = useState(null);
  const [selectedCsvFile, setSelectedCsvFile] = useState(null);

  const DELIVERY_PARTNERS = [
    'ValmoPlus',
    'Valmo',
    'Xpress Bees',
    'XpressBees',
    'ShadowFax',
    'Shadowfax',
    'Delhivery',
    'Ecom Express',
    'EcomExpress',
    'DTDC',
    'BlueDart',
    'Blue Dart',
    'Ekart',
    'Ekart Logistics',
    'Meesho Supply Chain',
    'Wow Express',
    'Smartr',
    'Movin',
  ];

  /**
   * Extract SKU from Product Details table.
   * The table row looks like: "Bob1   Free Size   1   Black   3255246..."
   * We look for the line containing 'SKU' header, then take the next line's first token.
   */
  function extractSKU(lines) {
    // Find the SKU header line in Product Details table
    const skuHeaderIdx = lines.findIndex(line =>
      /^\s*SKU\s+Size\s+Qty/i.test(line) || line.includes('SKU')
    );
    if (skuHeaderIdx === -1) return null;
    // The data row is the next non-empty line
    for (let i = skuHeaderIdx + 1; i < Math.min(skuHeaderIdx + 5, lines.length); i++) {
      const row = lines[i]?.trim();
      if (row && row.length > 0) {
        // Split by 2+ spaces (tab-like separation in PDF text)
        const parts = row.split(/\s{2,}/);
        if (parts[0] && parts[0].trim().length > 0) {
          return parts[0].trim();
        }
      }
    }
    return null;
  }

  /**
   * Extract Qty from Product Details table.
   * Table row: "SKU   Size   Qty   Color   OrderNo"
   * Data row:  "Bob1  Free Size  1  Black  3255..."
   */
  function extractQuantity(lines) {
    // Find the header line with Qty column
    const headerIdx = lines.findIndex(line =>
      /^\s*SKU\s+Size\s+Qty/i.test(line) || (/SKU/i.test(line) && /Qty/i.test(line))
    );
    if (headerIdx !== -1) {
      // Determine column index of Qty in header
      const header = lines[headerIdx].trim();
      const headerParts = header.split(/\s{2,}/);
      const qtyColIdx = headerParts.findIndex(h => /^qty$/i.test(h.trim()));
      // Get data row
      for (let i = headerIdx + 1; i < Math.min(headerIdx + 5, lines.length); i++) {
        const row = lines[i]?.trim();
        if (row && row.length > 0) {
          const dataParts = row.split(/\s{2,}/);
          if (qtyColIdx >= 0 && dataParts[qtyColIdx] !== undefined) {
            const q = parseInt(dataParts[qtyColIdx], 10);
            if (!isNaN(q) && q > 0) return q;
          }
          // Fallback: find a standalone number in the row (column 2)
          for (let c = 1; c < dataParts.length; c++) {
            const n = parseInt(dataParts[c], 10);
            if (!isNaN(n) && n >= 1 && n <= 999) return n;
          }
        }
      }
    }
    // Fallback: old approach
    const qtyIndex = lines.findIndex(line => line.includes('Qty'));
    if (qtyIndex !== -1) {
      const qty1 = lines[qtyIndex + 1]?.trim()?.split(/\s{2,}/)?.[2]?.trim()?.split(' ')?.[0];
      const n = parseInt(qty1, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return 1;
  }

  /**
   * Extract Store Name from the "If undelivered, return to:" section.
   * This is the SHORT business name (e.g. "Bistro Sales", "ShreeShopee").
   * It appears as the FIRST line right after the "If undelivered, return to:" text.
   */
  function extractStoreName(lines) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/if undelivered.*return to/i.test(line)) {
        // The store name is the next non-empty line
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const candidate = lines[j]?.trim();
          if (candidate && candidate.length > 1 && !/\d{6}|floor|road|opp|near|soc|chowk/i.test(candidate)) {
            return candidate;
          }
        }
      }
    }
    return 'Unknown';
  }

  /**
   * Extract Seller Account Name from the Tax Invoice section.
   * Pattern: "Sold by : VAGHASIYA SHARDABEN MANSUKHBHAI"
   */
  function extractSellerAccountName(lines) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Match "Sold by :" or "Sold by:" (case insensitive)
      const match = line.match(/sold\s+by\s*:\s*(.+)/i);
      if (match) {
        const name = match[1].trim();
        if (name.length > 1) return name;
        // Name might be on the next line
        const nextLine = lines[i + 1]?.trim();
        if (nextLine && nextLine.length > 1) return nextLine;
      }
    }
    // Fallback: line before GSTIN
    const gstinIdx = lines.findIndex(l => /GSTIN/i.test(l));
    if (gstinIdx > 1) {
      for (let j = gstinIdx - 1; j >= Math.max(0, gstinIdx - 3); j--) {
        const candidate = lines[j].trim();
        if (candidate.length > 2 && !/\d{6}|^\d|\bpin\b|\bstate\b|\bdistrict\b/i.test(candidate)) {
          return candidate;
        }
      }
    }
    return 'Unknown';
  }

  /**
   * Extract Delivery Partner from label text.
   * The delivery partner (e.g. "Delhivery") appears prominently in the top-right of the label.
   */
  function extractDeliveryPartner(lines) {
    const fullText = lines.join(' ').toLowerCase();
    const sorted = [...DELIVERY_PARTNERS].sort((a, b) => b.length - a.length);
    for (const dp of sorted) {
      if (fullText.includes(dp.toLowerCase())) return dp;
    }
    return 'Unknown';
  }

  const handleDirectSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setStatus('Preparing files...');

    try {
      const pdfFile = event.target['direct-pdf'].files[0];
      const dataFile = event.target['direct-csv'].files[0];
      if (!pdfFile || !dataFile) throw new Error('Please select both PDF and CSV/Excel files');

      const isExcel = /\.(xlsx|xls)$/i.test(dataFile.name);
      
      setStatus('Loading files...');
      const [pdfjsLib, pdfArrayBuffer, csvData] = await (async () => {
        const [lib, pdfBuf] = await Promise.all([
          loadPdfJs(),
          readFileAsArrayBuffer(pdfFile)
        ]);
        if (isExcel) {
          const dataBuf = await readFileAsArrayBuffer(dataFile);
          setStatus('Parsing Excel...');
          const data = parseExcel(dataBuf);
          return [lib, pdfBuf, data];
        }
        setStatus('Parsing CSV...');
        const csvText = await readFileAsText(dataFile);
        return [lib, pdfBuf, parseCSV(csvText)];
      })();

      const skuKey = csvData.length ? findHeaderKeyInsensitive(csvData[0], 'SKU') : null;
      const originKey = csvData.length ? findHeaderKeyInsensitive(csvData[0], 'Origin') || findHeaderKeyInsensitive(csvData[0], 'origin') : null;

      setStatus('Reading PDF...');
      const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer });
      const pdf = await loadingTask.promise;

      const pageData = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        setStatus(`Analyzing page ${i} of ${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const lines = reconstructLinesFromTextItems(textContent.items || []);

        const hasCustomerAddress = lines.some(line =>
          line.toLowerCase().includes('customer address')
        );
        if (!hasCustomerAddress) continue;

        const sku = extractSKU(lines) || 'Unknown-SKU';
        const qty = extractQuantity(lines);
        const deliveryPartner = extractDeliveryPartner(lines);
        // storeName = short business name for stamping (e.g. "Bistro Sales")
        const storeName = extractStoreName(lines);
        // sellerAccount = legal name for sorting (e.g. "VAGHASIYA SHARDABEN MANSUKHBHAI")
        const sellerAccount = extractSellerAccountName(lines);

        let originName = 'Unknown Origin';
        if (skuKey) {
          const originRow = csvData.find(row => String(row[skuKey]).trim() === String(sku).trim());
          if (originRow && originKey) originName = originRow[originKey] || 'Unknown Origin';
        }

        pageData.push({ pageNumber: i, sku, qty, deliveryPartner, storeName, sellerAccount, originName });
      }

      if (pageData.length === 0) {
        throw new Error(
          'No shipping label pages found. Make sure the PDF contains pages with "Customer Address".'
        );
      }

      // Sort: single qty first, then multi; within group: originName → SKU → Delivery Partner → Seller
      pageData.sort((a, b) => {
        const aIsMulti = a.qty > 1 ? 1 : 0;
        const bIsMulti = b.qty > 1 ? 1 : 0;
        if (aIsMulti !== bIsMulti) return aIsMulti - bIsMulti;

        const originCmp = (a.originName || '').localeCompare(b.originName || '');
        if (originCmp !== 0) return originCmp;

        const skuCmp = (a.sku || '').localeCompare(b.sku || '');
        if (skuCmp !== 0) return skuCmp;

        const dpCmp = (a.deliveryPartner || '').localeCompare(b.deliveryPartner || '');
        if (dpCmp !== 0) return dpCmp;

        // Sort by Store Name (short business name, e.g. "Bistro Sales")
        return (a.storeName || '').localeCompare(b.storeName || '');
      });

      // Count occurrences of each origin (excluding "Unknown Origin")
      const originCounts = {};
      const firstOriginIndex = {}; // Track first occurrence index of each origin
      pageData.forEach((page, index) => {
        if (page.originName && page.originName !== 'Unknown Origin') {
          if (!originCounts[page.originName]) {
            originCounts[page.originName] = 0;
            firstOriginIndex[page.originName] = index;
          }
          originCounts[page.originName]++;
        }
      });

      setStatus('Building output PDF...');
      const sourcePdfDoc = await PDFDocument.load(pdfArrayBuffer);
      const outPdf = await PDFDocument.create();
      const boldFont = await outPdf.embedFont(StandardFonts.HelveticaBold);

      for (let i = 0; i < pageData.length; i++) {
        const pageInfo = pageData[i];
        const [copied] = await outPdf.copyPages(sourcePdfDoc, [pageInfo.pageNumber - 1]);
        const { width, height } = copied.getSize();

        // Stamp: letter mapped from Store Name list
        const storeNameMap = {
          'HRV Enterprise Fashion': 'H',
          'TF Watches': 'H',
          'ShreeShopee': 'H',
          'Shree Nathji Fashion143': 'J',
          'Bistro Sales': 'J',
          'YOLAKO SALES': 'Y',
          'JD FASHION ENTERPRISE': 'Y'
        };

        const storeName = (pageInfo.storeName || '').trim();
        let letterToStamp = '';
        
        for (const [key, val] of Object.entries(storeNameMap)) {
          if (storeName.toLowerCase() === key.toLowerCase()) {
            letterToStamp = val;
            break;
          }
        }
        
        // Fallback to first letter if not found in list
        if (!letterToStamp && storeName) {
          letterToStamp = storeName.charAt(0).toUpperCase();
        }

        if (letterToStamp && /[A-Z]/.test(letterToStamp)) {
          const fontSize = 48;
          const letterWidth = boldFont.widthOfTextAtSize(letterToStamp, fontSize);
          copied.drawText(letterToStamp, {
            x: (width * 0.38) - letterWidth, // Move further left into the Customer Address box
            y: height - 45, // Moved higher up to avoid covering address text
            size: fontSize,
            font: boldFont,
            color: rgb(0, 0, 0),
          });
        }

        // Draw Origin Name and Count at the bottom
        const isFirstOfOrigin = firstOriginIndex[pageInfo.originName] === i;
        const hasMultiplePages = originCounts[pageInfo.originName] > 1;
        const showCount = isFirstOfOrigin && hasMultiplePages && pageInfo.originName !== 'Unknown Origin';

        if (pageInfo.originName && pageInfo.originName !== 'Unknown Origin') {
          copied.drawText(`Origin : ${pageInfo.originName}`, { 
            x: 50, 
            y: 50, 
            size: 25, 
            font: boldFont,
            color: rgb(0, 0, 0)
          });
        }
        
        if (showCount) {
          const count = originCounts[pageInfo.originName];
          const countText = `(${count})`;
          const countFontSize = 24;
          
          const countWidth = boldFont.widthOfTextAtSize(countText, countFontSize);
          
          copied.drawText(countText, {
            x: width - countWidth - 50,
            y: 50,
            size: countFontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
          });
        }

        outPdf.addPage(copied);
      }

      const outBytes = await outPdf.save();
      const url = window.URL.createObjectURL(new Blob([outBytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'meesho_direct_sorted.pdf');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);

      setSuccess(true);
      setStatus(`Done! ${pageData.length} labels sorted & downloaded.`);
      setSelectedPdfFile(null);
      setSelectedCsvFile(null);
      if (event.target['direct-pdf']) event.target['direct-pdf'].value = '';
      if (event.target['direct-csv']) event.target['direct-csv'].value = '';
    } catch (err) {
      console.error('[MeeshoDirectSort]', err);
      setError(err.message || 'Processing failed');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      {allowed === false && (
        <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-sm text-yellow-700">
            This feature is disabled for your company. Please contact your admin.
          </p>
        </div>
      )}

      {/* Info banner */}
      <div className="mb-6 bg-pink-50 border border-pink-200 rounded-lg p-4 flex gap-3">
        <svg className="w-5 h-5 text-pink-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-pink-800 mb-1">Meesho Direct Sort</p>
          <ul className="text-xs text-pink-700 space-y-0.5 list-disc list-inside">
            <li><strong>Please use the same format columns in the Excel file (must include &apos;SKU&apos; and &apos;Origin&apos;).</strong></li>
            <li>Single Qty labels first → then Multiple Qty labels</li>
            <li>Within each group: sorted by Origin → SKU → Delivery Partner → Store Name</li>
            <li>Stamps <strong>mapped letter (e.g., Y, J, H)</strong> in large bold font at the top-right of Customer Address</li>
            <li>Stamps <strong>Origin Name</strong> and count at the bottom of the page</li>
          </ul>
        </div>
      </div>

      <form onSubmit={handleDirectSubmit} className="space-y-6">
        <div>
          <label htmlFor="direct-pdf" className="block text-sm font-medium text-gray-700 mb-2">
            Upload Meesho PDF File
          </label>
          <div
            className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors ${
              selectedPdfFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-pink-400'
            }`}
          >
            <div className="space-y-1 text-center w-full">
              {selectedPdfFile ? (
                <>
                  <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="mt-3 px-4 py-2 bg-green-100 rounded-lg border border-green-300">
                    <div className="flex items-center justify-start gap-2">
                      <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-semibold text-green-800 truncate" title={selectedPdfFile.name}>
                          {selectedPdfFile.name}
                        </div>
                        <div className="text-xs text-green-700 font-medium mt-0.5">
                          Size: {(selectedPdfFile.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                  </div>
                  <label htmlFor="direct-pdf" className="mt-2 block text-xs text-gray-500 cursor-pointer hover:text-pink-600">
                    Click to change file
                  </label>
                </>
              ) : (
                <>
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex justify-center text-sm text-gray-600">
                    <label htmlFor="direct-pdf" className="relative cursor-pointer bg-white rounded-md font-medium text-pink-600 hover:text-pink-500">
                      <span>Upload a PDF file</span>
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PDF up to 100 MB</p>
                </>
              )}
            </div>
          </div>
          <input
            type="file"
            id="direct-pdf"
            name="direct-pdf"
            accept=".pdf"
            required
            onChange={(e) => {
              const file = e.target.files?.[0];
              setSelectedPdfFile(file || null);
            }}
            className="sr-only"
          />
        </div>

        <div>
          <label htmlFor="direct-csv" className="block text-sm font-medium text-gray-700 mb-2">
            Upload CSV or Excel File
          </label>
          <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors ${
            selectedCsvFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-pink-400'
          }`}>
            <div className="space-y-1 text-center w-full">
              {selectedCsvFile ? (
                <>
                  <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="mt-3 px-4 py-2 bg-green-100 rounded-lg border border-green-300">
                    <div className="flex items-center justify-start gap-2">
                      <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-semibold text-green-800 truncate" title={selectedCsvFile.name}>
                          {selectedCsvFile.name}
                        </div>
                        <div className="text-xs text-green-700 font-medium mt-0.5">
                          Size: {(selectedCsvFile.size / 1024).toFixed(2)} KB
                        </div>
                      </div>
                    </div>
                  </div>
                  <label htmlFor="direct-csv" className="mt-2 block text-xs text-gray-500 cursor-pointer hover:text-pink-600">
                    Click to change file
                  </label>
                </>
              ) : (
                <>
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex justify-center text-sm text-gray-600">
                    <label htmlFor="direct-csv" className="relative cursor-pointer bg-white rounded-md font-medium text-pink-600 hover:text-pink-500">
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
            id="direct-csv"
            name="direct-csv"
            accept=".csv,.xlsx,.xls"
            required
            onChange={(e) => {
              const file = e.target.files?.[0];
              setSelectedCsvFile(file || null);
            }}
            className="sr-only"
          />
        </div>

        {/* Selected Files Summary */}
        {(selectedPdfFile || selectedCsvFile) && (
          <div className="p-3 bg-pink-50 border border-pink-200 rounded-lg">
            <p className="text-xs font-medium text-pink-700 mb-2">Ready to process:</p>
            <div className="space-y-1 text-xs">
              {selectedPdfFile && (
                <div className="flex items-center gap-2 text-pink-900">
                  <svg className="w-4 h-4 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">PDF:</span>
                  <span className="truncate">{selectedPdfFile.name}</span>
                </div>
              )}
              {selectedCsvFile && (
                <div className="flex items-center gap-2 text-pink-900">
                  <svg className="w-4 h-4 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">CSV:</span>
                  <span className="truncate">{selectedCsvFile.name}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || allowed === false || allowed === null || !selectedPdfFile || !selectedCsvFile}
          className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Sort &amp; Download PDF
            </>
          )}
        </button>
      </form>
    </div>
  );
}
