import { useState } from 'react';
import { useRouter } from 'next/router';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { FaDatabase, FaExternalLinkAlt, FaCheckCircle, FaFileExcel, FaTimes, FaTrash } from 'react-icons/fa';

/**
 * Amazon Sort: PDF has 2 or 3 pages per order (label + invoice, or label + invoice + extra details).
 * - Detect order boundaries: label pages start a new order.
 * - Use only the first (label) page of each order in the output.
 * - Extract SKU and quantity from any invoice/detail page of that order.
 * - Optional CSV/Excel: maps SKUs to Origin, groups by origin, stamps package counts (1st page of origin only).
 * - Sort: Priority 0 (Single item), Priority 1 (Combo item), Origin Name (A-Z, Unknown last), SKU Name.
 */
export default function AmazonSort({
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
  findHeaderKeyInsensitive,
  reconstructLinesFromTextItems,
  masterSkus = [],
}) {
  const router = useRouter();
  const [selectedAmazonPdfFile, setSelectedAmazonPdfFile] = useState(null);
  const [selectedAmazonCsvFile, setSelectedAmazonCsvFile] = useState(null);
  const [hasCsvFile, setHasCsvFile] = useState(false);
  const [showManualCsv, setShowManualCsv] = useState(false);

  /** Helper to clean SKU for exact matching in Master CSV */
  function getCleanSku(rawStr) {
    if (!rawStr) return '';
    let str = String(rawStr).trim();
    if (str.startsWith('[') && str.endsWith(']')) {
      str = str.substring(1, str.length - 1).trim();
    }
    const match = str.match(/^(.*?)\s*-\s*([A-Za-z0-9]+)?$/);
    if (match) {
      return match[1].trim();
    }
    return str;
  }

  /** Extract quantity from second page (invoice). */
  function extractAmazonQuantity(pageText, lines, textItems) {
    const rupeeQtyRegex = /₹[^\s₹]+\s+(\d+)\s+₹/g;
    let matches = [...pageText.matchAll(rupeeQtyRegex)];
    if (matches.length > 0) {
      const total = matches.reduce((sum, m) => sum + (parseInt(m[1], 10) || 0), 0);
      if (total > 0) return total;
    }
    const allQtyRegex = /\b(?:Quantity|Qty)\s*:?\s*(\d+)/gi;
    matches = [...pageText.matchAll(allQtyRegex)];
    if (matches.length > 0) {
      const total = matches.reduce((sum, m) => sum + (parseInt(m[1], 10) || 0), 0);
      if (total > 0) return total;
    }
    const looseRegex = /\b(?:Quantity|Qty)[^\d]*?(\d+)/gi;
    matches = [...pageText.matchAll(looseRegex)];
    if (matches.length > 0) {
      const total = matches.reduce((sum, m) => sum + (parseInt(m[1], 10) || 0), 0);
      if (total > 0) return total;
    }
    if (textItems && textItems.length > 0) {
      let qtyX = null;
      for (const item of textItems) {
        const str = (item.str || '').trim().toLowerCase();
        if (str === 'qty' || str === 'quantity') {
          const x = item.transform?.[4];
          if (x !== undefined) {
            qtyX = qtyX === null ? x : Math.min(qtyX, x);
          }
        }
      }
      if (qtyX !== null) {
        const tolerance = 25;
        let total = 0;
        for (const item of textItems) {
          const str = (item.str || '').trim();
          const x = item.transform?.[4];
          if (x !== undefined && Math.abs(x - qtyX) <= tolerance && /^\d+$/.test(str)) {
            const n = parseInt(str, 10);
            if (n >= 1 && n <= 999) total += n;
          }
        }
        if (total > 0) return total;
      }
    }
    const qtyLineIdx = lines.findIndex(l => /Quantity|Qty/i.test(l));
    if (qtyLineIdx >= 0) {
      const n = lines[qtyLineIdx].match(/(\d+)/);
      if (n) return parseInt(n[1], 10);
      for (let i = qtyLineIdx + 1; i < Math.min(qtyLineIdx + 4, lines.length); i++) {
        const num = lines[i].match(/^\s*(\d+)\s*$/);
        if (num) return parseInt(num[1], 10);
      }
    }
    return 1;
  }

  const handleAmazonSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setStatus('Preparing PDF...');

    try {
      const pdfFile = event.target.pdf_amazon.files[0];
      const dataFile = (showManualCsv || !masterSkus || masterSkus.length === 0)
        ? (event.target.csv_amazon?.files?.[0] || selectedAmazonCsvFile || null)
        : null;
      if (!pdfFile) throw new Error('Please select a PDF file');

      const isExcel = dataFile ? /\.(xlsx|xls)$/i.test(dataFile.name) : false;
      const [pdfjsLib, pdfArrayBuffer, csvData] = await (async () => {
        const [lib, pdfBuf] = await Promise.all([
          loadPdfJs(),
          readFileAsArrayBuffer(pdfFile),
        ]);

        let data = [];
        if (dataFile) {
          if (isExcel) {
            setStatus('Parsing Excel...');
            const { read, utils } = await import('xlsx');
            const dataBuf = await readFileAsArrayBuffer(dataFile);
            const workbook = read(dataBuf, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            data = utils.sheet_to_json(firstSheet);
          } else if (readFileAsText && parseCSV) {
            setStatus('Parsing CSV...');
            const csvText = await readFileAsText(dataFile);
            data = parseCSV(csvText);
          }
        } else if (masterSkus && masterSkus.length > 0) {
          // Use Company Master SKU file
          data = masterSkus.map(s => ({ SKU: s.sku, Origin: s.origin, Size: s.size }));
        }
        return [lib, pdfBuf, data];
      })();

      const hasDataSource = Boolean(dataFile || (masterSkus && masterSkus.length > 0));
      const skuKey = csvData.length 
        ? (findHeaderKeyInsensitive ? findHeaderKeyInsensitive(csvData[0], 'SKU') : Object.keys(csvData[0]).find(k => k.toLowerCase() === 'sku')) 
        : null;
      const originKey = csvData.length 
        ? (findHeaderKeyInsensitive ? (findHeaderKeyInsensitive(csvData[0], 'Origin') || findHeaderKeyInsensitive(csvData[0], 'origin')) : Object.keys(csvData[0]).find(k => k.toLowerCase() === 'origin')) 
        : null;

      function findOriginForSku(skuStr) {
        if (!hasDataSource || !csvData.length || !skuKey || !originKey || !skuStr) return null;
        const targetClean = getCleanSku(skuStr).toLowerCase();
        if (!targetClean) return null;

        const row = csvData.find(r => {
          const csvRaw = String(r[skuKey] || '').trim();
          if (!csvRaw) return false;
          if (csvRaw.toLowerCase() === targetClean) return true;
          const csvClean = getCleanSku(csvRaw).toLowerCase();
          return csvClean && csvClean === targetClean;
        });

        if (row && row[originKey]) {
          const val = String(row[originKey]).trim();
          return val || null;
        }
        return null;
      }

      setStatus('Reading PDF...');
      const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
      const numPages = pdf.numPages;

      const descSkuRegex = /\(([^)]+)\)\s*HSN/gi;
      const orderData = [];
      let labelPageNum = 1;
      let orderIndex = 0;

      const tryPage = async (pageNum) => {
        if (pageNum > numPages) return { skus: [], sku: null, qty: 1, pageText: '' };
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const lines = reconstructLinesFromTextItems(textContent.items || []);
        const pageText = (textContent.items || []).map(it => it.str || '').join(' ');
        const descSkuMatches = [...pageText.matchAll(descSkuRegex)];
        const foundSkus = descSkuMatches.length > 0
          ? descSkuMatches.map(m => (m[1] || '').trim()).filter(Boolean)
          : [];
        const foundSku = foundSkus.length > 0 ? foundSkus[foundSkus.length - 1] : null;
        const foundQty = extractAmazonQuantity(pageText, lines, textContent.items);
        return { skus: foundSkus, sku: foundSku, qty: foundQty, pageText };
      };

      const isInvoicePage = (text) => {
        const t = (text || '').toUpperCase();
        return t.includes('PAYMENT TRANSACTION ID') || t.includes('TAX INVOICE') || t.includes('PAGE 2 OF 2');
      };

      while (labelPageNum <= numPages) {
        orderIndex++;
        const page2 = labelPageNum + 1;
        const page3 = labelPageNum + 2;
        const firstPageNumber = labelPageNum;

        setStatus(`Reading order ${orderIndex} (pages ${labelPageNum}-${Math.min(page3, numPages)})...`);
        const fromPage2 = await tryPage(page2);
        let sku = fromPage2.sku;
        let qty = fromPage2.qty;
        let skus = fromPage2.skus;

        if (fromPage2.sku != null && page3 <= numPages) {
          const fromPage3 = await tryPage(page3);
          if (isInvoicePage(fromPage3.pageText)) {
            labelPageNum += 3;
          } else {
            labelPageNum += 2;
          }
        } else if (fromPage2.sku != null) {
          labelPageNum += 2;
        } else if (page3 <= numPages) {
          const fromPage3 = await tryPage(page3);
          if (fromPage3.sku != null) {
            sku = fromPage3.sku;
            skus = fromPage3.skus;
            qty = fromPage3.qty;
          } else {
            qty = fromPage2.qty;
          }
          labelPageNum += 3;
        } else {
          labelPageNum += 2;
        }

        const primarySku = sku || `Order_${orderIndex}`;
        const totalQty = qty || 1;
        const isCombo = (totalQty > 1 || skus.length > 1);
        let orderOriginName = null;
        if (dataFile) {
          const targetSkus = skus.length > 0 ? skus : [primarySku];
          const itemOrigins = targetSkus.map(s => findOriginForSku(s) || 'Unknown Origin');
          const uniqueOrigins = Array.from(new Set(itemOrigins)).sort((a, b) => a.localeCompare(b));
          orderOriginName = uniqueOrigins.join(' + ');
        }

        orderData.push({
          firstPageNumber,
          sku: primarySku,
          qty: totalQty,
          skus,
          isCombo,
          originName: orderOriginName,
        });
      }

      if (orderData.length === 0) throw new Error('No valid Amazon orders found.');

      const originCounts = {};
      if (dataFile) {
        orderData.forEach((order) => {
          const group = order.isCombo ? 'combo' : 'single';
          const origin = (order.originName || 'Unknown Origin').trim();
          const groupKey = `${group}_${origin}`;
          originCounts[groupKey] = (originCounts[groupKey] || 0) + 1;
        });
      }

      orderData.sort((a, b) => {
        const pA = a.isCombo ? 1 : 0;
        const pB = b.isCombo ? 1 : 0;
        if (pA !== pB) return pA - pB;
        if (dataFile) {
          const originA = (a.originName || 'Unknown Origin').trim();
          const originB = (b.originName || 'Unknown Origin').trim();
          if (originA !== originB) {
            const isUnkA = !originA || originA.toLowerCase() === 'unknown origin';
            const isUnkB = !originB || originB.toLowerCase() === 'unknown origin';
            const isZA = !isUnkA && originA.toLowerCase().startsWith('z');
            const isZB = !isUnkB && originB.toLowerCase().startsWith('z');
            const tierA = isUnkA ? 2 : (isZA ? 1 : 0);
            const tierB = isUnkB ? 2 : (isZB ? 1 : 0);
            if (tierA !== tierB) return tierA - tierB;

            if (tierA === 0) {
              const groupA = a.isCombo ? 'combo' : 'single';
              const groupB = b.isCombo ? 'combo' : 'single';
              const countA = originCounts[`${groupA}_${originA}`] || 0;
              const countB = originCounts[`${groupB}_${originB}`] || 0;
              if (countA !== countB) return countA - countB;
            }

            return originA.localeCompare(originB, undefined, { sensitivity: 'base' });
          }
        }
        const skuA = String(a.sku || '');
        const skuB = String(b.sku || '');
        if (skuA !== skuB) return skuA.localeCompare(skuB, undefined, { sensitivity: 'base' });
        return a.qty - b.qty;
      });

      const firstOriginIndex = {};
      if (dataFile) {
        orderData.forEach((order, index) => {
          const group = order.isCombo ? 'combo' : 'single';
          const origin = (order.originName || 'Unknown Origin').trim();
          const groupKey = `${group}_${origin}`;
          if (firstOriginIndex[groupKey] === undefined) {
            firstOriginIndex[groupKey] = index;
          }
        });
      }

      setStatus('Building output PDF...');
      const sourcePdfDoc = await PDFDocument.load(pdfArrayBuffer);
      const outPdf = await PDFDocument.create();
      const font = await outPdf.embedFont(StandardFonts.HelveticaBold);

      for (let i = 0; i < orderData.length; i++) {
        const order = orderData[i];
        const [copied] = await outPdf.copyPages(sourcePdfDoc, [order.firstPageNumber - 1]);
        const originLabel = (order.originName || 'Unknown Origin').trim();
        const group = order.isCombo ? 'combo' : 'single';
        const groupKey = `${group}_${originLabel}`;
        const isFirstOfOrigin = dataFile && firstOriginIndex[groupKey] === i;
        const totalOriginCount = dataFile ? (originCounts[groupKey] || 0) : 0;
        const showCount = isFirstOfOrigin && totalOriginCount > 0;
        const countStr = showCount ? `   (${totalOriginCount})` : '';

        const displaySku = order.sku || '';
        const displayQty = order.qty;
        let line;

        if (order.skus.length > 1) {
          const skuCount = {};
          order.skus.forEach(s => { skuCount[s] = (skuCount[s] || 0) + 1; });
          line = Object.entries(skuCount).map(([s, q], idx) => {
            const itemOrig = findOriginForSku(s) || (hasDataSource ? 'Unknown Origin' : null);
            const origPart = itemOrig ? ` : ${itemOrig}` : '';
            const cStr = (idx === 0) ? countStr : '';
            return `${s} | QTY - ${q}${origPart}${cStr}`;
          }).join('\n');
        } else {
          const itemOrig = findOriginForSku(displaySku) || (hasDataSource ? order.originName : null);
          const origPart = itemOrig ? ` : ${itemOrig}` : '';
          line = `${displaySku} | QTY - ${displayQty}${origPart}${countStr}`;
        }

        copied.drawText(line, { x: 50, y: 150, size: 24, font, color: rgb(0, 0, 0) });
        outPdf.addPage(copied);
      }

      const outBytes = await outPdf.save();
      const url = URL.createObjectURL(new Blob([outBytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfFile.name.replace(/\.pdf$/i, '') + '_sorted.pdf';
      link.click();
      URL.revokeObjectURL(url);
      setSuccess(true);
      setStatus('Done.');
    } catch (err) {
      setError(err.message || 'Processing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      {allowed === false && <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4"><p className="text-sm text-yellow-700">Access denied.</p></div>}
      <form onSubmit={handleAmazonSubmit} encType="multipart/form-data" className="space-y-6">
        <div>
          <label htmlFor="pdf_amazon" className="block text-sm font-medium text-gray-700 mb-2">Upload Amazon PDF <span className="text-red-500">*</span></label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg border-gray-300 hover:border-orange-400 transition-colors">
            <div className="space-y-1 text-center">
              <div className="flex text-sm text-gray-600">
                <label htmlFor="pdf_amazon" className="relative cursor-pointer bg-white rounded-md font-medium text-orange-600 hover:text-orange-500">
                  <span>Upload a file</span>
                  <input type="file" id="pdf_amazon" name="pdf_amazon" accept=".pdf" required onChange={(e) => setSelectedAmazonPdfFile(e.target.files[0] || null)} className="sr-only" />
                </label>
              </div>
              {selectedAmazonPdfFile && <p className="text-xs text-orange-600">{selectedAmazonPdfFile.name}</p>}
            </div>
          </div>
        </div>
        <div>
          {masterSkus && masterSkus.length > 0 ? (
            <div className="rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50/80 via-amber-50/60 to-orange-50/80 p-3.5 sm:p-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-orange-600 text-white rounded-lg shadow-xs flex-shrink-0">
                    <FaDatabase className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold uppercase tracking-wider text-orange-950">Company Master File</span>
                      <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-300 inline-flex items-center gap-1">
                        <FaCheckCircle className="w-3 h-3 text-emerald-600" />
                        {masterSkus.length.toLocaleString()} SKUs Loaded
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {selectedAmazonCsvFile
                        ? "⚠️ Manual file uploaded below will override Master File for this run."
                        : "✓ Automatically mapping Origin from Company Master File."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto bg-white/80 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-orange-200 shadow-2xs">
                  <span className="text-xs font-semibold text-gray-700">Add manual file:</span>
                  <button
                      type="button"
                      role="switch"
                      aria-checked={showManualCsv}
                      onClick={() => {
                        const next = !showManualCsv;
                        setShowManualCsv(next);
                        if (!next) {
                          setSelectedAmazonCsvFile(null);
                          setHasCsvFile(false);
                        }
                      }}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        showManualCsv ? 'bg-orange-600' : 'bg-gray-300'
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
                <div className="mt-3 pt-3 border-t border-orange-200/80">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="csv_amazon" className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Upload Override CSV or Excel File (Optional)
                    </label>
                    {selectedAmazonCsvFile && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAmazonCsvFile(null);
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
                    selectedAmazonCsvFile ? 'border-green-400 bg-green-50/50' : 'border-gray-300 hover:border-orange-400'
                  }`}>
                    <div className="space-y-1 text-center w-full">
                      {selectedAmazonCsvFile ? (
                        <div className="flex items-center justify-center gap-2 text-green-900">
                          <FaFileExcel className="w-5 h-5 text-green-600" />
                          <span className="text-sm font-semibold truncate">{selectedAmazonCsvFile.name}</span>
                          <span className="text-xs text-gray-500">({(selectedAmazonCsvFile.size / 1024).toFixed(1)} KB)</span>
                        </div>
                      ) : (
                        <>
                          <svg className="mx-auto h-10 w-10 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <div className="flex justify-center text-sm text-gray-600">
                            <label htmlFor="csv_amazon" className="relative cursor-pointer bg-white rounded-md font-medium text-orange-600 hover:text-orange-500">
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
                    id="csv_amazon"
                    name="csv_amazon"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files[0] || null;
                      setSelectedAmazonCsvFile(file);
                      setHasCsvFile(e.target.files.length > 0);
                    }}
                    className="sr-only"
                  />
                </div>
              )}
            </div>
          ) : (
            <div>
              <label htmlFor="csv_amazon" className="block text-sm font-medium text-gray-700 mb-2">
                Upload CSV/Excel (Optional)
              </label>
              <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors ${
                selectedAmazonCsvFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-orange-400'
              }`}>
                <div className="space-y-1 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex text-sm text-gray-600">
                    <label htmlFor="csv_amazon" className="relative cursor-pointer bg-white rounded-md font-medium text-orange-600 hover:text-orange-500">
                      <span>Upload a file</span>
                      <input
                        type="file"
                        id="csv_amazon"
                        name="csv_amazon"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => {
                          const file = e.target.files[0] || null;
                          setSelectedAmazonCsvFile(file);
                          setHasCsvFile(e.target.files.length > 0);
                        }}
                        className="sr-only"
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">CSV or Excel (.xlsx, .xls)</p>
                  {selectedAmazonCsvFile && (
                    <div className="mt-3 flex items-center gap-2 text-green-900 bg-green-50 p-2 rounded">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="font-medium">Selected:</span>
                      <span className="truncate text-sm">{selectedAmazonCsvFile.name}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 p-2.5 bg-orange-50 rounded-lg">
                <p className="text-xs text-orange-800">
                  ℹ Upload master file once to auto-map Origin across all sorting runs.
                </p>
              </div>
            </div>
          )}
        </div>
        <button type="submit" disabled={loading || !selectedAmazonPdfFile} className="w-full py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors disabled:bg-gray-300">
          {loading ? 'Processing...' : 'Process Amazon PDF'}
        </button>
      </form>
    </div>
  );
}
