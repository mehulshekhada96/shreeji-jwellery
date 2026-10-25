import mongoose from 'mongoose';

const DabbiSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  imageUrl: {
    type: String,
    default: '',
    trim: true,
  },
  boxRate: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  boxReturnRate: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  size: {
    type: String,
    default: '',
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  rateHistory: [
    {
      effectiveFrom: {
        type: Date,
        required: true,
      },
      effectiveTo: {
        type: Date,
        default: null,
      },
      boxRate: {
        type: Number,
        default: 0,
      },
      boxReturnRate: {
        type: Number,
        default: 0,
      },
      changedAt: {
        type: Date,
        default: Date.now,
      },
      changedByName: {
        type: String,
        default: '',
      },
      note: {
        type: String,
        default: '',
      },
    }
  ],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdByName: {
    type: String,
    default: '',
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

DabbiSchema.index({ company: 1, name: 1 });

export default mongoose.models.Dabbi || mongoose.model('Dabbi', DabbiSchema);
