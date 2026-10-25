import mongoose from 'mongoose';
import zlib from 'zlib';
import connectToDatabase from '../../../lib/mongodb';
import MasterRate from '../../../models/MasterRate';
import MasterRateHistory from '../../../models/MasterRateHistory';
import MasterRateSnapshot from '../../../models/MasterRateSnapshot';
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
        return res.status(400).json({ message: 'No approved rate items provided to save' });
      }

      await connectToDatabase();

      const now = new Date();
      let addCount = 0;
      let editCount = 0;

      // Prefetch all existing origins for approved items in a single query
      const allApprovedOrigins = approvedItems
        .map(i => (i.origin != null ? String(i.origin).trim() : ''))
        .filter(Boolean);

      const existingRecords = await MasterRate.find(
        { company: companyObjectId, origin: { $in: allApprovedOrigins } }
      ).lean();

      const existingMap = new Map();
      for (const rec of existingRecords) {
        if (rec.origin) {
          existingMap.set(rec.origin.toLowerCase(), rec);
        }
      }

      // Group into bulk operations
      const bulkOps = [];
      for (const item of approvedItems) {
        const rawOrigin = item.origin != null ? String(item.origin).trim() : '';
        if (!rawOrigin) continue;

        const newItemRate = Number(item.itemRate) || 0;
        const newBoxRate = Number(item.boxRate) || 0;
        const newBoxReturnRate = Number(item.boxReturnRate) || 0;
        const newSize = item.size != null ? String(item.size).trim() : '';
        const newImageLink = item.imageLink != null ? String(item.imageLink).trim() : '';

        const existing = existingMap.get(rawOrigin.toLowerCase());

        if (existing) {
          editCount++;
          const ratesChanged =
            existing.itemRate !== newItemRate ||
            existing.boxRate !== newBoxRate ||
            existing.boxReturnRate !== newBoxReturnRate;

          const setFields = {
            itemRate: newItemRate,
            boxRate: newBoxRate,
            boxReturnRate: newBoxReturnRate,
            size: newSize,
            lastModifiedBy: userObjectId,
            lastModifiedByName: userName,
            updatedAt: now
          };
          if (newImageLink) setFields.imageLink = newImageLink;
          if (item.dabbi) setFields.dabbi = item.dabbi;
          if (item.dabbiName) setFields.dabbiName = item.dabbiName;

          const updateDoc = { $set: setFields };

          if (ratesChanged) {
            updateDoc.$push = {
              rateHistory: {
                effectiveFrom: now,
                effectiveTo: null,
                itemRate: newItemRate,
                boxRate: newBoxRate,
                boxReturnRate: newBoxReturnRate,
                changedAt: now,
                changedByName: userName,
                note: `Rate updated from selective file upload (${fileName || 'file'})`
              }
            };
          }

          bulkOps.push({
            updateOne: {
              filter: { _id: existing._id },
              update: updateDoc
            }
          });
        } else {
          addCount++;
          const setFields = {
            itemRate: newItemRate,
            boxRate: newBoxRate,
            boxReturnRate: newBoxReturnRate,
            size: newSize,
            lastModifiedBy: userObjectId,
            lastModifiedByName: userName,
            updatedAt: now
          };
          if (newImageLink) setFields.imageLink = newImageLink;
          if (item.dabbi) setFields.dabbi = item.dabbi;
          if (item.dabbiName) setFields.dabbiName = item.dabbiName;

          bulkOps.push({
            updateOne: {
              filter: { company: companyObjectId, origin: rawOrigin },
              update: {
                $set: setFields,
                $setOnInsert: {
                  company: companyObjectId,
                  origin: rawOrigin,
                  createdAt: now,
                  rateHistory: [
                    {
                      effectiveFrom: now,
                      effectiveTo: null,
                      itemRate: newItemRate,
                      boxRate: newBoxRate,
                      boxReturnRate: newBoxReturnRate,
                      changedAt: now,
                      changedByName: userName,
                      note: `Initial rate from selective file upload (${fileName || 'file'})`
                    }
                  ]
                }
              },
              upsert: true
            }
          });
        }
      }

      if (bulkOps.length > 0) {
        const BATCH_SIZE = 1000;
        for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
          const slice = bulkOps.slice(i, i + BATCH_SIZE);
          await MasterRate.bulkWrite(slice, { ordered: false });
        }
      }

      // Record in MasterRateHistory
      const historyDoc = await MasterRateHistory.create({
        company: companyObjectId,
        action: 'UPLOAD',
        description: `Selective rate import from "${fileName || 'uploaded file'}": ${addCount} origins added, ${editCount} origins updated (Total ${approvedItems.length} applied)`,
        details: {
          fileName: fileName || '',
          added: addCount,
          updated: editCount,
          totalApplied: approvedItems.length
        },
        performedBy: userObjectId,
        performedByName: userName
      });

      // Update snapshot for backup
      try {
        const allRates = await MasterRate.find({ company: companyObjectId }, 'origin itemRate boxRate boxReturnRate size imageLink -_id').lean();
        const compressedBuffer = await new Promise((resolve, reject) => {
          zlib.gzip(Buffer.from(JSON.stringify(allRates)), (err, buf) => {
            if (err) reject(err);
            else resolve(buf);
          });
        });

        const snapDoc = await MasterRateSnapshot.create({
          company: companyObjectId,
          historyId: historyDoc._id,
          fileName: fileName || 'selective_rates.xlsx',
          totalCount: allRates.length,
          compressedData: compressedBuffer,
          performedBy: userObjectId,
          performedByName: userName
        });

        await MasterRateHistory.updateOne(
          { _id: historyDoc._id },
          { 'details.snapshotId': snapDoc._id }
        );

        const oldSnapshots = await MasterRateSnapshot.find({ company: companyObjectId })
          .sort({ createdAt: -1 })
          .skip(3)
          .select('_id')
          .lean();
        if (oldSnapshots.length > 0) {
          await MasterRateSnapshot.deleteMany({ _id: { $in: oldSnapshots.map(s => s._id) } });
        }
      } catch (snapErr) {
        console.warn('Rate snapshot non-fatal warning:', snapErr);
      }

      const updatedHistory = await MasterRateHistory.find({ company: companyObjectId })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();

      return res.status(200).json({
        success: true,
        message: `Successfully applied ${approvedItems.length} rates (${addCount} added, ${editCount} updated). Existing records remain intact.`,
        stats: {
          added: addCount,
          updated: editCount,
          totalApplied: approvedItems.length
        },
        history: updatedHistory
      });
    } catch (err) {
      console.error('Master Rate upsert error:', err);
      return res.status(500).json({ message: 'Failed to save approved rates: ' + err.message });
    }
  }

  res.setHeader('Allow', ['POST']);
  return res.status(405).json({ message: `Method ${method} Not Allowed` });
}

export default authMiddleware(handler);
