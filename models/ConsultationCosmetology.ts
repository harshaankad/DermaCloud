import mongoose, { Schema, Document, Model } from "mongoose";

// Image Interface - Now stores visit photos without before/after distinction
// Comparison is done across different visits, not within the same visit
export interface ICosmetologyImage {
  url: string;
  type?: "before" | "after"; // Optional, for legacy support
  comparisonTag?: string; // Optional, for legacy support
  uploadedAt: Date;
}

export interface IConsultationCosmetology extends Document {
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
    skinType?: string; // Fitzpatrick
    primaryConcern?: string;
  };

  // Assessment & Analysis
  assessment?: {
    findings?: string;
    diagnosis?: string;
    baselineEvaluation?: string;
    contraindicationsCheck?: string;
  };

  // Treatment Plan / Procedure
  procedure?: {
    name?: string;
    goals?: string;
    sessionNumber?: number;
    package?: string;
    productsAndParameters?: string;
    immediateOutcome?: string;
    procedureId?: mongoose.Types.ObjectId;
    basePrice?: number;
    gstRate?: number;
    gstAmount?: number;
    totalAmount?: number;
  };

  // Images - Visit photos for cross-visit comparison
  images: ICosmetologyImage[];

  // Aftercare & Follow-up
  aftercare?: {
    instructions?: string;
    homeProducts?: string;
    followUpDate?: Date;
    expectedResults?: string;
  };

  // Consent & Risks
  consent?: {
    risksExplained?: string;
    consentConfirmed?: boolean;
  };

  // Report Summary
  reportSummary?: {
    doctorNotes?: string;
    signature?: string;
    seal?: string;
  };

  // AI Patient Summary
  patientSummary?: {
    aiGenerated?: string;
    doctorEdited?: string;
    translations?: {
      hindi?: string;
      kannada?: string;
    };
  };

  // Custom Fields (Doctor-added fields)
  customFields?: Record<string, any>;

  // Generated Documents
  generatedFiles?: {
    pdfUrl?: string;
    wordUrl?: string;
    generatedAt?: Date;
  };

  // Billing
  consultationFee?: number;

  // Metadata
  status: "draft" | "completed";
  createdAt: Date;
  updatedAt: Date;
}

const CosmetologyImageSchema = new Schema<ICosmetologyImage>(
  {
    url: { type: String, required: true },
    type: {
      type: String,
      enum: ["before", "after"],
      required: false, // Optional, for legacy support
    },
    comparisonTag: String, // Optional, for legacy support
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ConsultationCosmetologySchema = new Schema<IConsultationCosmetology>(
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
      skinType: String,
      primaryConcern: String,
    },

    // Assessment
    assessment: {
      findings: String,
      diagnosis: String,
      baselineEvaluation: String,
      contraindicationsCheck: String,
    },

    // Procedure
    procedure: {
      name: String,
      goals: String,
      sessionNumber: Number,
      package: String,
      productsAndParameters: String,
      immediateOutcome: String,
      procedureId: { type: Schema.Types.ObjectId, ref: "CosmetologyProcedure" },
      basePrice: { type: Number, min: 0 },
      gstRate: { type: Number, enum: [0, 5, 12, 18, 28] },
      gstAmount: { type: Number, min: 0 },
      totalAmount: { type: Number, min: 0 },
    },

    // Images
    images: {
      type: [CosmetologyImageSchema],
      default: [],
    },

    // Aftercare
    aftercare: {
      instructions: String,
      homeProducts: String,
      followUpDate: Date,
      expectedResults: String,
    },

    // Consent
    consent: {
      risksExplained: String,
      consentConfirmed: Boolean,
    },

    // Report Summary
    reportSummary: {
      doctorNotes: String,
      signature: String,
      seal: String,
    },

    // AI Patient Summary
    patientSummary: {
      aiGenerated: String,
      doctorEdited: String,
      translations: {
        hindi: String,
        kannada: String,
      },
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

    // Generated Files
    generatedFiles: {
      pdfUrl: String,
      wordUrl: String,
      generatedAt: Date,
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
ConsultationCosmetologySchema.index({ clinicId: 1, consultationDate: -1 });
ConsultationCosmetologySchema.index({ patientId: 1, consultationDate: -1 });
ConsultationCosmetologySchema.index({ doctorId: 1, consultationDate: -1 });
ConsultationCosmetologySchema.index({ status: 1 });

const ConsultationCosmetology: Model<IConsultationCosmetology> =
  mongoose.models.ConsultationCosmetology ||
  mongoose.model<IConsultationCosmetology>(
    "ConsultationCosmetology",
    ConsultationCosmetologySchema
  );

export default ConsultationCosmetology;
