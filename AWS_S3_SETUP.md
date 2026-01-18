# 🗂️ AWS S3 Setup Complete

## ✅ What's Been Created

### **AWS S3 Utilities:**
1. ✅ **S3 Configuration** - AWS SDK setup with secure credentials
2. ✅ **Upload Function** - Upload images to S3 with organized folders
3. ✅ **Delete Function** - Delete single/multiple files, folders
4. ✅ **Signed URLs** - Temporary secure access to private files
5. ✅ **Image Processing** - Resize, compress, optimize with Sharp
6. ✅ **Upload API Endpoint** - `/api/upload` for client uploads

---

## 📁 Files Created

### **AWS Utilities** (`/lib/aws/`)
1. [s3-config.ts](lib/aws/s3-config.ts) - S3 configuration & folder structure
2. [upload.ts](lib/aws/upload.ts) - Upload single/multiple files
3. [delete.ts](lib/aws/delete.ts) - Delete files and folders
4. [signed-url.ts](lib/aws/signed-url.ts) - Generate temporary signed URLs
5. [image-processing.ts](lib/aws/image-processing.ts) - Image optimization with Sharp
6. [index.ts](lib/aws/index.ts) - Central export

### **API Routes** (`/app/api/`)
1. [upload/route.ts](app/api/upload/route.ts) - Image upload endpoint

---

## 🗂️ S3 Folder Structure

```
derma-hms-bucket/
├── tier1/
│   └── scans/
│       └── {userId}/
│           └── {timestamp}-{uuid}.jpg
├── tier2/
│   ├── clinical/
│   │   └── {clinicId}/
│   │       └── {timestamp}-{uuid}.jpg
│   ├── dermoscopic/
│   │   └── {clinicId}/
│   │       └── {timestamp}-{uuid}.jpg
│   ├── before/
│   │   └── {clinicId}/
│   │       └── {timestamp}-{uuid}.jpg
│   └── after/
│       └── {clinicId}/
│           └── {timestamp}-{uuid}.jpg
├── reports/
│   ├── pdf/
│   │   └── {clinicId}/
│   │       └── {consultationId}.pdf
│   └── word/
│       └── {clinicId}/
│           └── {consultationId}.docx
└── clinics/
    ├── logos/
    │   └── {clinicId}.png
    ├── seals/
    │   └── {clinicId}.png
    └── signatures/
        └── {doctorId}.png
```

---

## ⚙️ Environment Setup

Add these to your [.env.local](.env.local):

```env
# AWS S3
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=eu-north-1
AWS_S3_BUCKET_NAME=derma-hms-images
```

### **Getting AWS Credentials:**

1. **Login to AWS Console**: https://console.aws.amazon.com/
2. **Go to IAM** → Users → Add User
3. **Create user** with programmatic access
4. **Attach policy**: `AmazonS3FullAccess` (or create custom policy)
5. **Copy** Access Key ID and Secret Access Key
6. **Create S3 Bucket**:
   - Go to S3 Console
   - Click "Create bucket"
   - Name: `derma-hms-images`
   - Region: `eu-north-1` (Stockholm)
   - Block all public access: ✅ (files are private)
   - Enable versioning: ✅ (optional but recommended)

---

## 🚀 Usage Examples

### **1. Upload Image (Server-Side)**

```typescript
import { uploadToS3, S3_FOLDERS } from "@/lib/aws";

// Upload dermoscopic image
const result = await uploadToS3(
  imageBuffer,
  "image/jpeg",
  {
    folder: "TIER2_DERMOSCOPIC",
    clinicId: clinic._id.toString()
  }
);

if (result.success) {
  console.log("✅ Uploaded:", result.url);
  console.log("📁 S3 Key:", result.key);

  // Save URL to database
  consultation.images.push({
    url: result.url,
    type: "dermoscopic",
    uploadedAt: new Date()
  });
}
```

### **2. Upload Image (Client-Side via API)**

```typescript
// Frontend code
async function uploadImage(file: File, userId: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", "TIER1_SCANS");
  formData.append("userId", userId);
  formData.append("processImage", "true"); // Auto-resize & compress

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (data.success) {
    console.log("✅ Uploaded:", data.url);
    return data.url;
  } else {
    console.error("❌ Upload failed:", data.error);
  }
}
```

### **3. Process Image Before Upload**

```typescript
import { processImage, uploadToS3 } from "@/lib/aws";

// Read file
const fileBuffer = await file.arrayBuffer();
const buffer = Buffer.from(fileBuffer);

// Process: resize, compress, optimize
const processed = await processImage(buffer, {
  maxWidth: 2048,
  maxHeight: 2048,
  quality: 90,
  format: "jpeg"
});

// Upload processed image
const result = await uploadToS3(
  processed.buffer,
  processed.contentType,
  { folder: "TIER2_CLINICAL", clinicId }
);
```

### **4. Delete Image**

```typescript
import { deleteFromS3 } from "@/lib/aws";

// Delete using S3 key
await deleteFromS3("tier2/clinical/clinic123/1234567890-abc123.jpg");

// Or delete using full URL
await deleteFromS3(imageUrl);
```

### **5. Generate Signed URL (Temporary Access)**

```typescript
import { getSignedUrl } from "@/lib/aws";

// Generate signed URL valid for 1 hour
const signedUrl = getSignedUrl(
  "tier2/clinical/clinic123/image.jpg",
  3600 // 1 hour in seconds
);

// User can access this URL for 1 hour
console.log("Temporary URL:", signedUrl);
```

### **6. Validate Image**

```typescript
import { validateImage } from "@/lib/aws/image-processing";

const validation = await validateImage(imageBuffer, 8); // 8MB max

if (!validation.valid) {
  return res.status(400).json({ error: validation.error });
}
```

