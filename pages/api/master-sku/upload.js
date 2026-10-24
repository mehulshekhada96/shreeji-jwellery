import zlib from 'zlib';
import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import MasterSku from '../../../models/MasterSku';
import MasterSkuHistory from '../../../models/MasterSkuHistory';
import MasterSkuSnapshot from '../../../models/MasterSkuSnapshot';
import { authMiddleware } from '../common/common.services';

// Increase body limit to support large chunks if needed
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
        return res.status(400).json({ message: 'No SKU data provided in this chunk' });
      }

      await connectToDatabase();

      // Deduplicate items in this chunk
      const seen = new Map();
      const now = new Date();
      for (const item of items) {
        const rawSku = item.sku != null ? String(item.sku).trim() : '';
        if (!rawSku) continue;
        const key = rawSku.toLowerCase();
        seen.set(key, {
          company: companyObjectId,
          sku: rawSku,
          origin: item.origin != null ? String(item.origin).trim() : '',
          size: item.size != null ? String(item.size).trim() : '',
          lastModifiedBy: userObjectId,
          lastModifiedByName: user.name || user.username || 'User',
          createdAt: now,
          updatedAt: now
        });
      }

      const docsToInsert = Array.from(seen.values());

      let recordedPrevCount = typeof passedPrevCount === 'number' ? passedPrevCount : 0;

      // On first chunk (chunkIndex === 0):
      // Clean sync: delete existing SKUs for this company
      if (chunkIndex === 0) {
        recordedPrevCount = await MasterSku.countDocuments({ company: companyObjectId });
        await MasterSku.deleteMany({ company: companyObjectId });
      }

      // Fast raw bulk insert using MongoDB driver collection directly (bypasses Mongoose document casting overhead)
      if (docsToInsert.length > 0) {
        await MasterSku.collection.insertMany(docsToInsert, { ordered: false });
      }

      const isLastChunk = chunkIndex >= totalChunks - 1;

      // If not the last chunk, acknowledge and return quickly so the next chunk can proceed without timeout
      if (!isLastChunk) {
        return res.status(200).json({
          success: true,
          chunkIndex,
          previousCount: recordedPrevCount,
          processed: docsToInsert.length
        });
      }

      // Last chunk: finalize snapshot and history
      // Query all clean SKUs currently in the database for this company
      const allSkus = await MasterSku.find({ company: companyObjectId }, 'sku origin size -_id').lean();

      // Compress snapshot asynchronously
      const compressedBuffer = await new Promise((resolve, reject) => {
        zlib.gzip(Buffer.from(JSON.stringify(allSkus)), (err, buf) => {
          if (err) reject(err);
          else resolve(buf);
        });
      });

      const snapshot = await MasterSkuSnapshot.create({
        company: companyObjectId,
        fileName: fileName || 'master_file.xlsx',
        totalCount: allSkus.length,
        compressedData: compressedBuffer,
        performedBy: userObjectId,
        performedByName: user.name || user.username || 'User'
      });

      // Retain only last 3 snapshots
      const oldSnapshots = await MasterSkuSnapshot.find({ company: companyObjectId })
        .sort({ createdAt: -1 })
        .skip(3)
        .select('_id')
        .lean();
      if (oldSnapshots.length > 0) {
        await MasterSkuSnapshot.deleteMany({ _id: { $in: oldSnapshots.map(s => s._id) } });
      }

      const fileLabel = fileName ? ` from "${fileName}"` : '';
      const replaceDesc = recordedPrevCount > 0 ? ` (replaced ${recordedPrevCount} previous SKUs)` : '';
      const description = `Uploaded Master File${fileLabel} with ${allSkus.length} SKUs${replaceDesc}`;

      const historyDoc = await MasterSkuHistory.create({
        company: companyObjectId,
        action: 'UPLOAD',
        description,
        details: {
          totalCount: allSkus.length,
          previousCount: recordedPrevCount,
          fileName: fileName || 'master_file',
          snapshotId: snapshot._id
        },
        performedBy: userObjectId,
        performedByName: user.name || user.username || 'User'
      });

      await MasterSkuSnapshot.updateOne({ _id: snapshot._id }, { historyId: historyDoc._id });

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
        message: `Successfully uploaded ${allSkus.length} SKUs!`,
        count: allSkus.length,
        history: updatedHistory,
        uploadHistory: updatedUploadHistory
      });
    } catch (error) {
      console.error('Error uploading master file:', error);
      return res.status(500).json({ message: 'Failed to process master file upload', error: error.message });
    }
  }

  res.setHeader('Allow', ['POST']);
  return res.status(405).end(`Method ${method} Not Allowed`);
}

export default authMiddleware(handler);
