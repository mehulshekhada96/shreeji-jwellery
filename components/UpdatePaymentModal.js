import React, { useState } from 'react';
import axios from 'axios';
import { FaTimes, FaMoneyCheckAlt, FaCheckCircle } from 'react-icons/fa';
import { formatCurrency } from '../utils/invoicePdfGenerator';

const UpdatePaymentModal = ({ invoice, isOpen, onClose, onUpdated }) => {
  const [paymentStatus, setPaymentStatus] = useState(invoice?.paymentStatus || 'PENDING');
  const [addAmount, setAddAmount] = useState(invoice?.pendingAmount || 0);
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !invoice) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      setSubmitting(true);
      const token = localStorage.getItem('token');
      
      const payload = {
        paymentStatus,
        addPaymentAmount: Number(addAmount) || 0,
        paymentMode,
        referenceNo,
        notes,
      };

      const res = await axios.put(`/api/admin/invoices/${invoice._id}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (onUpdated) {
        onUpdated(res.data.invoice);
      }
      onClose();
    } catch (err) {
      console.error('Error updating payment:', err);
      setError(err?.response?.data?.message || 'Failed to update payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200 animate-fadeIn">
        {/* Header */}
        <div className="bg-gray-900 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <FaMoneyCheckAlt className="text-green-400" size={18} />
            <h3 className="text-base font-bold">Update Payment - {invoice.invoiceNumber}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            <FaTimes size={16} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Invoice Summary */}
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-1">
            <div className="flex justify-between text-gray-700">
              <span>Client:</span>
              <span className="font-bold text-gray-900">{invoice.companyName}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Total Invoiced:</span>
              <span className="font-bold text-blue-900">{formatCurrency(invoice.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Already Paid:</span>
              <span className="font-semibold text-green-700">{formatCurrency(invoice.paidAmount)}</span>
            </div>
            <div className="flex justify-between text-gray-700 border-t border-gray-200 pt-1">
              <span>Current Balance Due:</span>
              <span className="font-extrabold text-red-600">{formatCurrency(invoice.pendingAmount)}</span>
            </div>
          </div>

          {/* Quick Mark Paid */}
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Set Payment Status</label>
            <select
              value={paymentStatus}
              onChange={(e) => {
                const val = e.target.value;
                setPaymentStatus(val);
                if (val === 'PAID') {
                  setAddAmount(invoice.pendingAmount);
                } else if (val === 'PENDING') {
                  setAddAmount(0);
                }
              }}
              className="w-full p-2.5 border border-gray-300 rounded-lg bg-white font-medium"
            >
              <option value="PAID">Mark as FULL PAID</option>
              <option value="PARTIALLY PAID">PARTIALLY PAID (Record Installment)</option>
              <option value="PENDING">PENDING (Reset to Unpaid)</option>
            </select>
          </div>

          {/* Payment Amount to Record */}
          {paymentStatus !== 'PENDING' && (
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                New Installment Amount Received (Rs.) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max={invoice.pendingAmount || invoice.totalAmount}
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-lg bg-white font-bold text-green-700 text-sm focus:ring-2 focus:ring-blue-500"
              />

              {/* Dynamic Calculation Helper */}
              {Number(addAmount) > 0 && (
                <div className="mt-2 p-2.5 bg-blue-50 rounded-lg border border-blue-200 space-y-1 text-[11px]">
                  <div className="flex justify-between text-gray-700">
                    <span>Already Paid:</span>
                    <span className="font-semibold text-green-700">{formatCurrency(invoice.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between text-gray-700">
                    <span>+ This New Payment:</span>
                    <span className="font-bold text-green-800">+{formatCurrency(addAmount)}</span>
                  </div>
                  <div className="flex justify-between text-gray-800 border-t border-blue-200 pt-1 font-bold">
                    <span>New Total Paid:</span>
                    <span className="text-green-700">{formatCurrency(invoice.paidAmount + Number(addAmount))}</span>
                  </div>
                  <div className="flex justify-between text-gray-800 font-bold">
                    <span>New Balance Pending:</span>
                    <span className={Math.max(0, invoice.totalAmount - (invoice.paidAmount + Number(addAmount))) > 0 ? 'text-red-600' : 'text-gray-700'}>
                      {formatCurrency(Math.max(0, invoice.totalAmount - (invoice.paidAmount + Number(addAmount))))}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-700 pt-1 border-t border-blue-100">
                    <span>Updated Status:</span>
                    <span className="font-bold text-blue-900">
                      {Math.max(0, invoice.totalAmount - (invoice.paidAmount + Number(addAmount))) === 0 ? 'FULL PAID' : 'PARTIALLY PAID'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payment Mode */}
          {paymentStatus !== 'PENDING' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Payment Mode</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg bg-white"
                >
                  <option value="UPI">UPI (7874105288@ybl)</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Transaction Ref / UTR</label>
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="e.g. UTR / Txn No"
                  className="w-full p-2 border border-gray-300 rounded-lg bg-white"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Received via PhonePe UPI"
              className="w-full p-2 border border-gray-300 rounded-lg bg-white"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition shadow disabled:opacity-50"
            >
              <FaCheckCircle size={12} />
              <span>{submitting ? 'Saving...' : 'Save Payment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UpdatePaymentModal;
