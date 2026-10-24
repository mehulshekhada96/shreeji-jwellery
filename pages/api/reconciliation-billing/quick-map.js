import connectToDatabase from '../../../lib/mongodb';
import MasterSku from '../../../models/MasterSku';
import MasterSkuHistory from '../../../models/MasterSkuHistory';
import MasterRate from '../../../models/MasterRate';
import MasterRateHistory from '../../../models/MasterRateHistory';
import { authMiddleware } from '../common/common.services';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(455).json({ message: 'Method not allowed' });
  }

  const user = req.userData;
  if (!user || !user.company) {
    return res.status(401).json({ message: 'Unauthorized or no company associated' });
  }

  const companyId = user.company;

  try {
    await connectToDatabase();

    const {
      sku,
      origin,
      size = '',
      itemRate,
      boxRate,
      boxReturnRate,
      imageLink = '',
      effectiveFromDate,
      isCorrection = true, // Default to correction so rates apply to current billing period immediately
      note = ''
    } = req.body;

    if (!sku || !sku.trim()) {
      return res.status(400).json({ message: 'SKU is required' });
    }
    if (!origin || !origin.trim()) {
      return res.status(400).json({ message: 'Origin item name is required' });
    }

    const trimmedSku = sku.trim();
    const trimmedOrigin = origin.trim();
    const trimmedSize = (size || '').trim();
    const cleanImageLink = (imageLink || '').trim();

    // 1. Process MasterSku (map SKU -> Origin)
    const existingSku = await MasterSku.findOne({
      company: companyId,
      sku: { $regex: new RegExp(`^${trimmedSku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (existingSku) {
      const skuChanges = [];
      if ((existingSku.origin || '') !== trimmedOrigin) {
        skuChanges.push(`Origin changed from "${existingSku.origin || 'None'}" to "${trimmedOrigin}"`);
      }
      if (trimmedSize && (existingSku.size || '') !== trimmedSize) {
        skuChanges.push(`Size changed from "${existingSku.size || 'None'}" to "${trimmedSize}"`);
      }

      existingSku.origin = trimmedOrigin;
      if (trimmedSize) {
        existingSku.size = trimmedSize;
      }
      existingSku.lastModifiedBy = user._id;
      existingSku.lastModifiedByName = user.name || user.username || 'User';
      await existingSku.save();

      if (skuChanges.length > 0) {
        await MasterSkuHistory.create({
          company: companyId,
          action: 'EDIT',
          sku: trimmedSku,
          description: `Billing Quick Map - Updated SKU "${trimmedSku}": ${skuChanges.join(', ')}`,
          details: { sku: trimmedSku, origin: trimmedOrigin, size: existingSku.size },
          performedBy: user._id,
          performedByName: user.name || user.username || 'User'
        });
      }
    } else {
      await MasterSku.create({
        company: companyId,
        sku: trimmedSku,
        origin: trimmedOrigin,
        size: trimmedSize,
        lastModifiedBy: user._id,
        lastModifiedByName: user.name || user.username || 'User'
      });

      await MasterSkuHistory.create({
        company: companyId,
        action: 'ADD',
        sku: trimmedSku,
        description: `Billing Quick Map - Mapped SKU "${trimmedSku}" to Origin "${trimmedOrigin}"`,
        details: { sku: trimmedSku, origin: trimmedOrigin, size: trimmedSize },
        performedBy: user._id,
        performedByName: user.name || user.username || 'User'
      });
    }

    // 2. Process MasterRate (Origin -> Rates & Rate History)
    const existingRate = await MasterRate.findOne({
      company: companyId,
      origin: { $regex: new RegExp(`^${trimmedOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    const numItemRate = itemRate !== undefined && itemRate !== '' ? Math.max(0, Number(itemRate) || 0) : null;
    const numBoxRate = boxRate !== undefined && boxRate !== '' ? Math.max(0, Number(boxRate) || 0) : null;
    const numBoxReturnRate = boxReturnRate !== undefined && boxReturnRate !== '' ? Math.max(0, Number(boxReturnRate) || 0) : null;

    if (!existingRate) {
      // Create new MasterRate
      const finalItemRate = numItemRate !== null ? numItemRate : 0;
      const finalBoxRate = numBoxRate !== null ? numBoxRate : 0;
      const finalBoxReturnRate = numBoxReturnRate !== null ? numBoxReturnRate : 0;

      const effectiveDate = effectiveFromDate ? new Date(effectiveFromDate) : new Date('2020-01-01');
      effectiveDate.setHours(0, 0, 0, 0);

      const newRate = await MasterRate.create({
        company: companyId,
        origin: trimmedOrigin,
        itemRate: finalItemRate,
        boxRate: finalBoxRate,
        boxReturnRate: finalBoxReturnRate,
        size: trimmedSize,
        imageLink: cleanImageLink,
        rateHistory: [
          {
            effectiveFrom: effectiveDate,
            effectiveTo: null,
            itemRate: finalItemRate,
            boxRate: finalBoxRate,
            boxReturnRate: finalBoxReturnRate,
            changedAt: new Date(),
            changedByName: user.name || user.username || 'User',
            note: note || 'Created from Billing quick-map'
          }
        ],
        lastModifiedBy: user._id,
        lastModifiedByName: user.name || user.username || 'User'
      });

      await MasterRateHistory.create({
        company: companyId,
        action: 'ADD',
        description: `Billing Quick Map - Created Origin "${trimmedOrigin}" (Rate: ₹${finalItemRate}, Dabbi: ₹${finalBoxRate}, Ret Dabbi: ₹${finalBoxReturnRate})`,
        details: {
          rateId: newRate._id,
          origin: trimmedOrigin,
          itemRate: finalItemRate,
          boxRate: finalBoxRate,
          boxReturnRate: finalBoxReturnRate,
          size: trimmedSize
        },
        performedBy: user._id,
        performedByName: user.name || user.username || 'User'
      });
    } else {
      // Existing rate found
      const targetItemRate = numItemRate !== null ? numItemRate : existingRate.itemRate;
      const targetBoxRate = numBoxRate !== null ? numBoxRate : existingRate.boxRate;
      const targetBoxReturnRate = numBoxReturnRate !== null ? numBoxReturnRate : existingRate.boxReturnRate;

      const ratesChanged =
        (targetItemRate !== existingRate.itemRate) ||
        (targetBoxRate !== existingRate.boxRate) ||
        (targetBoxReturnRate !== existingRate.boxReturnRate);

      if (trimmedSize && !existingRate.size) existingRate.size = trimmedSize;
      if (cleanImageLink && !existingRate.imageLink) existingRate.imageLink = cleanImageLink;

      if (ratesChanged) {
        if (!Array.isArray(existingRate.rateHistory)) {
          existingRate.rateHistory = [];
        }

        if (isCorrection) {
          // Correction mode: Updates active rates across the board without date splits
          if (existingRate.rateHistory.length > 0) {
            const activeEntry = existingRate.rateHistory.find(h => !h.effectiveTo) || existingRate.rateHistory[existingRate.rateHistory.length - 1];
            activeEntry.itemRate = targetItemRate;
            activeEntry.boxRate = targetBoxRate;
            activeEntry.boxReturnRate = targetBoxReturnRate;
            activeEntry.changedAt = new Date();
            activeEntry.changedByName = user.name || user.username || 'User';
            if (note) activeEntry.note = note;
          } else {
            existingRate.rateHistory.push({
              effectiveFrom: existingRate.createdAt || new Date('2020-01-01'),
              effectiveTo: null,
              itemRate: targetItemRate,
              boxRate: targetBoxRate,
              boxReturnRate: targetBoxReturnRate,
              changedAt: new Date(),
              changedByName: user.name || user.username || 'User',
              note: note || 'Rate correction from Billing'
            });
          }
        } else {
          // Date-effective mode
          const effectiveDate = effectiveFromDate ? new Date(effectiveFromDate) : new Date();
          effectiveDate.setHours(0, 0, 0, 0);

          if (existingRate.rateHistory.length === 0) {
            existingRate.rateHistory.push({
              effectiveFrom: existingRate.createdAt || new Date('2020-01-01'),
              effectiveTo: effectiveDate,
              itemRate: existingRate.itemRate,
              boxRate: existingRate.boxRate,
              boxReturnRate: existingRate.boxReturnRate,
              changedAt: new Date(),
              changedByName: user.name || user.username || 'User',
              note: 'Initial period closed'
            });
          } else {
            const activeEntry = existingRate.rateHistory.find(h => !h.effectiveTo);
            if (activeEntry) {
              activeEntry.effectiveTo = effectiveDate;
            }
          }

          existingRate.rateHistory.push({
            effectiveFrom: effectiveDate,
            effectiveTo: null,
            itemRate: targetItemRate,
            boxRate: targetBoxRate,
            boxReturnRate: targetBoxReturnRate,
            changedAt: new Date(),
            changedByName: user.name || user.username || 'User',
            note: note || 'Updated from Billing tab'
          });
        }

        existingRate.itemRate = targetItemRate;
        existingRate.boxRate = targetBoxRate;
        existingRate.boxReturnRate = targetBoxReturnRate;
        existingRate.lastModifiedBy = user._id;
        existingRate.lastModifiedByName = user.name || user.username || 'User';

        await existingRate.save();

        await MasterRateHistory.create({
          company: companyId,
          action: 'EDIT',
          description: `Billing Quick Map - Updated Master Rate "${trimmedOrigin}" (Rate: ₹${targetItemRate}, Dabbi: ₹${targetBoxRate}, Ret Dabbi: ₹${targetBoxReturnRate})`,
          details: {
            origin: trimmedOrigin,
            itemRate: targetItemRate,
            boxRate: targetBoxRate,
            boxReturnRate: targetBoxReturnRate
          },
          performedBy: user._id,
          performedByName: user.name || user.username || 'User'
        });
      } else {
        existingRate.lastModifiedBy = user._id;
        existingRate.lastModifiedByName = user.name || user.username || 'User';
        await existingRate.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: `Successfully configured mapping & rates for SKU "${trimmedSku}"`,
      sku: trimmedSku,
      origin: trimmedOrigin
    });
  } catch (error) {
    console.error('Error in reconciliation-billing quick-map:', error);
    return res.status(500).json({ message: 'Failed to map SKU and update rates', error: error.message });
  }
}

export default authMiddleware(handler);
