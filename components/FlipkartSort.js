import { useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export default function FlipkartSort({
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
  const [selectedFlipkartPdfFile, setSelectedFlipkartPdfFile] = useState(null);
  const [selectedFlipkartCsvFile, setSelectedFlipkartCsvFile] = useState(null);
  const [hasCsvFile, setHasCsvFile] = useState(false);

  const companies = ['Valmo', 'Xpress Bees', 'ShadowFax', 'Delhivery', 'Ecom Express', 'Flipkart'].sort();

  function extractFlipkartSKU(lines) {
    const skuHeaderIndex = lines.findIndex(line => line.toUpperCase().includes('SKU ID |'));
    if (skuHeaderIndex !== -1) {
      const nextLine = lines[skuHeaderIndex + 1];
      if (nextLine) {
        const parts = nextLine.split('|');
        if (parts.length > 1) {
          const leftPart = parts[0].trim();
          const skuMatch = leftPart.match(/^\d+\s+(.+)$/);
          if (skuMatch) return skuMatch[1].trim();
          return leftPart;
        }
      }
    }

    const SKUIndex = lines.findIndex(line => line.toUpperCase().includes('SKU') || line.toUpperCase().includes('PRODUCT ID'));
    if (SKUIndex === -1) return null;
    
    const line = lines[SKUIndex];
    const nextLine = lines[SKUIndex + 1] || '';
    
    // Check if SKU is on the same line after a colon or space
    if (line.includes(':')) {
      const parts = line.split(':');
      if (parts[1] && parts[1].trim().length > 0) return parts[1].trim();
    }
    
    // Fallback: look at the next line, handle multiple spaces
    const nextParts = nextLine.trim().split(/\s{2,}/);
    if (nextParts.length > 1) return nextParts[1].trim();
    if (nextParts[0]) return nextParts[0].trim();
    
    return null;
  }

  function extractFlipkartQuantity(lines) {
    // 1. Check for "TOTAL QTY" (common in multi-product labels)
    const totalQtyIndex = lines.findIndex(line => 
      line.toUpperCase().includes('TOTAL QTY') || 
      line.toUpperCase().includes('TOTAL QUANTITY')
    );
    if (totalQtyIndex !== -1) {
      const line = lines[totalQtyIndex];
      const match = line.match(/(?:TOTAL QTY|TOTAL QUANTITY)\s*:?\s*(\d+)/i);
      if (match) return parseInt(match[1], 10);
      
      // Check next line if same line match failed
      const nextLine = lines[totalQtyIndex+1] || '';
      const nextMatch = nextLine.match(/(\d+)/);
      if (nextMatch) return parseInt(nextMatch[1], 10);
    }

    // 2. Standard Logic
    const QtyIndex = lines.findIndex(line => 
      line.toUpperCase().includes('QTY') || 
      line.toUpperCase().includes('QUANTITY')
    );
    if (QtyIndex === -1) return 1;
    
    const line = lines[QtyIndex];
    const nextLine = lines[QtyIndex + 1] || '';
    
    const sameLineMatch = line.match(/(?:Qty|Quantity)\s*:?\s*(\d+)/i);
    if (sameLineMatch) return parseInt(sameLineMatch[1], 10);
    
    const nextLineMatch = nextLine.match(/(\d+)/);
    if (nextLineMatch) return parseInt(nextLineMatch[1], 10);
  
    return 1;
  }

  function extractFlipkartCompany(lines) {

    const company = companies.find(company => {
      return lines.some(line => line.trim()?.toUpperCase().includes(company.toUpperCase()));
    });
    return company || 'Flipkart';
  }

  const handleFlipkartSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setStatus('Preparing files...');

    try {
      const pdfFile = event.target.pdf_flipkart.files[0];
      const dataFile = event.target.csv_flipkart?.files?.[0] || null;
      if (!pdfFile) throw new Error('Please select a PDF file');

      const isExcel = dataFile ? /\.(xlsx|xls)$/i.test(dataFile.name) : false;
      const [pdfjsLib, pdfArrayBuffer, csvData] = await (async () => {
        const [lib, pdfBuf] = await Promise.all([
          loadPdfJs(),
          readFileAsArrayBuffer(pdfFile)
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
          } else {
            setStatus('Parsing CSV...');
            const csvText = await readFileAsText(dataFile);
            data = parseCSV(csvText);
          }
        }
        return [lib, pdfBuf, data];
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
        
        // Marker for valid labels (adapting from Meesho)
        const hasMarker = lines.some(line => {
          const l = line.toLowerCase();
          return l.includes('customer address') || 
                 l.includes('shipping label') ||
                 l.includes('product id') ||
                 l.includes('tax invoice') ||
                 l.includes('sold by');
        });
        
        if (!hasMarker) continue;
        
        const sku = extractFlipkartSKU(lines);
        const qty = extractFlipkartQuantity(lines);
        let originName = null; 
        if (dataFile) {
          originName = 'Unknown Origin'; // If file exists, default to Unknown
          if (skuKey && sku) {
            const originRow = csvData.find(row => String(row[skuKey]).trim() === String(sku).trim());
            if (originRow && originKey) originName = originRow[originKey] || 'Unknown Origin';
          }
        }

        let labelBottomY = null;
        let fmpcY = null;
        let minX = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        const fullText = textContent.items ? textContent.items.map(item => item.str).join('').toLowerCase().replace(/\s/g, '') : '';
        const hasTaxInvoice = fullText.includes('taxinvoice');

        if (textContent.items) {
          for (const item of textContent.items) {
            const str = item.str.toLowerCase().replace(/\s/g, '');
            if (str.includes('resale') || str.includes('printedat')) {
              labelBottomY = item.transform[5];
            }
            // Only match horizontal FMP text (ignore the rotated AWB text on the left)
            if (str.startsWith('fmp') && Math.abs(item.transform[1]) < 0.1) {
              if (fmpcY === null || item.transform[5] < fmpcY) {
                fmpcY = item.transform[5];
              }
            }
          }
          if (!labelBottomY) {
            if (fmpcY !== null) {
              labelBottomY = fmpcY - 45;
            } else {
              for (const item of textContent.items) {
                if (item.str.toLowerCase().replace(/\s/g, '').includes('taxinvoice')) {
                  labelBottomY = item.transform[5] + 15;
                  break;
                }
              }
            }
          }

          // Calculate bounding box of all label text
          if (labelBottomY !== null) {
            for (const item of textContent.items) {
              const y = item.transform[5];
              if (y >= labelBottomY - 15 && item.str.trim()) {
                const x = item.transform[4];
                const isRotated = Math.abs(item.transform[1]) > 0.5;
                const textEndX = isRotated ? x + 12 : x + (item.width || 0);
                
                if (x < minX) minX = x;
                if (textEndX > maxX) maxX = textEndX;
                if (y > maxY) maxY = y;
              }
            }
          }
        }

        const company = extractFlipkartCompany(lines);
        pageData.push({ 
          pageNumber: i, sku, qty, originName, company, 
          labelBottomY, fmpcY, minX, maxX, maxY, hasTaxInvoice 
        });
      }

      if (pageData.length === 0) {
        throw new Error('No valid shipping labels found in the PDF.');
      }

      // Multi-Product Sorting:
      // Single-item orders (Qty=1) get Priority 0, Multi-item orders (Qty>1) get Priority 1
      pageData.sort((a, b) => {
        const priorityA = (a.qty > 1) ? 1 : 0;
        const priorityB = (b.qty > 1) ? 1 : 0;
        if (priorityA !== priorityB) return priorityA - priorityB;

        // Secondary Sort: Origin Name (if available), otherwise SKU
        const originA = a.originName || ''; 
        const originB = b.originName || '';
        if (originA !== originB) return originA.localeCompare(originB);

        // Tertiary Sort: SKU
        const skuA = String(a.sku || ''); 
        const skuB = String(b.sku || '');
        if (skuA !== skuB) return skuA.localeCompare(skuB);

        // Quaternary Sort: Company
        const companyA = a.company || ''; 
        const companyB = b.company || '';
        return companyA.localeCompare(companyB);
      });

      // Count occurrences of each origin
      const originCounts = {};
      const firstOriginIndex = {};
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
      const helveticaBoldFont = await outPdf.embedFont(StandardFonts.HelveticaBold);
      
      for (let i = 0; i < pageData.length; i++) {
        const pageInfo = pageData[i];
        
        // --- FINAL ULTRA-TIGHT CROPPING FIX ---
        // 1. Get original size and embed page
        const originalPage = sourcePdfDoc.getPage(pageInfo.pageNumber - 1);
        const { width: origWidth, height: origHeight } = originalPage.getSize();
        const embeddedLabel = await outPdf.embedPage(originalPage);
        
        let targetWidth, targetHeight, xShift, yShift;
        if (pageInfo.minX !== Infinity && pageInfo.maxX !== -Infinity && (pageInfo.maxX - pageInfo.minX) > 100) {
            // Apply tight bounding box crop
            const padLeft = 10;
            const padRight = 10;
            const padTop = 20;
            const padBottom = 10;
            
            const cropLeft = Math.max(0, pageInfo.minX - padLeft);
            const cropRight = Math.min(origWidth, pageInfo.maxX + padRight);
            const cropBottom = Math.max(0, pageInfo.labelBottomY - padBottom);
            const cropTop = Math.min(origHeight, pageInfo.maxY + padTop);
            
            targetWidth = cropRight - cropLeft;
            targetHeight = cropTop - cropBottom; // Exact label height
            
            xShift = -cropLeft;
            yShift = -cropBottom;
        } else if (origWidth > 400) {
            // Fallback for A4 
            if (pageInfo.hasTaxInvoice) {
              console.log("in tax invoice")
                // The new LabelPlusInvoice format has a rasterized, scaled-down label
                targetWidth = 170;
                targetHeight = 260;
            } else {
              console.log("in normal invoice")
                // Standard old A4 label format
                targetWidth = 240;
                targetHeight = 362;
            }
            
            if (pageInfo.labelBottomY !== null) {
                let cutY = pageInfo.labelBottomY - 10;
                if (!pageInfo.hasTaxInvoice) {
                    targetHeight = (origHeight - 21) - cutY;
                }
                yShift = -cutY;
            } else {
                yShift = -(origHeight - targetHeight) + 21;
            }
            xShift = -(origWidth - targetWidth) / 2;
        } else {
            // Fallback for thermal
            targetWidth = origWidth;
            targetHeight = origHeight;
            xShift = 0;
            yShift = 0;
        }
        
        const newPage = outPdf.addPage([targetWidth, targetHeight]);
        
        newPage.drawPage(embeddedLabel, {
          x: xShift,
          y: yShift,
          width: origWidth,
          height: origHeight
        });

        const isFirstOfOrigin = pageInfo.originName ? firstOriginIndex[pageInfo.originName] === i : false;
        const hasMultiplePages = pageInfo.originName ? originCounts[pageInfo.originName] > 1 : false;
        const showCount = isFirstOfOrigin && hasMultiplePages && pageInfo.originName !== null;

        // Dynamic text positioning and scaling
        const scale = targetWidth / 240;
        const fontSize = Math.max(8, 12 * scale);
        const countFontSize = Math.max(10, 16 * scale);
        const textX = Math.max(8, 20 * scale);
        
        let textY;
        if (pageInfo.fmpcY !== null) {
          // Draw text exactly 12 points (scaled) above the bottom FMP* barcode text
          textY = (pageInfo.fmpcY + yShift) + (14 * scale);
        } else {
          // Fallback if FMP text isn't found
          textY = 10 + (29 * scale);
        }

        // 4. DRAW TEXT
        if (pageInfo.originName) {
          newPage.drawText(`O:- ${pageInfo.originName}`, { 
            x: textX, 
            y: textY, 
            size: fontSize, 
            font: helveticaBoldFont,
            color: rgb(0, 0, 0)
          });
        }
        
        if (showCount) {
          const count = originCounts[pageInfo.originName];
          const countText = `(${count})`;
          const countWidth = helveticaBoldFont.widthOfTextAtSize(countText, countFontSize);
          
          newPage.drawText(countText, {
            x: targetWidth - countWidth - textX,
            y: textY,
            size: countFontSize,
            font: helveticaBoldFont,
            color: rgb(0, 0, 0)
          });
        }
      }
      
      const outBytes = await outPdf.save();
      const url = window.URL.createObjectURL(new Blob([outBytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Flipkart_Sorted_${new Date().getTime()}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

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
      <form onSubmit={handleFlipkartSubmit} encType="multipart/form-data" className="space-y-6">
        <div>
          <label htmlFor="pdf_flipkart" className="block text-sm font-medium text-gray-700 mb-2">
            Upload Flipkart PDF File <span className="text-red-500">*</span>
          </label>
          <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors ${
            selectedFlipkartPdfFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
          }`}>
            <div className="space-y-1 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex text-sm text-gray-600">
                <label htmlFor="pdf_flipkart" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500">
                  <span>Upload a file</span>
                  <input
                    type="file"
                    id="pdf_flipkart"
                    name="pdf_flipkart"
                    accept=".pdf"
                    required
                    onChange={(e) => {
                      const file = e.target.files[0];
                      setSelectedFlipkartPdfFile(file);
                    }}
                    className="sr-only"
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">PDF up to 25MB</p>
              {selectedFlipkartPdfFile && (
                <div className="mt-3 flex items-center gap-2 text-blue-900 bg-blue-50 p-2 rounded">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">Selected:</span>
                  <span className="truncate text-sm">{selectedFlipkartPdfFile.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="csv_flipkart" className="block text-sm font-medium text-gray-700 mb-2">
            Upload CSV or Excel File (Optional)
          </label>
          <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-lg transition-colors ${
            selectedFlipkartCsvFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-green-400'
          }`}>
            <div className="space-y-1 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex text-sm text-gray-600">
                <label htmlFor="csv_flipkart" className="relative cursor-pointer bg-white rounded-md font-medium text-green-600 hover:text-green-500">
                  <span>Upload a file</span>
                  <input
                    type="file"
                    id="csv_flipkart"
                    name="csv_flipkart"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files[0] || null;
                      setSelectedFlipkartCsvFile(file);
                      setHasCsvFile(e.target.files.length > 0);
                    }}
                    className="sr-only"
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">CSV or Excel (.xlsx, .xls)</p>
              {selectedFlipkartCsvFile && (
                <div className="mt-3 flex items-center gap-2 text-green-900 bg-green-50 p-2 rounded">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">Selected:</span>
                  <span className="truncate text-sm">{selectedFlipkartCsvFile.name}</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              {hasCsvFile
                ? "✓ CSV/Excel file will be used to add origin information"
                : "ℹ Without CSV/Excel, sorting will be done by quantity, SKU, and company"}
            </p>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading || allowed === false || allowed === null || !selectedFlipkartPdfFile}
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
            'Process Flipkart PDF'
          )}
        </button>
      </form>
    </div>
  );
}
