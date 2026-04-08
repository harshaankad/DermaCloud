import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGstBreakdown {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface ISaleItem {
  itemId: mongoose.Types.ObjectId;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstRate: 0 | 5 | 12 | 18 | 28;
  total: number;
  hsnCode?: string;
  packing?: string;
  manufacturer?: string;
  batchNo?: string;
  expiryDate?: Date;
}

export interface ISale extends Document {
  saleId: string;
  clinicId: mongoose.Types.ObjectId;
  patientId?: mongoose.Types.ObjectId;
  patientName: string;
  patientPhone?: string;
  consultationId?: mongoose.Types.ObjectId;
  appointmentId?: mongoose.Types.ObjectId;
  items: ISaleItem[];
  subtotal: number;
  discountAmount: number;
  discountPercentage: number;
  taxAmount: number;
  taxPercentage: number;
  totalAmount: number;
  paymentMethod: "cash" | "card" | "upi" | "insurance" | "credit";
  paymentStatus: "paid" | "pending" | "partial" | "refunded";
  amountPaid: number;
  amountDue: number;
  soldBy: {
    id: mongoose.Types.ObjectId;
    name: string;
    role: "doctor" | "frontdesk";
  };
  notes?: string;
  invoiceNumber?: string;
  city?: string;
  grossValue: number;
  gst0: IGstBreakdown;
  gst5: IGstBreakdown;
  gst12: IGstBreakdown;
  gst18: IGstBreakdown;
  gst28: IGstBreakdown;
  totalGst: number;
  roundingAmount: number;
  doctorName?: string;
  invoiceDate?: Date;
  isInterstate: boolean;
  igst: number;
  clinicAddress?: string;
  clinicPhone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SaleItemSchema = new Schema<ISaleItem>(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
    },
    itemCode: {
      type: String,
      required: true,
    },
    itemName: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, "Unit price cannot be negative"],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
    },
    gstRate: {
      type: Number,
      enum: [0, 5, 12, 18, 28],
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      min: [0, "Total cannot be negative"],
    },
    hsnCode: { type: String, trim: true },
    packing: { type: String, trim: true },
    manufacturer: { type: String, trim: true },
    batchNo: { type: String, trim: true },
    expiryDate: { type: Date },
  },
  { _id: false }
);

const GstBreakdownSchema = new Schema<IGstBreakdown>(
  {
    taxable: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
  },
  { _id: false }
);

const SaleSchema = new Schema<ISale>(
  {
    saleId: {
      type: String,
      unique: true,
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: [true, "Clinic is required"],
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
    },
    patientName: {
      type: String,
      required: [true, "Patient/Customer name is required"],
      trim: true,
    },
    patientPhone: {
      type: String,
      trim: true,
    },
    consultationId: {
      type: Schema.Types.ObjectId,
      ref: "ConsultationDermatology",
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: "Appointment",
    },
    items: {
      type: [SaleItemSchema],
      required: true,
      validate: {
        validator: function (items: ISaleItem[]) {
          return items.length > 0;
        },
        message: "At least one item is required",
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0, "Subtotal cannot be negative"],
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: [0, "Discount amount cannot be negative"],
    },
    discountPercentage: {
      type: Number,
      default: 0,
      min: [0, "Discount percentage cannot be negative"],
      max: [100, "Discount percentage cannot exceed 100"],
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: [0, "Tax amount cannot be negative"],
    },
    taxPercentage: {
      type: Number,
      default: 0,
      min: [0, "Tax percentage cannot be negative"],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, "Total amount cannot be negative"],
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "upi", "insurance", "credit"],
      required: [true, "Payment method is required"],
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "pending", "partial", "refunded"],
      default: "paid",
    },
    amountPaid: {
      type: Number,
      required: true,
      min: [0, "Amount paid cannot be negative"],
    },
    amountDue: {
      type: Number,
      default: 0,
      min: [0, "Amount due cannot be negative"],
    },
    soldBy: {
      id: {
        type: Schema.Types.ObjectId,
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      role: {
        type: String,
        enum: ["doctor", "frontdesk"],
        required: true,
      },
    },
    notes: {
      type: String,
      trim: true,
    },
    invoiceNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    city: { type: String, trim: true },
    grossValue: { type: Number, default: 0, min: 0 },
    gst0: { type: GstBreakdownSchema, default: () => ({}) },
    gst5: { type: GstBreakdownSchema, default: () => ({}) },
    gst12: { type: GstBreakdownSchema, default: () => ({}) },
    gst18: { type: GstBreakdownSchema, default: () => ({}) },
    gst28: { type: GstBreakdownSchema, default: () => ({}) },
    totalGst: { type: Number, default: 0 },
    roundingAmount: { type: Number, default: 0 },
    doctorName: { type: String, trim: true },
    invoiceDate: { type: Date },
    isInterstate: { type: Boolean, default: false },
    igst: { type: Number, default: 0 },
    clinicAddress: { type: String, trim: true },
    clinicPhone: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

// Auto-generate saleId and invoiceNumber before saving
SaleSchema.pre("save", async function (next) {
  if (!this.saleId) {
    const count = await mongoose.models.Sale.countDocuments();
    this.saleId = `SALE-${String(count + 1).padStart(6, "0")}`;
  }

  if (!this.invoiceNumber) {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const todayCount = await mongoose.models.Sale.countDocuments({
      createdAt: {
        $gte: new Date(today.setHours(0, 0, 0, 0)),
        $lt: new Date(today.setHours(23, 59, 59, 999)),
      },
    });
    this.invoiceNumber = `INV-${dateStr}-${String(todayCount + 1).padStart(4, "0")}`;
  }

  next();
});

// Indexes for faster queries
SaleSchema.index({ clinicId: 1 });
SaleSchema.index({ patientId: 1 });
SaleSchema.index({ createdAt: -1 });
SaleSchema.index({ paymentStatus: 1 });
SaleSchema.index({ "soldBy.id": 1 });

const Sale: Model<ISale> =
  mongoose.models.Sale || mongoose.model<ISale>("Sale", SaleSchema);

export default Sale;
