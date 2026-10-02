import connectToDatabase from '../../../../lib/mongodb';
import Invoice from '../../../../models/Invoice';
import { USER_ROLES } from '../../../../lib/constants';
import { authMiddleware } from '../../common/common.services';

async function handler(req, res) {
  const { method } = req;
  const { id } = req.query;
  await connectToDatabase();

  const currentUser = req.userData;
  if (!currentUser || currentUser.role !== USER_ROLES.ADMINISTRATOR) {
    return res.status(403).json({ message: 'Access denied. Administrator only.' });
  }

  if (method === 'GET') {
    try {
      const invoice = await Invoice.findById(id).lean();
      if (!invoice || invoice.isDeleted) {
        return res.status(404).json({ message: 'Invoice not found' });
      }
      return res.status(200).json({ invoice });
    } catch (error) {
      return res.status(500).json({ message: 'Error fetching invoice', error: String(error) });
    }
  }

  if (method === 'PUT') {
    try {
      const invoice = await Invoice.findById(id);
      if (!invoice || invoice.isDeleted) {
        return res.status(404).json({ message: 'Invoice not found' });
      }

      const {
        paymentStatus,
        paidAmount,
        addPaymentAmount,
        paymentMode,
        referenceNo,
        notes,
        dueDate
      } = req.body;

      if (dueDate) {
        invoice.dueDate = new Date(dueDate);
      }

      if (notes !== undefined) {
        invoice.notes = notes;
      }

      // If adding a new payment chunk
      if (addPaymentAmount && Number(addPaymentAmount) > 0) {
        const amountToAdd = Number(addPaymentAmount);
        const newPaidAmount = Math.min(invoice.totalAmount, invoice.paidAmount + amountToAdd);
        invoice.paidAmount = newPaidAmount;
        invoice.pendingAmount = Math.max(0, invoice.totalAmount - newPaidAmount);

        if (invoice.pendingAmount === 0) {
          invoice.paymentStatus = 'PAID';
        } else if (invoice.paidAmount > 0) {
          invoice.paymentStatus = 'PARTIALLY PAID';
        } else {
          invoice.paymentStatus = 'PENDING';
        }

        invoice.paymentHistory.push({
          amount: amountToAdd,
          paymentDate: new Date(),
          paymentMode: paymentMode || 'UPI',
          referenceNo: referenceNo || '',
          notes: notes || 'Payment installment received'
        });
      } else if (paymentStatus) {
        // Direct status override
        invoice.paymentStatus = paymentStatus;
        if (paymentStatus === 'PAID') {
          const delta = Math.max(0, invoice.totalAmount - invoice.paidAmount);
          invoice.paidAmount = invoice.totalAmount;
          invoice.pendingAmount = 0;
          if (delta > 0) {
            invoice.paymentHistory.push({
              amount: delta,
              paymentDate: new Date(),
              paymentMode: paymentMode || 'UPI',
              referenceNo: referenceNo || '',
              notes: notes || 'Marked as Full Paid'
            });
          }
        } else if (paymentStatus === 'PENDING') {
          invoice.paidAmount = 0;
          invoice.pendingAmount = invoice.totalAmount;
        } else if (paymentStatus === 'PARTIALLY PAID') {
          if (paidAmount !== undefined) {
            invoice.paidAmount = Math.min(invoice.totalAmount, Math.max(0, Number(paidAmount) || 0));
            invoice.pendingAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount);
          }
        }
      }

      await invoice.save();
      return res.status(200).json({ message: 'Invoice updated successfully', invoice });
    } catch (error) {
      console.error('Error updating invoice:', error);
      return res.status(500).json({ message: 'Error updating invoice', error: String(error) });
    }
  }

  if (method === 'DELETE') {
    try {
      const invoice = await Invoice.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
      if (!invoice) {
        return res.status(404).json({ message: 'Invoice not found' });
      }
      return res.status(200).json({ message: 'Invoice deleted successfully' });
    } catch (error) {
      return res.status(500).json({ message: 'Error deleting invoice', error: String(error) });
    }
  }

  res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
  return res.status(405).json({ message: `Method ${method} Not Allowed` });
}

export default authMiddleware(handler);
