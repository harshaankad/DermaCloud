import mongoose, { Schema, Document, Model } from "mongoose";

// Custom Field Definition
export interface ICustomField {
  fieldName: string;
  fieldType: "text" | "number" | "date" | "select" | "textarea";
  options?: string[];
  section: string;
  required: boolean;
}

// Field Visibility Settings
export interface IFieldSettings {
  [fieldName: string]: {
    visible: boolean;
    required: boolean;
  };
}

export interface ISectionSettings {
  [sectionName: string]: IFieldSettings;
}

// Appointment Settings
export interface IAppointmentSettings {
  startHour: number; // 0-23
  endHour: number; // 0-23
  slotDuration: number; // minutes (e.g., 15, 20, 30)
  lunchStartHour: number;
  lunchEndHour: number;
  lunchEnabled: boolean;
}

export interface IClinic extends Document {
  doctorId: mongoose.Types.ObjectId;
  clinicName: string;
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
  seal?: string;

  // Appointment Settings
  appointmentSettings: IAppointmentSettings;

  // Dermatology Field Settings
  dermatologyFieldSettings: ISectionSettings;
  dermatologyCustomFields: ICustomField[];

  // Cosmetology Field Settings
  cosmetologyFieldSettings: ISectionSettings;
  cosmetologyCustomFields: ICustomField[];

  createdAt: Date;
  updatedAt: Date;
}

const CustomFieldSchema = new Schema<ICustomField>(
  {
    fieldName: {
      type: String,
      required: true,
    },
    fieldType: {
      type: String,
      enum: ["text", "number", "date", "select", "textarea"],
      required: true,
    },
    options: [String],
    section: {
      type: String,
      required: true,
    },
    required: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const ClinicSchema = new Schema<IClinic>(
  {
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    clinicName: {
      type: String,
      required: [true, "Clinic name is required"],
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9]{10}$/, "Please enter a valid 10-digit phone number"],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    logo: {
      type: String,
    },
    seal: {
      type: String,
    },

    // Appointment Settings
    appointmentSettings: {
      startHour: { type: Number, min: 0, max: 23, default: 9 },
      endHour: { type: Number, min: 0, max: 23, default: 22 },
      slotDuration: { type: Number, min: 5, max: 60, default: 30 },
      lunchStartHour: { type: Number, min: 0, max: 23, default: 13 },
      lunchEndHour: { type: Number, min: 0, max: 23, default: 14 },
      lunchEnabled: { type: Boolean, default: true },
    },

    // Dermatology Settings
    dermatologyFieldSettings: {
      type: Schema.Types.Mixed,
      default: {
        patientInfo: {
          complaint: { visible: true, required: true },
          duration: { visible: true, required: true },
          previousTreatment: { visible: true, required: false },
        },
        clinicalExamination: {
          lesionSite: { visible: true, required: true },
          morphology: { visible: true, required: true },
          distribution: { visible: true, required: true },
          severity: { visible: true, required: true },
        },
        dermoscopeFindings: {
          patterns: { visible: true, required: false },
          finalInterpretation: { visible: true, required: false },
        },
        diagnosis: {
          provisional: { visible: true, required: true },
          differentials: { visible: true, required: false },
        },
        treatmentPlan: {
          topicals: { visible: true, required: false },
          orals: { visible: true, required: false },
          lifestyleChanges: { visible: true, required: false },
          investigations: { visible: true, required: false },
        },
        followUp: {
          date: { visible: true, required: false },
          reason: { visible: true, required: false },
        },
        consent: {
          obtained: { visible: true, required: false },
          notes: { visible: true, required: false },
        },
      },
    },

    dermatologyCustomFields: {
      type: [CustomFieldSchema],
      default: [],
    },

    // Cosmetology Settings
    cosmetologyFieldSettings: {
      type: Schema.Types.Mixed,
      default: {
        patientInfo: {
          skinType: { visible: true, required: true },
          primaryConcern: { visible: true, required: true },
        },
        assessment: {
          findings: { visible: true, required: true },
          diagnosis: { visible: true, required: false },
          baselineEvaluation: { visible: true, required: false },
          contraindicationsCheck: { visible: true, required: true },
        },
        procedure: {
          name: { visible: true, required: true },
          goals: { visible: true, required: true },
          sessionNumber: { visible: true, required: false },
          package: { visible: true, required: false },
          productsAndParameters: { visible: true, required: false },
          immediateOutcome: { visible: true, required: false },
        },
        aftercare: {
          instructions: { visible: true, required: true },
          homeProducts: { visible: true, required: false },
          followUpDate: { visible: true, required: false },
          expectedResults: { visible: true, required: false },
        },
        consent: {
          risksExplained: { visible: true, required: true },
          consentConfirmed: { visible: true, required: true },
        },
      },
    },

    cosmetologyCustomFields: {
      type: [CustomFieldSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
ClinicSchema.index({ doctorId: 1 });

const Clinic: Model<IClinic> =
  mongoose.models.Clinic || mongoose.model<IClinic>("Clinic", ClinicSchema);

export default Clinic;
