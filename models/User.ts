import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  tier: "tier2";
  phone?: string;
  clinicId?: mongoose.Types.ObjectId;
  isVerified: boolean;
  googleId?: string;
  authProvider: "local" | "google";
  subscriptionId?: mongoose.Types.ObjectId;
  subscriptionStatus: "active" | "expired" | "none";
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  aiPatientSummaries?: Record<string, number>; // keyed by "YYYY_MM"
  loginAttempts: number;
  lockedUntil?: Date;
  refreshTokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: function (this: IUser) {
        return this.authProvider !== "google";
      },
      minlength: [6, "Password must be at least 6 characters"],
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    tier: {
      type: String,
      enum: ["tier2"],
      required: [true, "Tier is required"],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9]{10}$/, "Please enter a valid 10-digit phone number"],
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    googleId: {
      type: String,
      sparse: true,
    },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "expired", "none"],
      default: "none",
    },
    passwordResetToken: { type: String },
    passwordResetExpiry: { type: Date },
    aiPatientSummaries: { type: Schema.Types.Mixed, default: {} },
    loginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    refreshTokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries (email already indexed via unique:true in schema)
UserSchema.index({ tier: 1 });

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
