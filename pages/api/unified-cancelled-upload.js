import CancelledOrder from '../../models/CancelledOrder';
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
      meeshoCancelled = [],
      snapdealCancelled = [],
      flipkartCancelled = [],
      myntraCancelled = []
    } = req.body;

    if (!date) {
      return res.status(400).json({ message: 'Date is required for cancelled orders upload' });
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

    let meeshoCount = 0;
    if (Array.isArray(meeshoCancelled) && meeshoCancelled.length > 0) {
      const docs = meeshoCancelled.map(o => formatOrder(o, 'meesho'));
      const inserted = await CancelledOrder.insertMany(docs, { ordered: false });
      meeshoCount = inserted.length;
    }

    let snapdealCount = 0;
    if (Array.isArray(snapdealCancelled) && snapdealCancelled.length > 0) {
      const docs = snapdealCancelled.map(o => formatOrder(o, 'snapdeal'));
      const inserted = await CancelledOrder.insertMany(docs, { ordered: false });
      snapdealCount = inserted.length;
    }

    let flipkartCount = 0;
    if (Array.isArray(flipkartCancelled) && flipkartCancelled.length > 0) {
      const docs = flipkartCancelled.map(o => formatOrder(o, 'flipkart'));
      const inserted = await CancelledOrder.insertMany(docs, { ordered: false });
      flipkartCount = inserted.length;
    }

    let myntraCount = 0;
    if (Array.isArray(myntraCancelled) && myntraCancelled.length > 0) {
      const docs = myntraCancelled.map(o => formatOrder(o, 'myntra'));
      const inserted = await CancelledOrder.insertMany(docs, { ordered: false });
      myntraCount = inserted.length;
    }

    const totalCount = meeshoCount + snapdealCount + flipkartCount + myntraCount;

    return res.status(201).json({
      success: true,
      message: `Unified upload successful for ${date}! Saved ${totalCount} cancelled orders across platforms.`,
      counts: {
        meeshoCancelled: meeshoCount,
        snapdealCancelled: snapdealCount,
        flipkartCancelled: flipkartCount,
        myntraCancelled: myntraCount,
        total: totalCount
      },
      date
    });
  } catch (error) {
    console.error('Unified cancelled orders upload error:', error);
    return res.status(500).json({
      message: 'Failed to process unified cancelled orders upload',
      error: String(error?.message || error)
    });
  }
}

export default authMiddleware(handler);
