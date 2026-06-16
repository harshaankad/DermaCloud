import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A consent form template (e.g. the IADVL Academy procedure consent forms).
 * Templates are GLOBAL — shared by every clinic, not scoped to a clinicId.
 * The body is stored as lightweight markdown (## headings, • bullets, **bold**)
 * rendered by the consent PDF generator. Procedure-specific blanks that the
 * doctor fills at sign time are declared in `fields`; standard patient
 * demographics and the doctor's name are handled globally, not per template.
 */

export interface IConsentField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

export interface IConsentTemplate extends Document {
  key: string; // stable slug, e.g. "acne-scar-procedure"
  title: string;
  source?: string; // attribution, e.g. "IADVL Academy — SIG Laser & Aesthetics 2018-19"
  category?: string; // loose grouping, e.g. "laser", "injectable"
  version: number;
  bodyMarkdown: string;
  fields: IConsentField[];
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ConsentFieldSchema = new Schema<IConsentField>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    placeholder: String,
    required: { type: Boolean, default: false },
  },
  { _id: false }
);

const ConsentTemplateSchema = new Schema<IConsentTemplate>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    source: { type: String, trim: true },
    category: { type: String, trim: true },
    version: { type: Number, default: 1 },
    bodyMarkdown: { type: String, required: true },
    fields: { type: [ConsentFieldSchema], default: [] },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ConsentTemplateSchema.index({ isActive: 1, sortOrder: 1 });
ConsentTemplateSchema.index({ title: "text" });

const ConsentTemplate: Model<IConsentTemplate> =
  mongoose.models.ConsentTemplate ||
  mongoose.model<IConsentTemplate>("ConsentTemplate", ConsentTemplateSchema);

export default ConsentTemplate;
