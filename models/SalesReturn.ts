import mongoose, { Schema, Document, Model } from "mongoose";
import { IGstBreakdown } from "./Purchase";

export interface ISalesReturnItem {
  itemId?: mongoose.Types.ObjectId;
  itemName: string;
  itemCode?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstRate: number;
  total: number;
  restock: boolean;
}

export interface ISalesReturn extends Document {
  clinicId: mongoose.Types.ObjectId;
  originalSaleId?: mongoose.Types.ObjectId;
  invoiceNo: string;
  invoiceDate: Date;
  modeOfPayment: "cash" | "card" | "upi" | "credit";
  partyName: string;
  city?: string;
  items: ISalesReturnItem[];
  grossValue: number;
  discount: number;
  gst0: IGstBreakdown;
  gst5: IGstBreakdown;
  gst12: IGstBreakdown;
  gst18: IGstBreakdown;
  gst28: IGstBreakdown;
  totalGst: number;
  roundingAmount: number;
  netAmount: number;
  reason?: string;
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

const SalesReturnItemSchema = new Schema<ISalesReturnItem>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem" },
    itemName: { type: String, required: true, trim: true },
    itemCode: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    gstRate: { type: Number, default: 0 },
    total: { type: Number, required: true, min: 0 },
    restock: { type: Boolean, default: false },
  },
  { _id: false }
);

const SalesReturnSchema = new Schema<ISalesReturn>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true },
    originalSaleId: { type: Schema.Types.ObjectId, ref: "Sale" },
    invoiceNo: { type: String, required: true, trim: true },
    invoiceDate: { type: Date, required: true },
    modeOfPayment: {
      type: String,
      enum: ["cash", "card", "upi", "credit"],
      required: true,
    },
    partyName: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    items: {
      type: [SalesReturnItemSchema],
      required: true,
      validate: {
        validator: (items: ISalesReturnItem[]) => items.length > 0,
        message: "At least one item is required",
      },
    },
    grossValue: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    gst0: { type: GstBreakdownSchema, default: () => ({}) },
    gst5: { type: GstBreakdownSchema, default: () => ({}) },
    gst12: { type: GstBreakdownSchema, default: () => ({}) },
    gst18: { type: GstBreakdownSchema, default: () => ({}) },
    gst28: { type: GstBreakdownSchema, default: () => ({}) },
    totalGst: { type: Number, default: 0 },
    roundingAmount: { type: Number, default: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

SalesReturnSchema.index({ clinicId: 1, invoiceDate: -1 });

const SalesReturn: Model<ISalesReturn> =
  mongoose.models.SalesReturn ||
  mongoose.model<ISalesReturn>("SalesReturn", SalesReturnSchema);

export default SalesReturn;
