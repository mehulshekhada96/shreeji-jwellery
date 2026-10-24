import mongoose from 'mongoose';

const CancelledOrderSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  sku: { type: String, required: true }, // Style Id from Excel
  quantity: { type: Number, required: true },
  email: { type: String, required: false }, // Original email from Excel
  startDate: { type: Date, required: true }, // Start date of the range
  endDate: { type: Date, required: true }, // End date of the range
  selectedDate: { type: Date, required: false }, // Selected date for consistency with SKU Inventory
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false // Optional for backward compatibility with existing records
  },
  uploadedDate: { type: Date, default: Date.now }, // When the data was uploaded
  uploadedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: false 
  },
  uploadedByName: { 
    type: String, 
    required: false 
  },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

// Index for efficient queries
CancelledOrderSchema.index({ company: 1 });
CancelledOrderSchema.index({ companyName: 1, sku: 1 });
CancelledOrderSchema.index({ startDate: -1 });
CancelledOrderSchema.index({ endDate: -1 });
CancelledOrderSchema.index({ selectedDate: -1 });
CancelledOrderSchema.index({ uploadedDate: -1 });
CancelledOrderSchema.index({ startDate: 1, endDate: 1 });
CancelledOrderSchema.index({ company: 1, isDeleted: 1 });
CancelledOrderSchema.index({ company: 1, isDeleted: 1, startDate: -1 });
CancelledOrderSchema.index({ company: 1, isDeleted: 1, selectedDate: -1 });
CancelledOrderSchema.index({ company: 1, isDeleted: 1, startDate: -1, selectedDate: -1, companyName: 1, sku: 1 });

// Clear model cache to ensure latest schema is used
if (mongoose.models.CancelledOrder) {
  delete mongoose.models.CancelledOrder;
}

export default mongoose.model('CancelledOrder', CancelledOrderSchema);

