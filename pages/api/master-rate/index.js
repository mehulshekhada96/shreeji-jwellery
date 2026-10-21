import connectToDatabase from '../../../lib/mongodb';
import MasterRate from '../../../models/MasterRate';
import MasterRateHistory from '../../../models/MasterRateHistory';
import MasterRateSnapshot from '../../../models/MasterRateSnapshot';
import { authMiddleware } from '../common/common.services';

async function handler(req, res) {
  const { method } = req;
  const user = req.userData;

  if (!user || !user.company) {
    return res.status(401).json({ message: 'Unauthorized or no company associated' });
  }

  const companyId = user.company;

  if (method === 'GET') {
    try {
      await connectToDatabase();
      const { all, search, page = 1, limit = 50, sortBy = 'origin', sortOrder = 'asc' } = req.query;

      // Fast query to load all master rates (used for lookups or export)
      if (all === 'true') {
        const rates = await MasterRate.find({ company: companyId })
          .select('origin imageLink itemRate boxRate boxReturnRate size')
          .lean();
        return res.status(200).json({ success: true, count: rates.length, rates });
      }

      // Paginated query for management UI
      const filter = { company: companyId };
      if (search && search.trim()) {
        const queryRegex = new RegExp(search.trim(), 'i');
        filter.$or = [
          { origin: queryRegex },
          { size: queryRegex }
        ];
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const allowedSortFields = ['origin', 'itemRate', 'boxRate', 'boxReturnRate', 'size', 'updatedAt', 'createdAt'];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'origin';
      const sortDirection = sortOrder === 'desc' ? -1 : 1;
      const sortObj = { [sortField]: sortDirection };

      if (sortField !== 'origin') {
        sortObj.origin = 1;
      }

      const [totalCount, items, history, uploadHistory, totalWithImage] = await Promise.all([
        MasterRate.countDocuments(filter),
        MasterRate.find(filter)
          .sort(sortObj)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        MasterRateHistory.find({ company: companyId })
          .sort({ createdAt: -1 })
          .limit(3)
          .lean(),
        MasterRateHistory.find({ company: companyId, action: 'UPLOAD' })
          .sort({ createdAt: -1 })
          .limit(3)
          .lean(),
        MasterRate.countDocuments({ company: companyId, imageLink: { $exists: true, $ne: '' } })
      ]);

      return res.status(200).json({
        success: true,
        items,
        totalCount,
        totalWithImage,
        page: pageNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
        history,
        uploadHistory
      });
    } catch (error) {
      console.error('Error fetching master rates:', error);
      return res.status(500).json({ message: 'Failed to fetch master rates', error: error.message });
    }
  }

  if (method === 'POST') {
    try {
      await connectToDatabase();
      const { origin, imageLink = '', itemRate = 0, boxRate = 0, boxReturnRate = 0, size = '' } = req.body;

      if (!origin || !origin.trim()) {
        return res.status(400).json({ message: 'Original Product Name is required' });
      }

      const trimmedOrigin = origin.trim();
      const cleanImageLink = (imageLink || '').trim();
      const cleanSize = (size || '').trim();
      const numItemRate = Number(itemRate) || 0;
      const numBoxRate = Number(boxRate) || 0;
      const numBoxReturnRate = Number(boxReturnRate) || 0;

      // Case-insensitive duplicate check
      const existing = await MasterRate.findOne({
        company: companyId,
        origin: new RegExp(`^${trimmedOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      });

      if (existing) {
        return res.status(400).json({ message: `Original Product "${trimmedOrigin}" already exists in Master Rates` });
      }

      const newRate = await MasterRate.create({
        company: companyId,
        origin: trimmedOrigin,
        imageLink: cleanImageLink,
        itemRate: numItemRate,
        boxRate: numBoxRate,
        boxReturnRate: numBoxReturnRate,
        size: cleanSize,
        lastModifiedBy: user._id,
        lastModifiedByName: user.name || user.username || 'User'
      });

      await MasterRateHistory.create({
        company: companyId,
        action: 'ADD',
        description: `Added "${trimmedOrigin}" (Rate: ₹${numItemRate}, Dabbi: ₹${numBoxRate}, Return: ₹${numBoxReturnRate})`,
        details: {
          rateId: newRate._id,
          origin: trimmedOrigin,
          itemRate: numItemRate,
          boxRate: numBoxRate,
          boxReturnRate: numBoxReturnRate,
          size: cleanSize
        },
        performedBy: user._id,
        performedByName: user.name || user.username || 'User'
      });

      return res.status(201).json({
        success: true,
        message: 'Original Product Rate added successfully',
        item: newRate
      });
    } catch (error) {
      console.error('Error creating master rate:', error);
      return res.status(500).json({ message: 'Failed to create master rate', error: error.message });
    }
  }

  if (method === 'PUT') {
    try {
      await connectToDatabase();
      const { id, origin, imageLink, itemRate, boxRate, boxReturnRate, size } = req.body;

      if (!id) {
        return res.status(400).json({ message: 'Rate record ID is required' });
      }

      const existing = await MasterRate.findOne({ _id: id, company: companyId });
      if (!existing) {
        return res.status(404).json({ message: 'Master Rate record not found' });
      }

      const oldOrigin = existing.origin;
      const oldItemRate = existing.itemRate;
      const oldBoxRate = existing.boxRate;
      const oldBoxReturnRate = existing.boxReturnRate;

      if (origin !== undefined) {
        const trimmedOrigin = (origin || '').trim();
        if (!trimmedOrigin) {
          return res.status(400).json({ message: 'Original Product Name cannot be empty' });
        }
        // Check uniqueness if origin changed
        if (trimmedOrigin.toLowerCase() !== existing.origin.toLowerCase()) {
          const duplicate = await MasterRate.findOne({
            company: companyId,
            origin: new RegExp(`^${trimmedOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            _id: { $ne: id }
          });
          if (duplicate) {
            return res.status(400).json({ message: `Original Product "${trimmedOrigin}" already exists` });
          }
        }
        existing.origin = trimmedOrigin;
      }

      if (imageLink !== undefined) existing.imageLink = (imageLink || '').trim();
      if (itemRate !== undefined) existing.itemRate = Number(itemRate) || 0;
      if (boxRate !== undefined) existing.boxRate = Number(boxRate) || 0;
      if (boxReturnRate !== undefined) existing.boxReturnRate = Number(boxReturnRate) || 0;
      if (size !== undefined) existing.size = (size || '').trim();

      existing.lastModifiedBy = user._id;
      existing.lastModifiedByName = user.name || user.username || 'User';

      await existing.save();

      await MasterRateHistory.create({
        company: companyId,
        action: 'EDIT',
        description: `Updated Origin "${existing.origin}" (Rates: ₹${existing.itemRate} / Box: ₹${existing.boxRate})`,
        details: {
          rateId: existing._id,
          oldOrigin,
          newOrigin: existing.origin,
          oldRates: { item: oldItemRate, box: oldBoxRate, return: oldBoxReturnRate },
          newRates: { item: existing.itemRate, box: existing.boxRate, return: existing.boxReturnRate }
        },
        performedBy: user._id,
        performedByName: user.name || user.username || 'User'
      });

      return res.status(200).json({
        success: true,
        message: 'Origin Rate updated successfully',
        item: existing
      });
    } catch (error) {
      console.error('Error updating master rate:', error);
      return res.status(500).json({ message: 'Failed to update master rate', error: error.message });
    }
  }

  if (method === 'DELETE') {
    try {
      await connectToDatabase();
      const { id, clearAll } = req.query;

      // Delete All / Clear File
      if (clearAll === 'true') {
        const count = await MasterRate.countDocuments({ company: companyId });
        if (count === 0) {
          return res.status(400).json({ message: 'No Master Rate records to delete' });
        }

        await MasterRate.deleteMany({ company: companyId });

        await MasterRateHistory.create({
          company: companyId,
          action: 'CLEAR_ALL',
          description: `Deleted all ${count} Origin & Rate records from Master Rate File`,
          details: { deletedCount: count },
          performedBy: user._id,
          performedByName: user.name || user.username || 'User'
        });

        const [history, uploadHistory] = await Promise.all([
          MasterRateHistory.find({ company: companyId }).sort({ createdAt: -1 }).limit(3).lean(),
          MasterRateHistory.find({ company: companyId, action: 'UPLOAD' }).sort({ createdAt: -1 }).limit(3).lean()
        ]);

        return res.status(200).json({
          success: true,
          message: `Successfully cleared all ${count} Origin & Rate records`,
          deletedCount: count,
          history,
          uploadHistory
        });
      }

      // Delete single record
      if (!id) {
        return res.status(400).json({ message: 'Rate record ID is required' });
      }

      const existing = await MasterRate.findOne({ _id: id, company: companyId });
      if (!existing) {
        return res.status(404).json({ message: 'Master Rate record not found' });
      }

      await MasterRate.deleteOne({ _id: id, company: companyId });

      await MasterRateHistory.create({
        company: companyId,
        action: 'DELETE',
        description: `Deleted Origin "${existing.origin}"`,
        details: {
          rateId: existing._id,
          origin: existing.origin,
          itemRate: existing.itemRate,
          boxRate: existing.boxRate
        },
        performedBy: user._id,
        performedByName: user.name || user.username || 'User'
      });

      return res.status(200).json({
        success: true,
        message: `Origin "${existing.origin}" deleted successfully`
      });
    } catch (error) {
      console.error('Error deleting master rate:', error);
      return res.status(500).json({ message: 'Failed to delete master rate', error: error.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  return res.status(405).end(`Method ${method} Not Allowed`);
}

export default authMiddleware(handler);
