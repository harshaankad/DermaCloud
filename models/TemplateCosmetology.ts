import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITemplateCosmetology extends Document {
  clinicId: mongoose.Types.ObjectId;
  templateName: string;
  description?: string;

  // Pre-filled values for quick application
  prefillData: {
    patientInfo?: {
      skinType?: string;
      primaryConcern?: string;
    };
    assessment?: {
      findings?: string;
      diagnosis?: string;
      baselineEvaluation?: string;
      contraindicationsCheck?: string;
    };
    procedure?: {
      name?: string;
      goals?: string;
      package?: string;
      productsAndParameters?: string;
      immediateOutcome?: string;
    };
    aftercare?: {
      instructions?: string;
      homeProducts?: string;
      expectedResults?: string;
    };
    consent?: {
      risksExplained?: string;
    };
    reportSummary?: {
      doctorNotes?: string;
    };
    customFields?: Record<string, any>;
  };

  // Which custom fields to enable for this template
  enabledCustomFields?: string[];

  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TemplateCosmetologySchema = new Schema<ITemplateCosmetology>(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },
    templateName: {
      type: String,
      required: [true, "Template name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },

    // Pre-filled Data
    prefillData: {
      patientInfo: {
        skinType: String,
        primaryConcern: String,
      },
      assessment: {
        findings: String,
        diagnosis: String,
        baselineEvaluation: String,
        contraindicationsCheck: String,
      },
      procedure: {
        name: String,
        goals: String,
        package: String,
        productsAndParameters: String,
        immediateOutcome: String,
      },
      aftercare: {
        instructions: String,
        homeProducts: String,
        expectedResults: String,
      },
      consent: {
        risksExplained: String,
      },
      reportSummary: {
        doctorNotes: String,
      },
      customFields: {
        type: Schema.Types.Mixed,
        default: {},
      },
    },

    enabledCustomFields: {
      type: [String],
      default: [],
    },

    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
TemplateCosmetologySchema.index({ clinicId: 1 });
TemplateCosmetologySchema.index({ clinicId: 1, templateName: 1 }, { unique: true });

const TemplateCosmetology: Model<ITemplateCosmetology> =
  mongoose.models.TemplateCosmetology ||
  mongoose.model<ITemplateCosmetology>(
    "TemplateCosmetology",
    TemplateCosmetologySchema
  );

export default TemplateCosmetology;
