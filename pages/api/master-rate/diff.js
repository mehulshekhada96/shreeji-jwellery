import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import MasterRate from '../../../models/MasterRate';
import { authMiddleware } from '../common/common.services';
import { canWriteMasterRate } from '../../../lib/constants';

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

  if (!canWriteMasterRate(user)) {
    return res.status(403).json({ message: 'Permission denied: Write Master Rate permission required' });
  }

  const companyObjectId = new mongoose.Types.ObjectId(user.company);

  if (method === 'POST') {
    try {
      const { items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'No Rate items provided for diff analysis' });
      }

      await connectToDatabase();

      // Fetch all existing rates for this company
      const existingRates = await MasterRate.find(
        { company: companyObjectId },
        'origin itemRate boxRate boxReturnRate size imageLink'
      ).lean();

      // Index existing rates by lowercase origin
      const existingMap = new Map();
      for (const item of existingRates) {
        if (item.origin) {
          existingMap.set(String(item.origin).trim().toLowerCase(), item);
        }
      }

      const toAdd = [];
      const toEdit = [];
      const unchanged = [];
      const seenInFile = new Set();

      for (const item of items) {
        const rawOrigin = item.origin != null ? String(item.origin).trim() : '';
        if (!rawOrigin) continue;

        const lowerOrigin = rawOrigin.toLowerCase();
        if (seenInFile.has(lowerOrigin)) continue;
        seenInFile.add(lowerOrigin);

        const newItemRate = Number(item.itemRate) || 0;
        const newBoxRate = Number(item.boxRate) || 0;
        const newBoxReturnRate = Number(item.boxReturnRate) || 0;
        const newSize = item.size != null ? String(item.size).trim() : '';
        const newImageLink = item.imageLink != null ? String(item.imageLink).trim() : '';

        const existing = existingMap.get(lowerOrigin);

        if (!existing) {
          // New Origin to add
          toAdd.push({
            type: 'add',
            origin: rawOrigin,
            itemRate: newItemRate,
            boxRate: newBoxRate,
            boxReturnRate: newBoxReturnRate,
            size: newSize,
            imageLink: newImageLink
          });
        } else {
          const oldItemRate = Number(existing.itemRate) || 0;
          const oldBoxRate = Number(existing.boxRate) || 0;
          const oldBoxReturnRate = Number(existing.boxReturnRate) || 0;
          const oldSize = existing.size != null ? String(existing.size).trim() : '';
          const oldImageLink = existing.imageLink != null ? String(existing.imageLink).trim() : '';

          const itemRateChanged = Math.abs(oldItemRate - newItemRate) > 0.001;
          const boxRateChanged = Math.abs(oldBoxRate - newBoxRate) > 0.001;
          const boxReturnRateChanged = Math.abs(oldBoxReturnRate - newBoxReturnRate) > 0.001;
          const sizeChanged = oldSize.toLowerCase() !== newSize.toLowerCase();
          const imageChanged = oldImageLink !== newImageLink && newImageLink.length > 0;

          if (itemRateChanged || boxRateChanged || boxReturnRateChanged || sizeChanged || imageChanged) {
            toEdit.push({
              type: 'edit',
              origin: existing.origin || rawOrigin,
              oldValues: {
                itemRate: oldItemRate,
                boxRate: oldBoxRate,
                boxReturnRate: oldBoxReturnRate,
                size: oldSize,
                imageLink: oldImageLink
              },
              newValues: {
                itemRate: newItemRate,
                boxRate: newBoxRate,
                boxReturnRate: newBoxReturnRate,
                size: newSize,
                imageLink: newImageLink
              },
              changes: {
                itemRateChanged,
                boxRateChanged,
                boxReturnRateChanged,
                sizeChanged,
                imageChanged
              },
              itemRate: newItemRate,
              boxRate: newBoxRate,
              boxReturnRate: newBoxReturnRate,
              size: newSize,
              imageLink: newImageLink
            });
          } else {
            unchanged.push({
              type: 'unchanged',
              origin: existing.origin || rawOrigin,
              itemRate: oldItemRate,
              boxRate: oldBoxRate,
              boxReturnRate: oldBoxReturnRate,
              size: oldSize,
              imageLink: oldImageLink
            });
          }
        }
      }

      return res.status(200).json({
        success: true,
        summary: {
          totalInFile: seenInFile.size,
          addCount: toAdd.length,
          editCount: toEdit.length,
          unchangedCount: unchanged.length
        },
        toAdd,
        toEdit,
        unchanged: unchanged.slice(0, 500)
      });
    } catch (err) {
      console.error('Master Rate diff error:', err);
      return res.status(500).json({ message: 'Failed to analyze rate diff: ' + err.message });
    }
  }

  res.setHeader('Allow', ['POST']);
  return res.status(405).json({ message: `Method ${method} Not Allowed` });
}

export default authMiddleware(handler);
