import mongoose from 'mongoose';

const MasterRateHistorySchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  action: {
    type: String,
    enum: ['UPLOAD', 'ADD', 'EDIT', 'DELETE', 'CLEAR_ALL', 'RESTORE_SNAPSHOT'],
    required: true,
  },
  description: {
    type: String,
    default: '',
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

MasterRateHistorySchema.index({ company: 1, createdAt: -1 });

export default mongoose.models.MasterRateHistory || mongoose.model('MasterRateHistory', MasterRateHistorySchema);
