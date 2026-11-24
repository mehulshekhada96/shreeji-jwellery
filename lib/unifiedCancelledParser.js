import { isGenuineCompanyName } from './companyNameUtils.js';

/**
 * Returns true if the file columns indicate a Unified Order/Cancel Report
 * (e.g., marketplace export containing platform/store and status/cscan/suborder).
 */
export function isUnifiedCancelledFile(firstRowOrKeys) {
  if (!firstRowOrKeys) return false;
  const keys = Array.isArray(firstRowOrKeys)
    ? firstRowOrKeys.map(k => String(k).trim().toLowerCase())
    : Object.keys(firstRowOrKeys).map(k => String(k).trim().toLowerCase());

  const hasPlatform = keys.some(k => k === 'platform' || k === 'store');
  const hasStatus = keys.some(k => k === 'status' || k === 'cscan' || k === 'packet_scan_status' || k === 'return_type');
  const hasSubOrder = keys.some(k => k === 'sub order no' || k === 'suborder no' || k === 'suborder string' || k === 'order_no' || k === 'order no');

  return (hasPlatform && hasStatus) || (hasSubOrder && hasStatus);
}

/**
 * Parses date string from cscan_time, order_date, or similar (e.g. "24-11-2026 11:34 AM" or "22-11-2026")
 * into YYYY-MM-DD.
 */
export function parseDateString(dateVal) {
  if (!dateVal) return null;
  const str = String(dateVal).trim();
  const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return null;
}

/**
 * Checks if a row represents a cancelled order.
 */
export function isCancelledRow(row) {
  if (!row) return false;
  const status = String(row.status || row.order_status || row.return_type || '').trim().toUpperCase();
  if (/CANCEL/i.test(status)) return true;

  const cscan = String(row.cscan || '').trim().toUpperCase();
  if (cscan === 'YES') return true;

  const packetScan = String(row.packet_scan_status || '').trim().toUpperCase();
  if (/CANCEL/i.test(packetScan)) return true;

  return false;
}

/**
 * Parses rows from a Unified Orders / Cancelled report, deduplicates them,
 * and splits them into categories per platform:
 * - meeshoCancelled
 * - snapdealCancelled
 * - flipkartCancelled
 * - myntraCancelled
 */
export function parseUnifiedCancelledRows(rows, options = {}) {
  const {
    emailMappings = [],
    defaultDate = '',
    useSelectedDateOnly = true,
    defaultPlatform = 'meesho'
  } = options;

  // Build lookup map from email/identifier -> companyName
  const emailMap = new Map();
  emailMappings.forEach(m => {
    if (m.email && m.companyName) {
      emailMap.set(String(m.email).trim().toLowerCase(), String(m.companyName).trim());
    }
  });

  const seenDedupeKeys = new Set();
  const detectedDates = new Set();
  const unmapped = new Map();

  const meeshoCancelled = [];
  const snapdealCancelled = [];
  const flipkartCancelled = [];
  const myntraCancelled = [];

  let duplicatesSkipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;

    // Filter only cancelled orders
    if (!isCancelledRow(row)) continue;

    // Determine platform
    const platformRaw = String(row.platform || row.Store || '').toUpperCase();
    let platform = defaultPlatform || 'meesho';
    if (platformRaw.includes('SNAPDEAL')) platform = 'snapdeal';
    else if (platformRaw.includes('FLIPKART')) platform = 'flipkart';
    else if (platformRaw.includes('MYNTRA')) platform = 'myntra';
    else if (platformRaw.includes('MEESHO')) platform = 'meesho';

    // Sub Order / Order No & AWB
    const subOrderNo = String(row['Sub Order No'] || row.sub_order_no || row['SubOrder No'] || row.order_no || row['order no'] || '').trim();
    const awb = String(row.awb || row.awb2 || row.awb_return || '').trim();

    // SKU selection: listing_sku -> style_id -> sku -> Item_name
    const sku = String(row.listing_sku || row.style_id || row.sku || row.Item_name || '').trim();
    if (!sku) continue;

    // Deduplication by Sub Order No + SKU (or AWB)
    const dedupeKey = `${subOrderNo}_${sku}_${awb}`;
    if (dedupeKey && dedupeKey !== '__') {
      if (seenDedupeKeys.has(dedupeKey)) {
        duplicatesSkipped++;
        continue;
      }
      seenDedupeKeys.add(dedupeKey);
    }

    // Quantity
    const quantity = Math.round(Number(row.qty) || Number(row.mapped_qty) || 1);

    // Date extraction: prioritize user selected calendar date (defaultDate)
    const fileDate = parseDateString(row.cscan_time || row.order_date || row.LastUpdated || row.added_on || row.dscan_time);
    if (fileDate) detectedDates.add(fileDate);
    const targetDate = useSelectedDateOnly ? (defaultDate || fileDate) : (fileDate || defaultDate);

    // Company resolution:
    // 1. Match platform_id / email against emailMap
    const email = String(row.platform_id || row.email || '').trim().toLowerCase();
    const store = String(row.Store || row.store || row.company || '').trim();

    let companyName = emailMap.get(email);
    if (!companyName && store) {
      companyName = emailMap.get(store.toLowerCase());
    }

    // 2. Fallback: if not found in emailMap, check if Store is genuine
    if (!companyName && store && isGenuineCompanyName(store)) {
      companyName = store;
    }

    // 3. Fallback: if email is genuine name
    if (!companyName && email && isGenuineCompanyName(email)) {
      companyName = email;
    }

    // If company cannot be resolved, record as unmapped
    if (!companyName) {
      const unmappedKey = email || store || `Row_${i + 2}`;
      unmapped.set(unmappedKey, {
        email: email || store,
        store,
        platform,
        rowIndex: i + 2
      });
      continue;
    }

    const orderRecord = {
      companyName,
      sku,
      quantity,
      email: email || '',
      date: targetDate,
      subOrderNo,
      awb
    };

    if (platform === 'meesho') {
      meeshoCancelled.push(orderRecord);
    } else if (platform === 'snapdeal') {
      snapdealCancelled.push(orderRecord);
    } else if (platform === 'flipkart') {
      flipkartCancelled.push(orderRecord);
    } else if (platform === 'myntra') {
      myntraCancelled.push(orderRecord);
    }
  }

  const primaryDate = useSelectedDateOnly ? (defaultDate || Array.from(detectedDates)[0] || '') : (Array.from(detectedDates)[0] || defaultDate || '');

  return {
    success: true,
    primaryDate,
    detectedDates: Array.from(detectedDates),
    duplicatesSkipped,
    unmapped: Array.from(unmapped.values()),
    meeshoCancelled,
    snapdealCancelled,
    flipkartCancelled,
    myntraCancelled,
    counts: {
      meeshoCancelled: meeshoCancelled.length,
      snapdealCancelled: snapdealCancelled.length,
      flipkartCancelled: flipkartCancelled.length,
      myntraCancelled: myntraCancelled.length,
      total: meeshoCancelled.length + snapdealCancelled.length + flipkartCancelled.length + myntraCancelled.length
    }
  };
}
