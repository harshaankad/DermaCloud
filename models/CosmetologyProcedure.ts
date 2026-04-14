import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICosmetologyProcedure extends Document {
  clinicId: mongoose.Types.ObjectId;
  name: string;
  category: "laser" | "peel" | "injectable" | "facial" | "body" | "hair" | "skin" | "other";
  basePrice: number;
  gstRate: number;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CosmetologyProcedureSchema = new Schema<ICosmetologyProcedure>(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Procedure name is required"],
      trim: true,
    },
    category: {
      type: String,
      enum: ["laser", "peel", "injectable", "facial", "body", "hair", "skin", "other"],
      required: [true, "Category is required"],
    },
    basePrice: {
      type: Number,
      required: [true, "Base price is required"],
      min: [0, "Price cannot be negative"],
    },
    gstRate: {
      type: Number,
      default: 0,
      min: [0, "GST rate cannot be negative"],
      max: [100, "GST rate cannot exceed 100"],
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

CosmetologyProcedureSchema.index({ clinicId: 1, isActive: 1 });
CosmetologyProcedureSchema.index({ clinicId: 1, name: 1 }, { unique: true });
CosmetologyProcedureSchema.index({ name: "text" });

const CosmetologyProcedure: Model<ICosmetologyProcedure> =
  mongoose.models.CosmetologyProcedure ||
  mongoose.model<ICosmetologyProcedure>("CosmetologyProcedure", CosmetologyProcedureSchema);

export default CosmetologyProcedure;
