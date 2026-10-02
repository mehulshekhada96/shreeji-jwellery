import React, { useState, useEffect } from 'react';
import axios from 'axios';
import moment from 'moment-timezone';
import { 
  FaPlus, 
  FaFileInvoiceDollar, 
  FaDownload, 
  FaEye, 
  FaCheckCircle, 
  FaClock, 
  FaExclamationCircle, 
  FaMoneyBillWave, 
  FaTrash, 
  FaSearch, 
  FaFilter, 
  FaSync,
  FaEdit
} from 'react-icons/fa';
import CreateInvoiceModal from './CreateInvoiceModal';
import InvoiceModal from './InvoiceModal';
import UpdatePaymentModal from './UpdatePaymentModal';
import { generateInvoicePDF, formatCurrency } from '../utils/invoicePdfGenerator';

const AdminInvoicesManager = () => {
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState({
    totalInvoiced: 0,
    totalPaid: 0,
    totalPending: 0,
    count: 0,
    paidCount: 0,
    pendingCount: 0,
    partialCount: 0
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const params = {};
      if (selectedStatus !== 'ALL') params.status = selectedStatus;
      if (selectedCompany !== 'ALL') params.companyId = selectedCompany;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await axios.get('/api/admin/invoices', {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      setInvoices(res.data?.invoices || []);
      if (res.data?.stats) {
        setStats(res.data.stats);
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await axios.get('/api/admin/company-contacts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCompanies(res.data?.companies || []);
    } catch (err) {
      console.error('Error fetching companies:', err);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [selectedStatus, selectedCompany]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchInvoices();
  };

  const handleInvoiceCreated = (newInvoice) => {
    fetchInvoices();
    // Promptly open the generated invoice for the administrator to review/download
    setViewInvoice(newInvoice);
  };

  const handlePaymentUpdated = () => {
    fetchInvoices();
  };

  const handleDownload = async (invoice) => {
    try {
      setDownloadingId(invoice._id);
      await generateInvoicePDF(invoice, true);
    } catch (err) {
      console.error('PDF error:', err);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (invoiceId) => {
    if (!window.confirm('Are you sure you want to delete this invoice?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/admin/invoices/${invoiceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchInvoices();
    } catch (err) {
      console.error('Failed to delete invoice:', err);
      alert('Failed to delete invoice');
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

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-gray-900 text-white p-6 rounded-xl shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <img
            src="/images/tech-shekhada-logo.jpg"
            alt="Tech Shekhada"
            className="w-16 h-16 rounded-xl object-cover border-2 border-white/20 shadow-md"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-tight">Tech Shekhada Invoicing Hub</h2>
              <span className="text-[11px] bg-yellow-400 text-gray-900 font-bold px-2 py-0.5 rounded-full">
                Administrator
              </span>
            </div>
            <p className="text-xs text-blue-200 mt-1">
              Generate, track software feature subscriptions, log payments, and download official invoices.
            </p>
            <p className="text-xs text-yellow-300 font-medium mt-0.5">
              Mehul Shekhada | Contact: 7874105288 | Surat, Gujarat | UPI: 7874105288@ybl
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition shadow-lg hover:shadow-blue-500/25 cursor-pointer whitespace-nowrap"
        >
          <FaPlus size={12} />
          <span>+ Generate New Invoice</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Invoiced</span>
          <p className="text-2xl font-black text-gray-900 mt-1">{formatCurrency(stats.totalInvoiced)}</p>
          <span className="text-[11px] text-gray-500">{stats.count} total invoices</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Collected</span>
          <p className="text-2xl font-black text-green-700 mt-1">{formatCurrency(stats.totalPaid)}</p>
          <span className="text-[11px] text-green-600 font-semibold">{stats.paidCount} fully paid</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending / Due</span>
          <p className={`text-2xl font-black mt-1 ${stats.totalPending > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatCurrency(stats.totalPending)}
          </p>
          <span className="text-[11px] text-red-500 font-semibold">{stats.pendingCount} unpaid</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Partially Paid</span>
          <p className="text-2xl font-black text-amber-600 mt-1">{stats.partialCount}</p>
          <span className="text-[11px] text-amber-600 font-semibold">Installment active</span>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Company Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600">Company:</span>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="text-xs p-2 border border-gray-300 rounded-lg bg-white focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Companies</option>
              {companies.map(c => (
                <option key={c._id} value={c._id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs p-2 border border-gray-300 rounded-lg bg-white focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="PAID">Full Paid</option>
              <option value="PARTIALLY PAID">Partially Paid</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-80">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice #, company, mobile..."
              className="w-full text-xs pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            <FaSearch className="absolute left-2.5 top-2.5 text-gray-400" size={12} />
          </div>
          <button
            type="submit"
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCompany('ALL');
              setSelectedStatus('ALL');
            }}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
            title="Reset Filters"
          >
            <FaSync size={12} />
          </button>
        </form>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <FaFileInvoiceDollar className="text-blue-600" />
            <span>Invoices Directory</span>
          </h3>
          <span className="text-xs text-gray-500">{invoices.length} records</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500 text-xs">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading invoices...
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <FaFileInvoiceDollar size={38} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-gray-700">No Invoices Found</p>
            <p className="text-xs text-gray-400 mt-1">
              Click &quot;+ Generate New Invoice&quot; above to create an invoice for any company.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 uppercase text-[11px] font-semibold tracking-wider border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Company & Client</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Features Invoiced</th>
                  <th className="py-3 px-4 text-center">Cycle</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Pending</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {invoices.map((inv) => (
                  <tr key={inv._id} className="hover:bg-gray-50 transition">
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setViewInvoice(inv)}
                        className="font-bold text-blue-700 hover:underline"
                      >
                        {inv.invoiceNumber}
                      </button>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-bold text-gray-900 block">{inv.companyName}</span>
                      <span className="text-[11px] text-gray-500">
                        {inv.clientMobile} {inv.clientContactPerson ? `(${inv.clientContactPerson})` : ''}
                      </span>
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
                        <span className="font-medium text-gray-800 block truncate">
                          {inv.items?.map(it => it.featureName).join(', ') || 'Software Modules'}
                        </span>
                        <span className="text-[10px] text-gray-400">
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
                          onClick={() => setViewInvoice(inv)}
                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition"
                          title="View Invoice"
                        >
                          <FaEye size={13} />
                        </button>

                        <button
                          onClick={() => handleDownload(inv)}
                          disabled={downloadingId === inv._id}
                          className="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition"
                          title="Download PDF"
                        >
                          <FaDownload size={13} />
                        </button>

                        <button
                          onClick={() => setPaymentModalInvoice(inv)}
                          className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition"
                          title="Update Payment / Status"
                        >
                          <FaMoneyBillWave size={13} />
                        </button>

                        <button
                          onClick={() => handleDelete(inv._id)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                          title="Delete Invoice"
                        >
                          <FaTrash size={12} />
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

      {/* Create Invoice Modal */}
      <CreateInvoiceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onInvoiceCreated={handleInvoiceCreated}
      />

      {/* View Invoice Preview Modal */}
      {viewInvoice && (
        <InvoiceModal
          invoice={viewInvoice}
          isOpen={!!viewInvoice}
          onClose={() => setViewInvoice(null)}
        />
      )}

      {/* Update Payment Modal */}
      {paymentModalInvoice && (
        <UpdatePaymentModal
          invoice={paymentModalInvoice}
          isOpen={!!paymentModalInvoice}
          onClose={() => setPaymentModalInvoice(null)}
          onUpdated={handlePaymentUpdated}
        />
      )}
    </div>
  );
};

export default AdminInvoicesManager;
