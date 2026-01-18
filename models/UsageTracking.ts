import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUsageTracking extends Document {
  userId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD format
  dailyScans: number;
  monthlyScans: number;
  lastScanAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UsageTrackingSchema = new Schema<IUsageTracking>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"],
    },
    dailyScans: {
      type: Number,
      default: 0,
      min: 0,
    },
    monthlyScans: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastScanAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique tracking per user per day
UsageTrackingSchema.index({ userId: 1, date: 1 }, { unique: true });
UsageTrackingSchema.index({ userId: 1, date: -1 });

const UsageTracking: Model<IUsageTracking> =
  mongoose.models.UsageTracking ||
  mongoose.model<IUsageTracking>("UsageTracking", UsageTrackingSchema);

export default UsageTracking;
