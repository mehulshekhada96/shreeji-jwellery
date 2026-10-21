import zlib from 'zlib';
import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import MasterRate from '../../../models/MasterRate';
import MasterRateHistory from '../../../models/MasterRateHistory';
import MasterRateSnapshot from '../../../models/MasterRateSnapshot';
import { authMiddleware } from '../common/common.services';

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

async function handler(req, res) {
  const { method } = req;
  const user = req.userData;

  if (!user || !user.company) {
    return res.status(401).json({ message: 'Unauthorized or no company associated' });
  }

  const companyId = user.company;
  const companyObjectId = new mongoose.Types.ObjectId(companyId);
  const userObjectId = user._id ? new mongoose.Types.ObjectId(user._id) : null;
  await connectToDatabase();

  if (method === 'GET') {
    try {
      const { snapshotId, historyId } = req.query;

      let snapshot = null;
      if (snapshotId) {
        snapshot = await MasterRateSnapshot.findOne({ _id: snapshotId, company: companyObjectId });
      } else if (historyId) {
        const history = await MasterRateHistory.findOne({ _id: historyId, company: companyObjectId });
        if (history?.details?.snapshotId) {
          snapshot = await MasterRateSnapshot.findOne({ _id: history.details.snapshotId, company: companyObjectId });
        }
      }

      if (!snapshot) {
        const activeItems = await MasterRate.find({ company: companyObjectId })
          .select('origin imageLink itemRate boxRate boxReturnRate size')
          .lean();

        if (activeItems.length === 0) {
          return res.status(404).json({ message: 'No Master Rate snapshot found to download' });
        }

        return res.status(200).json({
          success: true,
          fileName: 'master_rate_backup.xlsx',
          totalCount: activeItems.length,
          items: activeItems
        });
      }

      const decompressedString = (await gunzipAsync(snapshot.compressedData)).toString('utf-8');
      const items = JSON.parse(decompressedString);

      return res.status(200).json({
        success: true,
        fileName: snapshot.fileName,
        totalCount: snapshot.totalCount,
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

      let snapshot = null;
      if (snapshotId) {
        snapshot = await MasterRateSnapshot.findOne({ _id: snapshotId, company: companyObjectId });
      } else if (historyId) {
        const history = await MasterRateHistory.findOne({ _id: historyId, company: companyObjectId });
        if (history?.details?.snapshotId) {
          snapshot = await MasterRateSnapshot.findOne({ _id: history.details.snapshotId, company: companyObjectId });
        }
      }

      if (!snapshot) {
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
        lastModifiedByName: user.name || user.username || 'User',
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
        performedByName: user.name || user.username || 'User'
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

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end(`Method ${method} Not Allowed`);
}

export default authMiddleware(handler);
