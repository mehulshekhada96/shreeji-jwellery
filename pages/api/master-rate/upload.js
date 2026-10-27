import zlib from 'zlib';
import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import MasterRate from '../../../models/MasterRate';
import MasterRateHistory from '../../../models/MasterRateHistory';
import MasterRateSnapshot from '../../../models/MasterRateSnapshot';
import { authMiddleware } from '../common/common.services';
import { canWriteMasterRate } from '../../../lib/constants';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

async function handler(req, res) {
  const { method } = req;
  const user = req.userData;

  if (!user || !user.company) {
    return res.status(401).json({ message: 'Unauthorized or no company associated' });
  }

  if (!canWriteMasterRate(user)) {
    return res.status(403).json({ message: 'Permission denied: Write Master Rate permission required' });
  }

  const companyId = user.company;
  const companyObjectId = new mongoose.Types.ObjectId(companyId);
  const userObjectId = user._id ? new mongoose.Types.ObjectId(user._id) : null;

  if (method === 'POST') {
    try {
      const {
        items,
        fileName,
        chunkIndex = 0,
        totalChunks = 1,
        previousCount: passedPrevCount
      } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'No Rate data provided in this chunk' });
      }

      await connectToDatabase();

      const seen = new Map();
      const now = new Date();
      for (const item of items) {
        const rawOrigin = item.origin != null ? String(item.origin).trim() : '';
        if (!rawOrigin) continue;
        const key = rawOrigin.toLowerCase();
        seen.set(key, {
          company: companyObjectId,
          origin: rawOrigin,
          imageLink: item.imageLink != null ? String(item.imageLink).trim() : '',
          itemRate: Number(item.itemRate) || 0,
          boxRate: Number(item.boxRate) || 0,
          boxReturnRate: Number(item.boxReturnRate) || 0,
          size: item.size != null ? String(item.size).trim() : '',
          lastModifiedBy: userObjectId,
          lastModifiedByName: user.name || user.username || 'User',
          createdAt: now,
          updatedAt: now
        });
      }

      const docsToInsert = Array.from(seen.values());

      let recordedPrevCount = typeof passedPrevCount === 'number' ? passedPrevCount : 0;

      // On first chunk: clean sync
      if (chunkIndex === 0) {
        recordedPrevCount = await MasterRate.countDocuments({ company: companyObjectId });
        await MasterRate.deleteMany({ company: companyObjectId });
      }

      // Fast raw bulk insert
      if (docsToInsert.length > 0) {
        await MasterRate.collection.insertMany(docsToInsert, { ordered: false });
      }

      const isLastChunk = chunkIndex >= totalChunks - 1;

      if (!isLastChunk) {
        return res.status(200).json({
          success: true,
          chunkIndex,
          previousCount: recordedPrevCount,
          processed: docsToInsert.length
        });
      }

      // Last chunk: finalize snapshot and history
      const allRates = await MasterRate.find(
        { company: companyObjectId },
        'origin imageLink itemRate boxRate boxReturnRate size -_id'
      ).lean();

      const compressedBuffer = await new Promise((resolve, reject) => {
        zlib.gzip(Buffer.from(JSON.stringify(allRates)), (err, buf) => {
          if (err) reject(err);
          else resolve(buf);
        });
      });

      const snapshot = await MasterRateSnapshot.create({
        company: companyObjectId,
        fileName: fileName || 'master_rate_file.xlsx',
        totalCount: allRates.length,
        compressedData: compressedBuffer,
        performedBy: userObjectId,
        performedByName: user.name || user.username || 'User'
      });

      // Keep only last 3 snapshots
      const oldSnapshots = await MasterRateSnapshot.find({ company: companyObjectId })
        .sort({ createdAt: -1 })
        .skip(3)
        .select('_id')
        .lean();
      if (oldSnapshots.length > 0) {
        await MasterRateSnapshot.deleteMany({ _id: { $in: oldSnapshots.map(s => s._id) } });
      }

      const fileLabel = fileName ? ` from "${fileName}"` : '';
      const replaceDesc = recordedPrevCount > 0 ? ` (replaced ${recordedPrevCount} previous origins)` : '';
      const description = `Uploaded Master Rate File${fileLabel} with ${allRates.length} Origins & Rates${replaceDesc}`;

      const historyDoc = await MasterRateHistory.create({
        company: companyObjectId,
        action: 'UPLOAD',
        description,
        details: {
          totalCount: allRates.length,
          previousCount: recordedPrevCount,
          fileName: fileName || 'master_rate_file',
          snapshotId: snapshot._id
        },
        performedBy: userObjectId,
        performedByName: user.name || user.username || 'User'
      });

      await MasterRateSnapshot.updateOne({ _id: snapshot._id }, { historyId: historyDoc._id });

      const [updatedHistory, updatedUploadHistory] = await Promise.all([
        MasterRateHistory.find({ company: companyObjectId })
          .sort({ createdAt: -1 })
          .limit(3)
          .lean(),
        MasterRateHistory.find({ company: companyObjectId, action: 'UPLOAD' })
          .sort({ createdAt: -1 })
          .limit(3)
          .lean()
      ]);

      return res.status(200).json({
        success: true,
        message: `Successfully uploaded ${allRates.length} Master Rates!`,
        count: allRates.length,
        history: updatedHistory,
        uploadHistory: updatedUploadHistory
      });
    } catch (error) {
      console.error('Error uploading master rate file:', error);
      return res.status(500).json({ message: 'Failed to process master rate file upload', error: error.message });
    }
  }

  res.setHeader('Allow', ['POST']);
  return res.status(405).end(`Method ${method} Not Allowed`);
}

export default authMiddleware(handler);
