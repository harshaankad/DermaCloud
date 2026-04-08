import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGstBreakdown {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface IPurchaseItem {
  itemId?: mongoose.Types.ObjectId;
  itemName: string;
  itemCode?: string;
  hsnCode?: string;
  pack?: string;
  batchNo?: string;
  expiryDate?: Date;
  quantity: number;
  freeQty?: number;
  mrp?: number;
  unitPrice: number;
  discount: number;
  gstRate: 0 | 5 | 12 | 18 | 28;
  total: number;
}

export interface IPurchase extends Document {
  clinicId: mongoose.Types.ObjectId;
  supplierInvNo: string;
  gstnNo?: string;
  invoiceDate: Date;
  modeOfPayment: "cash" | "credit" | "upi" | "card" | "neft";
  supplierName: string;
  city?: string;
  items: IPurchaseItem[];
  grossValue: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  gst0: IGstBreakdown;
  gst5: IGstBreakdown;
  gst12: IGstBreakdown;
  gst18: IGstBreakdown;
  gst28: IGstBreakdown;
  totalGst: number;
  adding: number;
  less: number;
  roundingAmount: number;
  netAmount: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GstBreakdownSchema = new Schema<IGstBreakdown>(
  {
    taxable: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
  },
  { _id: false }
);

const PurchaseItemSchema = new Schema<IPurchaseItem>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem" },
    itemName: { type: String, required: true, trim: true },
    itemCode: { type: String, trim: true },
    hsnCode: { type: String, trim: true },
    pack: { type: String, trim: true },
    batchNo: { type: String, trim: true },
    expiryDate: { type: Date },
    quantity: { type: Number, required: true, min: 1 },
    freeQty: { type: Number, default: 0, min: 0 },
    mrp: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    gstRate: { type: Number, enum: [0, 5, 12, 18, 28], default: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const PurchaseSchema = new Schema<IPurchase>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true },
    supplierInvNo: { type: String, required: true, trim: true },
    gstnNo: { type: String, trim: true },
    invoiceDate: { type: Date, required: true },
    modeOfPayment: {
      type: String,
      enum: ["cash", "credit", "upi", "card", "neft"],
      required: true,
    },
    supplierName: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    items: {
      type: [PurchaseItemSchema],
      required: true,
      validate: {
        validator: (items: IPurchaseItem[]) => items.length > 0,
        message: "At least one item is required",
      },
    },
    grossValue: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    cgst: { type: Number, default: 0, min: 0 },
    sgst: { type: Number, default: 0, min: 0 },
    igst: { type: Number, default: 0, min: 0 },
    gst0: { type: GstBreakdownSchema, default: () => ({}) },
    gst5: { type: GstBreakdownSchema, default: () => ({}) },
    gst12: { type: GstBreakdownSchema, default: () => ({}) },
    gst18: { type: GstBreakdownSchema, default: () => ({}) },
    gst28: { type: GstBreakdownSchema, default: () => ({}) },
    totalGst: { type: Number, default: 0 },
    adding: { type: Number, default: 0 },
    less: { type: Number, default: 0 },
    roundingAmount: { type: Number, default: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

PurchaseSchema.index({ clinicId: 1, invoiceDate: -1 });
PurchaseSchema.index({ clinicId: 1, supplierName: 1 });

const Purchase: Model<IPurchase> =
  mongoose.models.Purchase || mongoose.model<IPurchase>("Purchase", PurchaseSchema);

export default Purchase;
