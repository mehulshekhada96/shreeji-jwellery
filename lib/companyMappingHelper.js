import connectToDatabase from './mongodb';
import CompanyMapping from '../models/CompanyMapping';

/**
 * Loads company mapping info for a tenant company:
 * - aliasMap: Map of UPPERCASE rawName -> UPPERCASE canonicalName
 * - ignoredSet: Set of UPPERCASE non-company names marked as isIgnored: true
 */
export async function getCompanyMappingInfo(companyId, platform) {
  if (!companyId) {
    return { aliasMap: new Map(), ignoredSet: new Set() };
  }

  await connectToDatabase();

  const query = { company: companyId };
  if (platform && platform !== 'all') {
    const plat = platform.toLowerCase().trim();
    if (plat === 'meesho') {
      query.platform = { $in: ['meesho', null, ''] };
    } else {
      query.platform = plat;
    }
  }

  const allRecords = await CompanyMapping.find(query)
    .select('rawName canonicalName isIgnored isDeleted platform')
    .lean();

  // Generic 'all' mappings come first; platform-specific mappings come last to take precedence
  allRecords.sort((a, b) => {
    const aP = (a.platform || 'all').toLowerCase();
    const bP = (b.platform || 'all').toLowerCase();
    if (aP === 'all' && bP !== 'all') return -1;
    if (aP !== 'all' && bP === 'all') return 1;
    return 0;
  });

  const ignoredSet = new Set();
  const aliasMap = new Map();

  for (const m of allRecords) {
    if (m.isIgnored && m.rawName) {
      ignoredSet.add(m.rawName.trim().toUpperCase());
    } else if (!m.isDeleted && !m.isIgnored && m.rawName && m.canonicalName) {
      aliasMap.set(m.rawName.trim().toUpperCase(), m.canonicalName.trim().toUpperCase());
    }
  }

  return { aliasMap, ignoredSet };
}

/**
 * Loads active company mappings for a tenant company.
 * Returns a Map: UPPERCASE rawName -> UPPERCASE canonicalName
 */
export async function getCompanyMappingDict(companyId, platform) {
  const { aliasMap } = await getCompanyMappingInfo(companyId, platform);
  return aliasMap;
}

/**
 * Resolves a raw company name to its canonical name using the mapping dict.
 * If no mapping exists, returns the trimmed rawName in UPPERCASE.
 */
export function resolveCompanyName(rawName, mappingDict) {
  if (!rawName) return 'UNKNOWN COMPANY';
  const upper = rawName.trim().toUpperCase();
  if (!mappingDict || !(mappingDict instanceof Map)) return upper;

  if (mappingDict.has(upper)) {
    return mappingDict.get(upper);
  }

  return upper;
}

/**
 * Returns the effective assigned company names for a user:
 * - null: unrestricted access (admin, administrator, or manager with explicit hasAllCompanyAccess: true)
 * - Array of uppercase strings: restricted to these accounts
 * - [] (empty array): restricted to 0 accounts (zero assignments = zero access)
 */
export function getAssignedCompaniesForUser(user) {
  if (!user) return [];
  const role = (user.role || '').toLowerCase();
  if (role === 'admin' || role === 'administrator') {
    return null;
  }
  if (role === 'manager') {
    if (user.hasAllCompanyAccess === true) {
      return null;
    }
    if (Array.isArray(user.assignedCompanies)) {
      return user.assignedCompanies.map(c => String(c).trim().toUpperCase()).filter(Boolean);
    }
    return [];
  }
  return [];
}

/**
 * Builds a MongoDB query condition for companyName taking into account:
 * 1. Manager assigned company isolation (zero assignments = zero accounts)
 * 2. Explicit admin hasAllCompanyAccess override
 * 3. Requested company filters
 * 4. Dynamic alias expansion
 * 
 * Returns:
 * - null: no specific filter needed (unrestricted user with no requested companies)
 * - RegExp or { $in: [...] }: matching allowed company names and their aliases
 * - { $in: [] }: access restricted / empty match (e.g. 0 assigned accounts or requested unassigned account)
 */
export function buildCompanyQueryFilter({ user, requestedCompanies = [], aliasMap = new Map() }) {
  const assigned = getAssignedCompaniesForUser(user);

  // If user is restricted (assigned is an Array, even if empty [])
  if (Array.isArray(assigned)) {
    if (assigned.length === 0) {
      // Zero assigned accounts means zero accessible accounts!
      return { $in: [] };
    }

    const cleanRequested = (Array.isArray(requestedCompanies) ? requestedCompanies : [requestedCompanies])
      .filter(Boolean)
      .map(c => String(c).trim().toUpperCase());

    const assignedUpperSet = new Set(assigned);
    let effectiveCompanies = [];

    if (cleanRequested.length > 0) {
      effectiveCompanies = cleanRequested.filter(c => assignedUpperSet.has(c));
      if (effectiveCompanies.length === 0) {
        // Manager requested an account not assigned to them
        return { $in: [] };
      }
    } else {
      effectiveCompanies = [...assigned];
    }

    // Expand aliases for allowed effective companies
    const expandedUpperSet = new Set(effectiveCompanies);
    if (aliasMap && aliasMap instanceof Map) {
      for (const [rawUpper, canonicalUpper] of aliasMap.entries()) {
        if (expandedUpperSet.has(canonicalUpper) || expandedUpperSet.has(rawUpper)) {
          expandedUpperSet.add(canonicalUpper);
          expandedUpperSet.add(rawUpper);
        }
      }
    }

    const regexList = [...expandedUpperSet].map(c => new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
    return regexList.length === 1 ? regexList[0] : { $in: regexList };
  }

  // Unrestricted user (Admin or Manager with hasAllCompanyAccess === true)
  const cleanRequested = (Array.isArray(requestedCompanies) ? requestedCompanies : [requestedCompanies])
    .filter(Boolean)
    .map(c => String(c).trim().toUpperCase());

  if (cleanRequested.length > 0) {
    const expandedUpperSet = new Set(cleanRequested);
    if (aliasMap && aliasMap instanceof Map) {
      for (const [rawUpper, canonicalUpper] of aliasMap.entries()) {
        if (expandedUpperSet.has(canonicalUpper) || expandedUpperSet.has(rawUpper)) {
          expandedUpperSet.add(canonicalUpper);
          expandedUpperSet.add(rawUpper);
        }
      }
    }
    const regexList = [...expandedUpperSet].map(c => new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
    return regexList.length === 1 ? regexList[0] : { $in: regexList };
  }

  return null;
}


