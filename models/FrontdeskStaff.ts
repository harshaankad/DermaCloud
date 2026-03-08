import mongoose, { Schema, Document, Model } from "mongoose";

export interface IFrontdeskStaff extends Document {
  staffId: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  clinicId: mongoose.Types.ObjectId;
  doctorId: mongoose.Types.ObjectId;
  googleId?: string;
  authProvider: "local" | "google";
  status: "active" | "inactive";
  permissions: {
    appointments: boolean;
    patients: boolean;
    pharmacy: boolean;
    sales: boolean;
    reports: boolean;
  };
  lastLogin?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  refreshTokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const FrontdeskStaffSchema = new Schema<IFrontdeskStaff>(
  {
    staffId: {
      type: String,
      unique: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
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
      required: function (this: IFrontdeskStaff) {
        return this.authProvider !== "google";
      },
      minlength: [6, "Password must be at least 6 characters"],
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
      match: [/^[0-9]{10}$/, "Please enter a valid 10-digit phone number"],
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: [true, "Clinic is required"],
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Doctor is required"],
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    permissions: {
      appointments: { type: Boolean, default: true },
      patients: { type: Boolean, default: true },
      pharmacy: { type: Boolean, default: true },
      sales: { type: Boolean, default: true },
      reports: { type: Boolean, default: false },
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
    lastLogin: { type: Date },
    loginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    refreshTokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// Auto-generate staffId before saving
FrontdeskStaffSchema.pre("save", async function (next) {
  if (!this.staffId) {
    const count = await mongoose.models.FrontdeskStaff.countDocuments();
    this.staffId = `FD-${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

// Indexes for faster queries
FrontdeskStaffSchema.index({ email: 1 });
FrontdeskStaffSchema.index({ clinicId: 1 });
FrontdeskStaffSchema.index({ doctorId: 1 });
FrontdeskStaffSchema.index({ status: 1 });

const FrontdeskStaff: Model<IFrontdeskStaff> =
  mongoose.models.FrontdeskStaff ||
  mongoose.model<IFrontdeskStaff>("FrontdeskStaff", FrontdeskStaffSchema);

export default FrontdeskStaff;
