import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaPlus, FaTrash, FaTimes, FaFileInvoiceDollar, FaCheckCircle } from 'react-icons/fa';
import moment from 'moment-timezone';

const COMMON_FEATURES = [
  'SKU Management & Sorting',
  'Meesho Direct Sort & Excel',
  'Flipkart & Amazon Inventory Recon',
  'Vendor Bills & Party Management',
  'Worker Bills & Attendance Flow',
  'Production Flow & Final Products',
  'Full Enterprise OMS Suite',
  'Custom Feature Implementation'
];

const CreateInvoiceModal = ({ isOpen, onClose, onInvoiceCreated }) => {
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientMobile, setClientMobile] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientContactPerson, setClientContactPerson] = useState('');
  
  const [invoiceDate, setInvoiceDate] = useState(moment().format('YYYY-MM-DD'));
  const [dueDate, setDueDate] = useState(moment().add(15, 'days').format('YYYY-MM-DD'));
  const [billingCycle, setBillingCycle] = useState('MONTHLY');
  const [serviceFrom, setServiceFrom] = useState(moment().startOf('month').format('YYYY-MM-DD'));
  const [serviceTo, setServiceTo] = useState(moment().endOf('month').format('YYYY-MM-DD'));

  // Items
  const [items, setItems] = useState([
    {
      featureName: 'SKU Management & Sorting',
      description: '',
      billingCycle: 'MONTHLY',
      price: 5000,
      quantity: 1,
      discount: 0,
      total: 5000
    }
  ]);

  // Payment
  const [paymentStatus, setPaymentStatus] = useState('PENDING'); // PAID, PENDING, PARTIALLY PAID
  const [customPaidAmount, setCustomPaidAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch Companies on Open
  useEffect(() => {
    if (!isOpen) return;
    const fetchCompanies = async () => {
      try {
        setLoadingCompanies(true);
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/admin/company-contacts', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const compList = res.data?.companies || [];
        setCompanies(compList);
        if (compList.length > 0 && !selectedCompanyId) {
          handleSelectCompany(compList[0]._id, compList);
        }
      } catch (err) {
        console.error('Failed to load companies:', err);
      } finally {
        setLoadingCompanies(false);
      }
    };
    fetchCompanies();
  }, [isOpen]);

  const handleSelectCompany = (compId, list = companies) => {
    setSelectedCompanyId(compId);
    const found = list.find(c => c._id === compId);
    if (found) {
      setCompanyName(found.companyName || '');
      setClientMobile(found.mobileNumber || '');
      setClientAddress(found.address || '');
      setClientContactPerson(found.contactPerson || '');
    }
  };

  // Adjust service period when billing cycle changes
  const handleBillingCycleChange = (cycle) => {
    setBillingCycle(cycle);
    if (cycle === 'YEARLY') {
      setServiceTo(moment(serviceFrom).add(1, 'year').subtract(1, 'day').format('YYYY-MM-DD'));
    } else if (cycle === 'MONTHLY') {
      setServiceTo(moment(serviceFrom).endOf('month').format('YYYY-MM-DD'));
    }
    // Also update item billing cycles
    setItems(prev => prev.map(item => ({ ...item, billingCycle: cycle })));
  };

  // Items manipulation
  const handleItemChange = (index, field, value) => {
    setItems(prev => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };

      const price = field === 'price' ? Number(value) || 0 : Number(item.price) || 0;
      const qty = field === 'quantity' ? Number(value) || 1 : Number(item.quantity) || 1;
      const discount = field === 'discount' ? Number(value) || 0 : Number(item.discount) || 0;
      item.total = Math.max(0, price * qty - discount);

      next[index] = item;
      return next;
    });
  };

  const addItem = (suggestedName = '') => {
    setItems(prev => [
      ...prev,
      {
        featureName: suggestedName || 'Custom Feature',
        description: '',
        billingCycle: billingCycle || 'MONTHLY',
        price: 1000,
        quantity: 1,
        discount: 0,
        total: 1000
      }
    ]);
  };

  const removeItem = (index) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Totals
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price || 0) * (Number(item.quantity) || 1)), 0);
  const totalDiscount = items.reduce((sum, item) => sum + Number(item.discount || 0), 0);
  const totalAmount = Math.max(0, subtotal - totalDiscount);

  let paidAmount = 0;
  let pendingAmount = totalAmount;
  if (paymentStatus === 'PAID') {
    paidAmount = totalAmount;
    pendingAmount = 0;
  } else if (paymentStatus === 'PARTIALLY PAID') {
    paidAmount = Math.min(totalAmount, Math.max(0, Number(customPaidAmount) || 0));
    pendingAmount = Math.max(0, totalAmount - paidAmount);
  } else {
    paidAmount = 0;
    pendingAmount = totalAmount;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedCompanyId) {
      setError('Please select a company');
      return;
    }
    if (!companyName.trim()) {
      setError('Company name is required');
      return;
    }
    if (!clientMobile.trim()) {
      setError('Client mobile number is required');
      return;
    }
    if (items.length === 0) {
      setError('Please add at least one feature item');
      return;
    }

    try {
      setSubmitting(true);
      const token = localStorage.getItem('token');
      const payload = {
        companyId: selectedCompanyId,
        companyName,
        clientMobile,
        clientAddress,
        clientEmail,
        clientContactPerson,
        invoiceDate,
        dueDate,
        billingCycle,
        servicePeriod: {
          from: serviceFrom,
          to: serviceTo
        },
        items,
        discountTotal: totalDiscount,
        paymentStatus,
        paidAmount,
        paymentMode,
        referenceNo,
        notes
      };

      const res = await axios.post('/api/admin/invoices', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (onInvoiceCreated) {
        onInvoiceCreated(res.data.invoice);
      }
      onClose();
    } catch (err) {
      console.error('Error generating invoice:', err);
      setError(err?.response?.data?.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full overflow-hidden border border-gray-200 animate-fadeIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
              <FaFileInvoiceDollar size={20} className="text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Generate New Invoice</h2>
              <p className="text-xs text-blue-200">Tech Shekhada Software & Licensing Billing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 transition"
          >
            <FaTimes size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 max-h-[82vh] overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {error}
            </div>
          )}

          {/* Section 1: Client & Company Information */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              1. Client & Company Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Select Existing Company */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Select Registered Company <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => handleSelectCompany(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  disabled={loadingCompanies}
                >
                  <option value="">-- Choose Company --</option>
                  {companies.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.companyName} {c.mobileNumber ? `(${c.mobileNumber})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Company Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Company Name (on Invoice) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Shreeji Jewellery"
                  required
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Client Mobile */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Client Mobile Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={clientMobile}
                  onChange={(e) => setClientMobile(e.target.value)}
                  placeholder="e.g. 9876543210"
                  required
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Contact Person */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Contact Person Name
                </label>
                <input
                  type="text"
                  value={clientContactPerson}
                  onChange={(e) => setClientContactPerson(e.target.value)}
                  placeholder="e.g. Mehul Patel"
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Client Email
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Client Address */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Billing Address
                </label>
                <input
                  type="text"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="City, State, Pincode"
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Invoice Dates & Billing Cycle */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              2. Dates & Subscription Cycle
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Billing Cycle</label>
                <select
                  value={billingCycle}
                  onChange={(e) => handleBillingCycleChange(e.target.value)}
                  className="w-full text-xs p-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Invoice Date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full text-xs p-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full text-xs p-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Service From</label>
                <input
                  type="date"
                  value={serviceFrom}
                  onChange={(e) => setServiceFrom(e.target.value)}
                  className="w-full text-xs p-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Service To</label>
                <input
                  type="date"
                  value={serviceTo}
                  onChange={(e) => setServiceTo(e.target.value)}
                  className="w-full text-xs p-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Feature Items & Pricing */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                3. Features & Modules Invoiced
              </h3>
              <button
                type="button"
                onClick={() => addItem()}
                className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition"
              >
                <FaPlus size={10} /> Add Feature
              </button>
            </div>

            {/* Quick Feature Suggestions */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[11px] text-gray-500 self-center">Quick Add:</span>
              {COMMON_FEATURES.map((feat, fIdx) => (
                <button
                  key={fIdx}
                  type="button"
                  onClick={() => addItem(feat)}
                  className="text-[11px] px-2 py-0.5 bg-white hover:bg-blue-50 text-gray-700 hover:text-blue-700 border border-gray-300 rounded-full transition"
                >
                  + {feat}
                </button>
              ))}
            </div>

            {/* Items Table */}
            <div className="space-y-3 pt-2">
              {items.map((item, idx) => (
                <div key={idx} className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm relative">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    {/* Feature Name */}
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">Feature Name</label>
                      <input
                        type="text"
                        value={item.featureName}
                        onChange={(e) => handleItemChange(idx, 'featureName', e.target.value)}
                        placeholder="Feature name"
                        required
                        className="w-full text-xs p-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {/* Pricing Cycle */}
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">Cycle</label>
                      <select
                        value={item.billingCycle}
                        onChange={(e) => handleItemChange(idx, 'billingCycle', e.target.value)}
                        className="w-full text-xs p-2 border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="MONTHLY">Monthly</option>
                        <option value="YEARLY">Yearly</option>
                        <option value="ONE_TIME">One-time</option>
                      </select>
                    </div>

                    {/* Price */}
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">Price (Rs.)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={item.price}
                        onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                        required
                        className="w-full text-xs p-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 text-right font-medium"
                      />
                    </div>

                    {/* Discount */}
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">Discount (Rs.)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={item.discount}
                        onChange={(e) => handleItemChange(idx, 'discount', e.target.value)}
                        className="w-full text-xs p-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 text-right text-red-600"
                      />
                    </div>

                    {/* Total & Action */}
                    <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-4">
                      <div className="text-right">
                        <span className="block text-[10px] text-gray-400">Total</span>
                        <span className="text-xs font-bold text-gray-900">
                          Rs. {Number(item.total).toLocaleString('en-IN')}
                        </span>
                      </div>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="p-2 text-gray-400 hover:text-red-600 transition"
                          title="Remove item"
                        >
                          <FaTrash size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Optional Description */}
                  <div className="mt-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      placeholder="Optional notes or details for this feature..."
                      className="w-full text-[11px] p-1.5 border border-dashed border-gray-200 rounded text-gray-600 focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Calculations Box */}
            <div className="bg-white p-4 rounded-lg border border-gray-200 mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{items.length}</span> feature item{items.length > 1 ? 's' : ''} added
              </div>
              <div className="w-full sm:w-72 space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal:</span>
                  <span className="font-semibold text-gray-900">Rs. {subtotal.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Total Discount:</span>
                  <span className="font-semibold text-red-600">- Rs. {totalDiscount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-blue-900 pt-1 border-t border-gray-200">
                  <span>Grand Total:</span>
                  <span>Rs. {totalAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Payment Status & Record */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              4. Payment Status & Settlement
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label
                className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between transition ${
                  paymentStatus === 'PAID'
                    ? 'border-green-500 bg-green-50 text-green-900 shadow-sm'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="paymentStatus"
                    value="PAID"
                    checked={paymentStatus === 'PAID'}
                    onChange={() => setPaymentStatus('PAID')}
                    className="text-green-600 focus:ring-green-500"
                  />
                  <span className="text-xs font-bold">FULL PAID</span>
                </div>
                <span className="text-[11px] font-semibold text-green-700">Rs. {totalAmount.toLocaleString('en-IN')}</span>
              </label>

              <label
                className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between transition ${
                  paymentStatus === 'PARTIALLY PAID'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-sm'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="paymentStatus"
                    value="PARTIALLY PAID"
                    checked={paymentStatus === 'PARTIALLY PAID'}
                    onChange={() => {
                      setPaymentStatus('PARTIALLY PAID');
                      if (customPaidAmount === 0) setCustomPaidAmount(Math.round(totalAmount / 2));
                    }}
                    className="text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs font-bold">PARTIALLY PAID</span>
                </div>
                <span className="text-[11px] text-amber-700 font-semibold">Custom</span>
              </label>

              <label
                className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between transition ${
                  paymentStatus === 'PENDING'
                    ? 'border-red-500 bg-red-50 text-red-900 shadow-sm'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="paymentStatus"
                    value="PENDING"
                    checked={paymentStatus === 'PENDING'}
                    onChange={() => setPaymentStatus('PENDING')}
                    className="text-red-600 focus:ring-red-500"
                  />
                  <span className="text-xs font-bold">PENDING</span>
                </div>
                <span className="text-[11px] font-semibold text-red-700">Due: Rs. {totalAmount.toLocaleString('en-IN')}</span>
              </label>
            </div>

            {/* If Partial Paid: Paid Amount Input */}
            {paymentStatus === 'PARTIALLY PAID' && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-amber-900 mb-1">
                    Amount Paid by Client (Rs.) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={totalAmount}
                    value={customPaidAmount}
                    onChange={(e) => setCustomPaidAmount(e.target.value)}
                    className="w-full text-xs p-2 border border-amber-300 rounded-lg bg-white font-bold text-green-700"
                  />
                </div>
                <div>
                  <span className="block text-xs font-bold text-amber-900 mb-1">Balance Remaining Due</span>
                  <div className="text-sm font-extrabold text-red-600 p-2 bg-white rounded-lg border border-amber-200">
                    Rs. {pendingAmount.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            )}

            {/* If Paid or Partial: Payment Mode and Reference */}
            {paymentStatus !== 'PENDING' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full text-xs p-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="UPI">UPI (GPay / PhonePe / Paytm to 7874105288@ybl)</option>
                    <option value="BANK_TRANSFER">Bank Transfer (NEFT / IMPS)</option>
                    <option value="CASH">Cash</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Reference / UTR / Txn No.
                  </label>
                  <input
                    type="text"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="e.g. UTR12345678"
                    className="w-full text-xs p-2 border border-gray-300 rounded-lg bg-white"
                  />
                </div>
              </div>
            )}

            {/* Internal Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Invoice Notes (Optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. 50% advance received, balance due upon monthly review"
                className="w-full text-xs p-2 border border-gray-300 rounded-lg bg-white"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-md disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Generating Invoice...</span>
                </>
              ) : (
                <>
                  <FaCheckCircle size={14} />
                  <span>Generate & Save Invoice</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateInvoiceModal;
