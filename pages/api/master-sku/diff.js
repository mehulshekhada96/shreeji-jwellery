import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import MasterSku from '../../../models/MasterSku';
import { authMiddleware } from '../common/common.services';
import { canWriteMasterSku } from '../../../lib/constants';

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

  if (!canWriteMasterSku(user)) {
    return res.status(403).json({ message: 'Permission denied: Write Master SKU permission required' });
  }

  const companyObjectId = new mongoose.Types.ObjectId(user.company);

  if (method === 'POST') {
    try {
      const { items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'No SKU items provided for diff analysis' });
      }

      await connectToDatabase();

      // Fetch all existing SKUs for this company (projection for high performance)
      const existingSkus = await MasterSku.find(
        { company: companyObjectId },
        'sku origin size'
      ).lean();

      // Index existing SKUs by lowercase sku
      const existingMap = new Map();
      for (const item of existingSkus) {
        if (item.sku) {
          existingMap.set(String(item.sku).trim().toLowerCase(), item);
        }
      }

      const toAdd = [];
      const toEdit = [];
      const unchanged = [];
      const seenInFile = new Set();

      for (const item of items) {
        const rawSku = item.sku != null ? String(item.sku).trim() : '';
        if (!rawSku) continue;

        const lowerSku = rawSku.toLowerCase();
        if (seenInFile.has(lowerSku)) continue; // ignore duplicate rows inside the uploaded file
        seenInFile.add(lowerSku);

        const newOrigin = item.origin != null ? String(item.origin).trim() : '';
        const newSize = item.size != null ? String(item.size).trim() : '';

        const existing = existingMap.get(lowerSku);

        if (!existing) {
          // New SKU to add
          toAdd.push({
            type: 'add',
            sku: rawSku,
            origin: newOrigin,
            size: newSize
          });
        } else {
          const oldOrigin = existing.origin != null ? String(existing.origin).trim() : '';
          const oldSize = existing.size != null ? String(existing.size).trim() : '';

          const originChanged = oldOrigin !== newOrigin;
          const sizeChanged = oldSize.toLowerCase() !== newSize.toLowerCase();

          if (originChanged || sizeChanged) {
            toEdit.push({
              type: 'edit',
              sku: existing.sku || rawSku,
              oldOrigin,
              newOrigin,
              originChanged,
              oldSize,
              newSize,
              sizeChanged,
              origin: newOrigin,
              size: newSize
            });
          } else {
            unchanged.push({
              type: 'unchanged',
              sku: existing.sku || rawSku,
              origin: oldOrigin,
              size: oldSize
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
      console.error('Master SKU diff error:', err);
      return res.status(500).json({ message: 'Failed to analyze SKU diff: ' + err.message });
    }
  }

  res.setHeader('Allow', ['POST']);
  return res.status(405).json({ message: `Method ${method} Not Allowed` });
}

export default authMiddleware(handler);
