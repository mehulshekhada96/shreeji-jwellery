import connectToDatabase from '../../../lib/mongodb';
import CompanyMapping from '../../../models/CompanyMapping';
import SkuInventory from '../../../models/SkuInventory';
import CancelledOrder from '../../../models/CancelledOrder';
import ReturnOrder from '../../../models/ReturnOrder';
import CustomerReturnOrder from '../../../models/CustomerReturnOrder';
import { authMiddleware } from '../common/common.services';
import { USER_ROLES } from '../../../lib/constants';

async function handler(req, res) {
  const { method } = req;

  try {
    const user = req.userData;
    if (!user || !user.company) {
      return res.status(401).json({ message: 'Unauthorized or no company associated' });
    }

    const companyId = user.company;
    await connectToDatabase();

    // 1. GET: Return canonical groups + raw names per platform (or all)
    if (method === 'GET') {
      const { platform = 'all' } = req.query;
      const targetPlatform = (platform || 'all').toLowerCase().trim();

      // Find mappings strictly for this platform
      const mappingQuery = { company: companyId };
      if (targetPlatform !== 'all') {
        if (targetPlatform === 'meesho') {
          mappingQuery.platform = { $in: ['meesho', null, ''] };
        } else {
          mappingQuery.platform = targetPlatform;
        }
      }
      const allRecords = await CompanyMapping.find(mappingQuery).lean();

      // Sort so 'all' mappings come first and specific platform mappings come last,
      // giving precedence to platform-specific mappings
      allRecords.sort((a, b) => {
        const aP = (a.platform || 'all').toLowerCase();
        const bP = (b.platform || 'all').toLowerCase();
        if (aP === 'all' && bP !== 'all') return -1;
        if (aP !== 'all' && bP === 'all') return 1;
        return 0;
      });

      // Set of ignored/deleted non-company names (in UPPERCASE)
      const ignoredNamesSet = new Set(
        allRecords
          .filter(m => m.isIgnored)
          .map(m => (m.rawName || '').trim().toUpperCase())
          .filter(Boolean)
      );

      // Active mapping records (not ignored and not deleted)
      const activeMappings = allRecords.filter(m => !m.isIgnored && !m.isDeleted && m.canonicalName);

      // Find distinct raw company names appearing in database for selected platform
      let invQuery = { company: companyId };
      let includeReturnsAndCancels = false;

      if (targetPlatform === 'meesho') {
        invQuery.platform = { $nin: ['flipkart', 'snapdeal', 'myntra', 'amazon'] };
        includeReturnsAndCancels = true;
      } else if (targetPlatform === 'flipkart') {
        invQuery.platform = 'flipkart';
      } else if (targetPlatform === 'amazon') {
        invQuery.platform = 'amazon';
      } else if (targetPlatform === 'myntra') {
        invQuery.platform = 'myntra';
      } else if (targetPlatform === 'snapdeal') {
        invQuery.platform = 'snapdeal';
      } else {
        // 'all'
        includeReturnsAndCancels = true;
      }

      const dbPromises = [SkuInventory.find(invQuery).distinct('companyName')];
      if (includeReturnsAndCancels) {
        dbPromises.push(
          CancelledOrder.find({ company: companyId }).distinct('companyName'),
          ReturnOrder.find({ company: companyId }).distinct('companyName'),
          CustomerReturnOrder.find({ company: companyId }).distinct('companyName')
        );
      }

      const dbResults = await Promise.all(dbPromises);
      const invNames = dbResults[0] || [];
      const extraNames = dbResults.slice(1).flat();

      // Normalize ALL company names to UPPERCASE and make UNIQUE
      const allRawNamesSet = new Set();
      [...invNames, ...extraNames].forEach(name => {
        if (name && typeof name === 'string' && name.trim()) {
          const uName = name.trim().toUpperCase();
          if (!ignoredNamesSet.has(uName)) {
            allRawNamesSet.add(uName);
          }
        }
      });

      // Also include any raw names from active mappings (if not ignored)
      activeMappings.forEach(m => {
        if (m.rawName) {
          const rUpper = m.rawName.trim().toUpperCase();
          if (!ignoredNamesSet.has(rUpper)) {
            allRawNamesSet.add(rUpper);
          }
        }
      });

      const allRawNames = [...allRawNamesSet].sort((a, b) => a.localeCompare(b));

      // Build mapping map: rawName -> canonicalName
      const rawToCanonical = {};
      activeMappings.forEach(m => {
        if (m.rawName && m.canonicalName) {
          const rUpper = m.rawName.trim().toUpperCase();
          const cUpper = m.canonicalName.trim().toUpperCase();
          rawToCanonical[rUpper] = cUpper;
        }
      });

      // Build canonical groups: canonicalName -> Set of alias rawNames
      const canonicalGroupsMap = new Map();

      // Seed with canonical names from active mappings
      activeMappings.forEach(m => {
        if (m.canonicalName) {
          const cUpper = m.canonicalName.trim().toUpperCase();
          if (!ignoredNamesSet.has(cUpper)) {
            if (!canonicalGroupsMap.has(cUpper)) {
              canonicalGroupsMap.set(cUpper, new Set());
            }
            if (m.rawName) {
              const rUpper = m.rawName.trim().toUpperCase();
              if (!ignoredNamesSet.has(rUpper)) {
                canonicalGroupsMap.get(cUpper).add(rUpper);
              }
            }
          }
        }
      });

      // For any raw company that is NOT mapped to a different canonical name,
      // it is its own canonical company by default!
      allRawNames.forEach(raw => {
        if (!rawToCanonical[raw] && !ignoredNamesSet.has(raw)) {
          if (!canonicalGroupsMap.has(raw)) {
            canonicalGroupsMap.set(raw, new Set());
          }
          canonicalGroupsMap.get(raw).add(raw);
        }
      });

      // Format canonical groups as array of objects
      const canonicalGroups = [];
      canonicalGroupsMap.forEach((aliasSet, canonicalName) => {
        canonicalGroups.push({
          canonicalName,
          platform: targetPlatform,
          aliases: [...aliasSet].sort((a, b) => a.localeCompare(b)),
        });
      });

      canonicalGroups.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));

      // Calculate counts for each platform tab
      let platformCounts = {
        all: allRawNames.length,
        meesho: 0,
        amazon: 0,
        flipkart: 0,
        myntra: 0,
        snapdeal: 0,
      };

      try {
        const [skuPlatforms, canNames, retNames, custNames] = await Promise.all([
          SkuInventory.aggregate([
            { $match: { company: companyId } },
            { $group: { _id: { $toLower: { $ifNull: ['$platform', 'meesho'] } }, names: { $addToSet: { $toUpper: '$companyName' } } } }
          ]),
          CancelledOrder.find({ company: companyId }).distinct('companyName'),
          ReturnOrder.find({ company: companyId }).distinct('companyName'),
          CustomerReturnOrder.find({ company: companyId }).distinct('companyName'),
        ]);

        const meeshoExtra = new Set([...canNames, ...retNames, ...custNames].map(n => (n || '').trim().toUpperCase()).filter(Boolean));
        const meeshoNamesSet = new Set(meeshoExtra);

        skuPlatforms.forEach(p => {
          const plat = p._id;
          const valid = (p.names || []).filter(n => !ignoredNamesSet.has(n));
          if (['flipkart', 'amazon', 'myntra', 'snapdeal'].includes(plat)) {
            platformCounts[plat] = valid.length;
          } else {
            valid.forEach(n => meeshoNamesSet.add(n));
          }
        });
        platformCounts.meesho = [...meeshoNamesSet].filter(n => !ignoredNamesSet.has(n)).length;

        // Total all platforms
        const allSet = new Set([
          ...meeshoNamesSet,
          ...(skuPlatforms.flatMap(p => p.names || []))
        ]);
        platformCounts.all = [...allSet].filter(n => !ignoredNamesSet.has(n)).length;
      } catch (cntErr) {
        console.error('Error calculating platform counts:', cntErr);
      }

      return res.status(200).json({
        success: true,
        canonicalGroups,
        allRawNames,
        ignoredNames: [...ignoredNamesSet].sort(),
        platformCounts,
        activePlatform: targetPlatform,
      });
    }

    // Role check for modifications
    const allowedRoles = [USER_ROLES.ADMIN, USER_ROLES.ADMINISTRATOR, USER_ROLES.MANAGER];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ message: 'Insufficient role to manage company mappings' });
    }

    // 2. POST: Add alias, create master, ignore (delete), import Excel
    if (method === 'POST') {
      const { action, canonicalName, rawName, name, platform = 'all' } = req.body;
      const cleanPlatform = (platform || 'all').toLowerCase().trim();

      // Action: Import array from Excel
      if (action === 'import-excel' || Array.isArray(req.body.mappings)) {
        const rows = req.body.mappings || [];
        let importedCount = 0;
        let ignoredCount = 0;

        for (const row of rows) {
          const canonical = (row.canonicalName || row['Main Company'] || row['Canonical'] || row['canonical'] || '').trim().toUpperCase();
          const raw = (row.rawName || row['Alias Name'] || row['Alias'] || row['rawName'] || row['raw'] || '').trim().toUpperCase();
          const rowPlatform = (row.platform || row.Platform || row['Platform'] || cleanPlatform || 'all').toLowerCase().trim();
          const isIgnored = Boolean(row.isIgnored || String(row['Type'] || '').toLowerCase().includes('ignore'));

          if (isIgnored && (raw || canonical)) {
            const target = raw || canonical;
            const existing = await CompanyMapping.findOne({
              company: companyId,
              platform: rowPlatform,
              rawName: new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            });
            if (existing) {
              existing.isIgnored = true;
              existing.isDeleted = false;
              await existing.save();
            } else {
              await new CompanyMapping({
                company: companyId,
                platform: rowPlatform,
                rawName: target,
                canonicalName: target,
                isIgnored: true,
              }).save();
            }
            ignoredCount++;
            continue;
          }

          if (!canonical || !raw) continue;

          if (raw === canonical) {
            await CompanyMapping.updateMany(
              {
                company: companyId,
                platform: { $in: [rowPlatform, 'all'] },
                rawName: new RegExp(`^${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
              },
              { $set: { isDeleted: true, isIgnored: false } }
            );
          } else {
            const existing = await CompanyMapping.findOne({
              company: companyId,
              platform: rowPlatform,
              rawName: new RegExp(`^${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            });
            if (existing) {
              existing.canonicalName = canonical;
              existing.isDeleted = false;
              existing.isIgnored = false;
              await existing.save();
            } else {
              await new CompanyMapping({
                company: companyId,
                platform: rowPlatform,
                rawName: raw,
                canonicalName: canonical,
                isIgnored: false,
              }).save();
            }
            importedCount++;
          }
        }

        return res.status(200).json({
          success: true,
          message: `એક્સેલમાંથી ${importedCount} મેપિંગ્સ સફળતાપૂર્વક ઇમ્પોર્ટ થઈ ગયા!`,
          importedCount,
          ignoredCount,
        });
      }

      // Action: Ignore / Delete multiple names (multi-delete with checkboxes)
      if (action === 'delete-multiple' || action === 'delete-names') {
        const names = (req.body.names || []).map(n => (n || '').trim().toUpperCase()).filter(Boolean);
        if (names.length === 0) {
          return res.status(400).json({ message: 'No names provided to delete' });
        }

        const nameRegexes = names.map(n => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));

        // Upsert ignore record for each name: isIgnored=true, isDeleted=false
        for (const targetName of names) {
          await CompanyMapping.findOneAndUpdate(
            {
              company: companyId,
              platform: cleanPlatform,
              rawName: new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            },
            {
              $set: {
                platform: cleanPlatform,
                rawName: targetName,
                canonicalName: targetName,
                isIgnored: true,
                isDeleted: false,
                notes: 'Deleted/Ignored non-company name',
              },
            },
            { upsert: true, new: true }
          );
        }

        // Clean up any OTHER mappings where canonicalName was in names
        const cleanupQuery = {
          company: companyId,
          canonicalName: { $in: nameRegexes },
          rawName: { $nin: nameRegexes },
        };
        if (cleanPlatform !== 'all') {
          cleanupQuery.platform = cleanPlatform === 'meesho' ? { $in: ['meesho', null, ''] } : cleanPlatform;
        }
        await CompanyMapping.updateMany(cleanupQuery, { $set: { isDeleted: true } });

        return res.status(200).json({
          success: true,
          message: `${names.length} નામો સફળતાપૂર્વક હટાવી દીધા!`,
          deletedCount: names.length,
        });
      }

      // Action: Ignore / Delete a single name from left side completely (non-company name)
      if (action === 'delete-name' || action === 'ignore-name') {
        const targetName = (name || rawName || canonicalName || '').trim().toUpperCase();
        if (!targetName) {
          return res.status(400).json({ message: 'Name is required to delete' });
        }

        const targetRegex = new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

        // Upsert ignore record: MUST have isIgnored=true, isDeleted=false
        await CompanyMapping.findOneAndUpdate(
          {
            company: companyId,
            platform: cleanPlatform,
            rawName: targetRegex,
          },
          {
            $set: {
              platform: cleanPlatform,
              rawName: targetName,
              canonicalName: targetName,
              isIgnored: true,
              isDeleted: false,
              notes: 'Deleted/Ignored non-company name',
            },
          },
          { upsert: true, new: true }
        );

        // Also clean up any other mappings where canonicalName was this targetName
        const cleanupSingleQuery = {
          company: companyId,
          canonicalName: targetRegex,
          rawName: { $not: targetRegex },
        };
        if (cleanPlatform !== 'all') {
          cleanupSingleQuery.platform = cleanPlatform === 'meesho' ? { $in: ['meesho', null, ''] } : cleanPlatform;
        }
        await CompanyMapping.updateMany(cleanupSingleQuery, { $set: { isDeleted: true } });

        return res.status(200).json({
          success: true,
          message: `'${targetName}' ને લિસ્ટમાંથી સફળતાપૂર્વક હટાવી દીધું!`,
        });
      }

      // Action: Restore multiple ignored names
      if (action === 'restore-multiple') {
        const names = (req.body.names || []).map(n => (n || '').trim().toUpperCase()).filter(Boolean);
        if (names.length === 0) {
          return res.status(400).json({ message: 'No names provided to restore' });
        }

        const nameRegexes = names.map(n => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));

        await CompanyMapping.deleteMany({
          company: companyId,
          rawName: { $in: nameRegexes },
          isIgnored: true,
        });

        return res.status(200).json({
          success: true,
          message: `${names.length} નામો ફરીથી સક્રિય કરી દેવાયા!`,
        });
      }

      // Action: Restore an ignored name
      if (action === 'restore-name') {
        const targetName = (name || rawName || '').trim().toUpperCase();
        if (!targetName) {
          return res.status(400).json({ message: 'Name is required to restore' });
        }

        const targetRegex = new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

        await CompanyMapping.deleteMany({
          company: companyId,
          rawName: targetRegex,
          isIgnored: true,
        });

        return res.status(200).json({
          success: true,
          message: `'${targetName}' ફરીથી સક્રિય કરી દેવાયું!`,
        });
      }

      // Action: Add an alias to a canonical company
      if (action === 'add-alias') {
        if (!canonicalName || !canonicalName.trim()) {
          return res.status(400).json({ message: 'Canonical company name is required' });
        }
        if (!rawName || !rawName.trim()) {
          return res.status(400).json({ message: 'Raw company name to map is required' });
        }

        const cleanCanonical = canonicalName.trim().toUpperCase();
        const cleanRaw = rawName.trim().toUpperCase();

        if (cleanRaw === cleanCanonical) {
          await CompanyMapping.updateMany(
            {
              company: companyId,
              platform: { $in: [cleanPlatform, 'all'] },
              rawName: new RegExp(`^${cleanRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            },
            { $set: { isDeleted: true, isIgnored: false } }
          );
        } else {
          const existing = await CompanyMapping.findOne({
            company: companyId,
            platform: cleanPlatform,
            rawName: new RegExp(`^${cleanRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          });

          if (existing) {
            existing.canonicalName = cleanCanonical;
            existing.isIgnored = false;
            existing.isDeleted = false;
            await existing.save();
          } else {
            await new CompanyMapping({
              company: companyId,
              platform: cleanPlatform,
              rawName: cleanRaw,
              canonicalName: cleanCanonical,
              isIgnored: false,
            }).save();
          }
        }

        return res.status(200).json({
          success: true,
          message: `'${cleanRaw}' ને '${cleanCanonical}' સાથે જોડી દેવાયું!`,
        });
      }

      // Action: Create a new canonical company
      if (action === 'create-canonical') {
        const cleanCanonical = (canonicalName || '').trim().toUpperCase();
        if (!cleanCanonical) {
          return res.status(400).json({ message: 'Company name is required' });
        }

        // Un-ignore if it was previously ignored
        await CompanyMapping.updateMany(
          {
            company: companyId,
            rawName: new RegExp(`^${cleanCanonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          },
          { $set: { isIgnored: false } }
        );

        return res.status(200).json({
          success: true,
          message: `નવી મુખ્ય કંપની '${cleanCanonical}' ઉમેરાઈ!`,
          canonicalName: cleanCanonical,
        });
      }

      return res.status(400).json({ message: 'Invalid action or parameters' });
    }

    // 3. DELETE: Remove an alias tag or delete canonical group
    if (method === 'DELETE') {
      const { action, rawName, canonicalName, name, platform = 'all' } = req.query;
      const cleanPlatform = (platform || 'all').toLowerCase().trim();

      // Delete/Ignore a non-company name completely from left side
      if (action === 'delete-name' || action === 'ignore-name') {
        const targetName = (name || rawName || canonicalName || '').trim().toUpperCase();
        if (!targetName) {
          return res.status(400).json({ message: 'Name is required to delete' });
        }

        const targetRegex = new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

        await CompanyMapping.findOneAndUpdate(
          {
            company: companyId,
            platform: cleanPlatform,
            rawName: targetRegex,
          },
          {
            $set: {
              platform: cleanPlatform,
              rawName: targetName,
              canonicalName: targetName,
              isIgnored: true,
              isDeleted: false,
              notes: 'Deleted/Ignored non-company name',
            },
          },
          { upsert: true, new: true }
        );

        await CompanyMapping.updateMany(
          {
            company: companyId,
            canonicalName: targetRegex,
            rawName: { $not: targetRegex },
          },
          { $set: { isDeleted: true } }
        );

        return res.status(200).json({
          success: true,
          message: `'${targetName}' ને લિસ્ટમાંથી હટાવી દીધું!`,
        });
      }

      // Remove an alias tag from canonical company
      if (action === 'remove-alias' || rawName) {
        const cleanRaw = (rawName || '').trim().toUpperCase();
        const deleteQuery = {
          company: companyId,
          rawName: new RegExp(`^${cleanRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        };
        if (cleanPlatform !== 'all') {
          deleteQuery.platform = cleanPlatform === 'meesho' ? { $in: ['meesho', null, ''] } : cleanPlatform;
        }
        await CompanyMapping.updateMany(
          deleteQuery,
          { $set: { isDeleted: true } }
        );

        return res.status(200).json({
          success: true,
          message: `'${cleanRaw}' નું મેપિંગ હટાવી દીધું!`,
        });
      }

      // Delete an entire canonical group
      if (action === 'delete-group' && canonicalName) {
        const cleanCanonical = canonicalName.trim().toUpperCase();
        const deleteQuery = {
          company: companyId,
          canonicalName: new RegExp(`^${cleanCanonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        };
        if (cleanPlatform !== 'all') {
          deleteQuery.platform = cleanPlatform === 'meesho' ? { $in: ['meesho', null, ''] } : cleanPlatform;
        }
        await CompanyMapping.updateMany(
          deleteQuery,
          { $set: { isDeleted: true } }
        );

        return res.status(200).json({
          success: true,
          message: `'${cleanCanonical}' નું સંપૂર્ણ ગ્રૂપિંગ રીસેટ કરી દીધું!`,
        });
      }

      return res.status(400).json({ message: 'Missing parameters for delete' });
    }

    return res.status(405).json({ message: `Method ${method} not allowed` });
  } catch (error) {
    console.error('Error in company-mapping API:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error in company mapping',
    });
  }
}

export default authMiddleware(handler);
