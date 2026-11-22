import mongoose from 'mongoose';

const ReturnOrderSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  sku: { type: String, required: true },
  quantity: { type: Number, required: true },
  email: { type: String, required: false },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  selectedDate: { type: Date, required: false },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false
  },
  uploadedDate: { type: Date, default: Date.now },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  uploadedByName: {
    type: String,
    required: false
  },
  platform: {
    type: String,
    index: true,
    default: 'meesho'
  },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

ReturnOrderSchema.index({ company: 1 });
ReturnOrderSchema.index({ companyName: 1, sku: 1 });
ReturnOrderSchema.index({ startDate: -1 });
ReturnOrderSchema.index({ endDate: -1 });
ReturnOrderSchema.index({ selectedDate: -1 });
ReturnOrderSchema.index({ uploadedDate: -1 });
ReturnOrderSchema.index({ startDate: 1, endDate: 1 });
ReturnOrderSchema.index({ company: 1, isDeleted: 1 });
ReturnOrderSchema.index({ company: 1, isDeleted: 1, startDate: -1, selectedDate: -1, companyName: 1, sku: 1 });

if (mongoose.models.ReturnOrder) {
  delete mongoose.models.ReturnOrder;
}

export default mongoose.model('ReturnOrder', ReturnOrderSchema);
