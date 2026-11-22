import { isGenuineCompanyName } from './companyNameUtils.js';

export const DEFAULT_RETURN_KEYWORDS = {
  // RTO (Courier Return) default keywords
  'COURIER RETURN': 'rto',
  'COURIER_RETURN': 'rto',
  'COURIER RETURN (RTO)': 'rto',
  'RTO': 'rto',
  'FORWARD_RTO': 'rto',
  'RTO_COMPLETE': 'rto',
  // Customer return default keywords
  'CUSTOMER RETURN': 'customer',
  'CUSTOMER_RETURN': 'customer',
  'BUYER RETURN': 'customer',
  'BUYER_RETURN': 'customer',
  'RETURN': 'customer',
  'RET': 'customer',
  'EXCHANGE': 'customer',
  'POST_EXCHANGE_RETURN': 'customer',
  'POST-EXCHANGE-RETURN': 'customer',
  'FIRST_RET': 'customer',
  'SECOND_RET': 'customer'
};

/**
 * Returns true if the file columns indicate a Unified Order/Returns Report
 * (e.g., from marketplace export containing platform and return_type or Sub Order No).
 */
export function isUnifiedReturnsFile(firstRowOrKeys) {
  if (!firstRowOrKeys) return false;
  const keys = Array.isArray(firstRowOrKeys)
    ? firstRowOrKeys.map(k => String(k).trim().toLowerCase())
    : Object.keys(firstRowOrKeys).map(k => String(k).trim().toLowerCase());

  const hasPlatform = keys.some(k => k === 'platform' || k === 'store');
  const hasReturnType = keys.some(k => k === 'return_type' || k === 'return_status' || k === 'status');
  const hasSubOrder = keys.some(k => k === 'sub order no' || k === 'suborder no' || k === 'suborder string' || k === 'order_no');

  return (hasPlatform && hasReturnType) || (hasSubOrder && hasReturnType);
}

/**
 * Classifies a return_type string into either 'rto' or 'customer'.
 * Supports custom keywords dictionary { 'CUSTOM_KEYWORD': 'rto' | 'customer' }.
 * Returns 'unknown' if string looks like an unmapped return status, or null if empty/normal non-return status.
 */
export function classifyReturnType(returnType, customKeywords = {}) {
  if (!returnType) return null;
  const raw = String(returnType).trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();

  // 1. User dynamic keyword mapping check (priority)
  if (customKeywords && typeof customKeywords === 'object') {
    if (customKeywords[upper]) {
      return String(customKeywords[upper]).toLowerCase();
    }
    for (const [k, v] of Object.entries(customKeywords)) {
      if (k.toUpperCase() === upper) {
        return String(v).toLowerCase();
      }
    }
  }

  // 2. Built-in default keywords map
  if (DEFAULT_RETURN_KEYWORDS[upper]) {
    return DEFAULT_RETURN_KEYWORDS[upper];
  }

  // 3. Known regex patterns
  if (/Courier[-_\s]?Return|^RTO$|^FORWARD[-_\s]?RTO$|^RTO[-_\s]?COMPLETE$/i.test(raw)) {
    return 'rto';
  }
  if (/Customer[-_\s]?Return|Buyer[-_\s]?Return|\bRETURN\b|^RET$|\bRET\b|EXCHANGE|POST[-_\s]?EXCHANGE[-_\s]?RETURN|^FIRST_RET$|^SECOND_RET$/i.test(raw)) {
    return 'customer';
  }

  // 4. Known non-return statuses that are safely ignored without prompting
  if (/^(DELIVERED|SHIPPED|CANCELLED|CANCELED|INTRANSIT|IN_TRANSIT|OUT FOR DELIVERY|OFD|PENDING|QC FAILED REDRESSAL|QC_FAILED|NA|SUCCESS)$/i.test(raw)) {
    return null;
  }

  // 5. If it contains return indicators or is an unmapped token from return column
  return 'unknown';
}

/**
 * Parses date string from rscan_time or similar (e.g. "19-11-2026 07:20 PM" or "19-11-2026")
 * into YYYY-MM-DD.
 */
