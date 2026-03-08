// User & Auth Types
export type UserTier = "tier1" | "tier2";

export interface User {
  _id: string;
  email: string;
  password: string;
  name: string;
  tier: UserTier;
  phone?: string;
  clinicName?: string; // Only for Tier 2
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthPayload {
  userId: string;
  email: string;
  tier: UserTier;
}

// Tier 1 Types
export interface Tier1Usage {
  userId: string;
  date: string; // YYYY-MM-DD
  dailyScans: number;
  monthlyScans: number;
}

export interface AIResult {
  predictions: {
    condition: string;
    probability: number;
  }[];
  topPrediction: string;
  confidence: number;
  timestamp: Date;
}

export interface Tier1Scan {
  _id: string;
  userId: string;
  imageUrl: string;
  aiResult: AIResult;
  createdAt: Date;
}

// Tier 2 Types
export interface Patient {
  _id: string;
  clinicId: string;
  patientId: string; // Clinic's own patient ID
  name: string;
  age: number;
  gender: "male" | "female" | "other";
  phone: string;
  email?: string;
  address?: string;
  medicalHistory?: string;
  allergies?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Visit {
  _id: string;
  clinicId: string;
  patientId: string;
  visitDate: Date;
  visitType: "dermatology" | "cosmetology";
  chiefComplaint?: string;
  diagnosis?: string;

  // Dynamic fields stored as flexible object
  customFields?: Record<string, any>;

  // Images
  images: {
    url: string;
    type: "clinical" | "dermoscopy" | "before" | "after";
    aiResult?: AIResult;
    uploadedAt: Date;
  }[];

  // Prescription & Treatment
  prescription?: {
    medications: {
      name: string;
      dosage: string;
      frequency: string;
      duration: string;
    }[];
    instructions?: string;
  };

  procedures?: string[];

  // Report
  reportUrl?: string;

  createdAt: Date;
  updatedAt: Date;
}

// Payment Types
export interface PaymentRecord {
  _id: string;
  userId: string;
  tier: UserTier;
  amount: number;
  currency: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  status: "pending" | "completed" | "failed";
  createdAt: Date;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Form Field Types (for dynamic Tier 2 forms)
export interface CustomField {
  fieldName: string;
  fieldType: "text" | "number" | "date" | "select" | "textarea";
  options?: string[]; // For select type
  required?: boolean;
}

export interface ClinicSettings {
  _id: string;
  clinicId: string;
  customFields: {
    dermatology: CustomField[];
    cosmetology: CustomField[];
  };
  templates: {
    prescription: string;
    procedure: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}
