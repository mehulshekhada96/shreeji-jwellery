import mongoose from 'mongoose';

const ReturnKeywordMappingSchema = new mongoose.Schema({
  keyword: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  category: {
    type: String,
    required: true,
    enum: ['rto', 'customer']
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

ReturnKeywordMappingSchema.index({ company: 1, keyword: 1 });
ReturnKeywordMappingSchema.index({ company: 1, isDeleted: 1 });

export default mongoose.models.ReturnKeywordMapping || mongoose.model('ReturnKeywordMapping', ReturnKeywordMappingSchema);
