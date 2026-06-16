import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A single signed consent form for a patient. Captures a point-in-time snapshot
 * of the template text, the patient/doctor details, the filled-in blanks and the
 * patient's signature, plus audit metadata. The rendered, locked PDF lives in S3
 * (referenced by `pdfKey`); this record is the tamper-evident source of truth.
 */

export type SignatureMethod = "drawn" | "thumb" | "uploaded";

export interface IConsentSignature {
  key: string; // S3 object key of the signature image
  method: SignatureMethod;
}

export interface IConsentRecord extends Document {
  clinicId: mongoose.Types.ObjectId;
  patientId: mongoose.Types.ObjectId;
  createdById: mongoose.Types.ObjectId; // doctor (User) who facilitated

  // Template snapshot — frozen at sign time so later template edits never alter a signed record
  templateKey: string;
  templateTitle: string;
  templateVersion: number;

  // Patient snapshot
  patientSnapshot: {
    name: string;
    patientCode?: string; // human-facing patient ID
    age?: number;
    gender?: string;
    phone?: string;
    address?: string;
  };

  // Filled-in procedure-specific blanks (keyed by template field key)
  fieldValues: Record<string, string>;

  // Minor / guardian
  isMinor: boolean;
  guardianName?: string;
  guardianRelation?: string;

  // Doctor (operating doctor) snapshot
  doctorName?: string;
  doctorSignatureKey?: string; // S3 key of the doctor signature stamped onto the PDF

  // Patient signature
  patientSignature: IConsentSignature;

  // Audit
  signedAt: Date;
  audit: {
    ipAddress?: string;
    userAgent?: string;
  };

  // Generated artefact
  pdfKey?: string;

  status: "signed";
  createdAt: Date;
  updatedAt: Date;
}

const ConsentSignatureSchema = new Schema<IConsentSignature>(
  {
    key: { type: String, required: true },
    method: { type: String, enum: ["drawn", "thumb", "uploaded"], required: true },
  },
  { _id: false }
);

const ConsentRecordSchema = new Schema<IConsentRecord>(
  {
    clinicId: { type: Schema.Types.ObjectId, ref: "Clinic", required: true },
    patientId: { type: Schema.Types.ObjectId, ref: "Patient", required: true },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },

    templateKey: { type: String, required: true },
    templateTitle: { type: String, required: true },
    templateVersion: { type: Number, required: true },

    patientSnapshot: {
      name: { type: String, required: true },
      patientCode: String,
      age: Number,
      gender: String,
      phone: String,
      address: String,
    },

    fieldValues: { type: Schema.Types.Mixed, default: {} },

    isMinor: { type: Boolean, default: false },
    guardianName: String,
    guardianRelation: String,

    doctorName: String,
    doctorSignatureKey: String,

    patientSignature: { type: ConsentSignatureSchema, required: true },

    signedAt: { type: Date, default: Date.now },
    audit: {
      ipAddress: String,
      userAgent: String,
    },

    pdfKey: String,

    status: { type: String, enum: ["signed"], default: "signed" },
  },
  { timestamps: true }
);

ConsentRecordSchema.index({ clinicId: 1, signedAt: -1 });
ConsentRecordSchema.index({ clinicId: 1, patientId: 1, signedAt: -1 });

const ConsentRecord: Model<IConsentRecord> =
  mongoose.models.ConsentRecord ||
  mongoose.model<IConsentRecord>("ConsentRecord", ConsentRecordSchema);

export default ConsentRecord;
