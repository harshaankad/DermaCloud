# 🗄️ MongoDB Setup Complete

## ✅ What's Been Created

### **11 Mongoose Models:**

1. **User** - Doctors & Tier 1 users
2. **Clinic** - Clinic profiles with custom field settings
3. **Patient** - Patient records
4. **ConsultationDermatology** - Dermatology consultations
5. **ConsultationCosmetology** - Cosmetology consultations
6. **TemplateDermatology** - Dermatology templates
7. **TemplateCosmetology** - Cosmetology templates
8. **OTP** - One-time passwords for signup
9. **Tier1Scan** - AI scans for Tier 1 users
10. **UsageTracking** - Daily/monthly scan limits
11. **Connection Utility** - MongoDB connection with caching

---

## 📊 Database Structure

### **Collections Overview:**

```
derma-hms (database)
├── users
├── clinics
├── patients
├── consultationdermatologies
├── consultationcosmetologies
├── templatedermatologies
├── templatecosmetologies
├── otps (auto-expires after 10 minutes)
├── tier1scans
└── usagetrackings
```

---

## 🔑 Key Features

### **1. Custom Fields System**

**Clinic Level Settings:**
```javascript
{
  dermatologyFieldSettings: {
    patientInfo: {
      complaint: { visible: true, required: true },
      duration: { visible: false, required: false }  // Doctor hid this
    }
  },

  dermatologyCustomFields: [
    {
      fieldName: "Family History",
      fieldType: "textarea",
      section: "patientInfo",
      required: false
    }
  ]
}
```

**Consultation Level (stores values):**
```javascript
{
  patientInfo: {
    complaint: "Acne breakout"
  },
  customFields: {
    "Family History": "Mother has psoriasis"
  }
}
```

### **2. AI Integration (Dermoscopic Images Only)**

```javascript
// In ConsultationDermatology
images: [
  {
    url: "https://s3...",
    type: "dermoscopic",
    aiResult: {
      predictions: [
        { condition: "Melanoma", probability: 0.87 },
        { condition: "Nevus", probability: 0.12 }
      ],
      topPrediction: "Melanoma",
      confidence: 0.87
    }
  },
  {
    url: "https://s3...",
    type: "clinical"
    // NO aiResult - clinical images don't run AI
  }
]
```

### **3. Usage Tracking (Tier 1 Limits)**

**Daily Limit:** 5 scans
**Monthly Limit:** 100-120 scans

```javascript
{
  userId: ObjectId,
  date: "2026-01-01",
  dailyScans: 3,
  monthlyScans: 45,
  lastScanAt: Date
}
```

**Helper Functions:**
- `checkDailyLimit(userId)` - Check if user can scan today
- `checkMonthlyLimit(userId)` - Check if user can scan this month
- `incrementScanCount(userId)` - Increment after successful scan
- `getUserUsageStats(userId)` - Get usage statistics

### **4. Templates (Clinic-Specific)**

Doctors create templates to prefill consultation forms:

```javascript
// TemplateDermatology
{
  templateName: "Acne Consultation",
  prefillData: {
    diagnosis: {
      provisional: "Acne Vulgaris"
    },
    treatmentPlan: {
      topicals: "Adapalene 0.1% gel",
      lifestyleChanges: "Avoid oily foods"
    }
  }
}
```

When doctor selects this template → form auto-fills with these values.

### **5. OTP Auto-Expiration**

OTPs automatically delete after 10 minutes using MongoDB TTL index:

```javascript
{
  email: "doctor@example.com",
  otp: "123456",
  expiresAt: Date.now() + 10 minutes,  // Auto-deletes after this time
  verified: false
}
```

---

## 🔗 Relationships

```
User (Tier 2)
  └── has one → Clinic
      ├── has many → Patients
      ├── has many → ConsultationDermatology
      ├── has many → ConsultationCosmetology
      ├── has many → TemplateDermatology
      └── has many → TemplateCosmetology

User (Tier 1)
  ├── has many → Tier1Scan
  └── has one → UsageTracking (per day)

Patient
  ├── belongs to → Clinic
  ├── has many → ConsultationDermatology
  └── has many → ConsultationCosmetology
```

---

## 🚀 How to Use

### **1. Import Models:**

```typescript
import { User, Clinic, Patient, ConsultationDermatology } from "@/models";
```

### **2. Connect to Database:**

```typescript
import { connectDB } from "@/lib/db";

await connectDB();
```

### **3. Create a User:**

```typescript
const user = await User.create({
  email: "doctor@clinic.com",
  password: hashedPassword,
  name: "Dr. Sharma",
  tier: "tier2",
  phone: "9876543210"
});
```

