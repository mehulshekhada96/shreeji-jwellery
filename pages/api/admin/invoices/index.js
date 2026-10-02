import connectToDatabase from '../../../../lib/mongodb';
import Invoice from '../../../../models/Invoice';
import { USER_ROLES } from '../../../../lib/constants';
import { authMiddleware } from '../../common/common.services';

async function handler(req, res) {
  const { method } = req;
  await connectToDatabase();

  const currentUser = req.userData;
  if (!currentUser || currentUser.role !== USER_ROLES.ADMINISTRATOR) {
    return res.status(403).json({ message: 'Access denied. Administrator only.' });
  }

  if (method === 'GET') {
    try {
      const { status, companyId, search } = req.query;
      const query = { isDeleted: { $ne: true } };

      if (status && status !== 'ALL') {
        query.paymentStatus = status;
      }

      if (companyId && companyId !== 'ALL') {
        query.company = companyId;
      }

      if (search && search.trim() !== '') {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [
          { invoiceNumber: regex },
          { companyName: regex },
          { clientMobile: regex },
          { clientContactPerson: regex }
        ];
      }

      const invoices = await Invoice.find(query)
        .sort({ createdAt: -1 })
        .lean();

      // Calculate stats
      const allActiveInvoices = await Invoice.find({ isDeleted: { $ne: true } }).lean();
      const stats = {
        totalInvoiced: allActiveInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0),
        totalPaid: allActiveInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0),
        totalPending: allActiveInvoices.reduce((sum, inv) => sum + (inv.pendingAmount || 0), 0),
        count: allActiveInvoices.length,
        paidCount: allActiveInvoices.filter(i => i.paymentStatus === 'PAID').length,
        pendingCount: allActiveInvoices.filter(i => i.paymentStatus === 'PENDING').length,
        partialCount: allActiveInvoices.filter(i => i.paymentStatus === 'PARTIALLY PAID').length,
      };

      return res.status(200).json({ invoices, stats });
    } catch (error) {
      console.error('Error listing invoices:', error);
      return res.status(500).json({ message: 'Error retrieving invoices', error: String(error) });
    }
  }

  if (method === 'POST') {
    try {
      const {
        companyId,
        companyName,
        clientMobile,
        clientAddress,
        clientEmail,
        clientContactPerson,
        invoiceDate,
        dueDate,
        billingCycle,
        servicePeriod,
        items,
        discountTotal,
        paymentStatus,
        paidAmount: customPaidAmount,
        paymentMode,
        referenceNo,
        notes,
        terms
      } = req.body;

      if (!companyId || !companyName || !clientMobile) {
        return res.status(400).json({ message: 'Company, company name, and mobile number are required' });
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'At least one feature item is required' });
      }

      // Calculate totals
      let calculatedSubtotal = 0;
      let calculatedItemDiscounts = 0;

      const processedItems = items.map(item => {
        const price = Number(item.price) || 0;
        const qty = Number(item.quantity) || 1;
        const discount = Number(item.discount) || 0;
        const total = Math.max(0, price * qty - discount);

        calculatedSubtotal += price * qty;
        calculatedItemDiscounts += discount;

        return {
          featureName: item.featureName,
          description: item.description || '',
          billingCycle: item.billingCycle || 'MONTHLY',
          price,
          quantity: qty,
          discount,
          total
        };
      });

      const finalDiscountTotal = Number(discountTotal) >= 0 ? Number(discountTotal) : calculatedItemDiscounts;
      const totalAmount = Math.max(0, calculatedSubtotal - finalDiscountTotal);

      // Payment amount calculations
      let paid = 0;
      let pending = totalAmount;
      const status = paymentStatus || 'PENDING';

      if (status === 'PAID') {
        paid = totalAmount;
        pending = 0;
      } else if (status === 'PARTIALLY PAID') {
        paid = Math.min(totalAmount, Math.max(0, Number(customPaidAmount) || 0));
        pending = Math.max(0, totalAmount - paid);
      } else {
        paid = 0;
        pending = totalAmount;
      }

      // Generate invoice number TS-YYYYMM-XXXX
      const dateObj = invoiceDate ? new Date(invoiceDate) : new Date();
      const yearMonth = `${dateObj.getFullYear()}${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      const count = await Invoice.countDocuments();
      const invoiceNumber = `TS-${yearMonth}-${String(count + 1).padStart(4, '0')}`;

      // Build initial payment history if paid or partial
      const paymentHistory = [];
      if (paid > 0) {
        paymentHistory.push({
          amount: paid,
          paymentDate: dateObj,
          paymentMode: paymentMode || 'UPI',
          referenceNo: referenceNo || '',
          notes: notes || 'Initial payment recorded'
        });
      }

      const invoice = new Invoice({
        invoiceNumber,
        company: companyId,
        companyName,
        clientMobile,
        clientAddress: clientAddress || '',
        clientEmail: clientEmail || '',
        clientContactPerson: clientContactPerson || '',
        invoiceDate: dateObj,
        dueDate: dueDate ? new Date(dueDate) : null,
        billingCycle: billingCycle || 'MONTHLY',
        servicePeriod: {
          from: servicePeriod?.from ? new Date(servicePeriod.from) : null,
          to: servicePeriod?.to ? new Date(servicePeriod.to) : null
        },
        items: processedItems,
        subtotal: calculatedSubtotal,
        discountTotal: finalDiscountTotal,
        totalAmount,
        paidAmount: paid,
        pendingAmount: pending,
        paymentStatus: status,
        paymentHistory,
        provider: {
          companyName: 'Tech Shekhada',
          name: 'Mehul Shekhada',
          accountHolder: 'Mehul Kanjibhai Shekhada',
          mobile: '7874105288',
          address: '438, Prime Arcade, Lajamni Chowk, Mota Varachha, Surat.',
          upiId: '7874105288@ybl'
        },
        notes: notes || '',
        terms: terms || 'Thank you for choosing Tech Shekhada! Software access is subject to payment as per agreed terms.',
        createdBy: currentUser._id
      });

      await invoice.save();
      return res.status(201).json({ message: 'Invoice generated successfully', invoice });
    } catch (error) {
      console.error('Error creating invoice:', error);
      return res.status(500).json({ message: 'Failed to create invoice', error: String(error) });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ message: `Method ${method} Not Allowed` });
}

export default authMiddleware(handler);
