import { authMiddleware } from './common/common.services';
import SkuInventory from '../../models/SkuInventory';
import Company from '../../models/company';
import { USER_ROLES } from '../../lib/constants';
import connectToDatabase from '../../lib/mongodb';
import { getCompanyMappingInfo, resolveCompanyName, buildCompanyQueryFilter, getAssignedCompaniesForUser } from '../../lib/companyMappingHelper';

async function handler(req, res) {
    await connectToDatabase();
    
    const user = req.userData;
    if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check permissions
    if (![USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.ADMINISTRATOR].includes(user.role)) {
        return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const company = await Company.findById(user.company).lean();
    if (!company) {
        return res.status(404).json({ message: 'Company not found' });
    }

    if (!company.featureFlags?.isExtractSKU) {
        return res.status(403).json({ message: 'SKU feature is disabled for your company' });
    }

    if (req.method === 'GET') {
        try {
            const { platform } = req.query;

            const query = {
                company: user.company,
                isDeleted: false
            };
            if (platform === 'flipkart') {
                query.platform = 'flipkart';
            } else if (platform === 'snapdeal') {
                query.platform = 'snapdeal';
            } else if (platform === 'myntra') {
                query.platform = 'myntra';
            } else if (platform === 'amazon') {
                query.platform = 'amazon';
            } else if (platform === 'meesho') {
                query.platform = { $nin: ['flipkart', 'snapdeal', 'myntra', 'amazon'] };
            }

            const { aliasMap, ignoredSet } = await getCompanyMappingInfo(user.company, platform);

            const companyFilter = buildCompanyQueryFilter({ user, requestedCompanies: [], aliasMap });
            if (companyFilter) {
                query.companyName = companyFilter;
            } else if (ignoredSet.size > 0) {
                const ignoredRegexList = [...ignoredSet].map(c => new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
                query.companyName = { $nin: ignoredRegexList };
            }

            // Get unique dates
            const dates = await SkuInventory.distinct('selectedDate', query);

            // Get unique company names (trim and resolve via mapping)
            const companyNames = await SkuInventory.distinct('companyName', query);

            const canonicalNamesSet = new Set();
            companyNames.forEach(name => {
                if (name && typeof name === 'string' && name.trim()) {
                    const clean = name.trim();
                    if (!ignoredSet.has(clean.toUpperCase())) {
                        canonicalNamesSet.add(resolveCompanyName(clean, aliasMap));
                    }
                }
            });

            // Sort dates in descending order
            dates.sort((a, b) => new Date(b) - new Date(a));

            // Sort canonical company names alphabetically
            let trimmedCompanyNames = [...canonicalNamesSet].sort((a, b) => a.localeCompare(b));
            const assigned = getAssignedCompaniesForUser(user);
            if (Array.isArray(assigned)) {
                if (assigned.length === 0) {
                    trimmedCompanyNames = [];
                } else {
                    const assignedUpperSet = new Set(assigned.map(c => c.toUpperCase()));
                    trimmedCompanyNames = Array.from(assignedUpperSet)
                        .filter(c => !ignoredSet.has(c))
                        .sort((a, b) => a.localeCompare(b));
                }
            }

            return res.status(200).json({
                success: true,
                dates: dates,
                companyNames: trimmedCompanyNames
            });
        } catch (error) {
            console.error('Error fetching filter options:', error);
            return res.status(500).json({ message: 'Error fetching filters', error: error.message });
        }
    }

    return res.status(405).json({ message: 'Method not allowed' });
}

export default authMiddleware(handler);

