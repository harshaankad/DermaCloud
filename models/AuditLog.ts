import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAuditLog extends Document {
  clinicId?: mongoose.Types.ObjectId;
  userId: string;
  userEmail: string;
  role: "doctor" | "frontdesk" | "system";
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  details?: Record<string, any>;
  success: boolean;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic" },
    userId: { type: String, required: true },
    userEmail: { type: String, required: true },
    role: { type: String, enum: ["doctor", "frontdesk", "system"], required: true },
    action: { type: String, required: true }, // e.g. "LOGIN_SUCCESS", "CONSULTATION_CREATE"
    resourceType: { type: String, required: true }, // e.g. "auth", "consultation", "patient"
    resourceId: { type: String },
    ipAddress: { type: String },
    details: { type: Schema.Types.Mixed },
    success: { type: Boolean, default: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Auto-delete logs after 90 days
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Query indexes
AuditLogSchema.index({ clinicId: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1 });

const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog ||
  mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);

export default AuditLog;
