import mongoose, { Schema, Document, Model } from "mongoose";

export interface IConsultationTemplate extends Document {
  clinicId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;

  // Template metadata
  name: string;
  description?: string;
  category?: string; // e.g., "Eczema", "Psoriasis", "Vitiligo", etc.
  templateType: "dermatology" | "cosmetology"; // NEW: Template type
  isActive: boolean;

  // Template fields (mirrors the consultation form structure)
  // For dermatology OR cosmetology - stored as flexible object
  templateData: Record<string, any>;

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
    templateType: {
      type: String,
      enum: ["dermatology", "cosmetology"],
      default: "dermatology",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    templateData: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
consultationTemplateSchema.index({ clinicId: 1, isActive: 1 });
consultationTemplateSchema.index({ clinicId: 1, category: 1 });
consultationTemplateSchema.index({ clinicId: 1, templateType: 1 });

const ConsultationTemplate: Model<IConsultationTemplate> =
  mongoose.models.ConsultationTemplate ||
  mongoose.model<IConsultationTemplate>("ConsultationTemplate", consultationTemplateSchema);

export default ConsultationTemplate;
