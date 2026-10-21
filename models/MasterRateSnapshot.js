import mongoose from 'mongoose';

const MasterRateSnapshotSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  historyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MasterRateHistory',
  },
  fileName: {
    type: String,
    default: 'master_rate_file.xlsx',
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

MasterRateSnapshotSchema.index({ company: 1, createdAt: -1 });

export default mongoose.models.MasterRateSnapshot || mongoose.model('MasterRateSnapshot', MasterRateSnapshotSchema);
