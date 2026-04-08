import mongoose, { Schema, Document, Model } from "mongoose";

// Field Configuration Interface
export interface IFormField {
  fieldName: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "date" | "checkbox" | "prescription";
  required: boolean;
  enabled: boolean;
  options?: string[]; // For select fields
  placeholder?: string;
  order: number; // For custom ordering
  custom?: boolean; // User-added custom field
}

// Form Section Interface
export interface IFormSection {
  sectionName: string;
  sectionLabel: string;
  enabled: boolean;
  fields: IFormField[];
  order: number;
}

export interface IFormSettings extends Document {
  userId: mongoose.Types.ObjectId;
  formType: "dermatology" | "cosmetology";
  sections: IFormSection[];
  lastModified: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FormFieldSchema = new Schema<IFormField>(
  {
    fieldName: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "textarea", "number", "select", "date", "checkbox", "prescription"],
      required: true,
    },
    required: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    options: [String],
    placeholder: String,
    order: { type: Number, default: 0 },
    custom: { type: Boolean, default: false },
  },
  { _id: false }
);

const FormSectionSchema = new Schema<IFormSection>(
  {
    sectionName: { type: String, required: true },
    sectionLabel: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    fields: [FormFieldSchema],
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const FormSettingsSchema = new Schema<IFormSettings>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    formType: {
      type: String,
      enum: ["dermatology", "cosmetology"],
      required: true,
    },
    sections: {
      type: [FormSectionSchema],
      default: [],
    },
    lastModified: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: one form setting per user per form type
FormSettingsSchema.index({ userId: 1, formType: 1 }, { unique: true });

const FormSettings: Model<IFormSettings> =
  mongoose.models.FormSettings ||
  mongoose.model<IFormSettings>("FormSettings", FormSettingsSchema);

export default FormSettings;
