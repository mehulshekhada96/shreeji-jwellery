import { useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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
}) {
  const [selectedAmazonPdfFile, setSelectedAmazonPdfFile] = useState(null);
  const [selectedAmazonCsvFile, setSelectedAmazonCsvFile] = useState(null);
  const [hasCsvFile, setHasCsvFile] = useState(false);

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
      const dataFile = event.target.csv_amazon?.files?.[0] || null;
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
        }
        return [lib, pdfBuf, data];
      })();

      const skuKey = csvData.length 
        ? (findHeaderKeyInsensitive ? findHeaderKeyInsensitive(csvData[0], 'SKU') : Object.keys(csvData[0]).find(k => k.toLowerCase() === 'sku')) 
        : null;
      const originKey = csvData.length 
        ? (findHeaderKeyInsensitive ? (findHeaderKeyInsensitive(csvData[0], 'Origin') || findHeaderKeyInsensitive(csvData[0], 'origin')) : Object.keys(csvData[0]).find(k => k.toLowerCase() === 'origin')) 
        : null;

      function findOriginForSku(skuStr) {
        if (!dataFile || !csvData.length || !skuKey || !originKey || !skuStr) return null;
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
            const itemOrig = findOriginForSku(s) || (dataFile ? 'Unknown Origin' : null);
            const origPart = itemOrig ? ` : ${itemOrig}` : '';
            const cStr = (idx === 0) ? countStr : '';
            return `${s} | QTY - ${q}${origPart}${cStr}`;
          }).join('\n');
        } else {
          const itemOrig = findOriginForSku(displaySku) || (dataFile ? order.originName : null);
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
          <label htmlFor="csv_amazon" className="block text-sm font-medium text-gray-700">Upload CSV/Excel (Optional)</label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg border-gray-300 hover:border-orange-400 transition-colors">
            <div className="space-y-1 text-center">
              <label htmlFor="csv_amazon" className="relative cursor-pointer text-orange-600 font-medium">
                <span>Upload a file</span>
                <input type="file" id="csv_amazon" name="csv_amazon" accept=".csv,.xlsx,.xls" onChange={(e) => { setSelectedAmazonCsvFile(e.target.files[0] || null); setHasCsvFile(!!e.target.files.length); }} className="sr-only" />
              </label>
              {selectedAmazonCsvFile && <p className="text-xs text-orange-600">{selectedAmazonCsvFile.name}</p>}
            </div>
          </div>
        </div>
        <button type="submit" disabled={loading || !selectedAmazonPdfFile} className="w-full py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors disabled:bg-gray-300">
          {loading ? 'Processing...' : 'Process Amazon PDF'}
        </button>
      </form>
    </div>
  );
}
