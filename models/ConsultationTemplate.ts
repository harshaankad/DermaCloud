import mongoose, { Schema, Document, Model } from "mongoose";

export interface IConsultationTemplate extends Document {
  clinicId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;

  // Template metadata
  name: string;
  description?: string;
  category?: string; // e.g., "Eczema", "Psoriasis", "Vitiligo", etc.
  isActive: boolean;

  // Template fields (mirrors the consultation form structure)
  templateData: {
    // Chief Complaint & History
    complaint?: string;
    duration?: string;
    previousTreatment?: string;

    // Clinical Examination
    lesionSite?: string;
    morphology?: string;
    distribution?: string;
    severity?: string;

    // Dermoscopic Findings
    patterns?: string;
    finalInterpretation?: string;

    // Diagnosis
    provisional?: string;
    differentials?: string;

    // Treatment Plan
    topicals?: string;
    orals?: string;
    lifestyleChanges?: string;
    investigations?: string;

    // Follow-up
    reason?: string;
  };

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const consultationTemplateSchema = new Schema<IConsultationTemplate>(
  {
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: "Clinic",
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    templateData: {
      // Chief Complaint & History
      complaint: String,
      duration: String,
      previousTreatment: String,

      // Clinical Examination
      lesionSite: String,
      morphology: String,
      distribution: String,
      severity: String,

      // Dermoscopic Findings
      patterns: String,
      finalInterpretation: String,

      // Diagnosis
      provisional: String,
      differentials: String,

      // Treatment Plan
      topicals: String,
      orals: String,
      lifestyleChanges: String,
      investigations: String,

      // Follow-up
      reason: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
consultationTemplateSchema.index({ clinicId: 1, isActive: 1 });
consultationTemplateSchema.index({ clinicId: 1, category: 1 });

const ConsultationTemplate: Model<IConsultationTemplate> =
  mongoose.models.ConsultationTemplate ||
  mongoose.model<IConsultationTemplate>("ConsultationTemplate", consultationTemplateSchema);

export default ConsultationTemplate;
