import mongoose from 'mongoose';

const MasterRateSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  origin: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  imageLink: {
    type: String,
    default: '',
    trim: true,
  },
  itemRate: {
    type: Number,
    default: 0,
  },
  boxRate: {
    type: Number,
    default: 0,
  },
  boxReturnRate: {
    type: Number,
    default: 0,
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

MasterRateSchema.index({ company: 1, origin: 1 });

export default mongoose.models.MasterRate || mongoose.model('MasterRate', MasterRateSchema);
