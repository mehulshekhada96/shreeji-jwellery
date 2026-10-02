import mongoose from 'mongoose';

const InvoiceItemSchema = new mongoose.Schema({
  featureName: { type: String, required: true },
  description: { type: String, default: '' },
  billingCycle: { 
    type: String, 
    enum: ['MONTHLY', 'YEARLY', 'ONE_TIME'], 
    default: 'MONTHLY' 
  },
  price: { type: Number, required: true, default: 0 },
  quantity: { type: Number, default: 1 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true, default: 0 },
});

const PaymentRecordSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  paymentDate: { type: Date, default: Date.now },
  paymentMode: { 
    type: String, 
    enum: ['UPI', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'OTHER'], 
    default: 'UPI' 
  },
  referenceNo: { type: String, default: '' }, // e.g., UTR / Transaction ID
  notes: { type: String, default: '' },
});

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    companyName: { type: String, required: true },
    clientMobile: { type: String, required: true },
    clientAddress: { type: String, default: '' },
    clientEmail: { type: String, default: '' },
    clientContactPerson: { type: String, default: '' },
    invoiceDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    billingCycle: { 
      type: String, 
      enum: ['MONTHLY', 'YEARLY', 'CUSTOM'], 
      default: 'MONTHLY' 
    },
    servicePeriod: {
      from: { type: Date },
      to: { type: Date },
    },
    items: [InvoiceItemSchema],
    subtotal: { type: Number, required: true, default: 0 },
    discountTotal: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 },
    paidAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ['PAID', 'PENDING', 'PARTIALLY PAID'],
      default: 'PENDING',
    },
    paymentHistory: [PaymentRecordSchema],
    provider: {
      companyName: { type: String, default: 'Tech Shekhada' },
      name: { type: String, default: 'Mehul Shekhada' },
      accountHolder: { type: String, default: 'Mehul Kanjibhai Shekhada' },
      mobile: { type: String, default: '7874105288' },
      address: { type: String, default: '438, Prime Arcade, Lajamni Chowk, Mota Varachha, Surat.' },
      upiId: { type: String, default: '7874105288@ybl' },
    },
    notes: { type: String, default: '' },
    terms: { 
      type: String, 
      default: 'Thank you for choosing Tech Shekhada! All software access is subject to timely payment as per agreed terms.' 
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);
