import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAppointment extends Document {
  appointmentId: string;
  tokenNumber?: number;
  patientId: mongoose.Types.ObjectId;
  doctorId: mongoose.Types.ObjectId;
  clinicId: mongoose.Types.ObjectId;
  appointmentDate: Date;
  appointmentTime: string; // "09:00", "09:30", etc.
  duration: number; // in minutes
  type: "dermatology" | "cosmetology" | "follow-up" | "consultation";
  status: "scheduled" | "confirmed" | "checked-in" | "in-progress" | "completed" | "cancelled" | "no-show";
  reason?: string;
  notes?: string;
  bookedBy: {
    id: mongoose.Types.ObjectId;
    name: string;
    role: "doctor" | "frontdesk";
  };
  consultationId?: mongoose.Types.ObjectId;
  consultationFee?: number;
  checkedInAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AppointmentSchema = new Schema<IAppointment>(
  {
    appointmentId: {
      type: String,
      unique: true,
    },
    tokenNumber: {
      type: Number,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: [true, "Patient is required"],
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Doctor is required"],
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: [true, "Clinic is required"],
    },
    appointmentDate: {
      type: Date,
      required: [true, "Appointment date is required"],
    },
    appointmentTime: {
      type: String,
      required: [true, "Appointment time is required"],
      match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Please enter a valid time (HH:MM)"],
    },
    duration: {
      type: Number,
      default: 30, // 30 minutes default
      min: [15, "Minimum duration is 15 minutes"],
      max: [120, "Maximum duration is 120 minutes"],
    },
    type: {
      type: String,
      enum: ["dermatology", "cosmetology", "follow-up", "consultation"],
      required: [true, "Appointment type is required"],
    },
    status: {
      type: String,
      enum: ["scheduled", "confirmed", "checked-in", "in-progress", "completed", "cancelled", "no-show"],
      default: "scheduled",
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
    },
    bookedBy: {
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
    consultationId: {
      type: Schema.Types.ObjectId,
      ref: "ConsultationDermatology",
    },
    consultationFee: {
      type: Number,
      min: 0,
    },
    checkedInAt: Date,
    startedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    cancellationReason: String,
  },
  {
    timestamps: true,
  }
);

// Auto-generate appointmentId before saving
AppointmentSchema.pre("save", async function (next) {
  if (!this.appointmentId) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.appointmentId = `APT-${timestamp}${random}`;
  }
  next();
});

// Indexes for faster queries
AppointmentSchema.index({ appointmentDate: 1, appointmentTime: 1 });
AppointmentSchema.index({ patientId: 1 });
AppointmentSchema.index({ doctorId: 1 });
AppointmentSchema.index({ clinicId: 1 });
AppointmentSchema.index({ status: 1 });
AppointmentSchema.index({ appointmentDate: 1, clinicId: 1 });
AppointmentSchema.index({ clinicId: 1, appointmentDate: 1, tokenNumber: 1 });

const Appointment: Model<IAppointment> =
  mongoose.models.Appointment ||
  mongoose.model<IAppointment>("Appointment", AppointmentSchema);

export default Appointment;
