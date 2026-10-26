import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import MasterRate from '../../../models/MasterRate';
import MasterRateHistory from '../../../models/MasterRateHistory';
import MasterRateSnapshot from '../../../models/MasterRateSnapshot';
import MasterSku from '../../../models/MasterSku';
import { authMiddleware } from '../common/common.services';

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

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
          .select('origin imageLink itemRate boxRate boxReturnRate dabbi dabbiName size rateHistory')
          .lean();
        return res.status(200).json({ success: true, count: rates.length, rates });
      }

      // Paginated query for management UI
      const filter = { company: companyId };
      if (search && search.trim()) {
        const escaped = escapeRegex(search.trim());
        const queryRegex = new RegExp(escaped, 'i');

        // Look up any origins corresponding to this SKU search in MasterSku
        const matchedOriginsFromSku = await MasterSku.find({
          company: companyId,
          sku: queryRegex
        }).distinct('origin');

        const cleanOrigins = matchedOriginsFromSku.filter(Boolean);

        const orConditions = [
          { origin: queryRegex },
          { size: queryRegex }
        ];

        if (cleanOrigins.length > 0) {
          orConditions.push({ origin: { $in: cleanOrigins } });
        }

        filter.$or = orConditions;
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
      const { origin, imageLink = '', itemRate = 0, boxRate = 0, boxReturnRate = 0, dabbi = null, dabbiName = '', size = '' } = req.body;

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

      const cleanDabbi = (dabbi && mongoose.Types.ObjectId.isValid(dabbi)) ? dabbi : null;

      const newRate = await MasterRate.create({
        company: companyId,
        origin: trimmedOrigin,
        imageLink: cleanImageLink,
        itemRate: numItemRate,
        boxRate: numBoxRate,
        boxReturnRate: numBoxReturnRate,
        dabbi: cleanDabbi,
        dabbiName: (dabbiName || '').trim(),
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
      const {
        id,
        origin,
        imageLink,
        itemRate,
        boxRate,
        boxReturnRate,
        dabbi,
        dabbiName,
        size,
        effectiveFromDate,
        isCorrection = false,
        note = ''
      } = req.body;

      if (!id) {
        return res.status(400).json({ message: 'Rate record ID is required' });
      }

      const existing = await MasterRate.findOne({ _id: id, company: companyId });
      if (!existing) {
        return res.status(404).json({ message: 'Master Rate record not found' });
      }

      const oldOrigin = existing.origin;
      const oldItemRate = Number(existing.itemRate) || 0;
      const oldBoxRate = Number(existing.boxRate) || 0;
      const oldBoxReturnRate = Number(existing.boxReturnRate) || 0;

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
      if (size !== undefined) existing.size = (size || '').trim();
      if (dabbi !== undefined) {
        existing.dabbi = (dabbi && mongoose.Types.ObjectId.isValid(dabbi)) ? dabbi : null;
      }
      if (dabbiName !== undefined) existing.dabbiName = (dabbiName || '').trim();

      const newItemRate = itemRate !== undefined ? (Number(itemRate) || 0) : oldItemRate;
      const newBoxRate = boxRate !== undefined ? (Number(boxRate) || 0) : oldBoxRate;
      const newBoxReturnRate = boxReturnRate !== undefined ? (Number(boxReturnRate) || 0) : oldBoxReturnRate;

      const ratesChanged = (newItemRate !== oldItemRate) || (newBoxRate !== oldBoxRate) || (newBoxReturnRate !== oldBoxReturnRate);

      if (ratesChanged) {
        if (!Array.isArray(existing.rateHistory)) {
          existing.rateHistory = [];
        }

        if (isCorrection) {
          // Correction mode: Update active rate and adjust current history entry without date split
          if (existing.rateHistory.length > 0) {
            const activeEntry = existing.rateHistory.find(h => !h.effectiveTo) || existing.rateHistory[existing.rateHistory.length - 1];
            activeEntry.itemRate = newItemRate;
            activeEntry.boxRate = newBoxRate;
            activeEntry.boxReturnRate = newBoxReturnRate;
            activeEntry.changedAt = new Date();
            activeEntry.changedByName = user.name || user.username || 'User';
            if (note) activeEntry.note = note;
          } else {
            existing.rateHistory.push({
              effectiveFrom: existing.createdAt || new Date('2020-01-01'),
              effectiveTo: null,
              itemRate: newItemRate,
              boxRate: newBoxRate,
              boxReturnRate: newBoxReturnRate,
              changedAt: new Date(),
              changedByName: user.name || user.username || 'User',
              note: note || 'Rate correction'
            });
          }
        } else {
          // Date-effective mode: preserve past rate for prior dates
          const effectiveDate = effectiveFromDate ? new Date(effectiveFromDate) : new Date();
          effectiveDate.setHours(0, 0, 0, 0);

          const dayBefore = new Date(effectiveDate);
          dayBefore.setDate(dayBefore.getDate() - 1);
          dayBefore.setHours(23, 59, 59, 999);

          if (existing.rateHistory.length === 0) {
            // Seed the historical rate before effectiveDate
            existing.rateHistory.push({
              effectiveFrom: existing.createdAt || new Date('2020-01-01'),
              effectiveTo: dayBefore,
              itemRate: oldItemRate,
              boxRate: oldBoxRate,
              boxReturnRate: oldBoxReturnRate,
              changedAt: existing.createdAt || new Date(),
              changedByName: existing.lastModifiedByName || 'System',
              note: 'Prior rate before date-effective revision'
            });
          } else {
            // Close any active or overlapping entries
            for (const entry of existing.rateHistory) {
              if (!entry.effectiveTo || new Date(entry.effectiveTo) >= effectiveDate) {
                entry.effectiveTo = dayBefore;
              }
            }
          }

          // Push the new active rate entry starting from effectiveDate
          existing.rateHistory.push({
            effectiveFrom: effectiveDate,
            effectiveTo: null,
            itemRate: newItemRate,
            boxRate: newBoxRate,
            boxReturnRate: newBoxReturnRate,
            changedAt: new Date(),
            changedByName: user.name || user.username || 'User',
            note: note || `Rate effective from ${effectiveDate.toISOString().split('T')[0]}`
          });
        }

        existing.itemRate = newItemRate;
        existing.boxRate = newBoxRate;
        existing.boxReturnRate = newBoxReturnRate;
      }

      existing.lastModifiedBy = user._id;
      existing.lastModifiedByName = user.name || user.username || 'User';

      await existing.save();

      await MasterRateHistory.create({
        company: companyId,
        action: 'EDIT',
        description: `Updated Origin "${existing.origin}" (Rates: ₹${existing.itemRate} / Box: ₹${existing.boxRate}) [${isCorrection ? 'Correction' : 'Date-Effective'}]`,
        details: {
          rateId: existing._id,
          oldOrigin,
          newOrigin: existing.origin,
          oldRates: { item: oldItemRate, box: oldBoxRate, return: oldBoxReturnRate },
          newRates: { item: existing.itemRate, box: existing.boxRate, return: existing.boxReturnRate },
          isCorrection,
          effectiveFromDate: isCorrection ? 'All Dates' : (effectiveFromDate || new Date().toISOString().split('T')[0])
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
