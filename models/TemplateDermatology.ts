import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITemplateDermatology extends Document {
  clinicId: mongoose.Types.ObjectId;
  templateName: string;
  description?: string;

  // Pre-filled values for quick application
  prefillData: {
    patientInfo?: {
      complaint?: string;
      duration?: string;
      previousTreatment?: string;
    };
    clinicalExamination?: {
      lesionSite?: string;
      morphology?: string;
      distribution?: string;
      severity?: string;
    };
    dermoscopeFindings?: {
      patterns?: string;
      finalInterpretation?: string;
    };
    diagnosis?: {
      provisional?: string;
      differentials?: string[];
    };
    treatmentPlan?: {
      topicals?: string;
      orals?: string;
      lifestyleChanges?: string;
      investigations?: string;
    };
    followUp?: {
      reason?: string;
    };
    consent?: {
      notes?: string;
    };
    customFields?: Record<string, any>;
  };

  // Which custom fields to enable for this template
  enabledCustomFields?: string[];

  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TemplateDermatologySchema = new Schema<ITemplateDermatology>(
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
        complaint: String,
        duration: String,
        previousTreatment: String,
      },
      clinicalExamination: {
        lesionSite: String,
        morphology: String,
        distribution: String,
        severity: String,
      },
      dermoscopeFindings: {
        patterns: String,
        finalInterpretation: String,
      },
      diagnosis: {
        provisional: String,
        differentials: [String],
      },
      treatmentPlan: {
        topicals: String,
        orals: String,
        lifestyleChanges: String,
        investigations: String,
      },
      followUp: {
        reason: String,
      },
      consent: {
        notes: String,
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
TemplateDermatologySchema.index({ clinicId: 1 });
TemplateDermatologySchema.index({ clinicId: 1, templateName: 1 }, { unique: true });

const TemplateDermatology: Model<ITemplateDermatology> =
  mongoose.models.TemplateDermatology ||
  mongoose.model<ITemplateDermatology>(
    "TemplateDermatology",
    TemplateDermatologySchema
  );

export default TemplateDermatology;
