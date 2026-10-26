import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import Dabbi from '../../../models/Dabbi';
import MasterRate from '../../../models/MasterRate';
import Company from '../../../models/company';
import { authMiddleware } from '../common/common.services';

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

async function handler(req, res) {
  const { method } = req;
  const user = req.userData;

  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  await connectToDatabase();

  let companyId = user.company;
  const requestedCompany = req.query.company || req.body?.company;
  if (requestedCompany) {
    if (mongoose.Types.ObjectId.isValid(requestedCompany)) {
      companyId = requestedCompany;
    } else {
      try {
        const foundCompany = await Company.findOne({
          companyName: requestedCompany,
          isDeleted: { $ne: true }
        }).lean();
        if (foundCompany?._id) {
          companyId = foundCompany._id;
        }
      } catch (e) {
        console.error('Error finding company by name:', e);
      }
    }
  }

  if (!companyId) {
    return res.status(401).json({ message: 'No company associated' });
  }

  // ---------------------------------------------------------------------------
  // GET: Fetch all active Dabbis for company
  // ---------------------------------------------------------------------------
  if (method === 'GET') {
    try {
      const { search, includeInactive } = req.query;
      const filter = { company: companyId };

      if (includeInactive !== 'true') {
        filter.isActive = { $ne: false };
      }

      if (search && search.trim()) {
        const queryRegex = new RegExp(escapeRegex(search.trim()), 'i');
        filter.$or = [
          { name: queryRegex },
          { size: queryRegex }
        ];
      }

      const dabbis = await Dabbi.find(filter)
        .sort({ name: 1 })
        .lean();

      // Count linked MasterRate origins for each Dabbi
      const dabbiCounts = await Promise.all(
        dabbis.map(async (d) => {
          const count = await MasterRate.countDocuments({
            company: companyId,
            $or: [
              { dabbi: d._id },
              { dabbiName: d.name }
            ]
          });
          return {
            ...d,
            linkedOriginsCount: count
          };
        })
      );

      return res.status(200).json({
        success: true,
        count: dabbiCounts.length,
        dabbis: dabbiCounts
      });
    } catch (err) {
      console.error('Error fetching dabbis:', err);
      return res.status(500).json({ message: 'Internal server error while fetching dabbis', error: err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // POST: Create new Dabbi
  // ---------------------------------------------------------------------------
  if (method === 'POST') {
    try {
      const { name, imageUrl = '', boxRate = 0, boxReturnRate = 0, size = '' } = req.body;

      const trimmedName = (name || '').trim();
      if (!trimmedName) {
        return res.status(400).json({ message: 'Dabbi name is required' });
      }

      // Check unique name per company (case-insensitive)
      const existing = await Dabbi.findOne({
        company: companyId,
        name: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i'),
        isActive: { $ne: false }
      });

      if (existing) {
        return res.status(400).json({ message: `Dabbi with name "${trimmedName}" already exists` });
      }

      const numBoxRate = Math.max(0, Number(boxRate) || 0);
      const numBoxReturnRate = Math.max(0, Number(boxReturnRate) || 0);

      const newDabbi = new Dabbi({
        company: companyId,
        name: trimmedName,
        imageUrl: (imageUrl || '').trim(),
        boxRate: numBoxRate,
        boxReturnRate: numBoxReturnRate,
        size: (size || '').trim(),
        isActive: true,
        createdBy: user._id,
        createdByName: user.name || user.username || 'User',
        rateHistory: [
          {
            effectiveFrom: new Date('2020-01-01'),
            effectiveTo: null,
            boxRate: numBoxRate,
            boxReturnRate: numBoxReturnRate,
            changedAt: new Date(),
            changedByName: user.name || user.username || 'User',
            note: 'Initial Dabbi Creation'
          }
        ]
      });

      await newDabbi.save();

      return res.status(201).json({
        success: true,
        message: `Dabbi "${trimmedName}" created successfully`,
        dabbi: newDabbi
      });
    } catch (err) {
      console.error('Error creating dabbi:', err);
      return res.status(500).json({ message: 'Internal server error while creating dabbi', error: err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // PUT: Update existing Dabbi
  // ---------------------------------------------------------------------------
  if (method === 'PUT') {
    try {
      const {
        id,
        name,
        imageUrl,
        boxRate,
        boxReturnRate,
        size,
        isCorrection = false,
        effectiveFromDate,
        note,
        updateLinkedOrigins = false
      } = req.body;

      if (!id) {
        return res.status(400).json({ message: 'Dabbi ID is required' });
      }

      const dabbi = await Dabbi.findOne({ _id: id, company: companyId });
      if (!dabbi) {
        return res.status(404).json({ message: 'Dabbi not found' });
      }

      if (name !== undefined) {
        const trimmedName = (name || '').trim();
        if (!trimmedName) {
          return res.status(400).json({ message: 'Dabbi name cannot be empty' });
        }
        if (trimmedName.toLowerCase() !== dabbi.name.toLowerCase()) {
          const duplicate = await Dabbi.findOne({
            company: companyId,
            name: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i'),
            _id: { $ne: id },
            isActive: { $ne: false }
          });
          if (duplicate) {
            return res.status(400).json({ message: `Dabbi with name "${trimmedName}" already exists` });
          }
        }
        dabbi.name = trimmedName;
      }

      if (imageUrl !== undefined) dabbi.imageUrl = (imageUrl || '').trim();
      if (size !== undefined) dabbi.size = (size || '').trim();

      const oldBoxRate = Number(dabbi.boxRate) || 0;
      const oldBoxReturnRate = Number(dabbi.boxReturnRate) || 0;
      const newBoxRate = boxRate !== undefined ? Math.max(0, Number(boxRate) || 0) : oldBoxRate;
      const newBoxReturnRate = boxReturnRate !== undefined ? Math.max(0, Number(boxReturnRate) || 0) : oldBoxReturnRate;

      const ratesChanged = (newBoxRate !== oldBoxRate) || (newBoxReturnRate !== oldBoxReturnRate);

      if (ratesChanged) {
        if (!Array.isArray(dabbi.rateHistory)) {
          dabbi.rateHistory = [];
        }

        if (isCorrection) {
          if (dabbi.rateHistory.length > 0) {
            const activeEntry = dabbi.rateHistory.find(h => !h.effectiveTo) || dabbi.rateHistory[dabbi.rateHistory.length - 1];
            activeEntry.boxRate = newBoxRate;
            activeEntry.boxReturnRate = newBoxReturnRate;
            activeEntry.changedAt = new Date();
            activeEntry.changedByName = user.name || user.username || 'User';
            if (note) activeEntry.note = note;
          } else {
            dabbi.rateHistory.push({
              effectiveFrom: dabbi.createdAt || new Date('2020-01-01'),
              effectiveTo: null,
              boxRate: newBoxRate,
              boxReturnRate: newBoxReturnRate,
              changedAt: new Date(),
              changedByName: user.name || user.username || 'User',
              note: note || 'Dabbi rate correction'
            });
          }
        } else {
          // Date-effective revision: preserve past rate for prior dates
          const effectiveDate = effectiveFromDate ? new Date(effectiveFromDate) : new Date();
          effectiveDate.setHours(0, 0, 0, 0);

          const dayBefore = new Date(effectiveDate);
          dayBefore.setDate(dayBefore.getDate() - 1);
          dayBefore.setHours(23, 59, 59, 999);

          if (dabbi.rateHistory.length === 0) {
            dabbi.rateHistory.push({
              effectiveFrom: dabbi.createdAt || new Date('2020-01-01'),
              effectiveTo: dayBefore,
              boxRate: oldBoxRate,
              boxReturnRate: oldBoxReturnRate,
              changedAt: dabbi.createdAt || new Date(),
              changedByName: dabbi.lastModifiedByName || 'System',
              note: 'Prior rate before date-effective revision'
            });
          } else {
            for (const entry of dabbi.rateHistory) {
              if (!entry.effectiveTo || new Date(entry.effectiveTo) >= effectiveDate) {
                entry.effectiveTo = dayBefore;
              }
            }
          }

          dabbi.rateHistory.push({
            effectiveFrom: effectiveDate,
            effectiveTo: null,
            boxRate: newBoxRate,
            boxReturnRate: newBoxReturnRate,
            changedAt: new Date(),
            changedByName: user.name || user.username || 'User',
            note: note || `Dabbi rate revision effective from ${effectiveDate.toISOString().split('T')[0]}`
          });
        }

        dabbi.boxRate = newBoxRate;
        dabbi.boxReturnRate = newBoxReturnRate;

        // Optionally propagate to linked MasterRate origins
        if (updateLinkedOrigins) {
          const linkedRates = await MasterRate.find({
            company: companyId,
            $or: [{ dabbi: dabbi._id }, { dabbiName: dabbi.name }]
          });

          const effectiveDate = effectiveFromDate ? new Date(effectiveFromDate) : new Date();
          effectiveDate.setHours(0, 0, 0, 0);
          const dayBefore = new Date(effectiveDate);
          dayBefore.setDate(dayBefore.getDate() - 1);
          dayBefore.setHours(23, 59, 59, 999);

          for (const mr of linkedRates) {
            mr.boxRate = newBoxRate;
            mr.boxReturnRate = newBoxReturnRate;
            mr.dabbi = dabbi._id;
            mr.dabbiName = dabbi.name;

            if (!Array.isArray(mr.rateHistory)) mr.rateHistory = [];

            if (isCorrection) {
              if (mr.rateHistory.length > 0) {
                const act = mr.rateHistory.find(h => !h.effectiveTo) || mr.rateHistory[mr.rateHistory.length - 1];
                act.boxRate = newBoxRate;
                act.boxReturnRate = newBoxReturnRate;
              }
            } else {
              for (const entry of mr.rateHistory) {
                if (!entry.effectiveTo || new Date(entry.effectiveTo) >= effectiveDate) {
                  entry.effectiveTo = dayBefore;
                }
              }
              mr.rateHistory.push({
                effectiveFrom: effectiveDate,
                effectiveTo: null,
                itemRate: mr.itemRate,
                boxRate: newBoxRate,
                boxReturnRate: newBoxReturnRate,
                changedAt: new Date(),
                changedByName: user.name || user.username || 'User',
                note: `Updated from Dabbi "${dabbi.name}" rate revision`
              });
            }
            await mr.save();
          }
        }
      }

      dabbi.lastModifiedBy = user._id;
      dabbi.lastModifiedByName = user.name || user.username || 'User';

      await dabbi.save();

      return res.status(200).json({
        success: true,
        message: `Dabbi "${dabbi.name}" updated successfully`,
        dabbi
      });
    } catch (err) {
      console.error('Error updating dabbi:', err);
      return res.status(500).json({ message: 'Internal server error while updating dabbi', error: err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE: Soft delete Dabbi
  // ---------------------------------------------------------------------------
  if (method === 'DELETE') {
    try {
      const { id } = req.body || req.query;
      if (!id) {
        return res.status(400).json({ message: 'Dabbi ID is required' });
      }

      const dabbi = await Dabbi.findOne({ _id: id, company: companyId });
      if (!dabbi) {
        return res.status(404).json({ message: 'Dabbi not found' });
      }

      // Check if origins are linked
      const linkedCount = await MasterRate.countDocuments({
        company: companyId,
        $or: [{ dabbi: dabbi._id }, { dabbiName: dabbi.name }]
      });

      if (linkedCount > 0) {
        // Soft delete so historical links remain valid
        dabbi.isActive = false;
        await dabbi.save();
        return res.status(200).json({
          success: true,
          message: `Dabbi "${dabbi.name}" deactivated (${linkedCount} origins currently use it)`
        });
      }

      // If no origins linked, remove document
      await Dabbi.deleteOne({ _id: id, company: companyId });
      return res.status(200).json({
        success: true,
        message: `Dabbi "${dabbi.name}" deleted successfully`
      });
    } catch (err) {
      console.error('Error deleting dabbi:', err);
      return res.status(500).json({ message: 'Internal server error while deleting dabbi', error: err.message });
    }
  }

  return res.status(405).json({ message: `Method ${method} Not Allowed` });
}

export default authMiddleware(handler);
