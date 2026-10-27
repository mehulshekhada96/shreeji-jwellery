import connectToDatabase from '../../../lib/mongodb';
import MasterSku from '../../../models/MasterSku';
import { canReadMasterSku, checkPermission, PERMISSIONS } from '../../../lib/constants';
import { authMiddleware } from '../common/common.services';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const user = req.userData;
  if (!user || !user.company) {
    return res.status(401).json({ message: 'Unauthorized or no company associated' });
  }

  // Authorized for users with Master SKU read permission or order sorting permission (EXTRACT_SKU)
  const isAuthorized = canReadMasterSku(user) || checkPermission(user, PERMISSIONS.EXTRACT_SKU);
  if (!isAuthorized) {
    return res.status(403).json({
      message: 'Permission denied: Master SKU read or Extract SKU permission required for lookup'
    });
  }

  try {
    await connectToDatabase();

    // Returns minimal fields needed for sorting and mapping labels
    const skus = await MasterSku.find({ company: user.company })
      .select('sku origin size')
      .lean();

    return res.status(200).json({
      success: true,
      count: skus.length,
      skus: skus.map(s => ({
        sku: s.sku,
        origin: s.origin,
        size: s.size || ''
      }))
    });
  } catch (error) {
    console.error('Error fetching SKU lookup data:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}

export default authMiddleware(handler);
