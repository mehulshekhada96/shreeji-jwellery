import zlib from 'zlib';
import connectToDatabase from '../../../lib/mongodb';
import MasterSku from '../../../models/MasterSku';
import MasterSkuHistory from '../../../models/MasterSkuHistory';
import MasterSkuSnapshot from '../../../models/MasterSkuSnapshot';
import { authMiddleware } from '../common/common.services';

// Increase body/response limit to support large snapshot transfers
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb'
    },
    responseLimit: '15mb'
  }
};

async function handler(req, res) {
  const { method } = req;
  const user = req.userData;

  if (!user || !user.company) {
    return res.status(401).json({ message: 'Unauthorized or no company associated' });
  }

  const companyId = user.company;
  await connectToDatabase();

  // GET: Fetch snapshot data for download or preview
  if (method === 'GET') {
    try {
      const { snapshotId, historyId } = req.query;

      let snapshot = null;
      if (snapshotId) {
        snapshot = await MasterSkuSnapshot.findOne({ _id: snapshotId, company: companyId });
      } else if (historyId) {
        snapshot = await MasterSkuSnapshot.findOne({ historyId, company: companyId });
        if (!snapshot) {
          const history = await MasterSkuHistory.findOne({ _id: historyId, company: companyId });
          if (history?.details?.snapshotId) {
            snapshot = await MasterSkuSnapshot.findOne({ _id: history.details.snapshotId, company: companyId });
          }
        }
      }

      // If no snapshot record found (e.g., initial upload before snapshot model existed),
      // fallback to current active master SKUs if matching
      if (!snapshot) {
        const activeCount = await MasterSku.countDocuments({ company: companyId });
        if (activeCount > 0) {
          const activeItems = await MasterSku.find({ company: companyId })
            .select('sku origin size')
            .lean();
          
          const historyItem = historyId ? await MasterSkuHistory.findOne({ _id: historyId, company: companyId }) : null;
          const fileName = historyItem?.details?.fileName || 'master_sku_snapshot.xlsx';
          const snapshotItems = activeItems.map(i => ({ sku: i.sku, origin: i.origin || '', size: i.size || '' }));
          const compressedBuffer = zlib.gzipSync(Buffer.from(JSON.stringify(snapshotItems)));
          
          snapshot = await MasterSkuSnapshot.create({
            company: companyId,
            historyId: historyItem?._id,
            fileName,
            totalCount: activeItems.length,
            compressedData: compressedBuffer,
            performedBy: historyItem?.performedBy || user._id,
            performedByName: historyItem?.performedByName || user.name || 'User'
          });

          if (historyItem) {
            await MasterSkuHistory.updateOne({ _id: historyItem._id }, { 'details.snapshotId': snapshot._id });
          }

          return res.status(200).json({
            success: true,
            fileName,
            totalCount: activeItems.length,
            items: snapshotItems.map(i => ({
              SKU: i.sku,
              Origin: i.origin || '',
              Size: i.size || ''
            }))
          });
        }
        return res.status(404).json({ message: 'Snapshot data not available for this upload entry.' });
      }

      // Decompress snapshot
      const unzipped = zlib.gunzipSync(snapshot.compressedData);
      const items = JSON.parse(unzipped.toString('utf-8'));

      return res.status(200).json({
        success: true,
        fileName: snapshot.fileName || 'master_sku_snapshot.xlsx',
        totalCount: snapshot.totalCount || items.length,
        items: items.map(i => ({
          SKU: i.sku,
          Origin: i.origin || '',
          Size: i.size || ''
        }))
      });
    } catch (err) {
      console.error('Error fetching snapshot:', err);
      return res.status(500).json({ message: 'Failed to retrieve snapshot: ' + err.message });
    }
  }

  // POST: Restore Master File from snapshot
  if (method === 'POST') {
    try {
      const { snapshotId, historyId } = req.body;

      let snapshot = null;
      if (snapshotId) {
        snapshot = await MasterSkuSnapshot.findOne({ _id: snapshotId, company: companyId });
      } else if (historyId) {
        snapshot = await MasterSkuSnapshot.findOne({ historyId, company: companyId });
        if (!snapshot) {
          const history = await MasterSkuHistory.findOne({ _id: historyId, company: companyId });
          if (history?.details?.snapshotId) {
            snapshot = await MasterSkuSnapshot.findOne({ _id: history.details.snapshotId, company: companyId });
          }
        }
      }

      // If snapshot is still missing, check if active Master SKUs can provide it
      if (!snapshot) {
        const activeCount = await MasterSku.countDocuments({ company: companyId });
        const historyItem = historyId ? await MasterSkuHistory.findOne({ _id: historyId, company: companyId }) : null;
        if (activeCount > 0 && historyItem) {
          const activeItems = await MasterSku.find({ company: companyId }).select('sku origin size').lean();
          const snapshotItems = activeItems.map(i => ({ sku: i.sku, origin: i.origin || '', size: i.size || '' }));
          const compressedBuffer = zlib.gzipSync(Buffer.from(JSON.stringify(snapshotItems)));
          snapshot = await MasterSkuSnapshot.create({
            company: companyId,
            historyId: historyItem._id,
            fileName: historyItem.details?.fileName || 'master_file.xlsx',
            totalCount: activeItems.length,
            compressedData: compressedBuffer,
            performedBy: historyItem.performedBy || user._id,
            performedByName: historyItem.performedByName || user.name || 'User'
          });
          await MasterSkuHistory.updateOne({ _id: historyItem._id }, { 'details.snapshotId': snapshot._id });
        }
      }

      if (!snapshot || !snapshot.compressedData) {
        return res.status(404).json({
          message: 'Snapshot data for this previous upload was not preserved because it was uploaded before the snapshot feature was introduced. Any new uploads retain snapshots automatically.'
        });
      }

      // Decompress items
      const unzipped = zlib.gunzipSync(snapshot.compressedData);
      const rawItems = JSON.parse(unzipped.toString('utf-8'));

      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return res.status(400).json({ message: 'Snapshot contains no valid SKUs' });
      }

      const cleanItems = rawItems.map(item => ({
        company: companyId,
        sku: String(item.sku).trim(),
        origin: item.origin != null ? String(item.origin).trim() : '',
        size: item.size != null ? String(item.size).trim() : '',
        lastModifiedBy: user._id,
        lastModifiedByName: user.name || user.username || 'User'
      }));

      // Replace current active SKUs with snapshot
      const previousCount = await MasterSku.countDocuments({ company: companyId });
      await MasterSku.deleteMany({ company: companyId });

      const chunkSize = 1000;
      for (let i = 0; i < cleanItems.length; i += chunkSize) {
        const chunk = cleanItems.slice(i, i + chunkSize);
        await MasterSku.insertMany(chunk, { ordered: false });
      }

      const desc = `Restored Master File from "${snapshot.fileName}" snapshot (${cleanItems.length} SKUs, replaced ${previousCount} SKUs)`;
      await MasterSkuHistory.create({
        company: companyId,
        action: 'UPLOAD',
        description: desc,
        details: {
          totalCount: cleanItems.length,
          previousCount,
          fileName: snapshot.fileName,
          isRestore: true,
          snapshotId: snapshot._id
        },
        performedBy: user._id,
        performedByName: user.name || user.username || 'User'
      });

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
        message: `Successfully restored ${cleanItems.length} SKUs from "${snapshot.fileName}"!`,
        count: cleanItems.length,
        history: updatedHistory,
        uploadHistory: updatedUploadHistory
      });
    } catch (err) {
      console.error('Error restoring snapshot:', err);
      return res.status(500).json({ message: 'Failed to restore snapshot: ' + err.message });
    }
  }

  // DELETE: Delete a master file record, its upload history entry and associated snapshot
  if (method === 'DELETE') {
    try {
      const historyId = req.query.historyId || req.body?.historyId;
      const snapshotId = req.query.snapshotId || req.body?.snapshotId;

      if (!historyId && !snapshotId) {
        return res.status(400).json({ message: 'historyId or snapshotId is required' });
      }

      let historyItem = null;
      if (historyId) {
        historyItem = await MasterSkuHistory.findOne({ _id: historyId, company: companyId });
      }

      const targetSnapshotId = snapshotId || historyItem?.details?.snapshotId;
      if (targetSnapshotId) {
        await MasterSkuSnapshot.deleteOne({ _id: targetSnapshotId, company: companyId });
      }
      if (historyId) {
        await MasterSkuSnapshot.deleteMany({ historyId, company: companyId });
      }

      const shouldDeleteActiveSkus = req.query.deleteActiveSkus === 'true' || req.body?.deleteActiveSkus === true;
      let deletedActiveCount = 0;
      if (shouldDeleteActiveSkus) {
        deletedActiveCount = await MasterSku.countDocuments({ company: companyId });
        await MasterSku.deleteMany({ company: companyId });
      }

      if (historyItem) {
        await MasterSkuHistory.deleteOne({ _id: historyItem._id, company: companyId });
      } else if (historyId) {
        await MasterSkuHistory.deleteOne({ _id: historyId, company: companyId });
      }

      if (shouldDeleteActiveSkus) {
        await MasterSkuHistory.create({
          company: companyId,
          action: 'DELETE',
          description: `Deleted entire active Master SKU file (${deletedActiveCount.toLocaleString()} SKUs removed)`,
          details: { totalCount: deletedActiveCount, deletedAll: true, deletedAt: new Date() },
          performedBy: user._id,
          performedByName: user.name || user.username || 'User'
        });
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

      const fileName = historyItem?.details?.fileName ? `"${historyItem.details.fileName}"` : 'File';
      return res.status(200).json({
        success: true,
        message: `${fileName} record and snapshot removed successfully.`,
        history: updatedHistory,
        uploadHistory: updatedUploadHistory
      });
    } catch (err) {
      console.error('Error deleting snapshot / file record:', err);
      return res.status(500).json({ message: 'Failed to delete file record: ' + err.message });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default authMiddleware(handler);
