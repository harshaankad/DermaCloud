# Chapter 7 — Dermatology Visit + AI Pipeline

Chapter 6 traced the cosmetology flow from start to finish. This chapter does the same for **dermatology** — but now we have an extra player: **the AI pipeline**. A machine learning model looks at dermoscope images and predicts what skin condition the patient might have.

This chapter focuses on **what's different** from cosmetology. If something works the same way (form submission, PDF generation, WhatsApp sharing), we will say so briefly and point you back to Chapter 6 instead of repeating it.

---

## Table of contents

| # | Section |
|---|---------|
| 1 | [Cosmetology vs. dermatology — what's different?](#1-cosmetology-vs-dermatology--whats-different) |
| 2 | [The dermatology data model](#2-the-dermatology-data-model) |
| 3 | [Two types of images](#3-two-types-of-images) |
| 4 | [The AI pipeline — architecture overview](#4-the-ai-pipeline--architecture-overview) |
| 5 | [The AI service — Python + ONNX](#5-the-ai-service--python--onnx) |
| 6 | [The inference client — lib/ai/inference.ts](#6-the-inference-client) |
| 7 | [The upload route — where AI meets S3](#7-the-upload-route--where-ai-meets-s3) |
| 8 | [The visit page — how it all comes together](#8-the-visit-page) |
| 9 | [The "Analyse with AI" button](#9-the-analyse-with-ai-button) |
| 10 | [The submit flow](#10-the-submit-flow) |
| 11 | [The POST API — saving a dermatology consultation](#11-the-post-api) |
| 12 | [The condition causes database](#12-the-condition-causes-database) |
| 13 | [The AI explanation — Claude for dermatology](#13-the-ai-explanation--claude-for-dermatology) |
| 14 | [The consultation details page](#14-the-consultation-details-page) |
| 15 | [PDF generation — what's different](#15-pdf-generation--whats-different) |
| 16 | [Multi-issue dermatology](#16-multi-issue-dermatology) |
| 17 | [The labels — what the model knows](#17-the-labels--what-the-model-knows) |
| 18 | [Gotchas](#18-gotchas) |
| 19 | [If I changed X, what breaks?](#19-if-i-changed-x-what-breaks) |

---

<a id="1-cosmetology-vs-dermatology--whats-different"></a>
## 1. Cosmetology vs. dermatology — what's different?

| Feature | Cosmetology | Dermatology |
|---------|------------|-------------|
| **Image types** | One type: "visit photos" | Two types: "clinical" and "dermoscopic" |
| **AI inference** | None — photos are just stored | ONNX model predicts skin conditions from dermoscope images |
| **Form fields** | Procedure name, products, pricing, GST | Complaint, lesion site, morphology, severity, diagnosis, treatment plan |
| **Pricing** | Base price + GST per procedure | No procedure pricing |
| **Procedure catalog** | Yes — autocomplete with auto-pricing | No |
| **Patient explanation** | Claude AI (streaming) | Claude AI (streaming) — same system, different prompt |
| **PDF structure** | Procedure-focused | Diagnosis-focused, includes AI predictions |
| **Condition causes** | None | Built-in database of causes/tips per condition |
| **URL path** | `/clinic/visit/cosmetology` | `/clinic/visit/dermatology` |
| **Details page** | `/clinic/consultation/cosmetology/[id]` | `/clinic/consultation/[id]` (no "dermatology" in path) |

Everything else — the form system, templates, multi-issue support, image compression, before/after comparison, appointment linking — works the same way.

---

<a id="2-the-dermatology-data-model"></a>
## 2. The dermatology data model

> **File**: [models/ConsultationDermatology.ts](models/ConsultationDermatology.ts)

Here is the shape of a dermatology consultation document:

```
{
  clinicId         → Clinic
  patientId        → Patient
  doctorId         → User
  appointmentId    → Appointment (optional)
  consultationDate: Date

  patientInfo: {
    name, age, gender,
    complaint,              ← "itching on arms for 2 weeks"
    duration,               ← "2 weeks"
    previousTreatment       ← "tried clobetasol cream"
  }

  clinicalExamination: {
    lesionSite,             ← "bilateral forearms"
    morphology,             ← "erythematous papules"
    distribution,           ← "symmetrical"
    severity                ← "moderate"
  }

  dermoscopeFindings: {
    patterns,               ← doctor's own observation
    aiResults: {            ← what the AI model predicted
      predictions: [{ condition, probability }],
      topPrediction: string,
      confidence: number,
      timestamp: Date
    },
    finalInterpretation     ← doctor's final word
  }

  diagnosis: {
    provisional,            ← "Psoriasis"
    differentials: []       ← ["Eczema", "Dermatitis"]
  }

  treatmentPlan: {
    topicals,               ← "Clobetasol 0.05% cream BD"
    orals,                  ← "Cetirizine 10mg OD"
    lifestyleChanges,       ← "avoid hot showers"
    investigations,         ← "skin biopsy if no improvement"
    medications: [{ name, dosage, frequency, duration }]
  }

  images: [{
    url: string,
    type: "clinical" | "dermoscopic",     ← this is the key difference
    uploadedAt: Date,
    aiResult?: { ... }                    ← per-image AI result (optional)
  }]

  followUp:        { date, reason }
  patientSummary:  { aiGenerated, doctorEdited, translations: { hindi, kannada } }
  customFields:    { ... everything ... }

  status: "completed"
}
```

Compare this with cosmetology (Chapter 6, section 10). The big differences:

1. **`clinicalExamination`** replaces cosmetology's `assessment` — it has medical-specific fields like `lesionSite` and `morphology`.
2. **`dermoscopeFindings`** is entirely new — it holds the AI predictions.
3. **`diagnosis`** has `provisional` and `differentials` instead of just free-text.
4. **`treatmentPlan`** replaces `procedure` — it has topicals, orals, lifestyle changes instead of procedure name and pricing.
5. **Images have a `type` field** — either `"clinical"` or `"dermoscopic"`.

---

<a id="3-two-types-of-images"></a>
## 3. Two types of images

In cosmetology, all photos are the same. In dermatology, there are **two types**:

| Type | What it is | Example |
|------|-----------|---------|
| **Clinical** | A regular photo of the affected area, taken with a phone camera | A photo of a rash on someone's arm |
| **Dermoscopic** | A magnified photo taken with a dermoscope (a special device that attaches to the phone) | A zoomed-in view of a mole showing its internal structure |

Why does this matter? Because **only dermoscopic images** are sent to the AI model. Clinical photos are just for documentation.

On the visit form, each issue has two upload sections:

```ts
interface Issue {
  id: string;
  formData: Record<string, any>;
  clinicalImages: File[];        // regular photos
  dermoscopeImages: File[];      // dermoscope photos → these go to AI
  clinicalPreviews: string[];    // base64 previews
  dermoscopePreviews: string[];  // base64 previews
  aiResults: any;                // AI prediction results (null until analyzed)
  aiProcessing: boolean;         // true while AI is running
  isExpanded: boolean;
}
```

Compare with cosmetology's `Issue`, which just had `visitImages` and `visitPreviews` — one type.

---

<a id="4-the-ai-pipeline--architecture-overview"></a>
## 4. The AI pipeline — architecture overview

Here is how the AI pipeline works, from the doctor uploading a dermoscope image to seeing a prediction:

```
Doctor uploads dermoscope images on visit page
        ↓
Doctor clicks "Analyse with AI"
        ↓
Frontend sends images to POST /api/tier2/upload (WITHOUT skipAI)
        ↓
Upload route: saves images to S3 + calls predictSkinCondition()
        ↓
predictSkinCondition() sends image to remote AI service over HTTPS
        ↓
AI service (Python + FastAPI + ONNX):
  - Resizes image to 224×224
  - Normalizes pixel values (ImageNet mean/std)
  - Runs ONNX model inference
  - Returns top 3 predictions with probabilities
        ↓
Upload route: averages predictions across all images
        ↓
Returns { imageUrls, averageScores, finalResult } to frontend
        ↓
Frontend shows prediction bars (e.g. "Psoriasis 78%, Eczema 15%")
```

**Why is the AI service separate?** The ONNX model file is large (too big for Vercel's 250 MB function limit). So the model runs on a separate server (Railway, Fly.io, etc.) and the Next.js app calls it over HTTPS.

> **Java analogy**: this is like having a microservice architecture. Your main Spring Boot app calls a separate Python ML service via REST API.

---

<a id="5-the-ai-service--python--onnx"></a>
## 5. The AI service — Python + ONNX

> **File**: [ai-service/main.py](ai-service/main.py)

The AI service is a small **Python** app using **FastAPI** (similar to Spring Boot for Python). It has one job: take an image, run it through the model, return predictions.

### 5.1 — What is ONNX?

ONNX stands for **Open Neural Network Exchange**. It is a file format for machine learning models. Think of it like a `.jar` file but for ML models — it can be created in PyTorch or TensorFlow and then run anywhere using the ONNX Runtime.

The model file is `ai-service/skin_condition_model.onnx`.

### 5.2 — What does the model predict?

The model can recognize **10 skin conditions**:

> **File**: [labels.json](labels.json)

```json
[
  "Alopecia areata",
  "Basal cell carcinoma",
  "Eczema",
  "Herpes Zoster",
  "LP",
  "Nevus Depigmentosus",
  "Psoriasis",
  "Tinea incognito",
  "Viral warts",
  "Vitiligo"
]
```

For each image, the model outputs a probability for each condition. The top 3 are returned.

### 5.3 — How the prediction works

Step by step:

**Step 1 — Preprocess the image.**

```python
def preprocess(image_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((224, 224))
    arr = np.asarray(img, dtype=np.float32) / 255.0      # scale pixels to [0, 1]
    arr = (arr - MEAN) / STD                               # ImageNet normalization
    arr = arr.transpose(2, 0, 1)                           # change shape from HWC to CHW
    return arr[np.newaxis, :].astype(np.float32)           # add batch dimension: [1, 3, 224, 224]
```

What is happening here?

1. Open the image and resize to 224x224 pixels (the model expects this exact size).
2. Scale pixel values from 0-255 to 0-1.
3. Apply **ImageNet normalization** — subtract the mean and divide by standard deviation. This is a standard step because the model was trained on ImageNet-normalized data.
4. Rearrange the dimensions from Height-Width-Channels to Channels-Height-Width (the model expects this order).
5. Add a batch dimension (the model expects `[batch_size, channels, height, width]`).

> **Java analogy**: this is like preprocessing input data before passing it to a TensorFlow Serving endpoint in Java.

**Step 2 — Run inference.**

```python
outputs = SESSION.run(None, {INPUT_NAME: tensor})
logits = outputs[0][0]
probs = softmax(logits)
```

`SESSION.run` passes the tensor through the neural network and gets raw scores (logits). `softmax` converts these into probabilities that add up to 1.0.

**Step 3 — Return top 3 predictions.**

```python
top_idx = probs.argsort()[-3:][::-1]    # indices of top 3 highest probabilities
predictions = [
    {
        "condition": LABELS[i],
        "probability": float(probs[i]),
        "confidence": confidence_label(float(probs[i])),
    }
    for i in top_idx
]
```

Confidence labels:
- probability > 0.7 → `"high"`
- probability > 0.4 → `"medium"`
- probability ≤ 0.4 → `"low"`

### 5.4 — Authentication

The AI service uses a simple shared secret:

```python
API_KEY = os.environ.get("AI_API_KEY", "")

def check_auth(authorization):
    if not API_KEY: return           # no key = dev mode, skip auth
    expected = f"Bearer {API_KEY}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")
```

The same key is set on both the Next.js app (`AI_API_KEY` env var) and the Python service.

---

<a id="6-the-inference-client"></a>
## 6. The inference client — lib/ai/inference.ts

> **File**: [lib/ai/inference.ts](lib/ai/inference.ts)

This is the **Node.js client** that the Next.js app uses to talk to the Python AI service. It is simple:

```ts
export async function predictSkinCondition(imageBuffer: Buffer): Promise<InferenceResult | null> {
  if (!AI_API_URL) {
    console.warn("[ai] AI_API_URL not configured — skipping inference");
    return null;         // graceful degradation — upload still works
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
  formData.append("file", blob, "image.jpg");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);   // 30 second timeout

  const res = await fetch(`${AI_API_URL}/predict`, {
    method: "POST",
    body: formData,
    headers: AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {},
    signal: controller.signal,
  });

  clearTimeout(timeout);
  const data = await res.json();
  return data;
}
```

Key design choices:

1. **Graceful degradation.** If `AI_API_URL` is not configured, the function returns `null` instead of crashing. Image uploads still work — you just don't get AI predictions.
2. **30-second timeout.** If the AI service is slow or down, we don't wait forever.
3. **Returns `null` on any error.** The caller checks for `null` and continues without AI results.

The return type:

```ts
interface Prediction {
  condition: string;       // e.g. "Psoriasis"
  probability: number;     // e.g. 0.78
  confidence: "high" | "medium" | "low";
}

interface InferenceResult {
  predictions: Prediction[];
  topPrediction: Prediction;
  processingTime: number;  // milliseconds
}
```

---

<a id="7-the-upload-route--where-ai-meets-s3"></a>
## 7. The upload route — where AI meets S3

> **File**: [app/api/tier2/upload/route.ts](app/api/tier2/upload/route.ts)

This is the same upload route used by cosmetology, but with an important difference: **it can run AI inference**.

```ts
export async function POST(request: NextRequest) {
  const skipAI = request.nextUrl.searchParams.get("skipAI") === "true";
  const formData = await request.formData();
  const imageFiles = formData.getAll("images");

  // 1. Validate each image (type check, size check: max 8MB)
  // 2. Upload all images to S3
  const imageUrls = uploadResults.map((r) => r.url!);

  // 3. Run AI if not skipped
  if (!skipAI) {
    const inferenceResults = await Promise.all(
      imageBuffers.map((buf) => predictSkinCondition(buf))
    );
    // ...average predictions across images...
  }

  return NextResponse.json({ success: true, data: { imageUrls, averageScores, finalResult } });
}
```

### The `skipAI` parameter — when does AI run and when does it not?

There is **one upload route** for the whole app: `POST /api/tier2/upload`. It does two things: (1) save images to S3, (2) optionally run AI inference. The `?skipAI=true` query parameter controls whether step 2 happens.

Let's look at **every place** in the app that calls this upload route, and whether AI runs:

#### Scenario 1: Cosmetology visit — uploading procedure photos

```ts
// File: app/clinic/visit/cosmetology/page.tsx (inside handleSubmit)
const res = await fetch("/api/tier2/upload?skipAI=true", { ... });
```

**skipAI = true → AI does NOT run.**

Why? Cosmetology photos are pictures of beauty procedures (facials, peels, laser treatments). The AI model was trained on dermoscopic images of skin diseases. Running it on a photo of a chemical peel would give meaningless results. So cosmetology always skips AI.

The upload route just saves the images to S3 and returns the URLs. That's it.

#### Scenario 2: Dermatology visit — doctor clicks "Analyse with AI"

```ts
// File: app/clinic/visit/dermatology/page.tsx (inside handleAnalyzeDermoscope)
const res = await fetch("/api/tier2/upload", { ... });
//                       ↑ NO skipAI parameter
```

**skipAI = false (default) → AI DOES run.**

This is the moment the doctor wants AI predictions. They have uploaded dermoscope images and they want the model to analyze them. The upload route:
1. Saves all images to S3.
2. Sends each image to the Python AI service.
3. Gets back predictions (e.g. "Psoriasis 78%, Eczema 15%, Vitiligo 7%").
4. Averages the predictions across all images.
5. Returns `{ imageUrls, averageScores, finalResult }`.

The frontend stores these AI results in `issue.aiResults` and shows prediction bars on screen.

#### Scenario 3: Dermatology visit — final submit (dermoscope images)

```ts
// File: app/clinic/visit/dermatology/page.tsx (inside handleSubmit)
if (issue.dermoscopeImages.length > 0) {
  const res = await fetch("/api/tier2/upload?skipAI=true", { ... });
  //                       ↑ skipAI=true this time!
}
```

**skipAI = true → AI does NOT run.**

Wait — why skip AI for dermoscope images at submit time? Because **AI was already run in Scenario 2**. The doctor already clicked "Analyse with AI", saw the predictions, and is now ready to save. Running AI again would:
- Waste 30 seconds of server time.
- Waste money on the AI service.
- Give the same results the doctor already saw.

So at submit time, we just upload the images to S3 to get permanent URLs. The AI results from Scenario 2 are sent separately in the save request body as `aiAnalysis`.

#### Scenario 4: Dermatology visit — final submit (clinical images)

```ts
// File: app/clinic/visit/dermatology/page.tsx (inside handleSubmit)
if (issue.clinicalImages.length > 0) {
  const res = await fetch("/api/tier2/upload", { ... });
  //                       ↑ NO skipAI parameter — oops!
}
```

**skipAI = false → AI DOES run (but shouldn't).**

This is a small inconsistency in the code. Clinical images are regular phone photos (not dermoscope images). Running the AI model on them is pointless — the model was trained on dermoscopic images, not phone photos. The results won't be useful.

The AI results from clinical images are not used anywhere — they are discarded. But the AI service still runs, wasting time. Adding `?skipAI=true` here would be a good improvement.

#### Summary table

| Who calls upload? | When? | skipAI? | AI runs? | Why? |
|---|---|---|---|---|
| Cosmetology submit | Saving procedure photos | `true` | No | AI model doesn't understand beauty photos |
| Dermatology "Analyse with AI" button | Doctor wants predictions | `false` | **Yes** | This is the whole point — get AI predictions |
| Dermatology submit (dermoscope) | Saving for permanent storage | `true` | No | AI already ran earlier, don't repeat |
| Dermatology submit (clinical) | Saving clinical photos | `false` | Yes (wasteful) | Should be `true` — minor code issue |

### Averaging across multiple images

If the doctor uploads 3 dermoscope images, the AI runs on each one separately. The upload route then **averages** the predictions:

```ts
const allConditions = new Map<string, number[]>();
for (const result of validResults) {
  for (const pred of result.predictions) {
    if (!allConditions.has(pred.condition)) allConditions.set(pred.condition, []);
    allConditions.get(pred.condition)!.push(pred.probability);
  }
}

const averageScores = Array.from(allConditions.entries())
  .map(([condition, probs]) => ({
    condition,
    probability: probs.reduce((a, b) => a + b, 0) / probs.length,
  }))
  .sort((a, b) => b.probability - a.probability)
  .slice(0, 3);
```

So if image 1 says "Psoriasis 80%" and image 2 says "Psoriasis 70%", the final score is "Psoriasis 75%".

---

<a id="8-the-visit-page"></a>
## 8. The visit page — how it all comes together

> **File**: [app/clinic/visit/dermatology/page.tsx](app/clinic/visit/dermatology/page.tsx)

The dermatology visit page works like the cosmetology one (Chapter 6, section 5), with these differences:

### 8.1 — Page load

Same as cosmetology — 4 parallel API calls:

```ts
const [patientRes, formRes, templatesRes, apptRes] = await Promise.all([
  fetch(`/api/tier2/patients/${patientId}`, ...),
  fetch(`/api/tier2/settings/forms?formType=dermatology`, ...),    // "dermatology" not "cosmetology"
  fetch(`/api/tier2/templates?templateType=dermatology`, ...),     // "dermatology" not "cosmetology"
  fetch(apptUrl, ...),
]);
```

Plus a 5th call to fetch previous visits for comparison:

```ts
const response = await fetch(`/api/tier2/consultation/dermatology?patientId=${patientId}`, ...);
```

### 8.2 — The AI labels

The page imports the label list for displaying AI results:

```ts
import aiModelLabels from "@/labels.json";
```

This is the same list of 10 conditions from section 5.2. It is used to show prediction bars in the UI.

### 8.3 — Two image upload sections per issue

Each issue card has:
1. A **Clinical Images** section (max 5 per issue)
2. A **Dermoscope Images** section (max 5 per issue) with an "Analyse with AI" button

---

<a id="9-the-analyse-with-ai-button"></a>
## 9. The "Analyse with AI" button

This is the key dermatology feature. When the doctor uploads dermoscope images and clicks "Analyse with AI":

```ts
const handleAnalyzeDermoscope = async (issueId: string) => {
  const issue = issues.find((i) => i.id === issueId);
  if (!issue || issue.dermoscopeImages.length === 0) {
    showToast("Please upload at least one dermoscope image", "error");
    return;
  }

  updateIssue(issueId, { aiProcessing: true });    // show spinner

  const fd = new FormData();
  issue.dermoscopeImages.forEach((img) => fd.append("images", img));

  const res = await fetch("/api/tier2/upload", {     // NO skipAI → AI will run
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });

  const data = await res.json();
  if (data.success) {
    updateIssue(issueId, {
      aiResults: data.data.finalResult,    // { predictions, topPrediction }
      aiProcessing: false,
    });
  }
};
```

Notice: this call does **NOT** include `?skipAI=true`. That's what triggers the AI inference on the server.

After this call, `issue.aiResults` contains the predictions. The UI renders them as horizontal bars — one bar per condition, with the width proportional to the probability.

**Important**: the AI is **not automatic**. The doctor must explicitly click "Analyse with AI". This is a deliberate design choice — the AI is a tool to help, not a replacement for the doctor's judgment.

---

<a id="10-the-submit-flow"></a>
## 10. The submit flow

> **File**: [app/clinic/visit/dermatology/page.tsx:723](app/clinic/visit/dermatology/page.tsx#L723)

The submit flow is similar to cosmetology (Chapter 6, section 6.3), but with these differences:

### 10.1 — Image upload is split by type

For each issue, dermoscope and clinical images are uploaded separately:

```ts
for (const [idx, issue] of issues.entries()) {
  let clinicalImageUrls = [];
  let dermoscopeImageUrls = [];
  const aiAnalysis = issue.aiResults ?? null;    // AI results from earlier

  // Upload dermoscope images (skipAI because AI was already run)
  if (issue.dermoscopeImages.length > 0) {
    const fd = new FormData();
    issue.dermoscopeImages.forEach((img) => fd.append("images", img));
    const res = await fetch("/api/tier2/upload?skipAI=true", ...);
    dermoscopeImageUrls = data.data.imageUrls;
  }

  // Upload clinical images
  if (issue.clinicalImages.length > 0) {
    const fd = new FormData();
    issue.clinicalImages.forEach((img) => fd.append("images", img));
    const res = await fetch("/api/tier2/upload", ...);
    clinicalImageUrls = data.data.imageUrls;
  }

  processedIssues.push({
    label: `Issue ${idx + 1}`,
    formData: issue.formData,
    aiAnalysis,
    dermoscopeImageUrls,
    clinicalImageUrls,
  });
}
```

**Wait — why does the dermoscope upload use `skipAI=true` here?**

Because the AI was already run when the doctor clicked "Analyse with AI" earlier. We don't want to run it again at submit time. We just need to upload the images to S3 and get back the URLs.

But the clinical images upload does **NOT** use `skipAI=true`. Why? Because the clinical images are simple phone photos — the AI model won't produce useful results on them anyway. The upload route will try to run inference but the results won't be used for anything meaningful. (This is a minor inconsistency in the code — it wouldn't hurt to add `skipAI=true` there too.)

### 10.2 — The save request includes `aiAnalysis`

```ts
const saveRes = await fetch("/api/tier2/consultation/dermatology", {
  method: "POST",
  body: JSON.stringify({
    patientId,
    appointmentId,
    formData: combinedFormData,
    aiAnalysis: processedIssues[0]?.aiAnalysis,     // AI predictions
    dermoscopeImageUrls: processedIssues[0]?.dermoscopeImageUrls,
    clinicalImageUrls: processedIssues[0]?.clinicalImageUrls,
    consultationFee: ...,
  }),
});
```

### 10.3 — Redirect is to a different URL

After saving, the dermatology consultation redirects to:

```
/clinic/consultation/{consultationId}
```

Notice: there is no "dermatology" in the path. The cosmetology details page is at `/clinic/consultation/cosmetology/[id]`. The dermatology details page is at `/clinic/consultation/[id]`. This is a naming asymmetry in the code.

---

<a id="11-the-post-api"></a>
## 11. The POST API — saving a dermatology consultation

> **File**: [app/api/tier2/consultation/dermatology/route.ts](app/api/tier2/consultation/dermatology/route.ts)

The POST handler creates a `ConsultationDermatology` document. The main difference from cosmetology is how the data is mapped:

### 11.1 — Images are typed

```ts
const images = [];

// Dermoscope images → type: "dermoscopic"
if (dermoscopeImageUrls && dermoscopeImageUrls.length > 0) {
  dermoscopeImageUrls.forEach((url) => {
    images.push({ url, type: "dermoscopic", uploadedAt: new Date() });
  });
}

// Clinical images → type: "clinical"
if (clinicalImageUrls && clinicalImageUrls.length > 0) {
  clinicalImageUrls.forEach((url) => {
    images.push({ url, type: "clinical", uploadedAt: new Date() });
  });
}
```

### 11.2 — AI results are stored in `dermoscopeFindings`

```ts
dermoscopeFindings: aiAnalysis
  ? {
      aiResults: {
        predictions: Object.keys(aiAnalysis)
          .filter((key) => key !== "topPrediction")
          .map((key) => ({
            condition: key,
            probability: aiAnalysis[key] / 100,
          })),
        topPrediction: aiAnalysis.topPrediction?.condition || "",
        confidence: aiAnalysis.topPrediction?.probability || 0,
        timestamp: new Date(),
      },
      finalInterpretation: formData.finalInterpretation,
    }
  : {
      finalInterpretation: formData.finalInterpretation,
    },
```

If the doctor did not run AI, `dermoscopeFindings.aiResults` is `undefined`. The `finalInterpretation` is always the doctor's own text, regardless of AI.

### 11.3 — Diagnosis has differentials

```ts
diagnosis: {
  provisional: formData.provisional || formData.provisionalDiagnosis,
  differentials: (formData.differentials || formData.differentialDiagnosis)
    ? formData.differentials.split(",").map((d) => d.trim())
    : [],
},
```

The differentials are stored as an array of strings. The frontend sends them as a comma-separated string; the API splits them.

### 11.4 — No appointment update

Unlike cosmetology, this handler does **not** automatically mark the appointment as completed. This is another asymmetry in the code.

---

<a id="12-the-condition-causes-database"></a>
## 12. The condition causes database

> **File**: [app/api/tier2/consultation/dermatology/route.ts:17-170](app/api/tier2/consultation/dermatology/route.ts#L17-L170)

The dermatology API file contains a built-in database of common skin conditions, their causes, and care tips. It is a plain JavaScript object:

```ts
const conditionCauses: Record<string, { causes: string[]; tips: string[] }> = {
  eczema: {
    causes: [
      "Genetic predisposition and family history",
      "Dry skin and impaired skin barrier",
      // ...
    ],
    tips: [
      "Keep skin moisturized with fragrance-free creams",
      "Avoid hot showers; use lukewarm water",
      // ...
    ],
  },
  psoriasis: { ... },
  acne: { ... },
  vitiligo: { ... },
  fungal: { ... },
  dermatitis: { ... },
  urticaria: { ... },
  melanoma: { ... },
  default: { ... },    // fallback for unknown conditions
};
```

There is also a **medicine purpose database** — a mapping from medicine keywords to plain-English explanations:

```ts
const medicinePurposes: Record<string, string> = {
  "corticosteroid": "reduces inflammation, redness, and itching",
  "retinoid": "promotes skin cell turnover and prevents clogged pores",
  "cetirizine": "antihistamine that reduces allergic symptoms and itching",
  // ... 30+ entries
};
```

These are used by `generatePatientExplanation()` — a function that builds a simple text explanation **without AI**. This is a legacy system that exists alongside the Claude-based AI explanation.

The function works by:
1. Matching the diagnosis text against the `conditionCauses` keys.
2. Scanning the medicine names against `medicinePurposes`.
3. Building a structured markdown text with sections: "What's Happening?", "Common Causes", "Why These Medicines?", "Tips for Better Recovery".

> **Note**: this function is defined but the main AI explanation now uses Claude (section 13 below). The condition-causes database is still useful as a reference.

---

<a id="13-the-ai-explanation--claude-for-dermatology"></a>
## 13. The AI explanation — Claude for dermatology

> **File**: [app/api/tier2/consultation/dermatology/generate-explanation/route.ts](app/api/tier2/consultation/dermatology/generate-explanation/route.ts)

This works exactly like the cosmetology version (Chapter 6, section 9.1). The differences are in the **prompt**:

### Cosmetology prompt says:
```
"You are a warm AI health companion speaking directly to a patient 
after their cosmetology visit."
```

### Dermatology prompt says:
```
"You are a warm AI health companion speaking directly to a patient 
after their dermatology visit."
```

### The sections are different:

| Cosmetology | Dermatology |
|------------|-------------|
| "What Was Done Today?" | "What's Happening With Your Skin?" |
| "What To Expect Next" | "Why Did This Happen?" |
| "How Your Medicines Help" | "How Your Medicines Help" |
| "Your Recovery Journey" | "Your Recovery Journey" |

### Medicine handling is different:

The dermatology prompt includes **topicals and orals** as separate categories:

```ts
const meds = formatMedicines(prescription, fd.topicals || tp.topicals, fd.orals || tp.orals);
```

Cosmetology only handles prescription-style medicines. Dermatology also splits free-text topical and oral medicine strings on commas and semicolons.

Everything else — the streaming, the saving, the multi-issue handling — is identical.

---

<a id="14-the-consultation-details-page"></a>
## 14. The consultation details page

> **File**: [app/clinic/consultation/[consultationId]/page.tsx](app/clinic/consultation/[consultationId]/page.tsx)

This page is the dermatology equivalent of the cosmetology consultation details page. It shows:

- Patient information (name, complaint, duration, previous treatment)
- Clinical examination (lesion site, morphology, distribution, severity)
- Dermoscope findings and AI predictions (if any)
- Diagnosis (provisional and differentials)
- Treatment plan (topicals, orals, lifestyle changes)
- Images — separated into clinical and dermoscopic
- AI explanation with streaming, editing, and translation
- PDF download and WhatsApp sharing

The AI explanation features (generate, edit, translate, download PDF, share WhatsApp) work the same as cosmetology. The API endpoints just use `/dermatology/` instead of `/cosmetology/` in their paths.

---

<a id="15-pdf-generation--whats-different"></a>
## 15. PDF generation — what's different

> **File**: [app/api/tier2/consultation/dermatology/generate-pdf/route.ts](app/api/tier2/consultation/dermatology/generate-pdf/route.ts)

The PDF generation uses the same pdfkit approach as cosmetology (Chapter 6, section 16). Same helper functions (`fillRect`, `hLine`, `ensureSpace`, `sectionHeader`, `infoTable`, `textBlock`), same page layout, same fonts, same footer system.

The differences are in **what content is rendered**:

| Cosmetology PDF | Dermatology PDF |
|----------------|-----------------|
| Title: "COSMETOLOGY CONSULTATION REPORT" | Title: "DERMATOLOGY CONSULTATION REPORT" |
| Patient Info → Assessment → Procedure (with pricing) → Aftercare → Consent | Patient Info → Clinical Examination → Dermoscope Findings → Diagnosis → Treatment Plan → Follow-up |
| Prescription table (if medicines) | Prescription table (if medicines) |
| AI explanation (if included) | AI explanation (if included) |
| Translation (if language selected) | Translation (if language selected) |

The dermatology PDF includes the AI predictions if they exist:

```
dermoscopeFindings.aiResults.predictions → shown as a table row
```

And it has a `prescriptionTable` for structured medicines, just like cosmetology.

As with cosmetology, there are **two PDF routes**: `generate-pdf` (returns binary to browser) and `share-pdf` (uploads to S3, returns signed URL for WhatsApp).

---

<a id="16-multi-issue-dermatology"></a>
## 16. Multi-issue dermatology

Multi-issue works the same way as cosmetology (Chapter 6, section 11). Maximum 2 issues.

The only difference: when building multi-issue data, each issue stores **separate** dermoscope and clinical image URLs:

```ts
processedIssues.push({
  label: `Issue ${idx + 1}`,
  formData: issue.formData,
  aiAnalysis,
  dermoscopeImageUrls,        // per-issue dermoscope URLs
  clinicalImageUrls,          // per-issue clinical URLs
});
```

And in `customFields._issues`, each issue can have:
- `formData` — the form fields
- `dermoscopeImageUrls` — dermoscope photo URLs
- `clinicalImageUrls` — clinical photo URLs
- `aiAnalysis` — AI predictions for this specific issue

The server-side max 2 issues enforcement is explicit:

```ts
if (formData?._multiIssue === true && formData._issues.length > 2) {
  return NextResponse.json(
    { success: false, message: "Maximum 2 issues are allowed per consultation" },
    { status: 400 }
  );
}
```

### Comparison across visits

The before/after comparison also handles the image-type split. The comparison modal shows images grouped by type (clinical vs. dermoscopic), and the doctor can toggle between them:

```ts
const [comparisonImageType, setComparisonImageType] = 
  useState<"clinical" | "dermoscopic">("clinical");
```

---

<a id="17-the-labels--what-the-model-knows"></a>
## 17. The labels — what the model knows

The AI model only knows 10 conditions. This is important to understand:

```json
["Alopecia areata", "Basal cell carcinoma", "Eczema", "Herpes Zoster",
 "LP", "Nevus Depigmentosus", "Psoriasis", "Tinea incognito",
 "Viral warts", "Vitiligo"]
```

If the patient has a condition outside this list (like acne, scabies, or contact dermatitis), the model will still output predictions — but they will be **wrong**. The model is forced to choose from its 10 labels.

This is why the AI is presented as a **suggestion**, not a diagnosis. The doctor's judgment is always the final word.

The labels file exists in two places:
1. `labels.json` in the project root (imported by the frontend to display prediction names).
2. `ai-service/labels.json` in the AI service (used by the Python code to map model output indices to condition names).

These two files **must stay in sync**. If you add a condition to one, you must add it to the other. (Though adding conditions also requires retraining the model — see gotchas.)

---

<a id="18-gotchas"></a>
## 18. Gotchas

**1. The AI service can be down — and that's OK.**
`predictSkinCondition()` returns `null` if the service is unreachable. The upload still succeeds. The doctor just doesn't get AI predictions. This is the "graceful degradation" design.

**2. Two label files must stay in sync.**
`labels.json` (frontend) and `ai-service/labels.json` (Python) must have the same labels in the same order. If they diverge, the frontend will show wrong condition names for the predictions.

**3. The model only knows 10 conditions.**
It will always output predictions from its fixed list. If the patient has something else, the predictions are meaningless. The doctor should ignore them.

**4. Clinical images get AI inference too (by accident).**
During submit, clinical images are uploaded without `?skipAI=true`. The AI runs on them but the results are not used. It wastes time and compute. Adding `skipAI=true` for clinical uploads would be a good fix.

**5. Dermoscope images are uploaded twice.**
First when the doctor clicks "Analyse with AI" (to get predictions). Then again at submit time (to get permanent S3 URLs). The images go to S3 both times. This means there are duplicate copies in S3.

**6. No appointment completion in the dermatology POST handler.**
Unlike cosmetology, the dermatology API does not update the appointment to "completed". This is a gap — the appointment stays in its current status.

**7. The condition-causes database is separate from the Claude AI prompt.**
The `conditionCauses` object and the `generatePatientExplanation()` function are a legacy system. The current primary flow uses Claude for AI explanations. The two systems don't share data.

**8. The `aiResults` format differs between frontend and database.**
On the frontend, `aiResults` has `{ predictions: [...], topPrediction: {...} }`. When saved to the database via the API, the format is transformed — `topPrediction` becomes a string (just the condition name) and probabilities are divided by 100. If you read AI results from the database, don't assume the same shape as the frontend.

---

<a id="19-if-i-changed-x-what-breaks"></a>
## 19. If I changed X, what breaks?

| If I change... | What breaks |
|----------------|-------------|
| `labels.json` (add/remove a condition) | Frontend shows wrong names for predictions; must retrain the ONNX model and update both label files |
| `AI_API_URL` or `AI_API_KEY` env vars | AI predictions stop (graceful degradation — uploads still work) |
| The ONNX model file | AI predictions change — might be better or worse |
| The image preprocessing (resize, normalization) | Model gets unexpected input → predictions become garbage |
| `ConsultationDermatology` schema | POST/GET APIs, PDF rendering, AI prompt — all reference these fields |
| The `dermoscopeFindings.aiResults` shape | The consultation details page crashes when trying to display predictions |
| The `type` field on images (`"clinical"` / `"dermoscopic"`) | Comparison view, PDF rendering, and AI trigger all rely on this distinction |
| The `conditionCauses` object | Legacy patient explanation text changes (doesn't affect Claude-based explanations) |
| The Claude prompt in `generate-explanation` | AI explanation quality and format changes |
| The `generate-pdf` route | PDF breaks; remember there's a separate `share-pdf` route with duplicated code |
| The Python AI service's `/predict` endpoint URL or response shape | `lib/ai/inference.ts` breaks → AI returns `null` → graceful degradation |
