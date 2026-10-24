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

      if (cleanMatchedSkus.length > 0) {
        const orSkuFilter = [
          { sku: { $regex: escaped, $options: 'i' } },
          { sku: { $in: cleanMatchedSkus } }
        ];
        invMatch.$or = orSkuFilter;
        cancelMatch.$or = orSkuFilter;
        returnMatch.$or = orSkuFilter;
        custReturnMatch.$or = orSkuFilter;
      } else {
        const safeRegexFilter = { $regex: escaped, $options: 'i' };
        invMatch.sku = safeRegexFilter;
        cancelMatch.sku = safeRegexFilter;
        returnMatch.sku = safeRegexFilter;
        custReturnMatch.sku = safeRegexFilter;
      }
    }

    // 2. Query all 4 streams in parallel
    const [invRows, cancelRows, returnRows, custReturnRows] = await Promise.all([
      SkuInventory.find(invMatch).select('companyName sku quantity selectedDate').lean(),
      CancelledOrder.find(cancelMatch).select('companyName sku quantity startDate selectedDate').lean(),
      ReturnOrder.find(returnMatch).select('companyName sku quantity startDate selectedDate').lean(),
      CustomerReturnOrder.find(custReturnMatch).select('companyName sku quantity startDate selectedDate').lean()
    ]);

    // 3. Collect unique SKUs and Company Names
    const uniqueSkusSet = new Set();
    const uniqueCompaniesSet = new Set();

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

    const registerItem = (row) => {
      if (row.sku) uniqueSkusSet.add(row.sku.trim());
      if (row.companyName) {
        uniqueCompaniesSet.add(row.companyName.trim());
        getCanonicalName(row.companyName);
      }
    };

    invRows.forEach(registerItem);
    cancelRows.forEach(registerItem);
    returnRows.forEach(registerItem);
    custReturnRows.forEach(registerItem);

    const uniqueSkus = Array.from(uniqueSkusSet);

    // 4. Fetch MasterSku mapping (sku -> origin, size)
    const masterSkuDocs = await MasterSku.find({
      company: companyId,
      sku: { $in: uniqueSkus.map(s => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) }
    }).select('sku origin size').lean();

    const skuToOriginMap = new Map();
    const uniqueOriginsSet = new Set();

    for (const doc of masterSkuDocs) {
      const cleanSku = (doc.sku || '').trim().toLowerCase();
      const cleanOrigin = (doc.origin || '').trim();
      skuToOriginMap.set(cleanSku, {
        origin: cleanOrigin,
        size: (doc.size || '').trim()
      });
      if (cleanOrigin) {
        uniqueOriginsSet.add(cleanOrigin.toLowerCase());
      }
    }

    // 5. Fetch MasterRate mapping (origin -> rates & rateHistory)
    const uniqueOrigins = Array.from(uniqueOriginsSet);
    const masterRateDocs = await MasterRate.find({
      company: companyId,
      origin: { $in: uniqueOrigins.map(o => new RegExp(`^${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) }
    }).select('origin imageLink itemRate boxRate boxReturnRate size rateHistory').lean();

    const originToRateMap = new Map();
    for (const r of masterRateDocs) {
      const cleanOrigin = (r.origin || '').trim().toLowerCase();
      originToRateMap.set(cleanOrigin, {
        origin: r.origin,
        itemRate: Number(r.itemRate) || 0,
        boxRate: Number(r.boxRate) || 0,
        boxReturnRate: Number(r.boxReturnRate) || 0,
        imageLink: r.imageLink || '',
        size: r.size || '',
        rateHistory: Array.isArray(r.rateHistory) ? r.rateHistory : []
      });
    }

    // Helper to resolve rates for an SKU on a specific order date
    const resolveRates = (rawSku, orderDateStr) => {
      const cleanSku = (rawSku || '').trim().toLowerCase();
      const skuMapping = skuToOriginMap.get(cleanSku);
      const originName = skuMapping?.origin || '';
      const originSize = skuMapping?.size || '';

      const rateDoc = originName ? originToRateMap.get(originName.toLowerCase()) : null;

      let itemRate = rateDoc?.itemRate || 0;
      let boxRate = rateDoc?.boxRate || 0;
      let boxReturnRate = rateDoc?.boxReturnRate || 0;

      // Check if date-effective rateHistory matches this specific order date
      if (rateDoc && Array.isArray(rateDoc.rateHistory) && rateDoc.rateHistory.length > 0 && orderDateStr) {
        try {
          const oDate = new Date(orderDateStr);
          if (!isNaN(oDate.getTime())) {
            oDate.setHours(12, 0, 0, 0);
            const matched = rateDoc.rateHistory.find(h => {
              const from = h.effectiveFrom ? new Date(h.effectiveFrom) : null;
              if (from) from.setHours(0, 0, 0, 0);
              const to = h.effectiveTo ? new Date(h.effectiveTo) : null;
              if (to) to.setHours(23, 59, 59, 999);
              if (from && oDate < from) return false;
              if (to && oDate > to) return false;
              return true;
            });
            if (matched) {
              itemRate = Number(matched.itemRate) || 0;
              boxRate = Number(matched.boxRate) || 0;
              boxReturnRate = Number(matched.boxReturnRate) || 0;
            }
          }
        } catch (e) {
          // Fallback to active rate if invalid date
        }
      }

      // Formula:
      // Meesho inventory = rate + dabbi
      // Cancel order = rate only (NO calculation of dabbi rate in cancel order)
      // Return or customer return = rate + dabbi return rate
      const invUnitRate = itemRate + boxRate;
      const cancelUnitRate = itemRate;
      const retUnitRate = itemRate + boxReturnRate;

      return {
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
      const amount = qty * rates.cancelUnitRate; // NO calculation of dabbi rate in cancel order (itemRate only)

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
    const [invComps, cancelComps, returnComps, custComps] = await Promise.all([
      SkuInventory.distinct('companyName', {
        company: companyId,
        isDeleted: false,
        selectedDate: dateQuery,
        platform: platform === 'meesho' ? { $nin: ['flipkart', 'snapdeal', 'myntra'] } : platform
      }),
      CancelledOrder.distinct('companyName', {
        company: companyId,
        isDeleted: false,
        $or: [{ startDate: dateQuery }, { selectedDate: dateQuery }]
      }),
      ReturnOrder.distinct('companyName', {
        company: companyId,
        isDeleted: false,
        $or: [{ startDate: dateQuery }, { selectedDate: dateQuery }]
      }),
      CustomerReturnOrder.distinct('companyName', {
        company: companyId,
        isDeleted: false,
        $or: [{ startDate: dateQuery }, { selectedDate: dateQuery }]
      })
    ]);

    const allActiveComps = [...invComps, ...cancelComps, ...returnComps, ...custComps, ...Array.from(uniqueCompaniesSet)];
    // Register all active company names to resolve best casing
    allActiveComps.forEach(c => {
      const clean = (c || '').trim();
      if (clean) getCanonicalName(clean);
    });

    const canonicalUniqueComps = new Set();
    allActiveComps.forEach(c => {
      const clean = (c || '').trim();
      if (clean) {
        canonicalUniqueComps.add(getCanonicalName(clean));
      }
    });
    const companiesList = Array.from(canonicalUniqueComps).sort((a, b) => a.localeCompare(b));

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
