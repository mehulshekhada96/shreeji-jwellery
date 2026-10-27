import mongoose from 'mongoose';

const CompanyMappingSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  // Platform: 'all', 'meesho', 'amazon', 'flipkart', 'myntra', 'snapdeal'
  platform: {
    type: String,
    default: 'all',
    trim: true,
    index: true,
  },
  // The raw company name as parsed from marketplace PDF or Excel files
  rawName: {
    type: String,
    required: true,
    trim: true,
  },
  // The standardized canonical company name to display and group under
  canonicalName: {
    type: String,
    default: '',
    required: false,
    trim: true,
  },
  // True if this is a non-company / junk name that should be hidden from company lists
  isIgnored: {
    type: Boolean,
    default: false,
    index: true,
  },
  notes: {
    type: String,
    default: '',
    trim: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
}, { timestamps: true });

// Compound indexes
CompanyMappingSchema.index({ company: 1, rawName: 1, isDeleted: 1 });
CompanyMappingSchema.index({ company: 1, platform: 1, rawName: 1, isDeleted: 1 });
CompanyMappingSchema.index({ company: 1, canonicalName: 1 });
CompanyMappingSchema.index({ company: 1, isIgnored: 1 });

if (mongoose.models.CompanyMapping) {
  delete mongoose.models.CompanyMapping;
}

export default mongoose.models.CompanyMapping || mongoose.model('CompanyMapping', CompanyMappingSchema);
