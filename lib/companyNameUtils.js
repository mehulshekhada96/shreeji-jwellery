/**
 * Utility functions and constants for validating and normalizing genuine seller company names
 * across marketplace invoice parsing, sorting, and reconciliation billing.
 * 
 * Works cleanly in both Browser (client-side) and Node.js (API/server-side).
 */

export const DEFAULT_IGNORED_COMPANIES = new Set([
  'TOTAL',
  'TOTAL ITEMS',
  'COD',
  'PREPAID',
  'CASH ON DELIVERY',
  'UNKNOWN COMPANY',
  'DELHIVERY',
  'SHADOWFAX',
  'EKART',
  'XPRESSBEES',
  'BLUEDART',
  'ECOM EXPRESS',
  'AMAZON SHIPPING',
  'TAX INVOICE',
  'SELLER ADDRESS',
  'SHIPPED FROM',
  'DELIVERY ADDRESS',
  'BUYER',
  'SELLER',
  'RETURN ADDRESS',
  'SNAPDEAL',
  'SNAPDEAL REFERENCE',
  'AMOUNT ALREADY PAID',
  'CASH TO BE COLLECTED',
  'ITEM DESCRIPTION',
  'CUSTOMER ACKNOWLEDGEMENT',
  'DECLARATION',
  'ORIGINAL FOR RECIPIENT',
  'PACKSLIP PRINT FAILED FOR ONE OR MORE PACKAGES'
]);

export const NON_GENUINE_COMPANY_REGEX = /PACKSLIP|PRINT\s+FAILED|FAILED|ERROR|PACKAGE|TAX\s*INVOICE|DELIVERY\s+ADDRESS|SELLER\s+ADDRESS|SHIPPED\s+FROM|RETURN\s+ADDRESS|^COD$|^PREPAID$|^CASH\s+ON\s+DELIVERY$|^UNKNOWN\s+COMPANY$/i;

/**
 * Normalizes known seller aliases or proprietor trade names to their canonical portal brand.
 * E.g. CHINTAN LALLUBHAI DHANKECHA / ZXIRZ / 24CPHPD1557F3Z6 -> ZXRIZ
 */
export function normalizeCanonicalCompanyName(name) {
  if (!name || typeof name !== 'string') return name;
  const upper = name.trim().toUpperCase();
  if (/CHINTAN\s+LALLUBHAI|DHANKECHA|ZXIRZ/i.test(upper)) {
    return 'ZXRIZ';
  }
  return name.trim();
}

/**
 * Builds a robust MongoDB query filter to exclude non-genuine company names,
 * error banners, payment terms, and user-ignored aliases using MongoDB's $not regex.
 */
export function buildIgnoredCompanyDbFilter(ignoredSet = new Set()) {
  const words = [
    'PACKSLIP',
    'PRINT\\s+FAILED',
    'FAILED',
    'ERROR',
    'PACKAGE',
    'TAX\\s*INVOICE',
    'DELIVERY\\s+ADDRESS',
    'SELLER\\s+ADDRESS',
    'SHIPPED\\s+FROM',
    'RETURN\\s+ADDRESS',
    '^COD$',
    '^PREPAID$',
    '^CASH\\s+ON\\s+DELIVERY$',
    '^UNKNOWN\\s+COMPANY$'
  ];

  if (ignoredSet && ignoredSet.size > 0) {
    for (const item of ignoredSet) {
      if (item && typeof item === 'string') {
        const escaped = item.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (escaped) words.push(`^${escaped}$`);
      }
    }
  }

  const combinedPattern = words.join('|');
  return { $not: new RegExp(combinedPattern, 'i') };
}

/**
 * Validates whether a raw string is a genuine business seller company name
 * or an error banner / workflow artifact / payment term / courier name.
 */
export function isGenuineCompanyName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;

  const upper = trimmed.toUpperCase();

  // 1. Check exact match in default ignored set
  if (DEFAULT_IGNORED_COMPANIES.has(upper)) return false;

  // 2. Reject strings containing workflow, error, packaging or document phrases
  const invalidSubstrings = [
    'PACKSLIP', 'PRINT', 'FAILED', 'ERROR', 'PACKAGE', 'PACKAGES',
    'TAX INVOICE', 'INVOICE', 'DELIVERY ADDRESS', 'SELLER ADDRESS',
    'SHIPPED FROM', 'RETURN ADDRESS', 'SNAPDEAL', 'REFERENCE',
    'CASH TO BE COLLECTED', 'AMOUNT ALREADY PAID', 'TOTAL ITEMS',
    'CUSTOMER ACKNOWLEDGEMENT', 'DECLARATION', 'REVERSE CHARGE',
    'AUTHORISED SIGNATORY', 'BUYER', 'CONSIGNEE', 'DISPATCH',
    'NEED HELP', 'PLEASE VISIT', 'MY ORDERS', 'PRIZE SCHEME',
    'LOTTERY', 'LUCKY DRAW', 'BEWARE', 'FRAUD', 'CALLS/SMS'
  ];

  for (const kw of invalidSubstrings) {
    if (upper.includes(kw)) return false;
  }

  // 3. Reject totals and calculations
  if (/^(?:TOTAL|SUMMARY|SUBTOTAL|GRAND TOTAL)\b/i.test(trimmed)) return false;

  // 4. Reject payment methods
  if (/^(?:COD|PREPAID|CASH|ONLINE|POSTPAID)\b/i.test(trimmed)) return false;

  // 4. Reject courier names alone
  if (/^(?:DELHIVERY|SHADOWFAX|EKART|XPRESSBEES|BLUEDART|ECOM EXPRESS)\b/i.test(trimmed)) return false;

  // 5. Reject long sentences (more than 5 words or containing sentence particles)
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 5) return false;
  if (/\b(?:FOR|ONE|OR|MORE|THE|PLEASE|SECTION|UNDER|WITH|THAT|THIS|SHOWS|ACTUAL)\b/i.test(trimmed)) return false;

  return true;
}
