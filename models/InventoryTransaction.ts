import mongoose, { Schema, Document, Model } from "mongoose";

export interface IInventoryTransaction extends Document {
  transactionId: string;
  itemId: mongoose.Types.ObjectId;
  clinicId: mongoose.Types.ObjectId;
  type: "stock-in" | "stock-out" | "adjustment" | "expired" | "damaged" | "return";
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  referenceType?: "sale" | "purchase" | "purchase-return" | "sales-return" | "manual";
  referenceId?: mongoose.Types.ObjectId;
  batchNumber?: string;
  expiryDate?: Date;
  costPrice?: number;
  performedBy: {
    id: mongoose.Types.ObjectId;
    name: string;
    role: "doctor" | "frontdesk";
  };
  createdAt: Date;
}

const InventoryTransactionSchema = new Schema<IInventoryTransaction>(
  {
    transactionId: {
      type: String,
      unique: true,
    },
    itemId: {
      type: Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: [true, "Item is required"],
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: [true, "Clinic is required"],
    },
    type: {
      type: String,
      enum: ["stock-in", "stock-out", "adjustment", "expired", "damaged", "return", "new-item"],
      required: [true, "Transaction type is required"],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
    },
    previousStock: {
      type: Number,
      required: true,
    },
    newStock: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: [true, "Reason is required"],
      trim: true,
    },
    referenceType: {
      type: String,
      enum: ["sale", "purchase", "purchase-return", "sales-return", "manual"],
    },
    referenceId: {
      type: Schema.Types.ObjectId,
    },
    batchNumber: {
      type: String,
      trim: true,
    },
    expiryDate: {
      type: Date,
    },
    costPrice: {
      type: Number,
      min: [0, "Cost price cannot be negative"],
    },
    performedBy: {
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
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Auto-generate transactionId before saving
InventoryTransactionSchema.pre("save", async function (next) {
  if (!this.transactionId) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.transactionId = `TXN-${timestamp}${random}`;
  }
  next();
});

// Indexes for faster queries
InventoryTransactionSchema.index({ itemId: 1 });
InventoryTransactionSchema.index({ clinicId: 1 });
InventoryTransactionSchema.index({ type: 1 });
InventoryTransactionSchema.index({ createdAt: -1 });
InventoryTransactionSchema.index({ referenceId: 1 });

const InventoryTransaction: Model<IInventoryTransaction> =
  mongoose.models.InventoryTransaction ||
  mongoose.model<IInventoryTransaction>("InventoryTransaction", InventoryTransactionSchema);

export default InventoryTransaction;
