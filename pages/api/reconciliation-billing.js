import connectToDatabase from '../../lib/mongodb';
import SkuInventory from '../../models/SkuInventory';
import CancelledOrder from '../../models/CancelledOrder';
import ReturnOrder from '../../models/ReturnOrder';
import CustomerReturnOrder from '../../models/CustomerReturnOrder';
import MasterSku from '../../models/MasterSku';
import MasterRate from '../../models/MasterRate';
import Company from '../../models/company';
import { authMiddleware } from './common/common.services';
import moment from 'moment';

export const config = {
  maxDuration: 60,
};

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await connectToDatabase();
    const user = req.userData;
    if (!user || !user.company) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const companyId = user.company;
    const {
      startDate,
      endDate,
      companyName,
      sku,
      platform = 'meesho'
    } = req.query;

    // Date range preparation
    const start = startDate ? new Date(startDate) : moment().startOf('month').toDate();
    const end = endDate ? new Date(endDate) : moment().endOf('month').toDate();
    end.setHours(23, 59, 59, 999);

    const dateQuery = { $gte: start, $lte: end };

    // 1. Build Base Match Filters for each collection
    // SkuInventory
    const invMatch = {
      company: companyId,
      isDeleted: false,
      selectedDate: dateQuery
    };
    if (platform === 'meesho') {
      invMatch.platform = { $nin: ['flipkart', 'snapdeal', 'myntra'] };
    } else if (platform) {
      invMatch.platform = platform;
    }

    // Cancelled Orders
    const cancelMatch = {
      company: companyId,
      isDeleted: false,
      $or: [
        { startDate: dateQuery },
        { selectedDate: dateQuery }
      ]
    };

    // Returns
    const returnMatch = {
      company: companyId,
      isDeleted: false,
      $or: [
        { startDate: dateQuery },
        { selectedDate: dateQuery }
      ]
    };

    // Customer Returns
    const custReturnMatch = {
      company: companyId,
      isDeleted: false,
      $or: [
        { startDate: dateQuery },
        { selectedDate: dateQuery }
      ]
    };

    // Sheet Parameters:
    // Print / Packaging Rate (default ₹2.40 per dispatched quantity)
    const printRate = req.query.printRate !== undefined ? Math.max(0, Number(req.query.printRate) || 0) : 2.40;
    // Customer Return % (85% as in Customer Return sheet cell B9 = B8 * 0.85)
    const custReturnPercent = req.query.custReturnPercent !== undefined ? Math.max(0, Math.min(100, Number(req.query.custReturnPercent) || 0)) : 85;

    const rawCompanies = req.query.companies || req.query.companyName;
    let companiesFilter = [];
    if (Array.isArray(rawCompanies)) {
      companiesFilter = rawCompanies.map(c => String(c).trim()).filter(Boolean);
    } else if (typeof rawCompanies === 'string' && rawCompanies.trim()) {
      companiesFilter = rawCompanies.split(',').map(c => c.trim()).filter(Boolean);
    }

    if (companiesFilter.length > 0) {
      const companyRegexList = companiesFilter.map(c => new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
      const companyQuery = companyRegexList.length === 1 ? companyRegexList[0] : { $in: companyRegexList };
      invMatch.companyName = companyQuery;
      cancelMatch.companyName = companyQuery;
      returnMatch.companyName = companyQuery;
      custReturnMatch.companyName = companyQuery;
    }

    if (sku && sku.trim()) {
      const escaped = sku.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const skuRegex = new RegExp(escaped, 'i');

      // Also look up any SKUs in MasterSku whose SKU or Origin matches
      const matchingSkus = await MasterSku.find({
        company: companyId,
        $or: [
          { sku: skuRegex },
          { origin: skuRegex }
        ]
      }).distinct('sku');

      const cleanMatchedSkus = matchingSkus.filter(Boolean);

      const skuCondition = cleanMatchedSkus.length > 0
        ? { $or: [{ sku: skuRegex }, { sku: { $in: cleanMatchedSkus } }] }
        : { sku: skuRegex };

      invMatch.$and = invMatch.$and || [];
      invMatch.$and.push(skuCondition);

      cancelMatch.$and = cancelMatch.$and || [];
      cancelMatch.$and.push(skuCondition);

      returnMatch.$and = returnMatch.$and || [];
      returnMatch.$and.push(skuCondition);

      custReturnMatch.$and = custReturnMatch.$and || [];
      custReturnMatch.$and.push(skuCondition);
    }

    // 2. Query all 6 streams in parallel in a single database round-trip
    const [invRows, cancelRows, returnRows, custReturnRows, masterSkuDocs, masterRateDocs] = await Promise.all([
      SkuInventory.find(invMatch).select('companyName sku quantity selectedDate').lean(),
      CancelledOrder.find(cancelMatch).select('companyName sku quantity startDate selectedDate').lean(),
      ReturnOrder.find(returnMatch).select('companyName sku quantity startDate selectedDate').lean(),
      CustomerReturnOrder.find(custReturnMatch).select('companyName sku quantity startDate selectedDate').lean(),
      MasterSku.find({ company: companyId }).select('sku origin size').lean(),
      MasterRate.find({ company: companyId }).select('origin imageLink itemRate boxRate boxReturnRate size rateHistory').lean()
    ]);

    // 3. Build in-memory lookup maps for instant O(1) resolution
    const skuToOriginMap = new Map();
    for (const doc of masterSkuDocs) {
      const cleanSku = (doc.sku || '').trim().toLowerCase();
      if (cleanSku) {
        skuToOriginMap.set(cleanSku, {
          origin: (doc.origin || '').trim(),
          size: (doc.size || '').trim()
        });
      }
    }

    const originToRateMap = new Map();
    for (const r of masterRateDocs) {
      const cleanOrigin = (r.origin || '').trim().toLowerCase();
      if (cleanOrigin) {
        // Pre-parse rateHistory dates into numeric millisecond timestamps for instant comparison
        const parsedHistory = (Array.isArray(r.rateHistory) ? r.rateHistory : []).map(h => ({
          fromMs: h.effectiveFrom ? new Date(h.effectiveFrom).setHours(0, 0, 0, 0) : null,
          toMs: h.effectiveTo ? new Date(h.effectiveTo).setHours(23, 59, 59, 999) : null,
          itemRate: Number(h.itemRate) || 0,
          boxRate: Number(h.boxRate) || 0,
          boxReturnRate: Number(h.boxReturnRate) || 0
        }));

        originToRateMap.set(cleanOrigin, {
          origin: r.origin,
          itemRate: Number(r.itemRate) || 0,
          boxRate: Number(r.boxRate) || 0,
          boxReturnRate: Number(r.boxReturnRate) || 0,
          imageLink: r.imageLink || '',
          size: r.size || '',
          parsedHistory
        });
      }
    }

    // Canonical Company Normalization (case-insensitive deduplication, preferring UPPERCASE / TitleCase)
    const canonicalCompanyMap = new Map(); // lowercase -> best canonical display name

    const getCanonicalName = (rawName) => {
      const trimmed = (rawName || '').trim();
      if (!trimmed) return 'Unknown Company';
      const lower = trimmed.toLowerCase();
      if (!canonicalCompanyMap.has(lower)) {
        canonicalCompanyMap.set(lower, trimmed);
      } else {
        const existing = canonicalCompanyMap.get(lower);
        const existingUpper = (existing.match(/[A-Z]/g) || []).length;
        const currentUpper = (trimmed.match(/[A-Z]/g) || []).length;
        if (currentUpper > existingUpper) {
          canonicalCompanyMap.set(lower, trimmed);
        }
      }
      return canonicalCompanyMap.get(lower);
    };

    const uniqueCompaniesSet = new Set();
    const registerItem = (row) => {
      if (row.companyName) {
        uniqueCompaniesSet.add(row.companyName.trim());
        getCanonicalName(row.companyName);
      }
    };

    invRows.forEach(registerItem);
    cancelRows.forEach(registerItem);
    returnRows.forEach(registerItem);
    custReturnRows.forEach(registerItem);

    // Memoized Helper to resolve rates for an SKU on a specific order date
    const rateCache = new Map();

    const resolveRates = (rawSku, orderDateStr) => {
      const cleanSku = (rawSku || '').trim().toLowerCase();
      const dKey = orderDateStr ? String(orderDateStr).slice(0, 10) : '';
      const cacheKey = `${cleanSku}:::${dKey}`;
      if (rateCache.has(cacheKey)) {
        return rateCache.get(cacheKey);
      }

      const skuMapping = skuToOriginMap.get(cleanSku);
      const originName = skuMapping?.origin || '';
      const originSize = skuMapping?.size || '';

      const rateDoc = originName ? originToRateMap.get(originName.toLowerCase()) : null;

      let itemRate = rateDoc?.itemRate || 0;
      let boxRate = rateDoc?.boxRate || 0;
      let boxReturnRate = rateDoc?.boxReturnRate || 0;

      // Check if date-effective rateHistory matches this specific order date
      if (rateDoc && rateDoc.parsedHistory && rateDoc.parsedHistory.length > 0 && orderDateStr) {
        try {
          const oDateMs = new Date(orderDateStr).setHours(12, 0, 0, 0);
          if (!isNaN(oDateMs)) {
            const matched = rateDoc.parsedHistory.find(h => {
              if (h.fromMs && oDateMs < h.fromMs) return false;
              if (h.toMs && oDateMs > h.toMs) return false;
              return true;
            });
            if (matched) {
              itemRate = matched.itemRate;
              boxRate = matched.boxRate;
              boxReturnRate = matched.boxReturnRate;
            }
          }
        } catch (e) {
          // Fallback to active rate if invalid date
        }
      }

      // Formula:
      // Meesho inventory = rate + dabbi
      // Cancel order = rate + dabbi return rate
      // Return or customer return = rate + dabbi return rate
      const invUnitRate = itemRate + boxRate;
      const cancelUnitRate = itemRate + boxReturnRate;
      const retUnitRate = itemRate + boxReturnRate;

      const result = {
        origin: originName || 'Unmapped SKU',
        size: rateDoc?.size || originSize || '',
        imageLink: rateDoc?.imageLink || '',
        hasRate: !!rateDoc,
        itemRate,
        boxRate,
        boxReturnRate,
        invUnitRate,
        cancelUnitRate,
        retUnitRate
      };

      rateCache.set(cacheKey, result);
      return result;
    };

    // 6. Aggregators
    const summary = {
      inventoryQty: 0,
      inventoryAmount: 0,
      printRate,
      printCharge: 0,
      grossInventoryAmount: 0,
      cancelledQty: 0,
      cancelledAmount: 0,
      returnsQty: 0,
      returnsAmount: 0,
      customerReturnsQty: 0,
      rawCustomerReturnsAmount: 0,
      custReturnPercent,
      customerReturnsAmount: 0,
      totalReturnsAmount: 0,
      netQty: 0,
      netAmount: 0,
      missingRatesCount: 0
    };

    const companyMap = new Map();
    const dateMap = new Map();
    const skuMap = new Map();

    const getOrCreateCompany = (name) => {
      const trimmed = (name || 'Unknown Company').trim();
      const lower = trimmed.toLowerCase();
      const canonicalName = getCanonicalName(trimmed);
      if (!companyMap.has(lower)) {
        companyMap.set(lower, {
          companyName: canonicalName,
          companyKey: lower,
          inventoryQty: 0,
          inventoryAmount: 0,
          printCharge: 0,
          grossInventoryAmount: 0,
          cancelledQty: 0,
          cancelledAmount: 0,
          returnsQty: 0,
          returnsAmount: 0,
          customerReturnsQty: 0,
          rawCustomerReturnsAmount: 0,
          customerReturnsAmount: 0,
          totalReturnsAmount: 0,
          netQty: 0,
          netAmount: 0,
          skusCount: 0
        });
      }
      const comp = companyMap.get(lower);
      comp.companyName = canonicalCompanyMap.get(lower) || canonicalName;
      return comp;
    };

    const getOrCreateDate = (dateVal) => {
      const d = dateVal ? moment(dateVal).format('YYYY-MM-DD') : 'Unknown';
      if (!dateMap.has(d)) {
        dateMap.set(d, {
          date: d,
          month: dateVal ? moment(dateVal).format('YYYY-MM') : 'Unknown',
          inventoryQty: 0,
          inventoryAmount: 0,
          printCharge: 0,
          grossInventoryAmount: 0,
          cancelledQty: 0,
          cancelledAmount: 0,
          returnsQty: 0,
          returnsAmount: 0,
          customerReturnsQty: 0,
          rawCustomerReturnsAmount: 0,
          customerReturnsAmount: 0,
          totalReturnsAmount: 0,
          netQty: 0,
          netAmount: 0
        });
      }
      return dateMap.get(d);
    };

    const getOrCreateSku = (rawSku) => {
      const cleanSku = (rawSku || '').trim();
      if (!skuMap.has(cleanSku)) {
        const rateInfo = resolveRates(cleanSku);
        skuMap.set(cleanSku, {
          sku: cleanSku,
          ...rateInfo,
          inventoryQty: 0,
          inventoryAmount: 0,
          printCharge: 0,
          grossInventoryAmount: 0,
          cancelledQty: 0,
          cancelledAmount: 0,
          returnsQty: 0,
          returnsAmount: 0,
          customerReturnsQty: 0,
          rawCustomerReturnsAmount: 0,
          customerReturnsAmount: 0,
          totalReturnsAmount: 0,
          netQty: 0,
          netAmount: 0,
          companies: new Set()
        });
      }
      return skuMap.get(cleanSku);
    };

    // Process Inventory
    invRows.forEach((r) => {
      const qty = Number(r.quantity) || 0;
      if (qty <= 0) return;
      const orderDate = r.selectedDate;
      const rates = resolveRates(r.sku, orderDate);
      const amount = qty * rates.invUnitRate;
      const printAmt = qty * printRate;

      summary.inventoryQty += qty;
      summary.inventoryAmount += amount;
      summary.printCharge += printAmt;

      const comp = getOrCreateCompany(r.companyName);
      comp.inventoryQty += qty;
      comp.inventoryAmount += amount;
      comp.printCharge += printAmt;

      const dt = getOrCreateDate(r.selectedDate);
      dt.inventoryQty += qty;
      dt.inventoryAmount += amount;
      dt.printCharge += printAmt;

      const sk = getOrCreateSku(r.sku);
      sk.inventoryQty += qty;
      sk.inventoryAmount += amount;
      sk.printCharge += printAmt;
      if (r.companyName) sk.companies.add(getCanonicalName(r.companyName));
    });

    // Process Cancelled Orders
    cancelRows.forEach((r) => {
      const qty = Number(r.quantity) || 0;
      if (qty <= 0) return;
      const orderDate = r.startDate || r.selectedDate;
      const rates = resolveRates(r.sku, orderDate);
      const amount = qty * rates.cancelUnitRate; // Cancel order = rate + dabbi return rate

      summary.cancelledQty += qty;
      summary.cancelledAmount += amount;

      const comp = getOrCreateCompany(r.companyName);
      comp.cancelledQty += qty;
      comp.cancelledAmount += amount;

      const dt = getOrCreateDate(r.startDate || r.selectedDate);
      dt.cancelledQty += qty;
      dt.cancelledAmount += amount;

      const sk = getOrCreateSku(r.sku);
      sk.cancelledQty += qty;
      sk.cancelledAmount += amount;
      if (r.companyName) sk.companies.add(getCanonicalName(r.companyName));
    });

    // Process Courier Returns
    returnRows.forEach((r) => {
      const qty = Number(r.quantity) || 0;
      if (qty <= 0) return;
      const orderDate = r.startDate || r.selectedDate;
      const rates = resolveRates(r.sku, orderDate);
      const amount = qty * rates.retUnitRate; // Return = rate + dabbi return rate

      summary.returnsQty += qty;
      summary.returnsAmount += amount;

      const comp = getOrCreateCompany(r.companyName);
      comp.returnsQty += qty;
      comp.returnsAmount += amount;

      const dt = getOrCreateDate(r.startDate || r.selectedDate);
      dt.returnsQty += qty;
      dt.returnsAmount += amount;

      const sk = getOrCreateSku(r.sku);
      sk.returnsQty += qty;
      sk.returnsAmount += amount;
      if (r.companyName) sk.companies.add(getCanonicalName(r.companyName));
    });

    // Process Customer Returns (85% Policy as in Customer Return sheet B9 = B8 * 0.85)
    custReturnRows.forEach((r) => {
      const qty = Number(r.quantity) || 0;
      if (qty <= 0) return;
      const orderDate = r.startDate || r.selectedDate;
      const rates = resolveRates(r.sku, orderDate);
      const rawAmount = qty * rates.retUnitRate; // Customer Return = rate + dabbi return rate
      const effectiveAmount = rawAmount * (custReturnPercent / 100);

      summary.customerReturnsQty += qty;
      summary.rawCustomerReturnsAmount += rawAmount;
      summary.customerReturnsAmount += effectiveAmount;

      const comp = getOrCreateCompany(r.companyName);
      comp.customerReturnsQty += qty;
      comp.rawCustomerReturnsAmount += rawAmount;
      comp.customerReturnsAmount += effectiveAmount;

      const dt = getOrCreateDate(r.startDate || r.selectedDate);
      dt.customerReturnsQty += qty;
      dt.rawCustomerReturnsAmount += rawAmount;
      dt.customerReturnsAmount += effectiveAmount;

      const sk = getOrCreateSku(r.sku);
      sk.customerReturnsQty += qty;
      sk.rawCustomerReturnsAmount += rawAmount;
      sk.customerReturnsAmount += effectiveAmount;
      if (r.companyName) sk.companies.add(getCanonicalName(r.companyName));
    });

    // Calculate Nets & Totals (Sheet formula: Net Goods = Gross Dispatched - Total Returns)
    summary.grossInventoryAmount = summary.inventoryAmount + summary.printCharge;
    summary.totalReturnsAmount = summary.cancelledAmount + summary.returnsAmount + summary.customerReturnsAmount;
    summary.netQty = summary.inventoryQty - summary.cancelledQty - summary.returnsQty - summary.customerReturnsQty;
    summary.netAmount = summary.grossInventoryAmount - summary.totalReturnsAmount;

    // Convert SKU Map to Array and count missing rates
    const skuWise = Array.from(skuMap.values()).map(sk => {
      sk.grossInventoryAmount = sk.inventoryAmount + sk.printCharge;
      sk.totalReturnsAmount = sk.cancelledAmount + sk.returnsAmount + sk.customerReturnsAmount;
      sk.netQty = sk.inventoryQty - sk.cancelledQty - sk.returnsQty - sk.customerReturnsQty;
      sk.netAmount = sk.grossInventoryAmount - sk.totalReturnsAmount;
      sk.companies = Array.from(new Set(Array.from(sk.companies).map(c => getCanonicalName(c))));
      if (!sk.hasRate) {
        summary.missingRatesCount += 1;
      }
      return sk;
    }).sort((a, b) => b.inventoryAmount - a.inventoryAmount);

    // Convert Company Map to Array
    const companyWise = Array.from(companyMap.values()).map(c => {
      c.companyName = canonicalCompanyMap.get(c.companyKey) || c.companyName;
      c.grossInventoryAmount = c.inventoryAmount + c.printCharge;
      c.totalReturnsAmount = c.cancelledAmount + c.returnsAmount + c.customerReturnsAmount;
      c.netQty = c.inventoryQty - c.cancelledQty - c.returnsQty - c.customerReturnsQty;
      c.netAmount = c.grossInventoryAmount - c.totalReturnsAmount;
      const totalReturnsQty = c.returnsQty + c.customerReturnsQty;
      c.returnRatePercent = c.inventoryQty > 0 ? ((totalReturnsQty / c.inventoryQty) * 100).toFixed(1) : '0.0';
      return c;
    }).sort((a, b) => b.netAmount - a.netAmount);

    // Convert Date Map to Array and Month aggregations
    const dateWise = Array.from(dateMap.values()).map(d => {
      d.grossInventoryAmount = d.inventoryAmount + d.printCharge;
      d.totalReturnsAmount = d.cancelledAmount + d.returnsAmount + d.customerReturnsAmount;
      d.netQty = d.inventoryQty - d.cancelledQty - d.returnsQty - d.customerReturnsQty;
      d.netAmount = d.grossInventoryAmount - d.totalReturnsAmount;
      return d;
    }).sort((a, b) => (a.date < b.date ? 1 : -1));

    // Month-wise aggregation
    const monthMap = new Map();
    dateWise.forEach(d => {
      const m = d.month;
      if (!monthMap.has(m)) {
        monthMap.set(m, {
          month: m,
          inventoryQty: 0,
          inventoryAmount: 0,
          printCharge: 0,
          grossInventoryAmount: 0,
          cancelledQty: 0,
          cancelledAmount: 0,
          returnsQty: 0,
          returnsAmount: 0,
          customerReturnsQty: 0,
          rawCustomerReturnsAmount: 0,
          customerReturnsAmount: 0,
          totalReturnsAmount: 0,
          netQty: 0,
          netAmount: 0,
          daysCount: 0
        });
      }
      const mItem = monthMap.get(m);
      mItem.inventoryQty += d.inventoryQty;
      mItem.inventoryAmount += d.inventoryAmount;
      mItem.printCharge += d.printCharge;
      mItem.grossInventoryAmount += d.grossInventoryAmount;
      mItem.cancelledQty += d.cancelledQty;
      mItem.cancelledAmount += d.cancelledAmount;
      mItem.returnsQty += d.returnsQty;
      mItem.returnsAmount += d.returnsAmount;
      mItem.customerReturnsQty += d.customerReturnsQty;
      mItem.rawCustomerReturnsAmount += d.rawCustomerReturnsAmount;
      mItem.customerReturnsAmount += d.customerReturnsAmount;
      mItem.totalReturnsAmount += d.totalReturnsAmount;
      mItem.netQty += d.netQty;
      mItem.netAmount += d.netAmount;
      mItem.daysCount += 1;
    });

    const monthWise = Array.from(monthMap.values()).sort((a, b) => (a.month < b.month ? 1 : -1));

    // Full list of unique companies active in the selected date range across all 4 streams
    // Collected in-memory during single pass with zero extra database queries
    const canonicalUniqueComps = new Set();
    uniqueCompaniesSet.forEach(c => {
      const clean = (c || '').trim();
      if (clean) {
        canonicalUniqueComps.add(getCanonicalName(clean));
      }
    });
    let companiesList = Array.from(canonicalUniqueComps).sort((a, b) => a.localeCompare(b));
    if (companiesFilter.length > 0) {
      const allDistinctComps = await SkuInventory.distinct('companyName', {
        company: companyId,
        isDeleted: false
      });
      const allCompSet = new Set(companiesList);
      allDistinctComps.forEach(c => {
        const clean = (c || '').trim();
        if (clean) allCompSet.add(getCanonicalName(clean));
      });
      companiesList = Array.from(allCompSet).sort((a, b) => a.localeCompare(b));
    }

    return res.status(200).json({
      success: true,
      startDate: moment(start).format('YYYY-MM-DD'),
      endDate: moment(end).format('YYYY-MM-DD'),
      summary,
      companyWise,
      dateWise,
      monthWise,
      skuWise,
      companiesList
    });
  } catch (error) {
    console.error('Error calculating reconciliation billing:', error);
    return res.status(500).json({ message: 'Internal server error calculating billing', error: error.message });
  }
}

export default authMiddleware(handler);
