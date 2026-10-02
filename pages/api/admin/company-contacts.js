import connectToDatabase from '../../../lib/mongodb';
import Company from '../../../models/company';
import User from '../../../models/users';
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
    if (!currentUser || currentUser.role !== USER_ROLES.ADMINISTRATOR) {
      return res.status(403).json({ message: 'Access denied. Administrator only.' });
    }

    const companies = await Company.find({ isDeleted: { $ne: true } })
      .select('companyName address featureFlags')
      .lean();

    // Fetch admin or first user for each company to get mobile & contact name
    const companyIds = companies.map(c => c._id);
    const users = await User.find({
      company: { $in: companyIds },
      isDeleted: { $ne: true }
    })
      .select('name mobileNumber role company')
      .lean();

    // Map company with primary contact
    const enrichedCompanies = companies.map(comp => {
      const compUsers = users.filter(u => String(u.company) === String(comp._id));
      const adminUser = compUsers.find(u => u.role === USER_ROLES.ADMIN) || compUsers[0];
      return {
        _id: comp._id,
        companyName: comp.companyName,
        address: comp.address || '',
        contactPerson: adminUser?.name || '',
        mobileNumber: adminUser?.mobileNumber || '',
        featureFlags: comp.featureFlags || {}
      };
    });

    return res.status(200).json({ companies: enrichedCompanies });
  } catch (error) {
    console.error('Error fetching company contacts:', error);
    return res.status(500).json({ message: 'Error fetching companies', error: String(error) });
  }
}

export default authMiddleware(handler);
