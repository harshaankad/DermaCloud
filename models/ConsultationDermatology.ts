import mongoose, { Schema, Document, Model } from "mongoose";

// AI Result Interface
export interface IAIResult {
  predictions: Array<{
    condition: string;
    probability: number;
  }>;
  topPrediction: string;
  confidence: number;
  timestamp: Date;
}

// Image Interface
export interface IConsultationImage {
  url: string;
  type: "clinical" | "dermoscopic";
  uploadedAt: Date;
  aiResult?: IAIResult;
}

// Medication Interface
export interface IMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface IConsultationDermatology extends Document {
  clinicId: mongoose.Types.ObjectId;
  patientId: mongoose.Types.ObjectId;
  doctorId: mongoose.Types.ObjectId;
  appointmentId?: mongoose.Types.ObjectId; // Links to frontdesk appointment
  consultationDate: Date;

  // Patient Information
  patientInfo: {
    name: string;
    age: number;
    gender: string;
    complaint?: string;
    duration?: string;
    previousTreatment?: string;
  };

  // Clinical Examination
  clinicalExamination?: {
    lesionSite?: string;
    morphology?: string;
    distribution?: string;
    severity?: string;
  };

  // Dermoscope Findings
  dermoscopeFindings?: {
    patterns?: string;
    aiResults?: IAIResult;
    finalInterpretation?: string;
  };

  // Diagnosis
  diagnosis?: {
    provisional?: string;
    differentials?: string[];
  };

  // Treatment Plan
  treatmentPlan?: {
    topicals?: string;
    orals?: string;
    lifestyleChanges?: string;
    investigations?: string;
    medications?: IMedication[];
  };

  // Images
  images: IConsultationImage[];

  // Follow-up
  followUp?: {
    date?: Date;
    reason?: string;
  };

  // Patient-Friendly Summary
  patientSummary?: {
    aiGenerated?: string;
    doctorEdited?: string;
    translations?: {
      hindi?: string;
      kannada?: string;
    };
  };

  // Consent & Signature
  consent?: {
    obtained?: boolean;
    notes?: string;
  };

  doctorSignature?: string;

  // Generated Documents
  generatedFiles?: {
    pdfUrl?: string;
    wordUrl?: string;
    generatedAt?: Date;
  };

  // Custom Fields (Doctor-added fields)
  customFields?: Record<string, any>;

  // Billing
  consultationFee?: number;

  // Metadata
  status: "draft" | "completed";
  createdAt: Date;
  updatedAt: Date;
}

const AIResultSchema = new Schema<IAIResult>(
  {
    predictions: [
      {
        condition: { type: String, required: true },
        probability: { type: Number, required: true, min: 0, max: 1 },
      },
    ],
    topPrediction: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ConsultationImageSchema = new Schema<IConsultationImage>(
  {
    url: { type: String, required: true },
    type: {
      type: String,
      enum: ["clinical", "dermoscopic"],
      required: true,
    },
    uploadedAt: { type: Date, default: Date.now },
    aiResult: { type: AIResultSchema },
  },
  { _id: false }
);

const MedicationSchema = new Schema<IMedication>(
  {
    name: { type: String, required: true },
    dosage: { type: String, required: true },
    frequency: { type: String, required: true },
    duration: { type: String, required: true },
  },
  { _id: false }
);

const ConsultationDermatologySchema = new Schema<IConsultationDermatology>(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: "Appointment",
    },
    consultationDate: {
      type: Date,
      default: Date.now,
    },

    // Patient Information
    patientInfo: {
      name: { type: String, required: true },
      age: { type: Number, required: true },
      gender: { type: String, required: true },
      complaint: String,
      duration: String,
      previousTreatment: String,
    },

    // Clinical Examination
    clinicalExamination: {
      lesionSite: String,
      morphology: String,
      distribution: String,
      severity: String,
    },

    // Dermoscope Findings
    dermoscopeFindings: {
      patterns: String,
      aiResults: AIResultSchema,
      finalInterpretation: String,
    },

    // Diagnosis
    diagnosis: {
      provisional: String,
      differentials: [String],
    },

    // Treatment Plan
    treatmentPlan: {
      topicals: String,
      orals: String,
      lifestyleChanges: String,
      investigations: String,
      medications: [MedicationSchema],
    },

    // Images
    images: {
      type: [ConsultationImageSchema],
      default: [],
    },

    // Follow-up
    followUp: {
      date: Date,
      reason: String,
    },

    // Patient Summary
    patientSummary: {
      aiGenerated: String,
      doctorEdited: String,
      translations: {
        hindi: String,
        kannada: String,
      },
    },

    // Consent
    consent: {
      obtained: Boolean,
      notes: String,
    },

    doctorSignature: String,

    // Generated Files
    generatedFiles: {
      pdfUrl: String,
      wordUrl: String,
      generatedAt: Date,
    },

    // Custom Fields
    customFields: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // Billing
    consultationFee: {
      type: Number,
      min: 0,
    },

    // Status
    status: {
      type: String,
      enum: ["draft", "completed"],
      default: "draft",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
ConsultationDermatologySchema.index({ clinicId: 1, consultationDate: -1 });
ConsultationDermatologySchema.index({ patientId: 1, consultationDate: -1 });
ConsultationDermatologySchema.index({ doctorId: 1, consultationDate: -1 });
ConsultationDermatologySchema.index({ status: 1 });

const ConsultationDermatology: Model<IConsultationDermatology> =
  mongoose.models.ConsultationDermatology ||
  mongoose.model<IConsultationDermatology>(
    "ConsultationDermatology",
    ConsultationDermatologySchema
  );

export default ConsultationDermatology;