### **4. Create a Clinic:**

```typescript
const clinic = await Clinic.create({
  doctorId: user._id,
  clinicName: "Dr. Sharma's Dermatology Clinic",
  address: "123 MG Road, Bangalore",
  phone: "9876543210"
  // dermatologyFieldSettings and cosmetologyFieldSettings auto-populate with defaults
});

// Link clinic to user
user.clinicId = clinic._id;
await user.save();
```

### **5. Add Custom Field:**

```typescript
await Clinic.findByIdAndUpdate(clinicId, {
  $push: {
    dermatologyCustomFields: {
      fieldName: "Allergy Test Result",
      fieldType: "select",
      options: ["Positive", "Negative"],
      section: "diagnosis",
      required: true
    }
  }
});
```

### **6. Create Patient:**

```typescript
const patient = await Patient.create({
  clinicId: clinic._id,
  patientId: "PAT00001",  // or use generatePatientId()
  name: "John Doe",
  age: 35,
  gender: "male",
  phone: "9123456789"
});
```

### **7. Create Dermatology Consultation:**

```typescript
const consultation = await ConsultationDermatology.create({
  clinicId: clinic._id,
  patientId: patient._id,
  doctorId: user._id,
  patientInfo: {
    name: patient.name,
    age: patient.age,
    gender: patient.gender,
    complaint: "Acne on face",
    duration: "2 months"
  },
  clinicalExamination: {
    lesionSite: "Face - cheeks",
    morphology: "Papules and pustules"
  },
  images: [
    {
      url: "https://s3.../dermoscopic.jpg",
      type: "dermoscopic",
      aiResult: {
        predictions: [...],
        topPrediction: "Acne Vulgaris",
        confidence: 0.92
      }
    }
  ],
  customFields: {
    "Allergy Test Result": "Negative"
  },
  status: "completed"
});
```

### **8. Check Tier 1 Usage:**

```typescript
import { checkDailyLimit, incrementScanCount } from "@/lib/db";

const { allowed, remaining } = await checkDailyLimit(userId);

if (allowed) {
  // Run AI scan
  await incrementScanCount(userId);
} else {
  // Show "Daily limit exceeded"
}
```

---

## 📝 Indexes

All models have optimized indexes for fast queries:

- **User**: `email`, `tier`
- **Clinic**: `doctorId`
- **Patient**: `(clinicId, patientId)`, `(clinicId, phone)`, `name` (text search)
- **Consultations**: `(clinicId, consultationDate)`, `(patientId, consultationDate)`, `status`
- **Templates**: `(clinicId, templateName)`
- **OTP**: `(email, createdAt)`, `expiresAt` (TTL)
- **Tier1Scan**: `(userId, createdAt)`
- **UsageTracking**: `(userId, date)`

---

## 🔒 Validation

All models include:
- ✅ Required field validation
- ✅ Email format validation
- ✅ Phone number validation (10 digits)
- ✅ Enum validation (tier, gender, status, etc.)
- ✅ Min/max validation (age, probability, etc.)

---

## 🧪 Testing Connection

Create a test file to verify MongoDB connection:

```typescript
// test-db.ts
import { connectDB } from "@/lib/db";
import { User } from "@/models";

async function test() {
  await connectDB();
  console.log("✅ Connected to MongoDB");

  const count = await User.countDocuments();
  console.log(`📊 Users in database: ${count}`);
}

test();
```

---

## ⚙️ Environment Setup

Make sure your [.env.local](.env.local) has:

```env
MONGODB_URI=mongodb://localhost:27017/derma-hms
```

Or use MongoDB Atlas:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/derma-hms
```

---

## 📦 Helper Functions Available

All in `lib/db/helpers.ts`:

1. **checkDailyLimit(userId)** - Check daily scan limit
2. **checkMonthlyLimit(userId)** - Check monthly scan limit
3. **incrementScanCount(userId)** - Increment scan count
4. **getUserUsageStats(userId)** - Get usage statistics
5. **generatePatientId(clinicId)** - Auto-generate patient ID
6. **validateCustomFields(data, definitions)** - Validate custom field data

---

## 🎯 Next Steps

Now that MongoDB is set up, you can:

1. ✅ **Test the connection** - Run `npm run dev` and check DB connection
2. **Build API Routes** - Create endpoints for CRUD operations
3. **Build Auth System** - JWT + bcrypt for login/signup
4. **Build Frontend** - Pages to interact with these models

---

**Status: MongoDB Setup Complete ✅**

Ready to proceed with API routes or AWS S3 setup!
