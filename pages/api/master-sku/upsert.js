import mongoose from 'mongoose';
import zlib from 'zlib';
import connectToDatabase from '../../../lib/mongodb';
import MasterSku from '../../../models/MasterSku';
import MasterSkuHistory from '../../../models/MasterSkuHistory';
import MasterSkuSnapshot from '../../../models/MasterSkuSnapshot';
import { authMiddleware } from '../common/common.services';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb'
    }
  }
};

async function handler(req, res) {
  const { method } = req;
  const user = req.userData;

  if (!user || !user.company) {
    return res.status(401).json({ message: 'Unauthorized or no company associated' });
  }

  const companyObjectId = new mongoose.Types.ObjectId(user.company);
  const userObjectId = user._id ? new mongoose.Types.ObjectId(user._id) : null;
  const userName = user.name || user.username || 'User';

  if (method === 'POST') {
    try {
      const { approvedItems, fileName } = req.body;

      if (!Array.isArray(approvedItems) || approvedItems.length === 0) {
        return res.status(400).json({ message: 'No approved items provided to save' });
      }

      await connectToDatabase();

      const now = new Date();
      let addCount = 0;
      let editCount = 0;

      // Group into bulkWrite operations
      const bulkOps = [];
      for (const item of approvedItems) {
        const rawSku = item.sku != null ? String(item.sku).trim() : '';
        if (!rawSku) continue;

        if (item.type === 'add') addCount++;
        else if (item.type === 'edit') editCount++;
        else addCount++;

        const originVal = item.newOrigin !== undefined ? item.newOrigin : (item.origin != null ? String(item.origin).trim() : '');
        const sizeVal = item.newSize !== undefined ? item.newSize : (item.size != null ? String(item.size).trim() : '');

        bulkOps.push({
          updateOne: {
            filter: {
              company: companyObjectId,
              sku: rawSku
            },
            update: {
              $set: {
                origin: originVal,
                size: sizeVal,
                lastModifiedBy: userObjectId,
                lastModifiedByName: userName,
                updatedAt: now
              },
              $setOnInsert: {
                company: companyObjectId,
                sku: rawSku,
                createdAt: now
              }
            },
            upsert: true
          }
        });
      }

      if (bulkOps.length > 0) {
        // Execute bulkWrite in batches of 2000 if large
        const BATCH_SIZE = 2000;
        for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
          const slice = bulkOps.slice(i, i + BATCH_SIZE);
          await MasterSku.bulkWrite(slice, { ordered: false });
        }
      }

      // Record in History
      const historyEntry = await MasterSkuHistory.create({
        company: companyObjectId,
        action: 'UPLOAD',
        sku: '',
        description: `Selective file import from "${fileName || 'uploaded file'}": ${addCount} SKUs added, ${editCount} SKUs updated (Total ${approvedItems.length} applied)`,
        details: {
          fileName: fileName || '',
          added: addCount,
          updated: editCount,
          totalApplied: approvedItems.length
        },
        performedBy: userObjectId,
        performedByName: userName
      });

      // Update compressed snapshot asynchronously for backup / rollback
      try {
        const allSkus = await MasterSku.find({ company: companyObjectId }, 'sku origin size -_id').lean();
        const compressedBuffer = await new Promise((resolve, reject) => {
          zlib.gzip(Buffer.from(JSON.stringify(allSkus)), (err, buf) => {
            if (err) reject(err);
            else resolve(buf);
          });
        });

        const snapDoc = await MasterSkuSnapshot.create({
          company: companyObjectId,
          historyId: historyEntry._id,
          fileName: fileName || 'selective_import.xlsx',
          totalCount: allSkus.length,
          compressedData: compressedBuffer,
          performedBy: userObjectId,
          performedByName: userName
        });

        await MasterSkuHistory.updateOne(
          { _id: historyEntry._id },
          { 'details.snapshotId': snapDoc._id }
        );

        // Retain only last 3 snapshots
        const oldSnapshots = await MasterSkuSnapshot.find({ company: companyObjectId })
          .sort({ createdAt: -1 })
          .skip(3)
          .select('_id')
          .lean();
        if (oldSnapshots.length > 0) {
          await MasterSkuSnapshot.deleteMany({ _id: { $in: oldSnapshots.map(s => s._id) } });
        }
      } catch (snapErr) {
        console.warn('Snapshot creation non-fatal warning:', snapErr);
      }

      // Fetch fresh history to return
      const updatedHistory = await MasterSkuHistory.find({ company: companyObjectId })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();

      return res.status(200).json({
        success: true,
        message: `Successfully applied ${approvedItems.length} SKUs (${addCount} added, ${editCount} updated). Existing records remain intact.`,
        stats: {
          added: addCount,
          updated: editCount,
          totalApplied: approvedItems.length
        },
        history: updatedHistory
      });
    } catch (err) {
      console.error('Master SKU upsert error:', err);
      return res.status(500).json({ message: 'Failed to save approved SKUs: ' + err.message });
    }
  }

  res.setHeader('Allow', ['POST']);
  return res.status(405).json({ message: `Method ${method} Not Allowed` });
}

export default authMiddleware(handler);