export function parseRscanDate(rscanTime) {
  if (!rscanTime) return null;
  const str = String(rscanTime).trim();
  const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  // Try YYYY-MM-DD
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
 * Parses rows from a Unified Returns report, deduplicates them by SubOrder + AWB,
 * and splits them into categories per platform:
 * - meeshoReturns, meeshoCustomerReturns
 * - snapdealReturns, snapdealCustomerReturns
 * - flipkartReturns, flipkartCustomerReturns
 * - myntraReturns, myntraCustomerReturns
 */
export function parseUnifiedReturnsRows(rows, options = {}) {
  const {
    emailMappings = [],
    defaultDate = '',
    useSelectedDateOnly = true,
    customKeywords = {}
  } = options;

  // Build lookup map from email -> companyName
  const emailMap = new Map();
  emailMappings.forEach(m => {
    if (m.email && m.companyName) {
      emailMap.set(String(m.email).trim().toLowerCase(), String(m.companyName).trim());
    }
  });

  const seenDedupeKeys = new Set();
  let duplicatesSkipped = 0;
  const detectedDates = new Set();
  const unmapped = new Map();
  const unrecognizedReturnTypes = new Set();

  const meeshoReturns = [];
  const meeshoCustomerReturns = [];
  const snapdealReturns = [];
  const snapdealCustomerReturns = [];
  const flipkartReturns = [];
  const flipkartCustomerReturns = [];
  const myntraReturns = [];
  const myntraCustomerReturns = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;

    // Platform detection: supports Meesho, Snapdeal, Flipkart, and Myntra
    const platformRaw = String(row.platform || '').trim().toUpperCase();
    let platform = 'meesho';
    if (platformRaw.includes('SNAPDEAL')) platform = 'snapdeal';
    else if (platformRaw.includes('FLIPKART')) platform = 'flipkart';
    else if (platformRaw.includes('MYNTRA')) platform = 'myntra';

    // Return category classification
    const returnTypeVal = String(row.return_type || '').trim();
    const statusVal = String(row.status || '').trim();
    const rawVal = returnTypeVal || statusVal;
    if (!rawVal) continue;

    const cat = classifyReturnType(rawVal, customKeywords);

    // If unrecognized keyword encountered, flag it for user mapping
    if (cat === 'unknown') {
      if (returnTypeVal) {
        unrecognizedReturnTypes.add(returnTypeVal);
      } else if (rawVal && !/^(DELIVERED|SHIPPED|CANCELLED|CANCELED)$/i.test(rawVal)) {
        unrecognizedReturnTypes.add(rawVal);
      }
      continue;
    }

    if (!cat) continue;

    // Deduplication by Sub Order No + AWB
    const subOrderNo = String(row['Sub Order No'] || row.sub_order_no || row['SubOrder No'] || row.order_no || '').trim();
    const awb = String(row.awb_return || row.awb || '').trim();
    const dedupeKey = `${subOrderNo}_${awb}`;

    if (dedupeKey && dedupeKey !== '_') {
      if (seenDedupeKeys.has(dedupeKey)) {
        duplicatesSkipped++;
        continue;
      }
      seenDedupeKeys.add(dedupeKey);
    }

    // SKU selection: listing_sku (best match) -> style_id -> sku -> Item_name
    const sku = String(row.listing_sku || row.style_id || row.sku || row.Item_name || '').trim();
    if (!sku) continue;

    // Quantity: 1 parcel = 1 return
    const quantity = 1;

    // Date extraction: strictly prioritize user selected calendar date (defaultDate)
    const fileDate = parseRscanDate(row.rscan_time || row.return_delivered_date || row.added_on);
    if (fileDate) detectedDates.add(fileDate);
    const targetDate = useSelectedDateOnly ? (defaultDate || fileDate) : (fileDate || defaultDate);

    // Company resolution:
    // 1. Match platform_id (email) against emailMap
    const email = String(row.platform_id || row.email || '').trim().toLowerCase();
    const store = String(row.Store || row.store || row.company || '').trim();

    let companyName = emailMap.get(email);

    // 2. Fallback: if not found by email, check if Store is genuine
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
      if (cat === 'rto') meeshoReturns.push(orderRecord);
      else meeshoCustomerReturns.push(orderRecord);
    } else if (platform === 'snapdeal') {
      if (cat === 'rto') snapdealReturns.push(orderRecord);
      else snapdealCustomerReturns.push(orderRecord);
    } else if (platform === 'flipkart') {
      if (cat === 'rto') flipkartReturns.push(orderRecord);
      else flipkartCustomerReturns.push(orderRecord);
    } else if (platform === 'myntra') {
      if (cat === 'rto') myntraReturns.push(orderRecord);
      else myntraCustomerReturns.push(orderRecord);
    }
  }

  const primaryDate = useSelectedDateOnly ? (defaultDate || Array.from(detectedDates)[0] || '') : (Array.from(detectedDates)[0] || defaultDate || '');

  return {
    success: true,
    primaryDate,
    detectedDates: Array.from(detectedDates),
    duplicatesSkipped,
    unmapped: Array.from(unmapped.values()),
    unrecognizedReturnTypes: Array.from(unrecognizedReturnTypes),
    meeshoReturns,
    meeshoCustomerReturns,
    snapdealReturns,
    snapdealCustomerReturns,
    flipkartReturns,
    flipkartCustomerReturns,
    myntraReturns,
    myntraCustomerReturns,
    counts: {
      meeshoReturns: meeshoReturns.length,
      meeshoCustomerReturns: meeshoCustomerReturns.length,
      snapdealReturns: snapdealReturns.length,
      snapdealCustomerReturns: snapdealCustomerReturns.length,
      flipkartReturns: flipkartReturns.length,
      flipkartCustomerReturns: flipkartCustomerReturns.length,
      myntraReturns: myntraReturns.length,
      myntraCustomerReturns: myntraCustomerReturns.length,
      total: meeshoReturns.length + meeshoCustomerReturns.length +
             snapdealReturns.length + snapdealCustomerReturns.length +
             flipkartReturns.length + flipkartCustomerReturns.length +
             myntraReturns.length + myntraCustomerReturns.length
    }
  };
}
