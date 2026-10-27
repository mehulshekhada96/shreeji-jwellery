import CustomerReturnOrder from '../../models/CustomerReturnOrder';
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

      const query = {
        isDeleted: false,
        company: user.company
      };

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

      if (sku) {
        query.sku = { $regex: sku, $options: 'i' };
      }

      const data = await CustomerReturnOrder.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              startDate: "$startDate",
              companyName: "$companyName",
              sku: "$sku"
            },
            totalQuantity: { $sum: "$quantity" }
          }
        },
        {
          $sort: {
            "_id.startDate": -1,
            "_id.companyName": 1,
            "_id.sku": 1
          }
        }
      ]).allowDiskUse(true);

      const aggregated = {};
      const dateCompanyMap = {};

      data.forEach(item => {
        const trimmedCompanyName = (item._id.companyName || '').trim();
        const trimmedSku = (item._id.sku || '').trim();
        if (!trimmedCompanyName || !trimmedSku) return;

        if (!aggregated[trimmedCompanyName]) {
          aggregated[trimmedCompanyName] = {};
        }
        if (!aggregated[trimmedCompanyName][trimmedSku]) {
          aggregated[trimmedCompanyName][trimmedSku] = 0;
        }
        aggregated[trimmedCompanyName][trimmedSku] += item.totalQuantity;

        if (item._id.startDate) {
          const dateStr = item._id.startDate.toISOString();
          if (!dateCompanyMap[dateStr]) {
            dateCompanyMap[dateStr] = {};
          }
          if (!dateCompanyMap[dateStr][trimmedCompanyName]) {
            dateCompanyMap[dateStr][trimmedCompanyName] = 0;
          }
          dateCompanyMap[dateStr][trimmedCompanyName] += item.totalQuantity;
        }
      });

      const rawData = [];
      Object.keys(dateCompanyMap).forEach(dateStr => {
        Object.keys(dateCompanyMap[dateStr]).forEach(companyName => {
          rawData.push({
            startDate: dateStr,
            companyName: companyName,
            quantity: dateCompanyMap[dateStr][companyName]
          });
        });
      });

      return res.status(200).json({
        success: true,
        data: aggregated,
        rawData: rawData
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

      const dateObj = new Date(startDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (dateObj > today) {
        return res.status(400).json({ message: 'Cannot upload data for future dates' });
      }

      const ordersToInsert = orders.map(order => ({
        companyName: order.companyName.trim(),
        sku: order.sku.trim(),
        quantity: Number(order.quantity) || 0,
        email: order.email?.trim().toLowerCase() || '',
        startDate: dateObj,
        endDate: dateObj,
        selectedDate: dateObj,
        company: user.company,
        uploadedDate: new Date(),
        uploadedBy: user._id,
        uploadedByName: user.name || user.username,
      }));

      const result = await CustomerReturnOrder.insertMany(ordersToInsert, { ordered: false });

      return res.status(201).json({
        success: true,
        message: `Successfully uploaded ${result.length} customer returns for ${startDate}`,
        count: result.length
      });
    }

    if (method === 'DELETE') {
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({ message: 'Date is required' });
      }

      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const result = await CustomerReturnOrder.updateMany(
        {
          $or: [
            { startDate: { $gte: startOfDay, $lte: endOfDay } },
            { selectedDate: { $gte: startOfDay, $lte: endOfDay } }
          ],
          company: user.company,
          isDeleted: false
        },
        { isDeleted: true }
      );

      return res.status(200).json({
        success: true,
        message: `Deleted ${result.modifiedCount} customer returns for ${date}`,
        count: result.modifiedCount
      });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  } catch (error) {
    console.error('Customer returns error:', error);
    return res.status(500).json({ message: 'Error processing request', error: String(error) });
  }
}

export default authMiddleware(handler);
