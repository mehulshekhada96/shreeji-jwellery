import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment-timezone';
import { 
  FaFileInvoiceDollar, 
  FaDownload, 
  FaEye, 
  FaCheckCircle, 
  FaClock, 
  FaExclamationCircle, 
  FaSync, 
  FaQrcode, 
  FaBuilding, 
  FaPhoneAlt, 
  FaMapMarkerAlt 
} from 'react-icons/fa';
import InvoiceModal from './InvoiceModal';
import { generateInvoicePDF, formatCurrency } from '../utils/invoicePdfGenerator';

const CompanyInvoicesList = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const fetchCompanyInvoices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const res = await axios.get('/api/invoices/my-company', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInvoices(res.data?.invoices || []);
    } catch (err) {
      console.error('Failed to fetch company invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanyInvoices();
  }, []);

  const handleView = (invoice) => {
    setSelectedInvoice(invoice);
    setIsViewModalOpen(true);
  };

  const handleDownload = async (invoice) => {
    try {
      setDownloadingId(invoice._id);
      await generateInvoicePDF(invoice, true);
    } catch (err) {
      console.error('PDF download error:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
            <FaCheckCircle className="text-green-600" size={10} /> Full Paid
          </span>
        );
      case 'PARTIALLY PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <FaClock className="text-amber-600" size={10} /> Partially Paid
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
            <FaExclamationCircle className="text-red-600" size={10} /> Pending
          </span>
        );
    }
  };

  // Summaries
  const totalAmount = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
  const totalPending = invoices.reduce((s, i) => s + (i.pendingAmount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Provider Information */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-xl shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <img
            src="/images/tech-shekhada-logo.jpg"
            alt="Tech Shekhada"
            className="w-16 h-16 rounded-xl object-cover border-2 border-white/20 shadow-md"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight">Tech Shekhada</span>
              <span className="text-[11px] bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full border border-blue-400/30">
                Official Invoicing
              </span>
            </div>
            <p className="text-xs text-blue-200 mt-1 flex items-center gap-2">
              <span className="font-semibold text-white">Mehul Shekhada</span>
              <span className="text-gray-400">|</span>
              <FaPhoneAlt size={10} /> <span>+91 7874105288</span>
              <span className="text-gray-400">|</span>
              <FaMapMarkerAlt size={10} /> <span>438, Prime Arcade, Lajamni Chowk, Mota Varachha, Surat</span>
            </p>
            <p className="text-xs text-yellow-300 font-semibold mt-1">
              UPI for Payment: 7874105288@ybl
            </p>
          </div>
        </div>

        <button
          onClick={fetchCompanyInvoices}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition"
        >
          <FaSync size={11} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Invoices</span>
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase">Total Invoiced</span>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(totalAmount)}</p>
          <span className="text-[11px] text-gray-400">{invoices.length} invoices generated</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase">Total Paid</span>
          <p className="text-xl font-bold text-green-700 mt-1">{formatCurrency(totalPaid)}</p>
          <span className="text-[11px] text-green-600 font-medium">Recorded settlements</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase">Outstanding Balance</span>
          <p className={`text-xl font-bold mt-1 ${totalPending > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatCurrency(totalPending)}
          </p>
          <span className="text-[11px] text-gray-400">Current pending amount</span>
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <FaFileInvoiceDollar className="text-blue-600" />
            <span>Company Subscription & Feature Invoices</span>
          </h3>
          <span className="text-xs text-gray-500">{invoices.length} total</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500 text-xs">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading invoices...
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <FaFileInvoiceDollar size={36} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-700">No Invoices Found</p>
            <p className="text-xs text-gray-400 mt-1">
              Your company has no invoices generated yet. Any future billing from Tech Shekhada will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 uppercase text-[11px] font-semibold tracking-wider border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Features / Plan</th>
                  <th className="py-3 px-4 text-center">Cycle</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Pending</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoices.map((inv) => (
                  <tr key={inv._id} className="hover:bg-gray-50 transition">
                    <td className="py-3 px-4 font-bold text-blue-700">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {moment(inv.invoiceDate).format('DD MMM YYYY')}
                      {inv.dueDate && (
                        <span className="block text-[10px] text-gray-400">
                          Due: {moment(inv.dueDate).format('DD MMM YYYY')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="max-w-xs">
                        <span className="font-semibold text-gray-800 block truncate">
                          {inv.items?.map(it => it.featureName).join(', ') || 'Software Services'}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {inv.items?.length || 0} module{inv.items?.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px] font-semibold uppercase">
                        {inv.billingCycle || 'MONTHLY'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-900">
                      {formatCurrency(inv.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-green-700">
                      {formatCurrency(inv.paidAmount)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-red-600">
                      {formatCurrency(inv.pendingAmount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {getStatusBadge(inv.paymentStatus)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleView(inv)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition"
                          title="View Invoice"
                        >
                          <FaEye size={14} />
                        </button>
                        <button
                          onClick={() => handleDownload(inv)}
                          disabled={downloadingId === inv._id}
                          className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-medium transition shadow-sm disabled:opacity-50"
                          title="Download PDF"
                        >
                          <FaDownload size={10} />
                          <span>{downloadingId === inv._id ? 'Generating...' : 'PDF'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Details Modal */}
      {selectedInvoice && (
        <InvoiceModal
          invoice={selectedInvoice}
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
        />
      )}
    </div>
  );
};

export default CompanyInvoicesList;
