import ReturnOrder from '../../models/ReturnOrder';
import CustomerReturnOrder from '../../models/CustomerReturnOrder';
import { authMiddleware } from './common/common.services';
import connectToDatabase from '../../lib/mongodb';

async function handler(req, res) {
  const { method } = req;

  try {
    const user = req.userData;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).end(`Method ${method} Not Allowed`);
    }

    await connectToDatabase();

    const {
      date,
      meeshoReturns = [],
      meeshoCustomerReturns = [],
      snapdealReturns = [],
      snapdealCustomerReturns = [],
      flipkartReturns = [],
      flipkartCustomerReturns = [],
      myntraReturns = [],
      myntraCustomerReturns = []
    } = req.body;

    if (!date) {
      return res.status(400).json({ message: 'Date is required for returns upload' });
    }

    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ message: 'Invalid date provided' });
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (dateObj > today) {
      return res.status(400).json({ message: 'Cannot upload data for future dates' });
    }

    const formatOrder = (order, targetPlatform) => ({
      companyName: String(order.companyName).trim(),
      sku: String(order.sku).trim(),
      quantity: Number(order.quantity) || 1,
      email: order.email ? String(order.email).trim().toLowerCase() : '',
      startDate: dateObj,
      endDate: dateObj,
      selectedDate: dateObj,
      company: user.company,
      platform: targetPlatform,
      uploadedDate: new Date(),
      uploadedBy: user._id,
      uploadedByName: user.name || user.username || 'System',
      isDeleted: false
    });

    const operations = [];

    // 1. Meesho RTO
    let meeshoRetCount = 0;
    if (Array.isArray(meeshoReturns) && meeshoReturns.length > 0) {
      const docs = meeshoReturns.map(o => formatOrder(o, 'meesho'));
      const res = await ReturnOrder.insertMany(docs, { ordered: false });
      meeshoRetCount = res.length;
    }

    // 2. Meesho Customer Returns
    let meeshoCustCount = 0;
    if (Array.isArray(meeshoCustomerReturns) && meeshoCustomerReturns.length > 0) {
      const docs = meeshoCustomerReturns.map(o => formatOrder(o, 'meesho'));
      const res = await CustomerReturnOrder.insertMany(docs, { ordered: false });
      meeshoCustCount = res.length;
    }

    // 3. Snapdeal RTO
    let snapdealRetCount = 0;
    if (Array.isArray(snapdealReturns) && snapdealReturns.length > 0) {
      const docs = snapdealReturns.map(o => formatOrder(o, 'snapdeal'));
      const res = await ReturnOrder.insertMany(docs, { ordered: false });
      snapdealRetCount = res.length;
    }

    // 4. Snapdeal Customer Returns
    let snapdealCustCount = 0;
    if (Array.isArray(snapdealCustomerReturns) && snapdealCustomerReturns.length > 0) {
      const docs = snapdealCustomerReturns.map(o => formatOrder(o, 'snapdeal'));
      const res = await CustomerReturnOrder.insertMany(docs, { ordered: false });
      snapdealCustCount = res.length;
    }

    // 5. Flipkart RTO
    let flipkartRetCount = 0;
    if (Array.isArray(flipkartReturns) && flipkartReturns.length > 0) {
      const docs = flipkartReturns.map(o => formatOrder(o, 'flipkart'));
      const res = await ReturnOrder.insertMany(docs, { ordered: false });
      flipkartRetCount = res.length;
    }

    // 6. Flipkart Customer Returns
    let flipkartCustCount = 0;
    if (Array.isArray(flipkartCustomerReturns) && flipkartCustomerReturns.length > 0) {
      const docs = flipkartCustomerReturns.map(o => formatOrder(o, 'flipkart'));
      const res = await CustomerReturnOrder.insertMany(docs, { ordered: false });
      flipkartCustCount = res.length;
    }

    // 7. Myntra RTO
    let myntraRetCount = 0;
    if (Array.isArray(myntraReturns) && myntraReturns.length > 0) {
      const docs = myntraReturns.map(o => formatOrder(o, 'myntra'));
      const res = await ReturnOrder.insertMany(docs, { ordered: false });
      myntraRetCount = res.length;
    }

    // 8. Myntra Customer Returns
    let myntraCustCount = 0;
    if (Array.isArray(myntraCustomerReturns) && myntraCustomerReturns.length > 0) {
      const docs = myntraCustomerReturns.map(o => formatOrder(o, 'myntra'));
      const res = await CustomerReturnOrder.insertMany(docs, { ordered: false });
      myntraCustCount = res.length;
    }

    const totalCount = meeshoRetCount + meeshoCustCount +
                       snapdealRetCount + snapdealCustCount +
                       flipkartRetCount + flipkartCustCount +
                       myntraRetCount + myntraCustCount;

    return res.status(201).json({
      success: true,
      message: `Unified upload successful for ${date}! Saved ${totalCount} returns across platforms.`,
      counts: {
        meeshoReturns: meeshoRetCount,
        meeshoCustomerReturns: meeshoCustCount,
        snapdealReturns: snapdealRetCount,
        snapdealCustomerReturns: snapdealCustCount,
        flipkartReturns: flipkartRetCount,
        flipkartCustomerReturns: flipkartCustCount,
        myntraReturns: myntraRetCount,
        myntraCustomerReturns: myntraCustCount,
        total: totalCount
      },
      date
    });
  } catch (error) {
    console.error('Unified returns upload error:', error);
    return res.status(500).json({
      message: 'Failed to process unified returns upload',
      error: String(error?.message || error)
    });
  }
}

export default authMiddleware(handler);
