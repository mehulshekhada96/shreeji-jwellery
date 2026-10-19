import mongoose from 'mongoose';

const MasterSkuSnapshotSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  historyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MasterSkuHistory',
  },
  fileName: {
    type: String,
    default: 'master_file.xlsx',
  },
  totalCount: {
    type: Number,
    default: 0,
  },
  compressedData: {
    type: Buffer,
    required: true,
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

MasterSkuSnapshotSchema.index({ company: 1, createdAt: -1 });

export default mongoose.models.MasterSkuSnapshot || mongoose.model('MasterSkuSnapshot', MasterSkuSnapshotSchema);
