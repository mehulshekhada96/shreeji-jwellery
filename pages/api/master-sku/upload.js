import zlib from 'zlib';
import connectToDatabase from '../../../lib/mongodb';
import MasterSku from '../../../models/MasterSku';
import MasterSkuHistory from '../../../models/MasterSkuHistory';
import MasterSkuSnapshot from '../../../models/MasterSkuSnapshot';
import { authMiddleware } from '../common/common.services';

// Increase body limit to support large Excel/CSV uploads
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

  if (method === 'POST') {
    try {
      const { items, fileName } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'No SKU data provided in the request' });
      }

      // Deduplicate by lowercase SKU to avoid unique constraint issues
      const seen = new Map();
      for (const item of items) {
        const rawSku = item.sku != null ? String(item.sku).trim() : '';
        if (!rawSku) continue;
        const key = rawSku.toLowerCase();
        seen.set(key, {
          company: companyId,
          sku: rawSku,
          origin: item.origin != null ? String(item.origin).trim() : '',
          size: item.size != null ? String(item.size).trim() : '',
          lastModifiedBy: user._id,
          lastModifiedByName: user.name || user.username || 'User'
        });
      }

      const cleanItems = Array.from(seen.values());

      if (cleanItems.length === 0) {
        return res.status(400).json({ message: 'No valid SKUs found in the uploaded file' });
      }

      await connectToDatabase();

      // Clean sync: Replace all existing SKUs for this company
      const previousCount = await MasterSku.countDocuments({ company: companyId });
      await MasterSku.deleteMany({ company: companyId });

      // Bulk insert in chunks of 1000 for high performance
      const chunkSize = 1000;
      for (let i = 0; i < cleanItems.length; i += chunkSize) {
        const chunk = cleanItems.slice(i, i + chunkSize);
        await MasterSku.insertMany(chunk, { ordered: false });
      }

      // Save compressed snapshot of uploaded SKUs (up to last 3 retained per company)
      const snapshotItems = cleanItems.map(i => ({ sku: i.sku, origin: i.origin, size: i.size }));
      const compressedBuffer = zlib.gzipSync(Buffer.from(JSON.stringify(snapshotItems)));

      const snapshot = await MasterSkuSnapshot.create({
        company: companyId,
        fileName: fileName || 'master_file.xlsx',
        totalCount: cleanItems.length,
        compressedData: compressedBuffer,
        performedBy: user._id,
        performedByName: user.name || user.username || 'User'
      });

      // Keep only last 3 snapshots for this company
      const oldSnapshots = await MasterSkuSnapshot.find({ company: companyId })
        .sort({ createdAt: -1 })
        .skip(3)
        .select('_id')
        .lean();
      if (oldSnapshots.length > 0) {
        await MasterSkuSnapshot.deleteMany({ _id: { $in: oldSnapshots.map(s => s._id) } });
      }

      const fileLabel = fileName ? ` from "${fileName}"` : '';
      const replaceDesc = previousCount > 0 ? ` (replaced ${previousCount} previous SKUs)` : '';
      const description = `Uploaded Master File${fileLabel} with ${cleanItems.length} SKUs${replaceDesc}`;

      await MasterSkuHistory.create({
        company: companyId,
        action: 'UPLOAD',
        description,
        details: {
          totalCount: cleanItems.length,
          previousCount,
          fileName: fileName || 'master_file',
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
        message: `Successfully uploaded ${cleanItems.length} SKUs!`,
        count: cleanItems.length,
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
