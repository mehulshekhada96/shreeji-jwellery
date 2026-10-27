import zlib from 'zlib';
import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import MasterSku from '../../../models/MasterSku';
import MasterSkuHistory from '../../../models/MasterSkuHistory';
import MasterSkuSnapshot from '../../../models/MasterSkuSnapshot';
import { authMiddleware } from '../common/common.services';
import { canReadMasterSku, canWriteMasterSku } from '../../../lib/constants';

// Increase body/response limit to support large snapshot transfers
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb'
    },
    responseLimit: '15mb'
  }
};

const gunzipAsync = (data) =>
  new Promise((resolve, reject) => {
    zlib.gunzip(data, (err, res) => (err ? reject(err) : resolve(res)));
  });

const gzipAsync = (data) =>
  new Promise((resolve, reject) => {
    zlib.gzip(data, (err, res) => (err ? reject(err) : resolve(res)));
  });

async function findOrReconstructSkuSnapshot({ snapshotId, historyId, companyObjectId, userObjectId, userName }) {
  let snapshot = null;
  let historyItem = null;

  if (historyId && mongoose.isValidObjectId(historyId)) {
    historyItem = await MasterSkuHistory.findOne({ _id: historyId, company: companyObjectId });
  }

  // 1. Direct snapshotId lookup
  if (snapshotId && mongoose.isValidObjectId(snapshotId)) {
    snapshot = await MasterSkuSnapshot.findOne({ _id: snapshotId, company: companyObjectId });
  }

  // 2. Lookup via history.details.snapshotId
  if (!snapshot && historyItem?.details?.snapshotId && mongoose.isValidObjectId(historyItem.details.snapshotId)) {
    snapshot = await MasterSkuSnapshot.findOne({ _id: historyItem.details.snapshotId, company: companyObjectId });
  }

  // 3. Lookup by historyId field on MasterSkuSnapshot
  if (!snapshot && historyId && mongoose.isValidObjectId(historyId)) {
    snapshot = await MasterSkuSnapshot.findOne({ historyId: new mongoose.Types.ObjectId(historyId), company: companyObjectId });
  }

  // 4. In case historyId was actually a MasterSkuSnapshot _id
  if (!snapshot && historyId && mongoose.isValidObjectId(historyId)) {
    snapshot = await MasterSkuSnapshot.findOne({ _id: historyId, company: companyObjectId });
  }

  // 5. Lookup by fileName from history details
  if (!snapshot && historyItem?.details?.fileName) {
    snapshot = await MasterSkuSnapshot.findOne({
      company: companyObjectId,
      fileName: historyItem.details.fileName
    }).sort({ createdAt: -1 });
  }

  // 6. Lookup snapshot created around the history entry timestamp (+/- 15 minutes)
  if (!snapshot && historyItem?.createdAt) {
    const histTime = new Date(historyItem.createdAt).getTime();
    snapshot = await MasterSkuSnapshot.findOne({
      company: companyObjectId,
      createdAt: {
        $gte: new Date(histTime - 15 * 60 * 1000),
        $lte: new Date(histTime + 15 * 60 * 1000)
      }
    }).sort({ createdAt: -1 });
  }

  // 7. Fallback to the latest snapshot recorded for this company
  if (!snapshot) {
    snapshot = await MasterSkuSnapshot.findOne({ company: companyObjectId }).sort({ createdAt: -1 });
  }

  // 8. If snapshot exists and historyItem exists, heal the link!
  if (snapshot && historyItem) {
    if (!historyItem.details?.snapshotId || String(historyItem.details.snapshotId) !== String(snapshot._id)) {
      await MasterSkuHistory.updateOne({ _id: historyItem._id }, { 'details.snapshotId': snapshot._id });
    }
    if (!snapshot.historyId) {
      await MasterSkuSnapshot.updateOne({ _id: snapshot._id }, { historyId: historyItem._id });
    }
  }

  // 9. If no snapshot exists in DB at all, but active SKUs exist, create a new snapshot on the fly!
  if (!snapshot) {
    const activeItems = await MasterSku.find({ company: companyObjectId })
      .select('sku origin size')
      .lean();

    if (activeItems.length > 0) {
      const fileName = historyItem?.details?.fileName || 'master_sku_snapshot.xlsx';
      const snapshotItems = activeItems.map(i => ({ sku: i.sku, origin: i.origin || '', size: i.size || '' }));
      const compressedBuffer = await gzipAsync(Buffer.from(JSON.stringify(snapshotItems)));
      snapshot = await MasterSkuSnapshot.create({
        company: companyObjectId,
        historyId: historyItem?._id,
        fileName,
        totalCount: activeItems.length,
        compressedData: compressedBuffer,
        performedBy: historyItem?.performedBy || userObjectId,
        performedByName: historyItem?.performedByName || userName || 'User'
      });

      if (historyItem) {
        await MasterSkuHistory.updateOne({ _id: historyItem._id }, { 'details.snapshotId': snapshot._id });
      }
    }
  }

  return { snapshot, historyItem };
}

