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

    if (method !== 'DELETE' && method !== 'POST') {
      res.setHeader('Allow', ['DELETE', 'POST']);
      return res.status(405).end(`Method ${method} Not Allowed`);
    }

    await connectToDatabase();

    const date = req.query.date || req.body?.date;
    const allPlatforms = req.query.allPlatforms === 'true' || req.body?.allPlatforms === true;
    const platform = req.query.platform || req.body?.platform || 'meesho';
    const deleteBoth = req.query.deleteBoth !== 'false' && req.body?.deleteBoth !== false;

    if (!date) {
      return res.status(400).json({ message: 'Date is required for deletion' });
    }

    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const baseQuery = {
      $or: [
        { startDate: { $gte: startOfDay, $lte: endOfDay } },
        { selectedDate: { $gte: startOfDay, $lte: endOfDay } }
      ],
      isDeleted: false
    };

    if (user.company) {
      baseQuery.company = user.company;
    }

    if (!allPlatforms && platform && platform !== 'all') {
      baseQuery.platform = platform;
    }

    // Platforms list to query counts
    const platforms = ['meesho', 'snapdeal', 'flipkart', 'myntra'];
    const counts = {
      meesho: { rto: 0, customer: 0 },
      snapdeal: { rto: 0, customer: 0 },
      flipkart: { rto: 0, customer: 0 },
      myntra: { rto: 0, customer: 0 },
      totalRto: 0,
      totalCustomer: 0,
      total: 0
    };

    // Calculate counts before updating
    for (const p of platforms) {
      if (!allPlatforms && platform !== 'all' && platform !== p) continue;
      const pQuery = { ...baseQuery, platform: p };
      const rtoCount = await ReturnOrder.countDocuments(pQuery);
      const custCount = deleteBoth ? await CustomerReturnOrder.countDocuments(pQuery) : 0;
      counts[p].rto = rtoCount;
      counts[p].customer = custCount;
      counts.totalRto += rtoCount;
      counts.totalCustomer += custCount;
    }
    counts.total = counts.totalRto + counts.totalCustomer;

    // Execute soft deletion
    const rtoResult = await ReturnOrder.updateMany(baseQuery, { isDeleted: true });
    let custResult = { modifiedCount: 0 };
    if (deleteBoth) {
      custResult = await CustomerReturnOrder.updateMany(baseQuery, { isDeleted: true });
    }

    const deletedTotal = (rtoResult.modifiedCount || 0) + (custResult.modifiedCount || 0);

    return res.status(200).json({
      success: true,
      message: allPlatforms || platform === 'all'
        ? `Successfully deleted ${deletedTotal} records across all portals (Meesho, Snapdeal, Flipkart, Myntra) for ${date}`
        : `Successfully deleted ${deletedTotal} records for ${platform} on ${date}`,
      deletedCount: deletedTotal,
      details: counts
    });
  } catch (error) {
    console.error('Unified returns delete error:', error);
    return res.status(500).json({ message: 'Error deleting unified returns', error: String(error) });
  }
}

export default authMiddleware(handler);
