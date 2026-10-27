import { USER_ROLES } from '../../lib/constants';
import connectToDatabase from '../../lib/mongodb';
import User from '../../models/users';
import SkuInventory from '../../models/SkuInventory';
import CancelledOrder from '../../models/CancelledOrder';
import CompanyMapping from '../../models/CompanyMapping';
import { getCompanyMappingInfo, resolveCompanyName } from '../../lib/companyMappingHelper';
import bcrypt from 'bcryptjs';
import { authMiddleware, isUserNameAvailable } from './common/common.services';

const handler = async (req, res) => {
  const { method } = req;

  await connectToDatabase();
  const currentUser = req.userData;
  const userId = currentUser?._id;
  const company = currentUser?.company;

  if (!currentUser || !company) {
    return res.status(401).json({ message: 'Unauthorized or no company associated' });
  }

  const isAdmin = [USER_ROLES.ADMIN, USER_ROLES.ADMINISTRATOR].includes(currentUser.role);

  if (method === 'POST') {
    // Only Admin can create users
    if (!isAdmin) {
      return res.status(403).json({ message: 'Forbidden: Admin access required to create users' });
    }

    const { name, mobileNumber, username, password, role, permissions, assignedCompanies, hasAllCompanyAccess } = req.body;

    try {
      const updates = {};

      if (name) {
        updates.name = name;
      }
      if (mobileNumber) {
        updates.mobileNumber = mobileNumber;
      }
      if (username) {
        const isUserNameAvailable1 = await isUserNameAvailable(username);
        if (!isUserNameAvailable1) {
          return res.status(400).json({ message: 'Username already exists' });
        }
        updates.username = username;
      }
      if (role) {
        updates.role = role;
      }
      if (permissions) {
        updates.permissions = permissions;
      }
      if (assignedCompanies !== undefined) {
        updates.assignedCompanies = Array.isArray(assignedCompanies)
          ? assignedCompanies.map(c => String(c).trim().toUpperCase()).filter(Boolean)
          : [];
      }
      updates.hasAllCompanyAccess = Boolean(hasAllCompanyAccess);
      if (password) {
        updates.password = await bcrypt.hash(password, 10);
      }
      updates.company = company;

      const updatedUser = await User.create(updates);
      const userObj = updatedUser.toObject();
      delete userObj.password;

      res.status(201).json({ message: 'User created successfully', data: userObj });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Error creating user', error: error.message });
    }
  } else if (method === 'PUT') {
    const { name, mobileNumber, username, password, oldPassword, role, permissions, assignedCompanies, hasAllCompanyAccess, _id } = req.body;

    if (!_id) {
      return res.status(400).json({ message: 'User id is required' });
    }

    try {
      // Verify the user belongs to the same company before updating
      const userToUpdate = await User.findById(_id);
      if (!userToUpdate || userToUpdate.company.toString() !== company.toString()) {
        return res.status(403).json({ message: 'Unauthorized: Cannot update user from another company' });
      }

      // Non-admins can ONLY update their own record and cannot alter privileged fields
      const isSelf = String(userId) === String(_id);
      if (!isAdmin && !isSelf) {
        return res.status(403).json({ message: 'Forbidden: Cannot update other users' });
      }

      const updates = {};

      // Profile fields (allowed for both Admin and self-service non-admins)
      if (name !== undefined) {
        updates.name = name;
      }
      if (mobileNumber !== undefined) {
        updates.mobileNumber = mobileNumber;
      }
      if (username && username !== userToUpdate.username) {
        const isUserNameAvailable1 = await isUserNameAvailable(username, _id);
        if (!isUserNameAvailable1) {
          return res.status(400).json({ message: 'Username already exists' });
        }
        updates.username = username;
      }

      // Password handling
      if (password) {
        if (!isAdmin) {
          // Self-service password change requires oldPassword verification
          if (!oldPassword) {
            return res.status(400).json({ message: 'Old password is required' });
          }
          const isPasswordMatch = await bcrypt.compare(oldPassword, userToUpdate.password);
          if (!isPasswordMatch) {
            return res.status(400).json({ message: 'Old password is incorrect' });
          }
        }
        updates.password = await bcrypt.hash(password, 10);
      }

      // Privileged fields (STRICTLY ADMIN ONLY)
      if (isAdmin) {
        if (role !== undefined) {
          updates.role = role;
        }
        if (permissions !== undefined) {
          updates.permissions = permissions;
        }
        if (assignedCompanies !== undefined) {
          updates.assignedCompanies = Array.isArray(assignedCompanies)
            ? assignedCompanies.map(c => String(c).trim().toUpperCase()).filter(Boolean)
            : [];
        }
        if (hasAllCompanyAccess !== undefined) {
          updates.hasAllCompanyAccess = Boolean(hasAllCompanyAccess);
        }
      }

      const updatedUser = await User.findByIdAndUpdate(_id, updates, { new: true }).lean();
      delete updatedUser.password;

      res.status(200).json({ message: 'User updated successfully', data: updatedUser });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ message: 'Error updating user', error: error.message });
    }
  } else if (method === 'GET') {
    if (!isAdmin) {
      return res.status(403).json({ message: 'Forbidden: Admin access required to view users' });
    }

    try {
      const users = await User.find(
        {
          role: { $nin: [USER_ROLES.ADMIN, USER_ROLES.ADMINISTRATOR] },
          isDeleted: { $ne: true },
          company: company,
        },
        { password: 0 }
      ).lean();

      // Also fetch the tenant's active canonical company accounts for assigning to managers
      let companyAccounts = [];
      try {
        const { aliasMap, ignoredSet } = await getCompanyMappingInfo(company);
        const [invNames, canNames, mapNames] = await Promise.all([
          SkuInventory.find({ company }).distinct('companyName'),
          CancelledOrder.find({ company }).distinct('companyName'),
          CompanyMapping.find({ company, isIgnored: false, isDeleted: false }).distinct('canonicalName'),
        ]);

        const rawSet = new Set(
          [...invNames, ...canNames, ...mapNames].map(c => (c || '').trim().toUpperCase()).filter(Boolean)
        );
        const accountsSet = new Set();
        rawSet.forEach(r => {
          if (!ignoredSet.has(r)) {
            accountsSet.add(resolveCompanyName(r, aliasMap));
          }
        });
        companyAccounts = [...accountsSet].sort((a, b) => a.localeCompare(b));
      } catch (accErr) {
        console.error('Error fetching company accounts for user management:', accErr);
      }

      res.status(200).json({ message: 'Users fetched successfully', data: users, companyAccounts });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
  } else if (method === 'DELETE') {
    if (!isAdmin) {
      return res.status(403).json({ message: 'Forbidden: Admin access required to delete users' });
    }

    const { _id } = req.body;
    if (!_id) {
      return res.status(400).json({ message: 'User id is required' });
    }

    // Verify the user belongs to the same company before deleting
    const userToDelete = await User.findById(_id);
    if (!userToDelete || userToDelete.company.toString() !== company.toString()) {
      return res.status(403).json({ message: 'Unauthorized: Cannot delete user from another company' });
    }
    await User.findByIdAndUpdate(_id, { isDeleted: true });
    res.status(200).json({ message: 'User deleted successfully' });
  } else {
    res.setHeader('Allow', ['POST', 'PUT', 'GET', 'DELETE']);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
};

export default authMiddleware(handler);