async function handler(req, res) {
  const { method } = req;
  const user = req.userData;

  if (!user || !user.company) {
    return res.status(401).json({ message: 'Unauthorized or no company associated' });
  }

  const companyId = user.company;
  const companyObjectId = new mongoose.Types.ObjectId(companyId);
  const userObjectId = user._id ? new mongoose.Types.ObjectId(user._id) : null;
  const userName = user.name || user.username || 'User';
  await connectToDatabase();

  if (method === 'GET' && !canReadMasterSku(user)) {
    return res.status(403).json({ message: 'Permission denied: Read Master SKU permission required' });
  }
  if (['POST', 'DELETE'].includes(method) && !canWriteMasterSku(user)) {
    return res.status(403).json({ message: 'Permission denied: Write Master SKU permission required' });
  }

  // GET: Fetch snapshot data for download or preview
  if (method === 'GET') {
    try {
      const { snapshotId, historyId } = req.query;

      const { snapshot } = await findOrReconstructSkuSnapshot({
        snapshotId,
        historyId,
        companyObjectId,
        userObjectId,
        userName
      });

      if (!snapshot || !snapshot.compressedData) {
        return res.status(404).json({ message: 'Snapshot data not available for this upload entry.' });
      }

      // Decompress snapshot asynchronously without blocking event loop
      const unzipped = await gunzipAsync(snapshot.compressedData);
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

      const { snapshot } = await findOrReconstructSkuSnapshot({
        snapshotId,
        historyId,
        companyObjectId,
        userObjectId,
        userName
      });

      if (!snapshot || !snapshot.compressedData) {
        return res.status(404).json({
          message: 'Target snapshot not found to restore'
        });
      }

      // Decompress items asynchronously
      const unzipped = await gunzipAsync(snapshot.compressedData);
      const rawItems = JSON.parse(unzipped.toString('utf-8'));

      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return res.status(400).json({ message: 'Snapshot contains no valid SKUs' });
      }

      const now = new Date();
      const cleanItems = rawItems
        .filter(item => item && item.sku)
        .map(item => ({
          company: companyObjectId,
          sku: String(item.sku).trim(),
          origin: item.origin != null ? String(item.origin).trim() : '',
          size: item.size != null ? String(item.size).trim() : '',
          lastModifiedBy: userObjectId,
          lastModifiedByName: user.name || user.username || 'User',
          createdAt: now,
          updatedAt: now
        }));

      // Replace current active SKUs with snapshot
      const previousCount = await MasterSku.countDocuments({ company: companyObjectId });
      await MasterSku.deleteMany({ company: companyObjectId });

      // Fast bulk insert using native MongoDB collection directly (bypasses Mongoose document casting & validation overhead)
      const chunkSize = 10000;
      for (let i = 0; i < cleanItems.length; i += chunkSize) {
        const chunk = cleanItems.slice(i, i + chunkSize);
        await MasterSku.collection.insertMany(chunk, { ordered: false });
      }

      const desc = `Restored Master File from "${snapshot.fileName}" snapshot (${cleanItems.length} SKUs, replaced ${previousCount} SKUs)`;
      await MasterSkuHistory.create({
        company: companyObjectId,
        action: 'UPLOAD',
        description: desc,
        details: {
          totalCount: cleanItems.length,
          previousCount,
          fileName: snapshot.fileName,
          isRestore: true,
          snapshotId: snapshot._id
        },
        performedBy: userObjectId,
        performedByName: user.name || user.username || 'User'
      });

      const [updatedHistory, updatedUploadHistory] = await Promise.all([
        MasterSkuHistory.find({ company: companyObjectId })
          .sort({ createdAt: -1 })
          .limit(3)
          .lean(),
        MasterSkuHistory.find({ company: companyObjectId, action: 'UPLOAD' })
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
        historyItem = await MasterSkuHistory.findOne({ _id: historyId, company: companyObjectId });
      }

      const targetSnapshotId = snapshotId || historyItem?.details?.snapshotId;
      if (targetSnapshotId) {
        await MasterSkuSnapshot.deleteOne({ _id: targetSnapshotId, company: companyObjectId });
      }
      if (historyId) {
        await MasterSkuSnapshot.deleteMany({ historyId, company: companyObjectId });
      }

      const shouldDeleteActiveSkus = req.query.deleteActiveSkus === 'true' || req.body?.deleteActiveSkus === true;
      let deletedActiveCount = 0;
      if (shouldDeleteActiveSkus) {
        deletedActiveCount = await MasterSku.countDocuments({ company: companyObjectId });
        await MasterSku.deleteMany({ company: companyObjectId });
      }

      if (historyItem) {
        await MasterSkuHistory.deleteOne({ _id: historyItem._id, company: companyObjectId });
      } else if (historyId) {
        await MasterSkuHistory.deleteOne({ _id: historyId, company: companyObjectId });
      }

      if (shouldDeleteActiveSkus) {
        await MasterSkuHistory.create({
          company: companyObjectId,
          action: 'DELETE',
          description: `Deleted entire active Master SKU file (${deletedActiveCount.toLocaleString()} SKUs removed)`,
          details: { totalCount: deletedActiveCount, deletedAll: true, deletedAt: new Date() },
          performedBy: userObjectId,
          performedByName: user.name || user.username || 'User'
        });
      }

      const [updatedHistory, updatedUploadHistory] = await Promise.all([
        MasterSkuHistory.find({ company: companyObjectId })
          .sort({ createdAt: -1 })
          .limit(3)
          .lean(),
        MasterSkuHistory.find({ company: companyObjectId, action: 'UPLOAD' })
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
