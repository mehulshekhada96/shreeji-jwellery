import CancelledOrder from '../../models/CancelledOrder';
import CompanyEmailMapping from '../../models/CompanyEmailMapping';
import { authMiddleware } from './common/common.services';
import { getCompanyMappingInfo, buildCompanyQueryFilter } from '../../lib/companyMappingHelper';

async function handler(req, res) {
  const { method } = req;

  try {
    const user = req.userData;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (method === 'GET') {
      const { startDate, endDate, companyName, sku } = req.query;

      // Base query - filter by user's company
      const query = { 
        isDeleted: false,
        company: user.company // Filter by user's company
      };

      // Date filter - Aligning with SKU Inventory logic but supporting legacy selectedDate
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        const dateQuery = {};
        if (start) dateQuery.$gte = start;
        if (end) dateQuery.$lte = end;

        if (Object.keys(dateQuery).length > 0) {
            query.$or = [
                { startDate: dateQuery },
                { selectedDate: dateQuery }
            ];
        }
      }

      // Company name filter
      const { aliasMap } = await getCompanyMappingInfo(user.company);
      const companyFilter = buildCompanyQueryFilter({
        user,
        requestedCompanies: companyName ? [companyName] : [],
        aliasMap
      });
      if (companyFilter) {
        query.companyName = companyFilter;
      }

      // SKU filter
      if (sku) {
        query.sku = { $regex: sku, $options: 'i' };
      }

      const data = await CancelledOrder.find(query)
        .sort({ startDate: -1, selectedDate: -1, companyName: 1, sku: 1 })
        .lean();

      // Aggregate data by company and SKU
      const aggregated = {};
      data.forEach(item => {
        const trimmedCompanyName = (item.companyName || '').trim();
        if (!trimmedCompanyName) return;

        if (!aggregated[trimmedCompanyName]) {
          aggregated[trimmedCompanyName] = {};
        }
        if (!aggregated[trimmedCompanyName][item.sku]) {
          aggregated[trimmedCompanyName][item.sku] = 0;
        }
        aggregated[trimmedCompanyName][item.sku] += item.quantity;
      });

      return res.status(200).json({
        success: true,
        data: aggregated,
        rawData: data
      });
    }

    if (method === 'POST') {
      const { orders, startDate } = req.body;

      if (!orders || !Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({ message: 'Orders array is required' });
      }

      if (!startDate) {
        return res.status(400).json({ message: 'Date is required' });
      }

      // Use new Date(startDate) directly to match SKU Inventory behavior
      const dateObj = new Date(startDate);
      
      // Validate date is not in the future
      const today = new Date();
      today.setHours(23, 59, 59, 999); // Allow anytime today
      
      if (dateObj > today) {
        return res.status(400).json({ message: 'Cannot upload data for future dates' });
      }

      // Create records with startDate = endDate = selectedDate
      const ordersToInsert = orders.map(order => ({
        companyName: order.companyName.trim(),
        sku: order.sku.trim(),
        quantity: Number(order.quantity) || 0,
        email: order.email?.trim().toLowerCase() || '',
        startDate: dateObj,
        endDate: dateObj, // Single date
        selectedDate: dateObj, // Save selectedDate as well for consistency
        company: user.company, // Add company reference
        uploadedDate: new Date(),
        uploadedBy: user._id,
        uploadedByName: user.name || user.username,
      }));

      const result = await CancelledOrder.insertMany(ordersToInsert, { ordered: false });

      return res.status(201).json({ 
        success: true, 
        message: `Successfully uploaded ${result.length} cancelled orders for ${startDate}`,
        count: result.length
      });
    }

    if (method === 'DELETE') {
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({ message: 'Date is required' });
      }

      // Aligning with SKU Inventory DELETE logic
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Soft delete records for this date (check both startDate and selectedDate) and company
      const result = await CancelledOrder.updateMany(
        {
          $or: [
            { startDate: { $gte: startOfDay, $lte: endOfDay } },
            { selectedDate: { $gte: startOfDay, $lte: endOfDay } }
          ],
          company: user.company, // Only delete records for user's company
          isDeleted: false
        },
        { isDeleted: true }
      );

      return res.status(200).json({ 
        success: true, 
        message: `Deleted ${result.modifiedCount} cancelled orders for ${date}`,
        count: result.modifiedCount
      });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (error) {
    console.error('Cancelled orders error:', error);
    return res.status(500).json({ message: 'Error processing request', error: String(error) });
  }
}

export default authMiddleware(handler);

