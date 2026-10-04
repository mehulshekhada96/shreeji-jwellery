import { useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export default function MyntraSort({
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
}) {
  const [selectedMyntraPdfFile, setSelectedMyntraPdfFile] = useState(null);
  const [selectedMyntraCsvFile, setSelectedMyntraCsvFile] = useState(null);
  const [hasCsvFile, setHasCsvFile] = useState(false);

  // Helper to extract clean SKU lookup string
  function getCleanMyntraSku(rawStr) {
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

  // Parse Myntra SKU items from text lines
  function parseMyntraItems(lines) {
    const items = [];
    const seen = new Set();

    const addItem = (rawText, isBracketed) => {
      const parts = rawText.includes('+') ? rawText.split('+') 
                  : rawText.includes(',') ? rawText.split(',') 
                  : rawText.includes('&') ? rawText.split('&') 
                  : [rawText];

      for (const part of parts) {
        const cleanSku = getCleanMyntraSku(part);
        let qty = 1;
        const match = part.match(/-\s*(\d+)$/);
        if (match) qty = parseInt(match[1], 10);

        if (cleanSku && cleanSku.length >= 2) {
          const key = `${cleanSku}_${qty}`;
          if (!seen.has(key)) {
            items.push({ 
              sku: cleanSku, 
              displaySku: isBracketed ? cleanSku : part.trim(), 
              searchStr: cleanSku, 
              qty 
            });
            seen.add(key);
          }
        }
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const bracketMatches = [...trimmed.matchAll(/\[\s*([A-Za-z0-9_\-\/\.\s\+&,]+?)\s*\]/g)];
      if (bracketMatches.length > 0) {
        for (const match of bracketMatches) {
          const inside = match[1].trim();
          if (!inside.includes(')-(') && !inside.toLowerCase().includes('page')) {
            addItem(inside, true);
          }
        }
        continue;
      }

      const unbracketedMatch = trimmed.match(/^([A-Za-z0-9_\.]{2,35}(?:\s+[A-Za-z0-9_\.]{2,35})?)\s*-\s*(\d+)?$/);
      if (unbracketedMatch) {
        const skuUpper = trimmed.toUpperCase();
        const isExcluded = 
          skuUpper.includes('NORMAL') ||
          skuUpper.includes('FWD') ||
          skuUpper.includes('COD') ||
          skuUpper.includes('PREPAID') ||
          skuUpper.includes('MYNTRA') ||
          skuUpper.includes('NULL') ||
          skuUpper.includes('EK_E2E') ||
          skuUpper.includes('DE_E2E');

        if (!isExcluded) {
          addItem(trimmed, false);
        }
      }
    }

    return items;
  }

  const handleMyntraSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setStatus('Preparing files...');

    try {
      const pdfFile = event.target.pdf_myntra?.files?.[0] || selectedMyntraPdfFile;
      const csvFile = event.target.csv_myntra?.files?.[0] || selectedMyntraCsvFile;
      if (!pdfFile) throw new Error('Please select a Myntra PDF file.');

      const isExcel = csvFile && /\.(xlsx|xls)$/i.test(csvFile.name);
      const [pdfjsLib, pdfArrayBuffer, csvData] = await (async () => {
        const [lib, pdfBuf] = await Promise.all([
          loadPdfJs(),
          readFileAsArrayBuffer(pdfFile)
        ]);

        let data = [];
        if (csvFile) {
          if (isExcel) {
            setStatus('Parsing Excel...');
            const dataBuf = await readFileAsArrayBuffer(csvFile);
            data = parseExcel(dataBuf);
          } else {
            setStatus('Parsing CSV...');
            const csvText = await readFileAsText(csvFile);
            data = parseCSV(csvText);
          }
        }
        return [lib, pdfBuf, data];
      })();

      let skuKey = null;
      let originKey = null;
      if (csvData && csvData.length) {
        skuKey = findHeaderKeyInsensitive(csvData[0], 'SKU');
        originKey = findHeaderKeyInsensitive(csvData[0], 'Origin') || findHeaderKeyInsensitive(csvData[0], 'origin');
      }

      setStatus('Reading Myntra PDF...');
      const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
      const totalPages = pdf.numPages;

      const pageData = [];

      for (let i = 1; i <= totalPages; i++) {
        setStatus(`Analyzing page ${i} of ${totalPages}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const lines = reconstructLinesFromTextItems(textContent.items || []);
        
        const fullTextLower = lines.join(' ').toLowerCase();
        const isMyntraLabel = fullTextLower.includes('declare that the goods') ||
                              fullTextLower.includes('buyer declaration') ||
                              fullTextLower.includes("buyer's name and address") ||
                              fullTextLower.includes('purchase made') ||
                              fullTextLower.includes('myntra') ||
                              fullTextLower.includes('if undelivered');

        if (!isMyntraLabel) continue;

        const items = parseMyntraItems(lines);

        let skuX = null;
        let skuY = null;
        let purchaseMadeY = null;
        if (textContent.items) {
          for (const item of textContent.items) {
            const str = (item.str || '').trim();
            if (!str) continue;
            const strLower = str.toLowerCase();
            if ((strLower.includes('purchase') || strLower.includes('made')) && item.transform?.[5] !== undefined) {
              purchaseMadeY = item.transform[5];
            }
            const isBracketed = str.includes('[') && str.includes(']');
            for (const it of items) {
              if (it.y === undefined && (str.includes(it.sku) || (isBracketed && str.includes(it.sku)))) {
                const x = item.transform?.[4];
                const y = item.transform?.[5];
                if (x !== undefined && y !== undefined) {
                  it.x = x;
                  it.y = y;
                  if (skuX === null) {
                    skuX = x;
                    skuY = y;
                  }
                }
              }
            }
          }
        }

        let totalQty = 0;
        let primarySku = 'Unknown_SKU';
        let isCombo = false;

        if (items.length > 0) {
          totalQty = items.reduce((acc, curr) => acc + curr.qty, 0);
          if (items.length === 1) {
            primarySku = items[0].sku;
            isCombo = items[0].qty > 1;
          } else {
            isCombo = true;
            const sortedSkus = [...items].sort((a, b) => a.sku.localeCompare(b.sku));
            primarySku = sortedSkus.map(it => it.qty > 1 ? `${it.sku} (x${it.qty})` : it.sku).join(' + ');
          }
        }

        let originName = 'Unknown Origin';
        if (csvData && csvData.length && skuKey && originKey) {
          const itemOrigins = [];
          for (const it of items) {
            const targetSku = String(it.sku || '').trim().toLowerCase();
            const row = csvData.find(r => {
              const csvSku = String(r[skuKey] || '').trim();
              if (!csvSku) return false;
              if (csvSku.toLowerCase() === targetSku) return true;
              const csvClean = getCleanMyntraSku(csvSku).toLowerCase();
              return csvClean && csvClean === targetSku;
            });

            if (row && row[originKey]) {
              const val = String(row[originKey]).trim();
              if (val) {
                it.origin = val;
                itemOrigins.push(val);
              }
            }
            if (!it.origin) it.origin = 'Unknown Origin';
          }

          if (itemOrigins.length > 0) {
            const uniqueOrigins = Array.from(new Set(itemOrigins)).sort((a, b) => a.localeCompare(b));
            originName = uniqueOrigins.join(' + ');
          }
        } else {
          for (const it of items) {
            it.origin = 'Unknown Origin';
          }
        }

        pageData.push({
          pageNumber: i,
          items,
          primarySku,
          totalQty: totalQty || 1,
          isCombo,
          originName,
          skuX,
          skuY,
          purchaseMadeY,
        });
      }

      if (pageData.length === 0) {
        throw new Error('No valid Myntra shipping labels found in the PDF.');
      }

      // Count occurrences of each origin per group (Priority 0: Single, Priority 1: Combo)
      const originCounts = {};
      pageData.forEach((page) => {
        const p = page.isCombo ? 1 : 0;
        const origin = (page.originName || 'Unknown Origin').trim();
        if (origin && origin.toLowerCase() !== 'unknown origin') {
          const groupKey = `${p}_${origin}`;
          originCounts[groupKey] = (originCounts[groupKey] || 0) + 1;
        }
      });

      // SORTING LOGIC:
      // 1. Single orders (isCombo === false) FIRST (Priority 0). Multi/Combo (isCombo === true) NEXT (Priority 1).
      // 2. Origin Name (Count-wise ascending, Unknown Origin at end)
      // 3. Primary SKU Name (alphabetically)
      // 4. Total Quantity (ascending)
      pageData.sort((a, b) => {
        const pA = a.isCombo ? 1 : 0;
        const pB = b.isCombo ? 1 : 0;
        if (pA !== pB) return pA - pB;

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
            const groupKeyA = `${pA}_${originA}`;
            const groupKeyB = `${pB}_${originB}`;
            const countA = originCounts[groupKeyA] || 0;
            const countB = originCounts[groupKeyB] || 0;
            if (countA !== countB) return countA - countB;
          }

          return originA.localeCompare(originB, undefined, { sensitivity: 'base' });
        }

        const skuA = String(a.primarySku || '');
        const skuB = String(b.primarySku || '');
        if (skuA !== skuB) return skuA.localeCompare(skuB, undefined, { sensitivity: 'base' });

        return a.totalQty - b.totalQty;
      });

      // Track first occurrence index of each origin in each group
      const firstOriginIndex = {};
      pageData.forEach((page, index) => {
        const p = page.isCombo ? 1 : 0;
        const origin = (page.originName || 'Unknown Origin').trim();
        const groupKey = `${p}_${origin}`;
        if (firstOriginIndex[groupKey] === undefined) {
          firstOriginIndex[groupKey] = index;
        }
      });

      setStatus('Building sorted Myntra PDF...');
      const sourcePdfDoc = await PDFDocument.load(pdfArrayBuffer);
      const outPdf = await PDFDocument.create();
      const helveticaBoldFont = await outPdf.embedFont(StandardFonts.HelveticaBold);

      for (let i = 0; i < pageData.length; i++) {
        const pageInfo = pageData[i];
        const [copiedPage] = await outPdf.copyPages(sourcePdfDoc, [pageInfo.pageNumber - 1]);
        const { width, height } = copiedPage.getSize();

        const originLabel = pageInfo.originName || 'Unknown Origin';

        // Draw Origin Name(s) vertically (count shown ONLY on the 1st page of each origin group)
        let firstSkuY = pageInfo.skuY;
        let firstSkuX = pageInfo.skuX || 30;

        for (let idx = 0; idx < pageInfo.items.length; idx++) {
          const it = pageInfo.items[idx];
          const itemOrigin = it.origin || 'Unknown Origin';
          
          const p = pageInfo.isCombo ? 1 : 0;
          const originTrimmed = (originLabel || '').trim();
          const groupKey = `${p}_${originTrimmed}`;
          const isFirstOfOrigin = firstOriginIndex[groupKey] === i;
          const totalOriginCount = originCounts[groupKey] || 0;
          const showCount = isFirstOfOrigin && totalOriginCount > 0;
          const countStr = (showCount && idx === 0) ? `   (${totalOriginCount})` : '';

          let drawX = 95;
          let drawY = 120 - (idx * 16);

          if (it.x !== undefined && it.y !== undefined) {
            drawX = Math.max(95, it.x + 25);
            drawY = it.y;
            if (firstSkuY === null) {
              firstSkuY = it.y;
              firstSkuX = it.x;
            }
          } else if (firstSkuY !== null && firstSkuY !== undefined) {
            drawX = Math.max(95, firstSkuX + 25);
            drawY = firstSkuY - (idx * 16);
          }

          const lineText = pageInfo.items.length > 1
            ? `${it.displaySku || it.sku} : ${itemOrigin}${countStr}`
            : `O : ${itemOrigin}${countStr}`;

          copiedPage.drawText(lineText, {
            x: drawX,
            y: drawY,
            size: 13,
            font: helveticaBoldFont,
            color: rgb(0, 0, 0)
          });
        }

        // Position Quantity ABOVE the bottom horizontal line (shifted up by 22pt)
        let qtyY = 85;
        if (pageInfo.purchaseMadeY !== undefined && pageInfo.purchaseMadeY !== null) {
          qtyY = pageInfo.purchaseMadeY + 22;
        }

        const qtyText = `Qty: ${pageInfo.totalQty}`;
        const qtyWidth = helveticaBoldFont.widthOfTextAtSize(qtyText, 12);
        const qtyX = Math.max(180, width - 220);

        copiedPage.drawText(qtyText, {
          x: qtyX,
          y: qtyY,
          size: 12,
          font: helveticaBoldFont,
          color: rgb(0, 0, 0)
        });

        outPdf.addPage(copiedPage);
      }

      const outBytes = await outPdf.save();
      const url = window.URL.createObjectURL(new Blob([outBytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Myntra_Sorted_${new Date().getTime()}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSuccess(true);
      setStatus('Done. File downloaded.');
    } catch (err) {
      console.error('Myntra Sort Error:', err);
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
      <form onSubmit={handleMyntraSubmit} encType="multipart/form-data" className="space-y-6">
        <div>
          <label htmlFor="pdf_myntra" className="block text-sm font-medium text-gray-700 mb-2">
            Upload Myntra PDF File <span className="text-red-500">*</span>
          </label>
          <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors ${
            selectedMyntraPdfFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
          }`}>
            <div className="space-y-1 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex text-sm text-gray-600">
                <label htmlFor="pdf_myntra" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                  <span>Upload a file</span>
                  <input
                    type="file"
                    id="pdf_myntra"
                    name="pdf_myntra"
                    accept=".pdf"
                    required
                    onChange={(e) => {
                      const file = e.target.files[0];
                      setSelectedMyntraPdfFile(file);
                    }}
                    className="sr-only"
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">PDF up to 25MB</p>
              {selectedMyntraPdfFile && (
                <div className="mt-3 flex items-center gap-2 text-blue-900 bg-blue-50 p-2 rounded">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">Selected:</span>
                  <span className="truncate text-sm">{selectedMyntraPdfFile.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
            <label htmlFor="csv_myntra" className="block text-sm font-medium text-gray-700">
              Upload CSV or Excel File (Optional)
            </label>
            <span className="text-sm text-gray-500">Optional columns: <strong>SKU</strong>, <strong>Origin</strong>.</span>
          </div>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-green-400 transition-colors">
            <div className="space-y-1 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex text-sm text-gray-600">
                <label htmlFor="csv_myntra" className="relative cursor-pointer bg-white rounded-md font-medium text-green-600 hover:text-green-500">
                  <span>Upload a file</span>
                  <input
                    type="file"
                    id="csv_myntra"
                    name="csv_myntra"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files[0] || null;
                      setSelectedMyntraCsvFile(file);
                      setHasCsvFile(e.target.files.length > 0);
                    }}
                    className="sr-only"
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">CSV or Excel (.xlsx, .xls)</p>
              {selectedMyntraCsvFile && (
                <div className="mt-3 flex items-center gap-2 text-green-900 bg-green-50 p-2 rounded">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">Selected:</span>
                  <span className="truncate text-sm">{selectedMyntraCsvFile.name}</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              {hasCsvFile
                ? "✓ CSV file will be used to add origin information"
                : "ℹ CSV/Excel file is optional. If provided, SKUs will be grouped by origin."}
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || allowed === false}
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Process Files'}
        </button>
      </form>
    </div>
  );
}
