import mongoose from 'mongoose';

const MasterSkuHistorySchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  action: {
    type: String,
    enum: ['UPLOAD', 'ADD', 'EDIT', 'DELETE'],
    required: true,
  },
  sku: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    required: true,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  performedByName: {
    type: String,
    default: '',
  },
}, { timestamps: true });

MasterSkuHistorySchema.index({ company: 1, createdAt: -1 });

export default mongoose.models.MasterSkuHistory || mongoose.model('MasterSkuHistory', MasterSkuHistorySchema);
