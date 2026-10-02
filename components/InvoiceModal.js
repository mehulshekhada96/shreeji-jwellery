import React from 'react';
import moment from 'moment-timezone';
import { FaTimes, FaDownload, FaPrint, FaCheckCircle, FaExclamationCircle, FaClock } from 'react-icons/fa';
import { generateInvoicePDF, formatCurrency } from '../utils/invoicePdfGenerator';

const InvoiceModal = ({ invoice, isOpen, onClose }) => {
  if (!isOpen || !invoice) return null;

  const handleDownload = () => {
    generateInvoicePDF(invoice, true);
  };

  const handlePrint = () => {
    window.print();
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300">
            <FaCheckCircle className="text-green-600" /> FULL PAID
          </span>
        );
      case 'PARTIALLY PAID':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <FaClock className="text-amber-600" /> PARTIALLY PAID
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300">
            <FaExclamationCircle className="text-red-600" /> PENDING
          </span>
        );
    }
  };

  return (
    <div
      id="invoice-modal-overlay"
      className="invoice-modal-overlay fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-60 flex items-center justify-center p-4 print:p-0 print:static print:bg-white print:overflow-visible"
    >
      <div
        id="invoice-modal-card"
        className="invoice-modal-card bg-white rounded-xl shadow-2xl max-w-4xl w-full overflow-hidden border border-gray-200 animate-fadeIn print:shadow-none print:border-none print:max-w-none print:w-full print:rounded-none print:overflow-visible"
      >
        {/* Modal Top Actions */}
        <div className="no-print bg-gray-900 px-6 py-4 flex items-center justify-between text-white print:hidden">
          <div className="flex items-center space-x-3">
            <span className="text-lg font-semibold tracking-wide">Invoice Preview</span>
            <span className="text-sm bg-gray-800 text-blue-400 px-2.5 py-0.5 rounded border border-gray-700">
              {invoice.invoiceNumber}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition shadow cursor-pointer"
            >
              <FaDownload size={13} />
              <span>Download PDF</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition cursor-pointer"
            >
              <FaPrint size={13} />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition cursor-pointer"
              title="Close"
            >
              <FaTimes size={18} />
            </button>
          </div>
        </div>

        {/* Printable/Preview Invoice Sheet */}
        <div
          id="printable-invoice-sheet"
          className="invoice-modal-sheet p-8 max-h-[80vh] overflow-y-auto print:p-0 print:overflow-visible print:max-h-none bg-white"
        >
          {/* Top Brand & Invoice Header */}
          <div className="flex flex-col sm:flex-row print:flex-row justify-between items-start pb-6 border-b border-gray-200 gap-4">
            <div className="flex items-start gap-4">
              <img
                src="/images/tech-shekhada-logo.jpg"
                alt="Tech Shekhada"
                className="w-20 h-20 rounded-lg object-cover shadow-sm border border-gray-200"
              />
              <div>
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">TECH SHEKHADA</h1>
                <p className="text-xs text-gray-700 mt-1 font-semibold">
                  Mehul Shekhada <span className="font-normal text-gray-500">| +91 7874105288</span>
                </p>
                <p className="text-xs text-gray-600">438, Prime Arcade, Lajamni Chowk, Mota Varachha, Surat - 394101</p>
                <p className="text-xs text-blue-700 font-medium mt-0.5">UPI ID: 7874105288@ybl</p>
              </div>
            </div>

            <div className="sm:text-right print:text-right">
              <span className="text-3xl font-black text-blue-900 tracking-wide block">INVOICE</span>
              <p className="text-sm font-semibold text-gray-800 mt-1"># {invoice.invoiceNumber}</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Date: {moment(invoice.invoiceDate).format('DD MMM YYYY')}
              </p>
              {invoice.dueDate && (
                <p className="text-xs text-gray-600">
                  Due Date: <span className="font-medium text-gray-800">{moment(invoice.dueDate).format('DD MMM YYYY')}</span>
                </p>
              )}
              {invoice.billingCycle && (
                <span className="inline-block mt-2 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-semibold uppercase tracking-wider">
                  {invoice.billingCycle} PLAN
                </span>
              )}
            </div>
          </div>

          {/* Bill To & Status Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 print:grid-cols-3 gap-6 my-6">
            <div className="md:col-span-2 print:col-span-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Billed To</h3>
              <p className="text-base font-bold text-gray-900">{invoice.companyName}</p>
              {invoice.clientContactPerson && (
                <p className="text-xs text-gray-700 mt-0.5">Attn: {invoice.clientContactPerson}</p>
              )}
              <p className="text-xs text-gray-700 mt-0.5 font-medium">Mobile: {invoice.clientMobile}</p>
              {invoice.clientEmail && (
                <p className="text-xs text-gray-600 mt-0.5">Email: {invoice.clientEmail}</p>
              )}
              {invoice.clientAddress && (
                <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{invoice.clientAddress}</p>
              )}
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Status</h3>
                <div className="mb-3">{getStatusBadge(invoice.paymentStatus)}</div>
              </div>

              <div className="border-t border-gray-200 pt-3 space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Paid:</span>
                  <span className="font-semibold text-green-700">{formatCurrency(invoice.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Balance Due:</span>
                  <span className={`font-semibold ${invoice.pendingAmount > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                    {formatCurrency(invoice.pendingAmount)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Service Period Notice */}
          {(invoice.servicePeriod?.from || invoice.servicePeriod?.to) && (
            <div className="mb-4 text-xs text-gray-500 bg-blue-50 px-3 py-1.5 rounded border border-blue-100 flex items-center gap-2">
              <span className="font-semibold text-blue-900">Service Validity:</span>
              <span>
                {invoice.servicePeriod?.from ? moment(invoice.servicePeriod.from).format('DD MMM YYYY') : 'Start'} to{' '}
                {invoice.servicePeriod?.to ? moment(invoice.servicePeriod.to).format('DD MMM YYYY') : 'Ongoing'}
              </span>
            </div>
          )}

          {/* Feature Items Table */}
          <div className="overflow-x-auto my-4 border border-gray-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-blue-900 text-white uppercase text-[11px] font-semibold tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4">Feature / Module Description</th>
                  <th className="py-3 px-4 text-center">Pricing Cycle</th>
                  <th className="py-3 px-4 text-right">Price</th>
                  <th className="py-3 px-4 text-right">Discount</th>
                  <th className="py-3 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {(invoice.items || []).map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-center text-gray-500">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-gray-900 block">{item.featureName}</span>
                      {item.description && (
                        <span className="text-gray-500 text-[11px]">{item.description}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px] font-semibold uppercase">
                        {item.billingCycle || 'MONTHLY'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-gray-800">
                      {formatCurrency(item.price)}
                    </td>
                    <td className="py-3 px-4 text-right text-red-600 font-medium">
                      {item.discount > 0 ? `- ${formatCurrency(item.discount)}` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-gray-900">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Grid: Payment Info + Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-6 my-6 items-start">
            {/* Payment Instructions (UPI Box) */}
            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
              <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-2">
                UPI Payment Details
              </h4>
              <p className="text-xs text-gray-700">
                You can pay quickly and directly via any UPI app:
              </p>
              <div className="mt-3 flex items-center gap-3">
                <img
                  src="/images/tech-shekhada-qr.jpg"
                  alt="UPI PhonePe QR"
                  className="w-20 h-20 rounded-lg object-contain shadow-sm border border-gray-300 bg-white p-1"
                />
                <div>
                  <p className="text-xs text-gray-500">Pay to UPI ID:</p>
                  <p className="text-sm font-extrabold text-blue-900 bg-white px-2.5 py-1 rounded border border-blue-200 inline-block mt-0.5">
                    7874105288@ybl
                  </p>
                  <p className="text-[11px] text-gray-700 font-semibold mt-1">Account: Mehul Kanjibhai Shekhada</p>
                  <p className="text-[10px] text-gray-500">Accepted on PhonePe, GPay, Paytm, BHIM</p>
                </div>
              </div>
            </div>

            {/* Totals Summary */}
            <div className="space-y-2 text-xs bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div className="flex justify-between text-gray-600 py-1">
                <span>Subtotal:</span>
                <span className="font-semibold text-gray-900">{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600 py-1">
                <span>Discount:</span>
                <span className="font-semibold text-red-600">
                  {invoice.discountTotal > 0 ? `- ${formatCurrency(invoice.discountTotal)}` : 'Rs. 0.00'}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm font-bold text-white bg-blue-900 px-3 py-2 rounded-lg my-2">
                <span>Total Amount:</span>
                <span>{formatCurrency(invoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-gray-600 py-1 border-t border-gray-200">
                <span>Amount Paid:</span>
                <span className="font-semibold text-green-700">{formatCurrency(invoice.paidAmount)}</span>
              </div>
              <div className="flex justify-between text-gray-700 py-1 font-bold">
                <span>Balance Due:</span>
                <span className={invoice.pendingAmount > 0 ? 'text-red-600' : 'text-gray-900'}>
                  {formatCurrency(invoice.pendingAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment History if exists */}
          {invoice.paymentHistory && invoice.paymentHistory.length > 0 && (
            <div className="my-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <h5 className="text-[11px] font-bold text-gray-600 uppercase mb-2">Payment Transaction History</h5>
              <div className="space-y-1.5">
                {invoice.paymentHistory.map((ph, pIdx) => (
                  <div key={pIdx} className="flex justify-between items-center text-xs text-gray-600 bg-white p-2 rounded border border-gray-100">
                    <span>
                      {moment(ph.paymentDate).format('DD MMM YYYY, hh:mm A')} — Mode:{' '}
                      <span className="font-semibold text-gray-800">{ph.paymentMode}</span>
                      {ph.referenceNo && ` (Ref: ${ph.referenceNo})`}
                    </span>
                    <span className="font-bold text-green-700">+{formatCurrency(ph.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Terms & Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200 flex flex-col sm:flex-row print:flex-row justify-between items-end gap-4 text-xs text-gray-500">
            <div className="space-y-1">
              <p className="font-semibold text-gray-700">Terms & Conditions:</p>
              <p>{invoice.terms || 'Subscription is subject to timely payment as per agreed terms.'}</p>
              <p>Subject to Surat, Gujarat jurisdiction. This is a computer generated invoice.</p>
            </div>
            <div className="text-right print:text-right">
              <p className="font-bold text-gray-900">For TECH SHEKHADA</p>
              <p className="text-xs font-semibold text-gray-800 mt-1">Mehul Shekhada</p>
              <div className="h-8"></div>
              <p className="text-[11px] text-gray-500 border-t border-gray-300 pt-1">Authorized Signatory</p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="no-print bg-gray-50 px-6 py-3 border-t border-gray-200 flex justify-end print:hidden">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-semibold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          /* Reset root layout for clean page printing */
          html, body {
            height: auto !important;
            min-height: 100% !important;
            overflow: visible !important;
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Hide all other body/app elements outside Next.js */
          body > *:not(#__next),
          nav, header, aside, footer, #navbar, .sidebar, .sidebar-submenu {
            display: none !important;
          }

          /* Hide everything in DOM by default when printing */
          body * {
            visibility: hidden;
          }

          /* Unhide ONLY the invoice modal and its contents */
          .invoice-modal-overlay,
          .invoice-modal-overlay * {
            visibility: visible;
          }

          /* Strip modal backdrop styling, make clean white container */
          .invoice-modal-overlay {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 100% !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            display: block !important;
            z-index: 999999 !important;
          }

          /* Remove modal card boundaries/shadows */
          .invoice-modal-card {
            position: static !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }

          /* Printable invoice sheet takes standard margins */
          .invoice-modal-sheet {
            max-height: none !important;
            overflow: visible !important;
            padding: 6mm 10mm !important;
            margin: 0 !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }

          /* Hide header buttons and footer close button */
          .no-print,
          .no-print * {
            display: none !important;
          }

          /* Retain background colors for table header, badges, borders */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          @page {
            size: A4 portrait;
            margin: 6mm;
          }
        }
      `}</style>
    </div>
  );
};

export default InvoiceModal;
