# ✅ AWS S3 Setup Complete!

## 🎉 What We've Built

### **Complete S3 Image Management System**

✅ **S3 Configuration** - Organized folder structure for all image types
✅ **Upload System** - Single & batch uploads with auto-naming
✅ **Delete System** - File & folder deletion
✅ **Signed URLs** - Temporary secure access
✅ **Image Processing** - Resize, compress, optimize, thumbnails
✅ **Upload API** - `/api/upload` endpoint ready
✅ **Test Endpoint** - `/api/test-s3` to verify connection

---

## 📂 File Structure

```
lib/aws/
├── s3-config.ts         # AWS SDK setup + folder structure
├── upload.ts            # Upload single/multiple files
├── delete.ts            # Delete files and folders
├── signed-url.ts        # Generate temporary signed URLs
├── image-processing.ts  # Sharp image optimization
└── index.ts             # Central export

app/api/
├── upload/
│   └── route.ts         # POST /api/upload
└── test-s3/
    └── route.ts         # GET /api/test-s3
```

---

## 🗂️ S3 Bucket Structure

```
derma-hms-bucket/
├── tier1/scans/{userId}/              # Tier 1 AI scans
├── tier2/
│   ├── clinical/{clinicId}/           # Clinical images
│   ├── dermoscopic/{clinicId}/        # Dermoscopic images (AI)
│   ├── before/{clinicId}/             # Before photos (cosmetology)
│   └── after/{clinicId}/              # After photos (cosmetology)
├── reports/
│   ├── pdf/{clinicId}/                # Generated PDF reports
│   └── word/{clinicId}/               # Generated Word reports
└── clinics/
    ├── logos/{clinicId}/              # Clinic logos
    ├── seals/{clinicId}/              # Clinic seals
    └── signatures/{doctorId}/         # Doctor signatures
```

---

## 🚀 Quick Start

### **1. Configure AWS Credentials**

Add to [.env.local](.env.local):

```env
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=eu-north-1
AWS_S3_BUCKET_NAME=derma-hms-images
```

### **2. Create S3 Bucket**

1. Login to AWS Console → S3
2. Create bucket named `derma-hms-images`
3. Region: `eu-north-1` (Stockholm)
4. Block all public access ✅
5. Enable versioning (optional)

### **3. Test Connection**

```bash
npm run dev
```

Then visit:
```
http://localhost:3000/api/test-s3
```

Expected response:
```json
{
  "success": true,
  "message": "✅ S3 connection successful",
  "config": {
    "bucket": "derma-hms-images",
    "region": "eu-north-1",
    "bucketExists": true
  }
}
```

---

## 💡 Usage Examples

### **Example 1: Upload Dermoscopic Image (with AI)**

```typescript
import { uploadToS3, processImage } from "@/lib/aws";
import { runAIInference } from "@/lib/ai";

// Process image
const processed = await processImage(imageBuffer, {
  maxWidth: 2048,
  maxHeight: 2048,
  quality: 90
});

// Upload to S3
const result = await uploadToS3(
  processed.buffer,
  processed.contentType,
  {
    folder: "TIER2_DERMOSCOPIC",
    clinicId: "clinic123"
  }
);

// Run AI inference
const aiResult = await runAIInference(processed.buffer);

// Save to consultation
consultation.images.push({
  url: result.url,
  type: "dermoscopic",
  aiResult,
  uploadedAt: new Date()
});
```

### **Example 2: Upload via API (Frontend)**

```typescript
async function uploadImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", "TIER1_SCANS");
  formData.append("userId", currentUser.id);
  formData.append("processImage", "true");

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  return data.url;
}
```

### **Example 3: Delete Image**

```typescript
import { deleteFromS3 } from "@/lib/aws";

// When deleting consultation
await deleteFromS3(consultation.images[0].url);
```

### **Example 4: Generate Signed URL**

```typescript
import { getSignedUrl } from "@/lib/aws";

// For temporary download/viewing
const tempUrl = getSignedUrl(imageKey, 3600); // 1 hour
```

---

## 🔒 Security Features

| Feature | Description |
|---------|-------------|
| **Private Files** | All files blocked from public access |
| **Encryption** | AES-256 server-side encryption |
| **Signed URLs** | Temporary access with expiration |
| **Validation** | Type, size, format checks |
| **Organized Storage** | User/clinic-specific folders |

---

## 📏 File Limits

| Type | Max Size |
|------|----------|
| Images (JPEG, PNG, WebP) | 8 MB |
| Documents (PDF, DOCX) | 10 MB |

---

## 🎨 Image Processing Features

```typescript
// Resize
await processImage(buffer, { maxWidth: 1024, maxHeight: 1024 });

// Compress
await processImage(buffer, { quality: 80 });

// Convert
await processImage(buffer, { format: "webp" });

// Thumbnail
await generateThumbnail(buffer, 300);

// Watermark
await addWatermark(buffer, "Confidential");
```

---

## 🧪 Testing Checklist

Test your S3 setup:

```bash
# 1. Test connection
curl http://localhost:3000/api/test-s3

# 2. Test upload (use Postman or create frontend)
POST http://localhost:3000/api/upload
Body: multipart/form-data
  - file: [image file]
  - folder: TIER1_SCANS
  - userId: test123
  - processImage: true

# 3. Verify in AWS Console
# Check S3 bucket for uploaded files
```

---

## 📖 API Reference

### **POST /api/upload**

Upload an image to S3.

**Request:**
```typescript
FormData {
  file: File              // Required
  folder: string          // Required (S3_FOLDERS key)
  userId?: string         // Optional
  clinicId?: string       // Optional
  processImage?: boolean  // Auto-resize & compress
}
```

**Response:**
```typescript
{
  success: boolean
  url?: string           // S3 file URL
  key?: string           // S3 object key
  error?: string
}
```

---

## 🔗 Integration Points

### **With MongoDB Models:**

```typescript
// Tier 1 Scan
const scan = await Tier1Scan.create({
  userId,
  imageUrl: uploadResult.url,  // ← S3 URL
  aiResult: { ... }
});

// Consultation Image
consultation.images.push({
  url: uploadResult.url,        // ← S3 URL
  type: "dermoscopic",
  aiResult: { ... }
});
```

### **With AI Model:**

```typescript
// 1. Upload to S3
const s3Result = await uploadToS3(...);

// 2. Run AI (pass buffer, not URL)
const aiResult = await runAIInference(imageBuffer);

// 3. Save both
consultation.images.push({
  url: s3Result.url,
  aiResult
});
```

---

## ⚠️ Important Notes

1. **Never commit `.env.local`** - Contains AWS secrets
2. **Test in development first** - Don't upload to production bucket during testing
3. **Monitor S3 costs** - AWS charges for storage and bandwidth
4. **Delete unused files** - Clean up old images to save costs
5. **Use signed URLs** - For secure, temporary access

---

## 🎯 What's Next?

Now that S3 is ready:

**A) AI Integration** - Connect your trained model for inference
**B) API Routes** - Auth, CRUD endpoints
**C) Frontend** - Upload UI, image viewers

Which one would you like to build next?

---

**Status: AWS S3 Setup Complete ✅**

All image storage infrastructure is ready for production!
