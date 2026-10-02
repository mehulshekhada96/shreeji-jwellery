import connectToDatabase from '../../../lib/mongodb';
import Invoice from '../../../models/Invoice';
import { USER_ROLES } from '../../../lib/constants';
import { authMiddleware } from '../common/common.services';

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  await connectToDatabase();

  try {
    const currentUser = req.userData;
    if (!currentUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Must be admin or administrator
    if (currentUser.role !== USER_ROLES.ADMIN && currentUser.role !== USER_ROLES.ADMINISTRATOR) {
      return res.status(403).json({ message: 'Only company admin or administrator can view invoices' });
    }

    if (!currentUser.company) {
      return res.status(400).json({ message: 'No company associated with this account' });
    }

    const invoices = await Invoice.find({
      company: currentUser.company,
      isDeleted: { $ne: true }
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ invoices });
  } catch (error) {
    console.error('Error fetching company invoices:', error);
    return res.status(500).json({ message: 'Error retrieving company invoices', error: String(error) });
  }
}

export default authMiddleware(handler);
