import mongoose, { Schema, Document, Model } from "mongoose";

// AI Result Interface
export interface IAIResult {
  predictions: Array<{
    condition: string;
    probability: number;
    confidence: "high" | "medium" | "low";
  }>;
  topPrediction: {
    condition: string;
    probability: number;
    confidence: "high" | "medium" | "low";
  };
  processingTime: number;
}

// Patient Info Interface
export interface IPatientInfo {
  name: string;
  age?: number;
  gender?: "male" | "female" | "other";
}

// Individual Image Result Interface
export interface IImageResult {
  imageUrl: string;
  s3Key: string;
  aiResult: IAIResult;
}

export interface ITier1Scan extends Document {
  userId: mongoose.Types.ObjectId;
  images: IImageResult[];
  finalResult: IAIResult; // Averaged result from all images
  patientInfo?: IPatientInfo;
  notes?: string;
  status: "pending" | "completed" | "failed";
  downloadedPdf?: boolean;
  downloadedWord?: boolean;
  generatedFiles?: {
    pdfUrl?: string;
    wordUrl?: string;
    generatedAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AIResultSchema = new Schema<IAIResult>(
  {
    predictions: [
      {
        condition: { type: String, required: true },
        probability: { type: Number, required: true, min: 0, max: 1 },
        confidence: {
          type: String,
          enum: ["high", "medium", "low"],
          required: true,
        },
      },
    ],
    topPrediction: {
      condition: { type: String, required: true },
      probability: { type: Number, required: true, min: 0, max: 1 },
      confidence: {
        type: String,
        enum: ["high", "medium", "low"],
        required: true,
      },
    },
    processingTime: { type: Number, required: true },
  },
  { _id: false }
);

const PatientInfoSchema = new Schema<IPatientInfo>(
  {
    name: { type: String, required: true },
    age: { type: Number, min: 0, max: 150 },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },
  },
  { _id: false }
);

const ImageResultSchema = new Schema<IImageResult>(
  {
    imageUrl: { type: String, required: true },
    s3Key: { type: String, required: true },
    aiResult: { type: AIResultSchema, required: true },
  },
  { _id: false }
);

const Tier1ScanSchema = new Schema<ITier1Scan>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    images: {
      type: [ImageResultSchema],
      required: true,
      validate: {
        validator: function (v: IImageResult[]) {
          return v.length >= 1 && v.length <= 5;
        },
        message: "Must upload between 1 and 5 images",
      },
    },
    finalResult: {
      type: AIResultSchema,
      required: true,
    },
    patientInfo: {
      type: PatientInfoSchema,
    },
    notes: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    downloadedPdf: {
      type: Boolean,
      default: false,
    },
    downloadedWord: {
      type: Boolean,
      default: false,
    },
    generatedFiles: {
      pdfUrl: String,
      wordUrl: String,
      generatedAt: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
Tier1ScanSchema.index({ userId: 1, createdAt: -1 });
Tier1ScanSchema.index({ status: 1 });

const Tier1Scan: Model<ITier1Scan> =
  mongoose.models.Tier1Scan ||
  mongoose.model<ITier1Scan>("Tier1Scan", Tier1ScanSchema);

export default Tier1Scan;
