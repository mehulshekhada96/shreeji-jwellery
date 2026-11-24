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

    if (method !== 'DELETE' && method !== 'POST') {
      res.setHeader('Allow', ['DELETE', 'POST']);
      return res.status(405).end(`Method ${method} Not Allowed`);
    }

    await connectToDatabase();

    const date = req.query.date || req.body?.date;
    const allPlatforms = req.query.allPlatforms === 'true' || req.body?.allPlatforms === true;
    const platform = req.query.platform || req.body?.platform || 'meesho';

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
      if (platform === 'meesho') {
        baseQuery.platform = { $in: ['meesho', null, ''] };
      } else {
        baseQuery.platform = platform;
      }
    }

    // Platforms list to query counts
    const platforms = ['meesho', 'snapdeal', 'flipkart', 'myntra'];
    const counts = {
      meesho: 0,
      snapdeal: 0,
      flipkart: 0,
      myntra: 0,
      total: 0
    };

    for (const p of platforms) {
      if (!allPlatforms && platform !== 'all' && platform !== p) continue;
      const pQuery = {
        ...baseQuery,
        platform: p === 'meesho' ? { $in: ['meesho', null, ''] } : p
      };
      const cnt = await CancelledOrder.countDocuments(pQuery);
      counts[p] = cnt;
      counts.total += cnt;
    }

    // Execute soft deletion
    const result = await CancelledOrder.updateMany(baseQuery, { isDeleted: true });
    const deletedTotal = result.modifiedCount || 0;

    return res.status(200).json({
      success: true,
      message: allPlatforms || platform === 'all'
        ? `Successfully deleted ${deletedTotal} cancelled orders across all portals (Meesho, Snapdeal, Flipkart, Myntra) for ${date}`
        : `Successfully deleted ${deletedTotal} cancelled orders for ${platform} on ${date}`,
      deletedCount: deletedTotal,
      details: counts
    });
  } catch (error) {
    console.error('Unified cancelled delete error:', error);
    return res.status(500).json({ message: 'Error deleting unified cancelled orders', error: String(error) });
  }
}

export default authMiddleware(handler);