### **7. Generate Thumbnail**

```typescript
import { generateThumbnail } from "@/lib/aws/image-processing";

const thumbnailBuffer = await generateThumbnail(imageBuffer, 300);

// Upload thumbnail
await uploadToS3(thumbnailBuffer, "image/jpeg", {
  folder: "TIER2_CLINICAL",
  clinicId,
  customFileName: "thumbnail-300.jpg"
});
```

---

## 🔧 Complete Upload Flow (with AI)

### **Tier 1 - AI Scan Upload**

```typescript
import { uploadToS3, processImage } from "@/lib/aws";
import { runAIInference } from "@/lib/ai";
import { Tier1Scan } from "@/models";

export async function handleTier1Upload(
  userId: string,
  imageFile: File
) {
  // 1. Convert to buffer
  const buffer = Buffer.from(await imageFile.arrayBuffer());

  // 2. Validate
  const validation = await validateImage(buffer, 8);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 3. Process image
  const processed = await processImage(buffer, {
    maxWidth: 2048,
    maxHeight: 2048,
    quality: 90,
    format: "jpeg"
  });

  // 4. Upload to S3
  const uploadResult = await uploadToS3(
    processed.buffer,
    processed.contentType,
    { folder: "TIER1_SCANS", userId }
  );

  if (!uploadResult.success) {
    throw new Error("Upload failed");
  }

  // 5. Run AI inference
  const aiResult = await runAIInference(processed.buffer);

  // 6. Save to database
  const scan = await Tier1Scan.create({
    userId,
    imageUrl: uploadResult.url,
    aiResult: {
      predictions: aiResult.predictions,
      topPrediction: aiResult.topPrediction,
      confidence: aiResult.confidence,
      timestamp: new Date()
    }
  });

  return scan;
}
```

### **Tier 2 - Consultation Image Upload**

```typescript
import { uploadToS3 } from "@/lib/aws";
import { ConsultationDermatology } from "@/models";
import { runAIInference } from "@/lib/ai";

export async function handleConsultationImageUpload(
  consultationId: string,
  imageFile: File,
  imageType: "clinical" | "dermoscopic",
  clinicId: string
) {
  // 1. Process & upload
  const buffer = Buffer.from(await imageFile.arrayBuffer());
  const processed = await processImage(buffer);

  const folder = imageType === "dermoscopic"
    ? "TIER2_DERMOSCOPIC"
    : "TIER2_CLINICAL";

  const uploadResult = await uploadToS3(
    processed.buffer,
    processed.contentType,
    { folder, clinicId }
  );

  // 2. Run AI only for dermoscopic images
  let aiResult = undefined;
  if (imageType === "dermoscopic") {
    aiResult = await runAIInference(processed.buffer);
  }

  // 3. Update consultation
  const consultation = await ConsultationDermatology.findByIdAndUpdate(
    consultationId,
    {
      $push: {
        images: {
          url: uploadResult.url,
          type: imageType,
          uploadedAt: new Date(),
          ...(aiResult && { aiResult })
        }
      }
    },
    { new: true }
  );

  return consultation;
}
```

---

## 🔒 Security Features

### **1. Private Files**
All files are private by default. No public access.

### **2. Encryption**
Files are encrypted at rest using AES-256 (server-side encryption).

### **3. Signed URLs**
Temporary access with expiration for secure sharing.

### **4. File Validation**
- Type validation (only images allowed)
- Size validation (max 8MB)
- Format validation (JPEG, PNG, WebP)

### **5. Organized Storage**
- User/Clinic-specific folders
- No file name collisions (UUID + timestamp)

---

## 📊 File Size Limits

```typescript
export const MAX_IMAGE_SIZE = 8 * 1024 * 1024;      // 8MB
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;  // 10MB
```

---

## 🎨 Image Processing Features

### **Resize**
```typescript
await processImage(buffer, { maxWidth: 1024, maxHeight: 1024 });
```

### **Compress**
```typescript
await processImage(buffer, { quality: 80 });
```

### **Convert Format**
```typescript
await processImage(buffer, { format: "webp" });
```

### **Generate Thumbnail**
```typescript
const thumbnail = await generateThumbnail(buffer, 300);
```

### **Add Watermark** (for downloaded reports)
```typescript
const watermarked = await addWatermark(buffer, "Confidential");
```

---

## 🧪 Testing S3 Setup

Create a test endpoint:

```typescript
// app/api/test-s3/route.ts
import { NextResponse } from "next/server";
import { s3, BUCKET_NAME } from "@/lib/aws";

export async function GET() {
  try {
    // List buckets to test connection
    const buckets = await s3.listBuckets().promise();

    return NextResponse.json({
      success: true,
      message: "S3 connection successful",
      bucket: BUCKET_NAME,
      allBuckets: buckets.Buckets?.map(b => b.Name)
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "S3 connection failed"
    }, { status: 500 });
  }
}
```

Test it:
```bash
curl http://localhost:3000/api/test-s3
```

---

## ✅ Setup Checklist

- [ ] AWS account created
- [ ] IAM user created with S3 access
- [ ] Access keys added to `.env.local`
- [ ] S3 bucket created (`derma-hms-images`)
- [ ] Bucket region set to `ap-south-1`
- [ ] Files tested with upload API
- [ ] Signed URLs tested
- [ ] Image processing tested

---

## 🎯 Next Steps

Now that S3 is ready, you can:

1. **Build AI Integration** - Connect AI model for inference
2. **Build API Routes** - Auth, patients, consultations
3. **Build Frontend** - Upload components, image viewers

---

**Status: AWS S3 Setup Complete ✅**

Ready for AI integration or API routes!
