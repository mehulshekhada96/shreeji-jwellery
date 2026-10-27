import zlib from 'zlib';
import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import MasterRate from '../../../models/MasterRate';
import MasterRateHistory from '../../../models/MasterRateHistory';
import MasterRateSnapshot from '../../../models/MasterRateSnapshot';
import { authMiddleware } from '../common/common.services';
import { canReadMasterRate, canWriteMasterRate } from '../../../lib/constants';

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

async function findOrReconstructRateSnapshot({ snapshotId, historyId, companyObjectId, userObjectId, userName }) {
  let snapshot = null;
  let historyItem = null;

  if (historyId && mongoose.isValidObjectId(historyId)) {
    historyItem = await MasterRateHistory.findOne({ _id: historyId, company: companyObjectId });
  }

  // 1. Direct snapshotId lookup
  if (snapshotId && mongoose.isValidObjectId(snapshotId)) {
    snapshot = await MasterRateSnapshot.findOne({ _id: snapshotId, company: companyObjectId });
  }

  // 2. Lookup via history.details.snapshotId
  if (!snapshot && historyItem?.details?.snapshotId && mongoose.isValidObjectId(historyItem.details.snapshotId)) {
    snapshot = await MasterRateSnapshot.findOne({ _id: historyItem.details.snapshotId, company: companyObjectId });
  }

  // 3. Lookup by historyId field on MasterRateSnapshot
  if (!snapshot && historyId && mongoose.isValidObjectId(historyId)) {
    snapshot = await MasterRateSnapshot.findOne({ historyId: new mongoose.Types.ObjectId(historyId), company: companyObjectId });
  }

  // 4. In case historyId was actually a MasterRateSnapshot _id
  if (!snapshot && historyId && mongoose.isValidObjectId(historyId)) {
    snapshot = await MasterRateSnapshot.findOne({ _id: historyId, company: companyObjectId });
  }

  // 5. Lookup by fileName from history details
  if (!snapshot && historyItem?.details?.fileName) {
    snapshot = await MasterRateSnapshot.findOne({
      company: companyObjectId,
      fileName: historyItem.details.fileName
    }).sort({ createdAt: -1 });
  }

  // 6. Lookup snapshot created around the history entry timestamp (+/- 15 minutes)
  if (!snapshot && historyItem?.createdAt) {
    const histTime = new Date(historyItem.createdAt).getTime();
    snapshot = await MasterRateSnapshot.findOne({
      company: companyObjectId,
      createdAt: {
        $gte: new Date(histTime - 15 * 60 * 1000),
        $lte: new Date(histTime + 15 * 60 * 1000)
      }
    }).sort({ createdAt: -1 });
  }

  // 7. Fallback to the latest snapshot recorded for this company
  if (!snapshot) {
    snapshot = await MasterRateSnapshot.findOne({ company: companyObjectId }).sort({ createdAt: -1 });
  }

  // 8. If snapshot exists and historyItem exists, heal the link!
  if (snapshot && historyItem) {
    if (!historyItem.details?.snapshotId || String(historyItem.details.snapshotId) !== String(snapshot._id)) {
      await MasterRateHistory.updateOne({ _id: historyItem._id }, { 'details.snapshotId': snapshot._id });
    }
    if (!snapshot.historyId) {
      await MasterRateSnapshot.updateOne({ _id: snapshot._id }, { historyId: historyItem._id });
    }
  }

  // 9. If no snapshot exists in DB at all, but active rates exist, create a new snapshot on the fly!
  if (!snapshot) {
    const activeRates = await MasterRate.find({ company: companyObjectId })
      .select('origin imageLink itemRate boxRate boxReturnRate size')
      .lean();

    if (activeRates.length > 0) {
      const fileName = historyItem?.details?.fileName || 'master_rate_backup.xlsx';
      const compressedBuffer = await gzipAsync(Buffer.from(JSON.stringify(activeRates)));
      snapshot = await MasterRateSnapshot.create({
        company: companyObjectId,
        historyId: historyItem?._id,
        fileName,
        totalCount: activeRates.length,
        compressedData: compressedBuffer,
        performedBy: historyItem?.performedBy || userObjectId,
        performedByName: historyItem?.performedByName || userName || 'User'
      });

      if (historyItem) {
        await MasterRateHistory.updateOne({ _id: historyItem._id }, { 'details.snapshotId': snapshot._id });
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

  if (method === 'GET' && !canReadMasterRate(user)) {
    return res.status(403).json({ message: 'Permission denied: Read Master Rate permission required' });
  }
  if (['POST', 'DELETE'].includes(method) && !canWriteMasterRate(user)) {
    return res.status(403).json({ message: 'Permission denied: Write Master Rate permission required' });
  }

  if (method === 'GET') {
    try {
      const { snapshotId, historyId } = req.query;

      const { snapshot } = await findOrReconstructRateSnapshot({
        snapshotId,
        historyId,
        companyObjectId,
        userObjectId,
        userName
      });

      if (!snapshot || !snapshot.compressedData) {
        return res.status(404).json({ message: 'No Master Rate snapshot found to download' });
      }

      const decompressedString = (await gunzipAsync(snapshot.compressedData)).toString('utf-8');
      const items = JSON.parse(decompressedString);

      return res.status(200).json({
        success: true,
        fileName: snapshot.fileName || 'master_rate_backup.xlsx',
        totalCount: snapshot.totalCount || items.length,
        createdAt: snapshot.createdAt,
        items
      });
    } catch (error) {
      console.error('Error fetching master rate snapshot:', error);
      return res.status(500).json({ message: 'Failed to retrieve snapshot data', error: error.message });
    }
  }

  if (method === 'POST') {
    try {
      const { snapshotId, historyId } = req.body;

      const { snapshot } = await findOrReconstructRateSnapshot({
        snapshotId,
        historyId,
        companyObjectId,
        userObjectId,
        userName
      });

      if (!snapshot || !snapshot.compressedData) {
        return res.status(404).json({ message: 'Target snapshot not found to restore' });
      }

      const decompressedString = (await gunzipAsync(snapshot.compressedData)).toString('utf-8');
      const items = JSON.parse(decompressedString);

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Snapshot contains no valid data to restore' });
      }

      const previousCount = await MasterRate.countDocuments({ company: companyObjectId });
      await MasterRate.deleteMany({ company: companyObjectId });

      const now = new Date();
      const docsToInsert = items.map(item => ({
        company: companyObjectId,
        origin: String(item.origin || '').trim(),
        imageLink: String(item.imageLink || '').trim(),
        itemRate: Number(item.itemRate) || 0,
        boxRate: Number(item.boxRate) || 0,
        boxReturnRate: Number(item.boxReturnRate) || 0,
        size: item.size != null ? String(item.size).trim() : '',
        lastModifiedBy: userObjectId,
        lastModifiedByName: userName,
        createdAt: now,
        updatedAt: now
      })).filter(doc => doc.origin);

      const chunkSize = 10000;
      for (let i = 0; i < docsToInsert.length; i += chunkSize) {
        const chunk = docsToInsert.slice(i, i + chunkSize);
        await MasterRate.collection.insertMany(chunk, { ordered: false });
      }

      await MasterRateHistory.create({
        company: companyObjectId,
        action: 'RESTORE_SNAPSHOT',
        description: `Restored Master Rate File from snapshot "${snapshot.fileName}" with ${docsToInsert.length} origins (replaced ${previousCount} origins)`,
        details: {
          snapshotId: snapshot._id,
          restoredCount: docsToInsert.length,
          previousCount,
          fileName: snapshot.fileName
        },
        performedBy: userObjectId,
        performedByName: userName
      });

      const [updatedHistory, updatedUploadHistory] = await Promise.all([
        MasterRateHistory.find({ company: companyObjectId }).sort({ createdAt: -1 }).limit(3).lean(),
        MasterRateHistory.find({ company: companyObjectId, action: 'UPLOAD' }).sort({ createdAt: -1 }).limit(3).lean()
      ]);

      return res.status(200).json({
        success: true,
        message: `Successfully restored ${docsToInsert.length} origins from snapshot!`,
        count: docsToInsert.length,
        history: updatedHistory,
        uploadHistory: updatedUploadHistory
      });
    } catch (error) {
      console.error('Error restoring snapshot:', error);
      return res.status(500).json({ message: 'Failed to restore snapshot', error: error.message });
    }
  }

  // DELETE: Delete a master rate snapshot, its upload history entry, and optionally active rates if chosen
  if (method === 'DELETE') {
    try {
      const historyId = req.query.historyId || req.body?.historyId;
      const snapshotId = req.query.snapshotId || req.body?.snapshotId;

      if (!historyId && !snapshotId) {
        return res.status(400).json({ message: 'historyId or snapshotId is required' });
      }

      let historyItem = null;
      if (historyId && mongoose.isValidObjectId(historyId)) {
        historyItem = await MasterRateHistory.findOne({ _id: historyId, company: companyObjectId });
      }

      const targetSnapshotId = snapshotId || historyItem?.details?.snapshotId;
      if (targetSnapshotId && mongoose.isValidObjectId(targetSnapshotId)) {
        await MasterRateSnapshot.deleteOne({ _id: targetSnapshotId, company: companyObjectId });
      }
      if (historyId && mongoose.isValidObjectId(historyId)) {
        await MasterRateSnapshot.deleteMany({ historyId: new mongoose.Types.ObjectId(historyId), company: companyObjectId });
      }
      // Also delete snapshots with matching fileName created around the same time (+/- 15 minutes)
      if (historyItem?.details?.fileName) {
        const histTime = new Date(historyItem.createdAt).getTime();
        await MasterRateSnapshot.deleteMany({
          company: companyObjectId,
          fileName: historyItem.details.fileName,
          createdAt: {
            $gte: new Date(histTime - 15 * 60 * 1000),
            $lte: new Date(histTime + 15 * 60 * 1000)
          }
        });
      }

      const shouldDeleteActiveRates = req.query.deleteActiveRates === 'true' || req.body?.deleteActiveRates === true;
      let deletedActiveCount = 0;
      if (shouldDeleteActiveRates) {
        deletedActiveCount = await MasterRate.countDocuments({ company: companyObjectId });
        await MasterRate.deleteMany({ company: companyObjectId });
      }

      if (historyItem) {
        await MasterRateHistory.deleteOne({ _id: historyItem._id, company: companyObjectId });
      } else if (historyId && mongoose.isValidObjectId(historyId)) {
        await MasterRateHistory.deleteOne({ _id: historyId, company: companyObjectId });
      }

      if (shouldDeleteActiveRates) {
        await MasterRateHistory.create({
          company: companyObjectId,
          action: 'DELETE',
          description: `Deleted entire active Master Rate file (${deletedActiveCount.toLocaleString()} origins removed)`,
          details: { totalCount: deletedActiveCount, deletedAll: true, deletedAt: new Date() },
          performedBy: userObjectId,
          performedByName: userName
        });
      }

      const [updatedHistory, updatedUploadHistory] = await Promise.all([
        MasterRateHistory.find({ company: companyObjectId }).sort({ createdAt: -1 }).limit(3).lean(),
        MasterRateHistory.find({ company: companyObjectId, action: 'UPLOAD' }).sort({ createdAt: -1 }).limit(3).lean()
      ]);

      return res.status(200).json({
        success: true,
        message: 'Master rate backup and history record deleted successfully',
        deletedActiveRates: shouldDeleteActiveRates,
        deletedActiveCount,
        history: updatedHistory,
        uploadHistory: updatedUploadHistory
      });
    } catch (error) {
      console.error('Error deleting master rate snapshot/history:', error);
      return res.status(500).json({ message: 'Failed to delete snapshot/history: ' + error.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).end(`Method ${method} Not Allowed`);
}

export default authMiddleware(handler);
