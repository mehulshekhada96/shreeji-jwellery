import connectToDatabase from '../../../lib/mongodb';
import MasterSku from '../../../models/MasterSku';
import MasterSkuHistory from '../../../models/MasterSkuHistory';
import MasterSkuSnapshot from '../../../models/MasterSkuSnapshot';
import MasterRate from '../../../models/MasterRate';
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
      const { all, search, page = 1, limit = 50, sortBy = 'sku', sortOrder = 'asc', rateStatus } = req.query;

      // Fast query for sorting components to load the entire mapping
      if (all === 'true') {
        const skus = await MasterSku.find({ company: companyId })
          .select('sku origin size')
          .lean();
        return res.status(200).json({ success: true, count: skus.length, skus });
      }

      // Paginated query for the management UI
      const filter = { company: companyId };
      if (search && search.trim()) {
        const escaped = escapeRegex(search.trim());
        const queryRegex = new RegExp(escaped, 'i');
        filter.$or = [
          { sku: queryRegex },
          { origin: queryRegex },
          { size: queryRegex }
        ];
      }

      // Filter by rate configuration status if specified
      if (rateStatus === 'configured' || rateStatus === 'not_configured') {
        const rawConfiguredOrigins = await MasterRate.find({ company: companyId }).distinct('origin');
        const configuredOrigins = rawConfiguredOrigins.filter(Boolean);
        if (rateStatus === 'configured') {
          filter.origin = { $in: configuredOrigins };
        } else if (rateStatus === 'not_configured') {
          filter.$and = filter.$and || [];
          filter.$and.push({
            $or: [
              { origin: { $nin: configuredOrigins } },
              { origin: null },
              { origin: '' }
            ]
          });
        }
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const allowedSortFields = ['sku', 'origin', 'size', 'updatedAt', 'createdAt'];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'sku';
      const sortDirection = sortOrder === 'desc' ? -1 : 1;
      const sortObj = { [sortField]: sortDirection };

      // Secondary sort for deterministic order
      if (sortField !== 'sku') {
        sortObj.sku = 1;
      }

      const [totalCount, items, history, uploadHistory] = await Promise.all([
        MasterSku.countDocuments(filter),
        MasterSku.find(filter)
          .sort(sortObj)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        MasterSkuHistory.find({ company: companyId })
          .sort({ createdAt: -1 })
          .limit(3)
          .lean(),
        MasterSkuHistory.find({ company: companyId, action: 'UPLOAD' })
          .sort({ createdAt: -1 })
          .limit(3)
          .lean()
      ]);

      // Enrich SKU items with imageLink from MasterRate based on origin
      const distinctOrigins = [...new Set(items.map(it => (it.origin || '').trim()).filter(Boolean))];
      if (distinctOrigins.length > 0) {
        const rates = await MasterRate.find({
          company: companyId,
          origin: { $in: distinctOrigins.map(o => new RegExp(`^${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) }
        }).select('origin imageLink itemRate boxRate boxReturnRate size _id updatedAt').lean();

        const rateMap = new Map();
        for (const r of rates) {
          rateMap.set((r.origin || '').trim().toLowerCase(), r);
        }

        for (const it of items) {
          const k = (it.origin || '').trim().toLowerCase();
          const match = rateMap.get(k);
          it.imageLink = match?.imageLink || '';
          it.itemRate = match?.itemRate ?? null;
          it.boxRate = match?.boxRate ?? null;
          it.boxReturnRate = match?.boxReturnRate ?? null;
          it.originSize = match?.size || '';
          it.rateId = match?._id || null;
          it.hasRate = !!match;
        }
      }

      return res.status(200).json({
        success: true,
        items,
        totalCount,
        page: pageNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
        history,
        uploadHistory
      });
    } catch (error) {
      console.error('Error fetching master SKUs:', error);
      return res.status(500).json({ message: 'Failed to fetch master SKUs', error: error.message });
    }
  }

  if (method === 'POST') {
    try {
      const { sku, origin = '', size = '' } = req.body;

      if (!sku || !sku.trim()) {
        return res.status(400).json({ message: 'SKU is required' });
      }

      const trimmedSku = sku.trim();
      const trimmedOrigin = (origin || '').trim();
      const trimmedSize = (size || '').trim();

      // Check if SKU already exists for this company (case-insensitive)
      const existing = await MasterSku.findOne({
        company: companyId,
        sku: { $regex: new RegExp(`^${trimmedSku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      }).lean();

      if (existing) {
        return res.status(400).json({ message: `SKU "${trimmedSku}" already exists in Master File` });
      }

      const newSkuDoc = await MasterSku.create({
        company: companyId,
        sku: trimmedSku,
        origin: trimmedOrigin,
        size: trimmedSize,
        lastModifiedBy: user._id,
        lastModifiedByName: user.name || user.username || 'User'
      });

      // Record in audit history
      await MasterSkuHistory.create({
        company: companyId,
        action: 'ADD',
        sku: trimmedSku,
        description: `Added SKU "${trimmedSku}" (Origin: ${trimmedOrigin || 'None'}, Size: ${trimmedSize || 'None'})`,
        details: { sku: trimmedSku, origin: trimmedOrigin, size: trimmedSize },
        performedBy: user._id,
        performedByName: user.name || user.username || 'User'
      });

      const updatedHistory = await MasterSkuHistory.find({ company: companyId })
        .sort({ createdAt: -1 })
        .limit(3)
        .lean();

      return res.status(201).json({
        success: true,
        message: `SKU "${trimmedSku}" added successfully`,
        item: newSkuDoc,
        history: updatedHistory
      });
    } catch (error) {
      console.error('Error adding master SKU:', error);
      return res.status(500).json({ message: 'Failed to add SKU', error: error.message });
    }
  }

  if (method === 'PUT') {
    try {
      const { id, sku, origin = '', size = '' } = req.body;

      if (!id) {
        return res.status(400).json({ message: 'ID is required' });
      }
      if (!sku || !sku.trim()) {
        return res.status(400).json({ message: 'SKU cannot be empty' });
      }

      const trimmedSku = sku.trim();
      const trimmedOrigin = (origin || '').trim();
      const trimmedSize = (size || '').trim();

      const existingDoc = await MasterSku.findOne({ _id: id, company: companyId });
      if (!existingDoc) {
        return res.status(404).json({ message: 'SKU not found' });
      }

      // Check if renamed SKU conflicts with another SKU
      if (existingDoc.sku.toLowerCase() !== trimmedSku.toLowerCase()) {
        const conflict = await MasterSku.findOne({
          company: companyId,
          _id: { $ne: id },
          sku: { $regex: new RegExp(`^${trimmedSku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        }).lean();
        if (conflict) {
          return res.status(400).json({ message: `Another SKU with name "${trimmedSku}" already exists` });
        }
      }

      // Track changes for history description
      const changes = [];
      if (existingDoc.sku !== trimmedSku) {
        changes.push(`SKU renamed from "${existingDoc.sku}" to "${trimmedSku}"`);
      }
      if ((existingDoc.origin || '') !== trimmedOrigin) {
        changes.push(`Origin changed from "${existingDoc.origin || 'None'}" to "${trimmedOrigin || 'None'}"`);
      }
      if ((existingDoc.size || '') !== trimmedSize) {
        changes.push(`Size changed from "${existingDoc.size || 'None'}" to "${trimmedSize || 'None'}"`);
      }

      existingDoc.sku = trimmedSku;
      existingDoc.origin = trimmedOrigin;
      existingDoc.size = trimmedSize;
      existingDoc.lastModifiedBy = user._id;
      existingDoc.lastModifiedByName = user.name || user.username || 'User';

      await existingDoc.save();

      // Only create history entry if something actually changed
      if (changes.length > 0) {
        await MasterSkuHistory.create({
          company: companyId,
          action: 'EDIT',
          sku: trimmedSku,
          description: `Updated SKU "${trimmedSku}": ${changes.join(', ')}`,
          details: { changes, sku: trimmedSku, origin: trimmedOrigin, size: trimmedSize },
          performedBy: user._id,
          performedByName: user.name || user.username || 'User'
        });
      }

      const updatedHistory = await MasterSkuHistory.find({ company: companyId })
        .sort({ createdAt: -1 })
        .limit(3)
        .lean();

      return res.status(200).json({
        success: true,
        message: `SKU "${trimmedSku}" updated successfully`,
        item: existingDoc,
        history: updatedHistory
      });
    } catch (error) {
      console.error('Error updating master SKU:', error);
      return res.status(500).json({ message: 'Failed to update SKU', error: error.message });
    }
  }

  if (method === 'DELETE') {
    try {
      const { id, clearAll, deleteHistory } = req.query || {};
      const body = req.body || {};
      const isClearAll = clearAll === 'true' || body.clearAll === true;

      // Case 1: Delete WHOLE current active Master SKU Excel file
      if (isClearAll) {
        const totalCount = await MasterSku.countDocuments({ company: companyId });

        // Delete all active Master SKUs for this company
        await MasterSku.deleteMany({ company: companyId });

        // Record in audit history
        await MasterSkuHistory.create({
          company: companyId,
          action: 'DELETE',
          description: `Deleted entire active Master SKU file (${totalCount.toLocaleString()} SKUs removed)`,
          details: { totalCount, deletedAll: true, deletedAt: new Date() },
          performedBy: user._id,
          performedByName: user.name || user.username || 'User'
        });

        // If requested to also remove history/snapshot of the latest upload
        if (deleteHistory === 'true' || body.deleteHistory === true) {
          const latestUpload = await MasterSkuHistory.findOne({ company: companyId, action: 'UPLOAD' }).sort({ createdAt: -1 });
          if (latestUpload) {
            if (latestUpload.details?.snapshotId) {
              await MasterSkuSnapshot.deleteOne({ _id: latestUpload.details.snapshotId, company: companyId });
            }
            await MasterSkuSnapshot.deleteMany({ historyId: latestUpload._id, company: companyId });
            await MasterSkuHistory.deleteOne({ _id: latestUpload._id, company: companyId });
          }
        }

        const [updatedHistory, updatedUploadHistory] = await Promise.all([
          MasterSkuHistory.find({ company: companyId })
            .sort({ createdAt: -1 })
            .limit(3)
            .lean(),
          MasterSkuHistory.find({ company: companyId, action: 'UPLOAD' })
            .sort({ createdAt: -1 })
            .limit(3)
            .lean()
        ]);

        return res.status(200).json({
          success: true,
          message: `Successfully deleted whole current master file (${totalCount.toLocaleString()} SKUs removed)`,
          deletedCount: totalCount,
          history: updatedHistory,
          uploadHistory: updatedUploadHistory
        });
      }

      // Case 2: Delete single SKU
      const targetId = id || body.id;
      if (!targetId) {
        return res.status(400).json({ message: 'SKU ID is required' });
      }

      const existingDoc = await MasterSku.findOne({ _id: targetId, company: companyId });
      if (!existingDoc) {
        return res.status(404).json({ message: 'SKU not found' });
      }

      const deletedSku = existingDoc.sku;
      const deletedOrigin = existingDoc.origin;
      const deletedSize = existingDoc.size;

      await MasterSku.deleteOne({ _id: targetId, company: companyId });

      await MasterSkuHistory.create({
        company: companyId,
        action: 'DELETE',
        sku: deletedSku,
        description: `Removed SKU "${deletedSku}" (Origin: ${deletedOrigin || 'None'}, Size: ${deletedSize || 'None'})`,
        details: { sku: deletedSku, origin: deletedOrigin, size: deletedSize },
        performedBy: user._id,
        performedByName: user.name || user.username || 'User'
      });

      const updatedHistory = await MasterSkuHistory.find({ company: companyId })
        .sort({ createdAt: -1 })
        .limit(3)
        .lean();

      return res.status(200).json({
        success: true,
        message: `SKU "${deletedSku}" removed successfully`,
        history: updatedHistory
      });
    } catch (error) {
      console.error('Error deleting master SKU:', error);
      return res.status(500).json({ message: 'Failed to delete SKU', error: error.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  return res.status(405).end(`Method ${method} Not Allowed`);
}

export default authMiddleware(handler);
