import connectToDatabase from '../../../lib/mongodb';
import FinalHisabSnapshot from '../../../models/FinalHisabSnapshot';
import { authMiddleware } from '../common/common.services';

function computeScopeKey(selectedCompanies = []) {
  if (!Array.isArray(selectedCompanies) || selectedCompanies.length === 0) {
    return '__ALL__';
  }
  return selectedCompanies
    .map(c => String(c).trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('||');
}

function getUserAllowedCompanies(user) {
  const isAdmin = user.role === 'admin' || user.role === 'ADMINISTRATOR' || user.role === 'Admin';
  if (isAdmin || user.hasAllCompanyAccess) {
    return null; // Admin has unrestricted access to all companies
  }
  // Only restrict if user has a non-empty assignedCompanies list
  if (Array.isArray(user.assignedCompanies) && user.assignedCompanies.length > 0) {
    return user.assignedCompanies.map(c => String(c).trim().toUpperCase()).filter(Boolean);
  }
  // If not explicitly restricted, allow all companies within user's account
  return null;
}

function isSnapshotAllowed(snapshot, allowedCompanies) {
  if (!allowedCompanies) return true; // Unrestricted access
  const allowedSet = new Set(allowedCompanies.map(c => String(c).trim().toUpperCase()));

  let snapCompanies = [];
  if (Array.isArray(snapshot.selectedCompanies) && snapshot.selectedCompanies.length > 0) {
    snapCompanies = snapshot.selectedCompanies.map(c => String(c).trim().toUpperCase()).filter(Boolean);
  } else if (snapshot.companyTitle) {
    snapCompanies = String(snapshot.companyTitle).split('&').map(c => c.trim().toUpperCase()).filter(Boolean);
  }

  return snapCompanies.length > 0 && snapCompanies.every(c => allowedSet.has(c));
}

// Check if a snapshot is superseded by a subsequent snapshot involving any of its companies
// (e.g. if Company A was settled alone in April, but in May it was settled together with Company B,
// the April snapshot is superseded and cannot be used as prior balance)
function isSnapshotSuperseded(candidate, allSnapshots) {
  if (!candidate || !Array.isArray(allSnapshots) || allSnapshots.length === 0) return false;

  const candEnd = new Date(candidate.endDate || candidate.createdAt).getTime();
  const candCreated = new Date(candidate.createdAt || candidate.endDate).getTime();
  const candCompanies = (candidate.selectedCompanies || [])
    .map(c => String(c).trim().toLowerCase())
    .filter(Boolean);

  if (candCompanies.length === 0 && candidate.companyTitle) {
    candidate.companyTitle.toLowerCase().split('&').forEach(t => {
      const s = t.trim();
      if (s) candCompanies.push(s);
    });
  }

  return allSnapshots.some(s => {
    if (String(s._id) === String(candidate._id)) return false;

    const sEnd = new Date(s.endDate || s.createdAt).getTime();
    const sCreated = new Date(s.createdAt || s.endDate).getTime();

    const isLater = sEnd > candEnd || (sEnd === candEnd && sCreated > candCreated);
    if (!isLater) return false;

    const sCompanies = (s.selectedCompanies || []).map(c => String(c).trim().toLowerCase());
    if (sCompanies.length === 0 && s.companyTitle) {
      s.companyTitle.toLowerCase().split('&').forEach(t => {
        const tr = t.trim();
        if (tr) sCompanies.push(tr);
      });
    }

    return candCompanies.some(c => sCompanies.includes(c));
  });
}

const round2 = (val) => Math.round((Number(val) || 0) * 100) / 100;

function cleanSnapshot(snap) {
  if (!snap) return null;
  return {
    ...snap,
    grossInventoryAmount: round2(snap.grossInventoryAmount),
    inventoryAmount: round2(snap.inventoryAmount),
    printCharge: round2(snap.printCharge),
    totalReturnsAmount: round2(snap.totalReturnsAmount),
    returnsAmount: round2(snap.returnsAmount),
    customerReturnsAmount: round2(snap.customerReturnsAmount),
    cancelledAmount: round2(snap.cancelledAmount),
    prevBalance: round2(snap.prevBalance),
    expenses: round2(snap.expenses),
    withdrawals: round2(snap.withdrawals),
    finalPayable: round2(snap.finalPayable),
    bankBalance: round2(snap.bankBalance),
    meeshoPending: round2(snap.meeshoPending),
    companyPersonalEntry: round2(snap.companyPersonalEntry),
    mainCompanyPersonalEntry: round2(snap.mainCompanyPersonalEntry),
    netProfit: round2(snap.netProfit),
  };
}

async function handler(req, res) {
  const { method } = req;
  const user = req.userData;

  if (!user || !user.company) {
    return res.status(401).json({ message: 'Unauthorized or no company associated' });
  }

  const companyId = user.company;
  const allowedCompanies = getUserAllowedCompanies(user);
  await connectToDatabase();

  if (method === 'GET') {
    try {
      const { selectedCompanies, lastOnly, allArchive } = req.query;

      // 1. If user requests full historical archive of all snapshots across companies
      if (allArchive === 'true') {
        const allSnapshots = await FinalHisabSnapshot.find({
          company: companyId,
        })
          .sort({ endDate: -1, createdAt: -1 })
          .limit(200)
          .lean();

        const filteredSnapshots = allSnapshots.filter(s => isSnapshotAllowed(s, allowedCompanies));

        return res.status(200).json({
          success: true,
          isAllArchive: true,
          count: filteredSnapshots.length,
          snapshots: filteredSnapshots.map(cleanSnapshot),
        });
      }

      let parsedCompanies = [];
      if (selectedCompanies) {
        try {
          parsedCompanies = typeof selectedCompanies === 'string' && selectedCompanies.startsWith('[')
            ? JSON.parse(selectedCompanies)
            : String(selectedCompanies).split(',').map(s => s.trim()).filter(Boolean);
        } catch {
          parsedCompanies = String(selectedCompanies).split(',').map(s => s.trim()).filter(Boolean);
        }
      }

      // History snapshot is ONLY used when companies are selected!
      if (!parsedCompanies || parsedCompanies.length === 0) {
        return res.status(200).json({
          success: true,
          scopeKey: '__ALL__',
          count: 0,
          snapshots: [],
          lastSnapshot: null,
          suggestedSnapshot: null,
          inheritedCompanies: [],
          extraCompaniesWithoutHistory: [],
          relatedSnapshots: []
        });
      }

      // If user is non-admin and passed companies they don't have access to, restrict them
      if (allowedCompanies && parsedCompanies.length > 0) {
        const unauthorized = parsedCompanies.filter(c => !allowedCompanies.includes(String(c).trim().toUpperCase()));
        if (unauthorized.length > 0) {
          return res.status(403).json({
            message: `You do not have permission for company: ${unauthorized.join(', ')}`
          });
        }
      }

      const scopeKey = computeScopeKey(parsedCompanies);

      // Load all snapshots for this account (up to 200, lean) to check for superseding and subsets
      const allSnapshots = await FinalHisabSnapshot.find({
        company: companyId,
      })
        .sort({ endDate: -1, createdAt: -1 })
        .limit(200)
        .lean();

      const allowedAllSnapshots = allSnapshots.filter(s => isSnapshotAllowed(s, allowedCompanies));

      // 1. Fetch exact match snapshots
      const rawExactSnapshots = await FinalHisabSnapshot.find({
        company: companyId,
        scopeKey,
      })
        .sort({ endDate: -1, createdAt: -1 })
        .limit(20)
        .lean();

      const exactSnapshots = rawExactSnapshots.filter(s => isSnapshotAllowed(s, allowedCompanies));
      let lastSnapshot = exactSnapshots[0] || null;

      // CRITICAL: If lastSnapshot is superseded by a subsequent snapshot involving ANY of its companies
      // (e.g. AKIRA was settled alone in April, but in May it was settled together with ALAKHDHANI JEWEL),
      // that older snapshot's balance has already been settled and MUST NOT be resurrected!
      if (lastSnapshot && isSnapshotSuperseded(lastSnapshot, allowedAllSnapshots)) {
        lastSnapshot = null;
      }

      let suggestedSnapshot = null;
      let inheritedCompanies = [];
      let extraCompaniesWithoutHistory = [];
      let relatedSnapshots = [];

      // If user selected 2 or more companies, check for subset combinations (single or multiple company previously saved)
      // Condition: ALL remaining companies must have NO hisab saved anywhere in the database!
      if (parsedCompanies.length > 1) {
        const parsedLower = parsedCompanies.map(c => String(c).trim().toLowerCase());

        // Helper: check if a company has appeared in ANY saved hisab anywhere in this account
        const companyHasAnyHisab = (compName) => {
          const compLower = String(compName).trim().toLowerCase();
          return allowedAllSnapshots.some(s => {
            if (Array.isArray(s.selectedCompanies) && s.selectedCompanies.some(sc => String(sc).trim().toLowerCase() === compLower)) {
              return true;
            }
            if (s.companyTitle) {
              const titles = s.companyTitle.toLowerCase().split('&').map(t => t.trim());
              if (titles.includes(compLower)) return true;
            }
            if (s.scopeKey && s.scopeKey.split('||').map(t => t.trim().toLowerCase()).includes(compLower)) {
              return true;
            }
            return false;
          });
        };

        // Find candidate snapshots whose selected companies are a strict subset of current parsedCompanies
        // (can be a single company OR multiple companies)
        const rawSubsetCandidates = allowedAllSnapshots.filter(s => {
          if (!Array.isArray(s.selectedCompanies) || s.selectedCompanies.length === 0) return false;
          if (s.scopeKey === scopeKey) return false;
          // If candidate was superseded by a later hisab, it cannot be used
          if (isSnapshotSuperseded(s, allowedAllSnapshots)) return false;
          const sLower = s.selectedCompanies.map(c => String(c).trim().toLowerCase());
          return sLower.length > 0 && sLower.length < parsedLower.length && sLower.every(c => parsedLower.includes(c));
        });

        // Filter: ONLY candidates where EVERY remaining company has NO hisab saved anywhere in the database!
        // "baki ni companies no hisab kyay pan save na hoy"
        const qualifiedCandidates = rawSubsetCandidates.filter(candidate => {
          const candLower = candidate.selectedCompanies.map(c => String(c).trim().toLowerCase());
          const remainingCompanies = parsedCompanies.filter(c => !candLower.includes(String(c).trim().toLowerCase()));

          if (remainingCompanies.length === 0) return false;
          const anyRemainingHasHisab = remainingCompanies.some(rc => companyHasAnyHisab(rc));
          return !anyRemainingHasHisab;
        });

        if (qualifiedCandidates.length > 0) {
          // Sort qualified candidates:
          // 1. Highest number of matching companies (e.g. 2 companies > 1 company)
          // 2. Latest endDate
          // 3. Latest createdAt
          qualifiedCandidates.sort((a, b) => {
            const countA = (a.selectedCompanies || []).length;
            const countB = (b.selectedCompanies || []).length;
            if (countB !== countA) return countB - countA;
            const dateA = new Date(a.endDate || a.createdAt).getTime();
            const dateB = new Date(b.endDate || b.createdAt).getTime();
            return dateB - dateA;
          });

          relatedSnapshots = qualifiedCandidates.slice(0, 10);

          // If no exact lastSnapshot exists, set the top qualified candidate as suggestedSnapshot
          if (!lastSnapshot) {
            const topCandidate = qualifiedCandidates[0];
            const topLower = (topCandidate.selectedCompanies || []).map(c => String(c).trim().toLowerCase());
            const extraCompanies = parsedCompanies.filter(c => !topLower.includes(String(c).trim().toLowerCase()));

            suggestedSnapshot = topCandidate;
            inheritedCompanies = topCandidate.selectedCompanies || [];
            extraCompaniesWithoutHistory = extraCompanies;
          }
        }
      }

      if (lastOnly === 'true') {
        return res.status(200).json({
          success: true,
          scopeKey,
          lastSnapshot: cleanSnapshot(lastSnapshot),
          suggestedSnapshot: cleanSnapshot(suggestedSnapshot),
          inheritedCompanies,
          extraCompaniesWithoutHistory,
        });
      }

      return res.status(200).json({
        success: true,
        scopeKey,
        count: exactSnapshots.length,
        snapshots: exactSnapshots.map(cleanSnapshot),
        relatedSnapshots: relatedSnapshots.map(cleanSnapshot),
        suggestedSnapshot: cleanSnapshot(suggestedSnapshot),
        inheritedCompanies,
        extraCompaniesWithoutHistory,
      });
    } catch (err) {
      console.error('Error fetching final hisab snapshot:', err);
      return res.status(500).json({ message: 'Failed to fetch final hisab snapshot: ' + err.message });
    }
  }

  if (method === 'POST') {
    try {
      const {
        selectedCompanies = [],
        companyTitle = '',
        startDate,
        endDate,
        grossInventoryAmount = 0,
        inventoryAmount = 0,
        printCharge = 0,
        printRate = 2.4,
        totalReturnsAmount = 0,
        returnsAmount = 0,
        customerReturnsAmount = 0,
        cancelledAmount = 0,
        prevBalance = 0,
        expenses = 0,
        withdrawals = 0,
        finalPayable,
        bankBalance = 0,
        meeshoPending = 0,
        companyBankBalances = {},
        companyPendingAmounts = {},
        companyPersonalEntry = 0,
        mainCompanyPersonalEntry = 0,
        netProfit = 0,
        note = ''
      } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Start date and End date are required' });
      }

      // Permission check on saving snapshot
      if (allowedCompanies && Array.isArray(selectedCompanies) && selectedCompanies.length > 0) {
        const unauthorized = selectedCompanies.filter(c => !allowedCompanies.includes(String(c).trim().toUpperCase()));
        if (unauthorized.length > 0) {
          return res.status(403).json({
            message: `You do not have permission to save hisab for company: ${unauthorized.join(', ')}`
          });
        }
      }

      const scopeKey = computeScopeKey(selectedCompanies);
      const isMultiCompany = Array.isArray(selectedCompanies) && selectedCompanies.length > 1;

      const numFinalPayable = Number(finalPayable);
      if (isNaN(numFinalPayable)) {
        return res.status(400).json({ message: 'Final payable amount is required' });
      }

      // Clean map balances
      const cleanBankBalances = {};
      if (companyBankBalances && typeof companyBankBalances === 'object') {
        Object.entries(companyBankBalances).forEach(([k, v]) => {
          cleanBankBalances[k] = round2(v);
        });
      }
      const cleanPendingAmounts = {};
      if (companyPendingAmounts && typeof companyPendingAmounts === 'object') {
        Object.entries(companyPendingAmounts).forEach(([k, v]) => {
          cleanPendingAmounts[k] = round2(v);
        });
      }

      const newSnapshot = await FinalHisabSnapshot.create({
        company: companyId,
        scopeKey,
        isMultiCompany,
        selectedCompanies: Array.isArray(selectedCompanies) ? selectedCompanies : [],
        companyTitle: companyTitle || '',
        startDate,
        endDate,
        grossInventoryAmount: round2(grossInventoryAmount),
        inventoryAmount: round2(inventoryAmount),
        printCharge: round2(printCharge),
        printRate: Number(printRate) || 2.4,
        totalReturnsAmount: round2(totalReturnsAmount),
        returnsAmount: round2(returnsAmount),
        customerReturnsAmount: round2(customerReturnsAmount),
        cancelledAmount: round2(cancelledAmount),
        prevBalance: round2(prevBalance),
        expenses: round2(expenses),
        withdrawals: round2(withdrawals),
        finalPayable: round2(numFinalPayable),
        bankBalance: round2(bankBalance),
        meeshoPending: round2(meeshoPending),
        companyBankBalances: cleanBankBalances,
        companyPendingAmounts: cleanPendingAmounts,
        companyPersonalEntry: round2(companyPersonalEntry),
        mainCompanyPersonalEntry: round2(mainCompanyPersonalEntry),
        netProfit: round2(netProfit),
        note: note || '',
        savedBy: user._id,
        savedByName: user.name || user.username || 'User'
      });

      return res.status(201).json({
        success: true,
        message: 'Final hisab snapshot saved successfully!',
        snapshot: newSnapshot
      });
    } catch (err) {
      console.error('Error saving final hisab snapshot:', err);
      return res.status(500).json({ message: 'Failed to save final hisab snapshot: ' + err.message });
    }
  }

  if (method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ message: 'Snapshot ID is required' });
      }

      const snapToDelete = await FinalHisabSnapshot.findOne({ _id: id, company: companyId });
      if (!snapToDelete) {
        return res.status(404).json({ message: 'Snapshot not found' });
      }

      if (!isSnapshotAllowed(snapToDelete, allowedCompanies)) {
        return res.status(403).json({ message: 'You do not have permission to delete this snapshot' });
      }

      await FinalHisabSnapshot.deleteOne({ _id: id, company: companyId });

      return res.status(200).json({
        success: true,
        message: 'Snapshot deleted successfully'
      });
    } catch (err) {
      console.error('Error deleting snapshot:', err);
      return res.status(500).json({ message: 'Failed to delete snapshot: ' + err.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ message: `Method ${method} Not Allowed` });
}

export default authMiddleware(handler);

