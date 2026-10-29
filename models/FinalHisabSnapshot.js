import mongoose from 'mongoose';

const FinalHisabSnapshotSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  // Key to uniquely identify the scope: sorted list of normalized company names (or empty for all)
  scopeKey: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  isMultiCompany: {
    type: Boolean,
    default: false,
  },
  selectedCompanies: [
    {
      type: String,
      trim: true,
    }
  ],
  companyTitle: {
    type: String,
    default: '',
    trim: true,
  },
  // Date period for which this hisab was prepared
  startDate: {
    type: String,
    required: true,
  },
  endDate: {
    type: String,
    required: true,
  },
  // Calculated figures
  grossInventoryAmount: {
    type: Number,
    default: 0,
  },
  inventoryAmount: {
    type: Number,
    default: 0,
  },
  printCharge: {
    type: Number,
    default: 0,
  },
  printRate: {
    type: Number,
    default: 2.4,
  },
  totalReturnsAmount: {
    type: Number,
    default: 0,
  },
  returnsAmount: {
    type: Number,
    default: 0,
  },
  customerReturnsAmount: {
    type: Number,
    default: 0,
  },
  cancelledAmount: {
    type: Number,
    default: 0,
  },
  // User input amounts
  prevBalance: {
    type: Number,
    default: 0,
  },
  expenses: {
    type: Number,
    default: 0,
  },
  withdrawals: {
    type: Number,
    default: 0,
  },
  // Final calculated goods payable (આગળના હિસાબમાં લેવાના થતાં રૂ.)
  finalPayable: {
    type: Number,
    default: 0,
    required: true,
  },
  // Balance Sheet / Profit side inputs
  bankBalance: {
    type: Number,
    default: 0,
  },
  meeshoPending: {
    type: Number,
    default: 0,
  },
  companyBankBalances: {
    type: Map,
    of: Number,
    default: {},
  },
  companyPendingAmounts: {
    type: Map,
    of: Number,
    default: {},
  },
  companyPersonalEntry: {
    type: Number,
    default: 0,
  },
  mainCompanyPersonalEntry: {
    type: Number,
    default: 0,
  },
  netProfit: {
    type: Number,
    default: 0,
  },
  note: {
    type: String,
    default: '',
    trim: true,
  },
  savedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  savedByName: {
    type: String,
    default: '',
  },
}, { timestamps: true });

FinalHisabSnapshotSchema.index({ company: 1, scopeKey: 1, endDate: -1, createdAt: -1 });

export default mongoose.models.FinalHisabSnapshot || mongoose.model('FinalHisabSnapshot', FinalHisabSnapshotSchema);

