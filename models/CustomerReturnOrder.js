import mongoose from 'mongoose';

const CustomerReturnOrderSchema = new mongoose.Schema({
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

CustomerReturnOrderSchema.index({ company: 1 });
CustomerReturnOrderSchema.index({ companyName: 1, sku: 1 });
CustomerReturnOrderSchema.index({ startDate: -1 });
CustomerReturnOrderSchema.index({ endDate: -1 });
CustomerReturnOrderSchema.index({ selectedDate: -1 });
CustomerReturnOrderSchema.index({ uploadedDate: -1 });
CustomerReturnOrderSchema.index({ startDate: 1, endDate: 1 });
CustomerReturnOrderSchema.index({ company: 1, isDeleted: 1 });
CustomerReturnOrderSchema.index({ company: 1, isDeleted: 1, startDate: -1, selectedDate: -1, companyName: 1, sku: 1 });

if (mongoose.models.CustomerReturnOrder) {
  delete mongoose.models.CustomerReturnOrder;
}

export default mongoose.model('CustomerReturnOrder', CustomerReturnOrderSchema);
