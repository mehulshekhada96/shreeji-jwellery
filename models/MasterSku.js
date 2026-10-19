import mongoose from 'mongoose';

const MasterSkuSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  sku: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  origin: {
    type: String,
    default: '',
    trim: true,
  },
  size: {
    type: String,
    default: '',
    trim: true,
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  lastModifiedByName: {
    type: String,
    default: '',
  },
}, { timestamps: true });

MasterSkuSchema.index({ company: 1, sku: 1 });

export default mongoose.models.MasterSku || mongoose.model('MasterSku', MasterSkuSchema);
