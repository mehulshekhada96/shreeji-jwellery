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
