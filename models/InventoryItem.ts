import mongoose, { Schema, Document, Model } from "mongoose";

export interface IInventoryItem extends Document {
  itemCode: string;
  name: string;
  genericName?: string;
  category: "medicine" | "cream" | "lotion" | "supplement" | "equipment" | "consumable" | "other";
  type: "prescription" | "otc"; // over-the-counter
  clinicId: mongoose.Types.ObjectId;
  currentStock: number;
  minStockLevel: number;
  maxStockLevel?: number;
  unit: "tablets" | "capsules" | "ml" | "units" | "tubes" | "bottles" | "pieces" | "grams";
  costPrice: number;
  sellingPrice: number;
  manufacturer?: string;
  batchNumber?: string;
  expiryDate?: Date;
  location?: string; // shelf/rack
  description?: string;
  status: "active" | "discontinued" | "out-of-stock";
  createdAt: Date;
  updatedAt: Date;
}

const InventoryItemSchema = new Schema<IInventoryItem>(
  {
    itemCode: {
      type: String,
    },
    name: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
    },
    genericName: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ["medicine", "cream", "lotion", "supplement", "equipment", "consumable", "other"],
      required: [true, "Category is required"],
    },
    type: {
      type: String,
      enum: ["prescription", "otc"],
      default: "otc",
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: [true, "Clinic is required"],
    },
    currentStock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Stock cannot be negative"],
    },
    minStockLevel: {
      type: Number,
      required: true,
      default: 10,
      min: [0, "Minimum stock level cannot be negative"],
    },
    maxStockLevel: {
      type: Number,
      min: [0, "Maximum stock level cannot be negative"],
    },
    unit: {
      type: String,
      enum: ["tablets", "capsules", "ml", "units", "tubes", "bottles", "pieces", "grams"],
      required: [true, "Unit is required"],
    },
    costPrice: {
      type: Number,
      required: [true, "Cost price is required"],
      min: [0, "Cost price cannot be negative"],
    },
    sellingPrice: {
      type: Number,
      required: [true, "Selling price is required"],
      min: [0, "Selling price cannot be negative"],
    },
    manufacturer: {
      type: String,
      trim: true,
    },
    batchNumber: {
      type: String,
      trim: true,
    },
    expiryDate: {
      type: Date,
    },
    location: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "discontinued", "out-of-stock"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate itemCode before saving
InventoryItemSchema.pre("save", async function (next) {
  if (!this.itemCode) {
    const prefix = this.category === "medicine" ? "MED" : "PROD";
    // Use timestamp + random suffix for guaranteed uniqueness
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.itemCode = `${prefix}-${timestamp}${random}`;
  }

  // Update status based on stock
  if (this.currentStock === 0) {
    this.status = "out-of-stock";
  } else if (this.status === "out-of-stock" && this.currentStock > 0) {
    this.status = "active";
  }

  next();
});

// Indexes for faster queries
InventoryItemSchema.index({ clinicId: 1, itemCode: 1 }, { unique: true });
InventoryItemSchema.index({ name: "text", genericName: "text" });
InventoryItemSchema.index({ category: 1 });
InventoryItemSchema.index({ status: 1 });
InventoryItemSchema.index({ currentStock: 1, minStockLevel: 1 }); // For low stock alerts
InventoryItemSchema.index({ expiryDate: 1 }); // For expiry alerts

const InventoryItem: Model<IInventoryItem> =
  mongoose.models.InventoryItem ||
  mongoose.model<IInventoryItem>("InventoryItem", InventoryItemSchema);

export default InventoryItem;
