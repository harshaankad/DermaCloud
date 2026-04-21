# Chapter 6 — Cosmetology Visit: End-to-End

This chapter follows **one complete cosmetology visit** from start to finish. We will trace the journey of a real patient — from the moment the frontdesk books their appointment to the moment they receive a PDF report on WhatsApp. Every screen, every API call, every database write.

This is the first "vertical slice" chapter. Previous chapters taught you the building blocks (auth, models, API routes). Now you see how those blocks come together to serve a real clinic workflow.

> **Java analogy**: think of this chapter as a **sequence diagram** that walks through every layer — controller, service, DAO, database — for one end-to-end use case.

---

## Table of contents

| # | Section |
|---|---------|
| 1 | [The big picture — what are the 8 steps?](#1-the-big-picture) |
| 2 | [Step 1 — Frontdesk books an appointment](#2-step-1--frontdesk-books-an-appointment) |
| 3 | [Step 2 — Doctor sees today's appointments on the dashboard](#3-step-2--doctor-sees-todays-appointments) |
| 4 | [Step 3 — Doctor clicks "Start Visit" and lands on the patient page](#4-step-3--start-visit-and-patient-page) |
| 5 | [Step 4 — The cosmetology visit form](#5-step-4--the-cosmetology-visit-form) |
| 6 | [Step 5 — Doctor fills the form and submits](#6-step-5--filling-and-submitting-the-form) |
| 7 | [Step 6 — The POST API saves the consultation](#7-step-6--the-post-api-saves-the-consultation) |
| 8 | [Step 7 — The consultation details page](#8-step-7--the-consultation-details-page) |
| 9 | [Step 8 — AI explanation, translation, PDF, WhatsApp](#9-step-8--ai-explanation-translation-pdf-whatsapp) |
| 10 | [The data model recap](#10-the-data-model-recap) |
| 11 | [Multi-issue consultations](#11-multi-issue-consultations) |
| 12 | [Image uploads and before/after comparison](#12-image-uploads-and-beforeafter-comparison) |
| 13 | [Templates — filling the form fast](#13-templates--filling-the-form-fast) |
| 14 | [The dynamic form system](#14-the-dynamic-form-system) |
| 15 | [Procedure catalog and auto-pricing](#15-procedure-catalog-and-auto-pricing) |
| 16 | [PDF generation deep-dive](#16-pdf-generation-deep-dive) |
| 17 | [Share PDF via WhatsApp](#17-share-pdf-via-whatsapp) |
| 18 | [Gotchas](#18-gotchas) |
| 19 | [If I changed X, what breaks?](#19-if-i-changed-x-what-breaks) |

---

<a id="1-the-big-picture"></a>
## 1. The big picture — what are the 8 steps?

Here is the full journey, start to finish:

```
Frontdesk books appointment
        ↓
Doctor sees appointment on dashboard
        ↓
Doctor clicks "Start Visit" → patient page
        ↓
Doctor clicks "Cosmetology Visit" → visit form page
        ↓
Doctor fills form, uploads photos, submits
        ↓
API creates ConsultationCosmetology document in MongoDB
        ↓
Doctor lands on consultation details page
        ↓
Doctor generates AI explanation → downloads PDF → shares via WhatsApp
```

Every arrow above is a **page navigation** or an **API call**. We will trace each one.

---

<a id="2-step-1--frontdesk-books-an-appointment"></a>
## 2. Step 1 — Frontdesk books an appointment

The frontdesk staff opens the appointments page and books an appointment for a patient. This creates an `Appointment` document in MongoDB.

The appointment has these important fields:

| Field | What it means |
|-------|---------------|
| `patientId` | Which patient this appointment is for |
| `clinicId` | Which clinic (always filtered — Chapter 4 rule) |
| `date` | The date of the appointment |
| `status` | Starts as `"scheduled"` |
| `consultationType` | `"cosmetology"` or `"dermatology"` |
| `consultationFee` | How much the patient pays for this visit |

The key thing to know: the appointment **does not contain any medical data**. It is just a booking. The medical data comes later, when the doctor conducts the visit.

> **File**: [models/Appointment.ts](models/Appointment.ts)

---

<a id="3-step-2--doctor-sees-todays-appointments"></a>
## 3. Step 2 — Doctor sees today's appointments on the dashboard

When the doctor logs in, they see the dashboard. The dashboard fetches today's appointments from the API:

```
GET /api/tier2/appointments?date=2026-04-18
```

The dashboard page shows each appointment as a row. Each row has the patient name, time, status, and a **"Start Visit"** button.

> **File**: [app/clinic/dashboard/page.tsx](app/clinic/dashboard/page.tsx)

The "Start Visit" button is a link. It points to the **patient details page**, not directly to the visit form. The URL looks like:

```
/clinic/patients/67abc123def456?appointmentId=67xyz789
```

Notice: the URL carries **two pieces of information** — the patient ID (in the path) and the appointment ID (as a query parameter). Both travel forward through the entire flow.

---

<a id="4-step-3--start-visit-and-patient-page"></a>
## 4. Step 3 — Doctor clicks "Start Visit" and lands on the patient page

The patient details page shows the patient's information — name, age, phone, history of past visits.

At the top, there are two buttons:
- **Cosmetology Visit**
- **Dermatology Visit**

When the doctor clicks "Cosmetology Visit", the browser navigates to:

```
/clinic/visit/cosmetology?patientId=67abc123def456&appointmentId=67xyz789
```

> **File**: [app/clinic/patients/[id]/page.tsx:370](app/clinic/patients/[id]/page.tsx#L370)

Notice again: `patientId` and `appointmentId` are passed as query parameters. They keep traveling forward.

---

<a id="5-step-4--the-cosmetology-visit-form"></a>
## 5. Step 4 — The cosmetology visit form

This is the big page. The doctor spends most of their time here. Let's understand it piece by piece.

> **File**: [app/clinic/visit/cosmetology/page.tsx](app/clinic/visit/cosmetology/page.tsx) — this is a large file (~1500+ lines)

### 5.1 — What happens when the page loads?

The page reads `patientId` and `appointmentId` from the URL query parameters:

```ts
const patientId = searchParams.get("patientId");
const appointmentId = searchParams.get("appointmentId");
```

Then it fires **4 API calls at the same time** using `Promise.all`:

```ts
const [patientRes, formRes, templatesRes, apptRes] = await Promise.all([
  fetch(`/api/tier2/patients/${patientId}`, ...),
  fetch(`/api/tier2/settings/forms?formType=cosmetology`, ...),
  fetch(`/api/tier2/templates?templateType=cosmetology`, ...),
  fetch(apptUrl, ...),
]);
```

Let's break down what each call does:

| # | API call | What it fetches |
|---|----------|-----------------|
| 1 | `GET /api/tier2/patients/:id` | The patient's name, age, gender, phone |
| 2 | `GET /api/tier2/settings/forms?formType=cosmetology` | The **form configuration** — which fields to show |
| 3 | `GET /api/tier2/templates?templateType=cosmetology` | Saved templates the doctor can use |
| 4 | `GET /api/tier2/appointments/:id` | The appointment details (including the fee) |

> **Java analogy**: `Promise.all` is like submitting 4 tasks to an `ExecutorService` and then calling `future.get()` on all of them. The page waits until all 4 are done, then renders.

### 5.2 — The form structure

The form is **not hardcoded**. The fields come from the **form settings API** (call #2 above). The API returns a list of **sections**, and each section has a list of **fields**.

Here is what the data looks like:

```ts
interface FormSection {
  sectionName: string;      // e.g. "patientInfo", "assessment", "procedure"
  sectionLabel: string;     // e.g. "Patient Information"
  enabled: boolean;         // can the doctor hide this section?
  fields: FormField[];      // the fields inside this section
  order: number;            // display order
}

interface FormField {
  fieldName: string;        // e.g. "primaryConcern", "diagnosis"
  label: string;            // what the user sees: "Primary Concern"
  type: string;             // "text", "textarea", "number", "select", "date", "checkbox", "prescription"
  required: boolean;
  enabled: boolean;
  options?: string[];       // for "select" type — the dropdown choices
  placeholder?: string;
  order: number;
}
```

This means **every clinic can customize their form**. One clinic might want a "Skin Type" field. Another might not. The doctor (or admin) configures this in the Settings page, and the visit form adapts.

> **Java analogy**: think of this as a form builder. Instead of hardcoding `<input>` tags in JSP, you have a configuration in the database that says "show these fields in this order." The frontend reads the config and builds the form at runtime.

### 5.3 — Two types of sections

The sections are split into two groups:

1. **Issue sections** — these sections repeat for each issue (concern) the patient has. Example: "Assessment", "Procedure", "Aftercare".
2. **Shared sections** — these sections appear once, even if the patient has multiple issues. Example: "Follow-up Date".

The code decides which is which by checking `SHARED_SECTION_NAMES`:

```ts
const SHARED_SECTION_NAMES = ["followUp"];
```

If a section's `sectionName` is in this list, it is shared. Otherwise, it is per-issue.

### 5.4 — State management

The page tracks state in several `useState` hooks. The most important ones:

| State variable | What it holds |
|----------------|---------------|
| `patient` | The patient object (name, age, etc.) |
| `sections` | The form configuration from the settings API |
| `issues` | An array of "issues" — each issue has its own form data and images |
| `sharedFormData` | Form data for shared sections (like follow-up date) |
| `templates` | Available templates to fill the form quickly |
| `consultationFee` | The fee from the appointment (or typed manually) |
| `previousVisits` | Past cosmetology visits (for before/after comparison) |

The `issues` array is the core. Each issue is an object:

```ts
interface Issue {
  id: string;                        // unique ID for this issue
  formData: Record<string, any>;     // field values (e.g. { primaryConcern: "acne", diagnosis: "..." })
  visitImages: File[];               // photos the doctor uploads (not yet sent to server)
  visitPreviews: string[];           // base64 previews of those photos
  isExpanded: boolean;               // is this issue card expanded in the UI?
}
```

A new consultation always starts with one issue. The doctor can add a second issue if the patient has two concerns (maximum 2).

---

<a id="6-step-5--filling-and-submitting-the-form"></a>
## 6. Step 5 — Doctor fills the form and submits

### 6.1 — Filling the form

The doctor types into the form fields. Each keystroke updates the `issues` state. For example, when the doctor types into the "Primary Concern" field of Issue 1:

```ts
updateIssueFormData(issueId, "primaryConcern", "acne scars");
```

This finds the issue in the `issues` array and updates its `formData`:

```ts
const updateIssueFormData = (id: string, fieldName: string, value: any) => {
  setIssues((prev) =>
    prev.map((i) =>
      i.id === id ? { ...i, formData: { ...i.formData, [fieldName]: value } } : i
    )
  );
};
```

> **Java analogy**: this is like calling `issue.getFormData().put("primaryConcern", "acne scars")` — but in React, you must create a new object instead of mutating the old one. That's how React knows to re-render.

### 6.2 — Uploading photos

The doctor can upload up to 10 photos per issue. When they select photos:

1. Each photo is **compressed** on the client side (max 1024px width, JPEG 80% quality) to reduce upload size.
2. A base64 preview is created for display.
3. The actual `File` objects are stored in `issue.visitImages` — they have not been sent to the server yet.

The upload to S3 happens only at submit time (step 6.3 below).

### 6.3 — The submit flow

When the doctor clicks "Save Consultation", the `handleSubmit` function runs. Here is what happens, step by step:

> **File**: [app/clinic/visit/cosmetology/page.tsx:564](app/clinic/visit/cosmetology/page.tsx#L564)

**Step A — Validate required fields.**

The code loops through every issue, every section, every field. If a field is marked `required` and the value is empty, it shows an error toast and stops.

```ts
for (const [idx, issue] of issues.entries()) {
  for (const section of issueSections) {
    for (const field of section.fields) {
      if (field.enabled && field.required && !issue.formData[field.fieldName]) {
        showToast(`Issue ${idx + 1}: "${field.label}" is required`, "error");
        return;   // stop here — don't submit
      }
    }
  }
}
```

**Step B — Upload images to S3 (per issue).**

For each issue that has photos, the code sends a `POST` to the upload API:

```ts
const fd = new FormData();
issue.visitImages.forEach((img) => fd.append("images", img));
const res = await fetch("/api/tier2/upload?skipAI=true", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: fd,
});
```

Notice `?skipAI=true`. The upload route normally runs AI inference on dermoscopy images. For cosmetology photos, we skip that step.

The upload API returns a list of S3 URLs:

```ts
if (data.success) imageUrls = data.data.imageUrls;
```

**Step C — Build the combined form data.**

The code merges Issue 1's form data with the shared form data. If there are multiple issues, it adds a special `_multiIssue` flag:

```ts
const combinedFormData = {
  ...processedIssues[0]?.formData,     // Issue 1 fields at top level
  ...sharedFormData,                    // Shared fields (follow-up date)
};
if (issues.length > 1) {
  combinedFormData._multiIssue = true;
  combinedFormData._issues = processedIssues;   // all issues with their image URLs
}
```

This design keeps **backwards compatibility**. Old single-issue consultations just have flat fields. New multi-issue ones have the `_multiIssue` flag and the `_issues` array.

**Step D — Save the consultation.**

Finally, the code sends a POST to the consultation API:

```ts
const saveRes = await fetch("/api/tier2/consultation/cosmetology", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    patientId,
    appointmentId,
    formData: combinedFormData,
    imageUrls: processedIssues[0]?.imageUrls || [],
    consultationFee: consultationFee ? parseFloat(consultationFee) : undefined,
  }),
});
```

**Step E — Redirect to the details page.**

If the save was successful, the browser navigates to the consultation details page:

```ts
router.push(`/clinic/consultation/cosmetology/${saveData.data.consultationId}`);
```

---

<a id="7-step-6--the-post-api-saves-the-consultation"></a>
## 7. Step 6 — The POST API saves the consultation

> **File**: [app/api/tier2/consultation/cosmetology/route.ts](app/api/tier2/consultation/cosmetology/route.ts)

This is the server-side handler. Let's walk through what it does:

### 7.1 — Auth check

```ts
const auth = await verifyTier2Request(request);
if (!auth.success) return NextResponse.json(...);
if (auth.role !== "doctor") return NextResponse.json(...);  // only doctors can create consultations
```

### 7.2 — Find the patient

```ts
const patient = await Patient.findById(patientId);
if (!patient) return NextResponse.json({ success: false, message: "Patient not found" }, { status: 404 });
```

### 7.3 — Build the images array

The API takes the image URLs (already uploaded to S3) and wraps them with a timestamp:

```ts
const images = [];
if (imageUrls && imageUrls.length > 0) {
  imageUrls.forEach((url) => {
    images.push({ url, uploadedAt: new Date() });
  });
}
```

### 7.4 — Create the ConsultationCosmetology document

This is the main write. The code creates a new document with all the structured fields pulled from `formData`:

```ts
const consultation = await ConsultationCosmetology.create({
  clinicId: auth.clinicId,
  patientId: patient._id,
  doctorId: auth.userId,
  appointmentId: appointmentId || undefined,
  consultationDate: new Date(),
  patientInfo: {
    name: formData.patientName || patient.name,
    age: formData.patientAge || patient.age,
    gender: formData.patientGender || patient.gender,
    skinType: formData.skinType,
    primaryConcern: formData.primaryConcern,
  },
  assessment: {
    findings: formData.findings,
    diagnosis: formData.diagnosis,
    // ...
  },
  procedure: {
    name: formData.procedureName || formData.name,
    basePrice,
    gstRate,
    gstAmount,
    totalAmount,
    // ...
  },
  images,
  aftercare: { ... },
  consent: { ... },
  customFields: formData,     // the ENTIRE form data is also saved here as a catch-all
  consultationFee: ...,
  status: "completed",
});
```

**Important design choice**: the form data is saved in **two places**:
1. **Structured fields** like `patientInfo.primaryConcern`, `procedure.name`, etc. These have a fixed shape defined in the Mongoose schema.
2. **`customFields`** — the entire `formData` object. This is a freeform `Mixed` field. It captures everything, including fields the doctor added through the form builder.

Why both? The structured fields make it easy to query and display. The `customFields` field makes sure **nothing is lost** — even if the form has custom fields that don't match the Mongoose schema.

### 7.5 — Mark the appointment as completed

If the consultation was linked to an appointment, the API updates the appointment status:

```ts
if (appointmentId) {
  await Appointment.findByIdAndUpdate(appointmentId, {
    status: "completed",
    consultationId: consultation._id,
    completedAt: new Date(),
  });
}
```

This closes the loop. The appointment that was "scheduled" is now "completed", and it points to the consultation document.

### 7.6 — Audit log

```ts
auditLog({ clinicId, userId, action: "CONSULTATION_CREATE", resourceType: "consultation", ... }).catch(() => {});
```

Fire-and-forget. Does not block the response.

### 7.7 — Return the response

```ts
return NextResponse.json({
  success: true,
  data: {
    consultationId: consultation._id,
    patientId: patient._id,
    patientName: patient.name,
    appointmentCompleted: !!appointmentId,
  },
});
```

The frontend uses `consultationId` to navigate to the details page.

---

<a id="8-step-7--the-consultation-details-page"></a>
## 8. Step 7 — The consultation details page

After saving, the doctor is redirected to:

```
/clinic/consultation/cosmetology/67consultationId123
```

> **File**: [app/clinic/consultation/cosmetology/[consultationId]/page.tsx](app/clinic/consultation/cosmetology/[consultationId]/page.tsx)

### 8.1 — What this page shows

This page is a **read-only view** of the saved consultation. It shows:

- Patient information (name, age, gender, skin type)
- Assessment (findings, diagnosis)
- Procedure details (name, products, outcome, pricing)
- Aftercare instructions
- Consent status
- Photos taken during the visit
- The AI-generated patient explanation (if any)

### 8.2 — How it loads data

The page reads the `consultationId` from the URL using `useParams()`:

```ts
const params = useParams();
const consultationId = params.consultationId as string;
```

Then it calls the GET API:

```
GET /api/tier2/consultation/cosmetology?consultationId=67consultationId123
```

The API fetches the document, populates the patient and clinic references, signs any S3 image URLs (so the browser can display them), and returns the data.

### 8.3 — Signed URLs for images

Images are stored in S3 as private objects. The browser cannot access them directly. The API generates **signed URLs** — temporary links that expire after 1 hour:

```ts
function generateSignedUrlsForImages(images) {
  return images.map((image) => {
    const s3Key = new URL(image.url).pathname.substring(1);
    const signedUrl = getSignedUrl(s3Key, 3600);   // 1 hour
    return { ...image, url: signedUrl };
  });
}
```

> **Java analogy**: this is like generating a pre-signed S3 URL using the AWS SDK in Java. The URL contains a signature that grants read access for a limited time.

---

<a id="9-step-8--ai-explanation-translation-pdf-whatsapp"></a>
## 9. Step 8 — AI explanation, translation, PDF, WhatsApp

This is the final step. The doctor can do 4 things from the details page:

### 9.1 — Generate AI explanation

The doctor clicks "Generate AI Explanation". The frontend calls:

```
POST /api/tier2/consultation/cosmetology/generate-explanation
Body: { consultationId: "..." }
```

> **File**: [app/api/tier2/consultation/cosmetology/generate-explanation/route.ts](app/api/tier2/consultation/cosmetology/generate-explanation/route.ts)

This API does something special: it **streams** the response. Let me explain.

**What happens on the server:**

1. The API loads the consultation from the database.
2. It builds a **prompt** that includes all the consultation data — the findings, procedure, medicines, aftercare, everything.
3. It sends the prompt to **Claude** (using the Anthropic SDK) and asks for a patient-friendly explanation.
4. As Claude generates text word-by-word, the server streams each chunk to the browser.

Here is the streaming code:

```ts
const anthropicStream = anthropic.messages.stream({
  model: "claude-sonnet-4-6",
  max_tokens: 1500,
  messages: [{ role: "user", content: prompt }],
});

const readableStream = new ReadableStream({
  async start(controller) {
    for await (const chunk of anthropicStream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        controller.enqueue(encoder.encode(chunk.delta.text));
      }
    }
    // After streaming is done, save the full text to the database
    consultation.patientSummary = { aiGenerated: fullText };
    await consultation.save();
    controller.close();
  },
});
```

> **Java analogy**: streaming is like writing to a `ServletOutputStream` while the data is still coming in, instead of buffering the whole response in memory first.

**What happens on the frontend:**

The browser reads the stream using a `ReadableStream` reader. Each time a chunk arrives, the text on screen updates — the patient sees the explanation "typing itself out" in real time.

```ts
const reader = response.body.getReader();
const decoder = new TextDecoder();
let fullText = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  fullText += decoder.decode(value, { stream: true });
  flushSync(() => setStreamingText(fullText));
}
```

`flushSync` forces React to re-render immediately, so the text appears character-by-character.

**What the prompt looks like:**

The prompt is carefully structured. It tells Claude to:
- Act as a warm health companion
- Use simple language
- Follow a specific structure (headings, bullet points)
- Include exactly the right number of medicine bullets
- Stay under 500 words
- Not use emojis

The prompt includes ALL the consultation data as context.

### 9.2 — Doctor edits the explanation

The doctor can edit the AI-generated text. When they click "Save Edit":

```
POST /api/tier2/consultation/cosmetology/save-explanation
Body: { consultationId: "...", doctorEdited: "the edited text" }
```

> **File**: [app/api/tier2/consultation/cosmetology/save-explanation/route.ts](app/api/tier2/consultation/cosmetology/save-explanation/route.ts)

The API saves the edited text alongside the original:

```ts
consultation.patientSummary = {
  aiGenerated: consultation.patientSummary?.aiGenerated,   // keep the original
  doctorEdited: doctorEdited.trim(),                        // save the edit
};
```

Later, when showing or printing, the system uses `doctorEdited` if it exists, otherwise `aiGenerated`.

### 9.3 — Translation

The doctor can translate the explanation into Hindi or Kannada. The frontend splits the text into sections (by `##` headings) and translates each section in parallel:

```ts
const sections = activeExplanation.split(/\n(?=## )/).filter((s) => s.trim());
// Translate all sections in parallel
```

Each section is sent to:

```
POST /api/tier2/translate
Body: { text: "section text", targetLanguage: "hindi" }
```

The translations are cached in the component state so the doctor can switch tabs without re-translating. They are also saved to the database:

```
POST /api/tier2/consultation/cosmetology/save-translation
Body: { consultationId: "...", language: "hindi", text: "translated text" }
```

> **File**: [app/api/tier2/consultation/cosmetology/save-translation/route.ts](app/api/tier2/consultation/cosmetology/save-translation/route.ts)

### 9.4 — Download PDF

The doctor clicks "Download PDF". The frontend sends:

```
POST /api/tier2/consultation/cosmetology/generate-pdf
Body: { consultationId: "...", includeExplanation: true, language: "hindi" }
```

The API generates a PDF **on the server** and returns it as a binary file. The browser triggers a download.

We cover the PDF generation in detail in section 16 below.

### 9.5 — Share via WhatsApp

The doctor clicks "Share on WhatsApp". This works differently from the download:

1. The API generates the same PDF.
2. But instead of returning it to the browser, it **uploads it to S3**.
3. It creates a **signed URL** that is valid for 7 days.
4. It returns the signed URL to the frontend.
5. The frontend opens a WhatsApp link with the URL pre-filled.

```
POST /api/tier2/consultation/cosmetology/share-pdf
Body: { consultationId: "...", includeExplanation: true, language: "hindi" }
→ Response: { success: true, url: "https://s3.amazonaws.com/...?signature=..." }
```

> **File**: [app/api/tier2/consultation/cosmetology/share-pdf/route.ts](app/api/tier2/consultation/cosmetology/share-pdf/route.ts)

---

<a id="10-the-data-model-recap"></a>
## 10. The data model recap

Let's zoom out and see the **documents in MongoDB** after this whole flow:

| Collection | What was created/updated |
|------------|------------------------|
| `appointments` | Status changed from `"scheduled"` to `"completed"`. Now has `consultationId`. |
| `consultationcosmetologies` | New document with all the medical data, images, and AI summary. |
| `auditlogs` | A log entry recording that the doctor created a consultation. |

The `ConsultationCosmetology` document is the star. Here is its shape:

```
{
  clinicId:         → points to Clinic
  patientId:        → points to Patient
  doctorId:         → points to User (the doctor)
  appointmentId:    → points to Appointment (optional)
  consultationDate: Date
  
  patientInfo:   { name, age, gender, skinType, primaryConcern }
  assessment:    { findings, diagnosis, baselineEvaluation, contraindicationsCheck }
  procedure:     { name, goals, sessionNumber, package, productsAndParameters, immediateOutcome, basePrice, gstRate, gstAmount, totalAmount }
  images:        [{ url, uploadedAt }]
  aftercare:     { instructions, homeProducts, followUpDate, expectedResults }
  consent:       { risksExplained, consentConfirmed }
  patientSummary: { aiGenerated, doctorEdited, translations: { hindi, kannada } }
  customFields:  { ...everything... }
  
  status: "completed"
}
```

> **File**: [models/ConsultationCosmetology.ts](models/ConsultationCosmetology.ts)

---

<a id="11-multi-issue-consultations"></a>
## 11. Multi-issue consultations

A patient might come with two concerns — for example, "acne scars" and "hair removal". DermaCloud supports this.

### How it works on the frontend

The doctor clicks "Add Issue". A second form card appears. Each issue has its own:
- Form fields (primary concern, diagnosis, procedure, etc.)
- Photos
- Template selection

Shared sections (like "Follow-up Date") appear only once, at the bottom.

Maximum: **2 issues per consultation**.

```ts
const addIssue = useCallback(() => {
  if (issues.length >= 2) {
    showToast("Maximum 2 issues per consultation", "error");
    return;
  }
  // ...
}, [...]);
```

### How it is stored

When there are multiple issues, the `customFields` looks like:

```json
{
  "_multiIssue": true,
  "_issues": [
    {
      "label": "Issue 1",
      "formData": { "primaryConcern": "acne scars", "diagnosis": "..." },
      "imageUrls": ["https://s3.amazonaws.com/..."]
    },
    {
      "label": "Issue 2",
      "formData": { "primaryConcern": "hair removal", "diagnosis": "..." },
      "imageUrls": ["https://s3.amazonaws.com/..."]
    }
  ],
  "primaryConcern": "acne scars",  // Issue 1 fields at top level for backwards compat
  "diagnosis": "..."
}
```

The structured fields (`patientInfo`, `assessment`, `procedure`, `aftercare`) always contain **Issue 1's data**. Issue 2's data lives only in `customFields._issues[1].formData`.

This means: if you query `consultation.procedure.name`, you get Issue 1's procedure. To get Issue 2's, you must look at `consultation.customFields._issues[1].formData.name`.

---

<a id="12-image-uploads-and-beforeafter-comparison"></a>
## 12. Image uploads and before/after comparison

### Upload flow

1. Doctor picks photos from their phone/camera.
2. Photos are **compressed on the client** (canvas resize to 1024px width, JPEG 80%).
3. At submit time, photos are sent to `POST /api/tier2/upload?skipAI=true` as `FormData`.
4. The upload API saves them to S3 and returns the URLs.
5. The URLs are stored in the consultation document.

### Before/after comparison

DermaCloud does **not** mark individual photos as "before" or "after" within a single visit. Instead, it compares photos **across different visits**.

When the doctor opens the visit form, the page fetches all previous cosmetology visits for this patient:

```ts
const res = await fetch(`/api/tier2/consultation/cosmetology?patientId=${patientId}`, ...);
```

It filters to visits that have photos. The doctor can then:
1. Select up to 5 previous visits.
2. Pick up to 4 photos from those visits.
3. View them side-by-side with the current visit's photos.

This is a powerful feature for tracking a patient's progress over multiple sessions.

---

<a id="13-templates--filling-the-form-fast"></a>
## 13. Templates — filling the form fast

Cosmetology doctors do the same procedures repeatedly. "Chemical Peel — Glycolic 30%", "Botox — Forehead". Typing the same details every time is slow.

**Templates** solve this. A template is a saved set of field values. The doctor creates it once, then applies it with one click.

### How templates are applied

When the doctor clicks a template on an issue card:

```ts
const applyTemplateToIssue = (issueId, templateId) => {
  const template = templates.find((t) => t._id === templateId);
  const nonEmpty = Object.fromEntries(
    Object.entries(template.templateData).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
  // Auto-calculate GST if base price is set
  if (basePrice > 0) {
    nonEmpty.gstAmount = basePrice * gstRate / 100;
    nonEmpty.totalAmount = basePrice + nonEmpty.gstAmount;
  }
  // Merge template data into the issue's form data
  setIssues((prev) =>
    prev.map((i) => (i.id === issueId ? { ...i, formData: { ...i.formData, ...nonEmpty } } : i))
  );
};
```

The template data **merges** with existing form data. Fields that have a value in the template overwrite the current value. Fields not in the template stay unchanged.

---

<a id="14-the-dynamic-form-system"></a>
## 14. The dynamic form system

The form fields are not hardcoded. They come from the settings API. Let me explain how this works:

1. The doctor (or admin) goes to the **Settings** page.
2. They configure which sections and fields to show for cosmetology visits.
3. This configuration is saved to the database (in the Clinic document or a separate settings collection).
4. When the visit page loads, it calls `GET /api/tier2/settings/forms?formType=cosmetology`.
5. The API returns the list of sections and fields.
6. The `renderField` function looks at each field's `type` and renders the right HTML input:

```ts
const renderField = (field, value, onChange) => {
  switch (field.type) {
    case "textarea": return <textarea ... />;
    case "number":   return <input type="number" ... />;
    case "date":     return <input type="date" ... />;
    case "select":   return <select ...>{field.options.map(...)}</select>;
    case "checkbox": return <input type="checkbox" ... />;
    default:         return <input type="text" ... />;
  }
};
```

There is one **special case**: if the field name is `"name"` and the label contains "procedure", the code renders a **searchable dropdown** that searches the procedure catalog (section 15).

---

<a id="15-procedure-catalog-and-auto-pricing"></a>
## 15. Procedure catalog and auto-pricing

DermaCloud has a **procedure catalog** — a list of all procedures the clinic offers, with their prices and GST rates. When the doctor types a procedure name in the form, the code searches the catalog:

```ts
const searchProcedures = useCallback((query, key) => {
  setTimeout(async () => {
    const res = await fetch(`/api/tier2/cosmetology-procedures?search=${encodeURIComponent(query)}`, ...);
    const data = await res.json();
    if (data.success) setProcSearchResults(data.data);
  }, 300);   // debounce: wait 300ms after the last keystroke
}, []);
```

When the doctor selects a procedure from the dropdown, the code auto-fills the price fields:

```ts
onChange("basePrice", proc.basePrice);
onChange("gstRate", proc.gstRate);
onChange("gstAmount", gstAmt);
onChange("totalAmount", total);
```

This saves time and ensures consistent pricing.

---

<a id="16-pdf-generation-deep-dive"></a>
## 16. PDF generation deep-dive

> **File**: [app/api/tier2/consultation/cosmetology/generate-pdf/route.ts](app/api/tier2/consultation/cosmetology/generate-pdf/route.ts)

The PDF is generated **on the server** using a library called **pdfkit**. This is a Node.js library that creates PDF files by drawing shapes, text, and images onto a canvas.

> **Java analogy**: pdfkit is like iText or Apache PDFBox in Java. You create a document, add pages, draw text at specific coordinates.

### 16.1 — Page layout constants

The code starts by defining the page geometry:

```ts
const PW = 595.28;    // page width (A4 in points)
const PH = 841.89;    // page height
const MT = 40;         // margin top
const ML = 50;         // margin left
const MR = 50;         // margin right
const MB = 90;         // margin bottom (room for footer)
const CW = PW - ML - MR;   // content width
```

Everything is positioned using these constants. There is no CSS — it is all manual coordinate math.

### 16.2 — Helper functions

The code has several helper functions:

| Function | What it does |
|----------|-------------|
| `fillRect()` | Draws a filled rectangle |
| `hLine()` | Draws a horizontal line |
| `ensureSpace()` | Checks if there is enough space on the current page. If not, adds a new page. |
| `sectionHeader()` | Draws a section header with a navy stripe on the left |
| `infoTable()` | Draws a two-column table (label on the left, value on the right) |
| `textBlock()` | Renders a block of text with basic markdown support (headings, bullets, bold) |
| `prescriptionTable()` | Draws a medicine table with columns for name, dosage, route, frequency, etc. |

### 16.3 — The buildPdf function

This is the main function. It takes the consultation data and draws everything onto the PDF:

1. **Header** — clinic name, address, phone (navy blue bar at the top)
2. **Title** — "COSMETOLOGY CONSULTATION REPORT"
3. **Date and Patient ID**
4. **Patient Information** — name, age, gender, skin type, primary concern
5. **Clinical data** — rendered per-issue for multi-issue, or flat for single-issue
6. **Patient Explanation** — the AI-generated text (if `includeExplanation` is true)
7. **Translation** — the Hindi/Kannada version (if a language is selected)
8. **Signature block** — a line for the doctor to sign

### 16.4 — Multi-issue PDF rendering

If the consultation has multiple issues, the PDF renders each issue separately with its own heading:

```ts
if (isMultiIssue) {
  issues.forEach((issue, idx) => {
    const title = `Issue ${idx + 1}: ${concern}`;
    renderIssueData(fd, title);   // each issue gets its own section
  });
} else {
  renderIssueData(fd);            // single issue — no heading
}
```

### 16.5 — Footers

After all content is drawn, the code goes back to each page and adds a footer:

```ts
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  // Draw footer line
  hLine(doc, ML, ML + CW, PH - 45, C.border, 0.5);
  // Add confidentiality text
  doc.text(footerText, ML, PH - 36, { ... });
  // Add page number
  doc.text(`Page ${i + 1} of ${range.count}`, ML, PH - 36, { ... });
}
```

This is only possible because `bufferPages: true` was set when creating the document. Without buffering, pdfkit writes pages immediately and you cannot go back.

### 16.6 — Indic language support

The PDF supports Kannada and Hindi text. It loads custom fonts:

```ts
const KANNADA_FONT = path.join(FONTS_DIR, "NotoSansKannada-Regular.ttf");
const DEVANAGARI_FONT = path.join(FONTS_DIR, "NotoSansDevanagari-Regular.ttf");
```

When the translation section is rendered, the code switches to the Indic font:

```ts
sectionHeader(doc, title);
textBlock(doc, translatedText, C.navy, true);   // true = use Indic font
```

### 16.7 — The response

The PDF is built as a buffer in memory, then returned as a binary response:

```ts
return new Response(pdfBuffer, {
  headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": pdfBuffer.length.toString(),
  },
});
```

---

<a id="17-share-pdf-via-whatsapp"></a>
## 17. Share PDF via WhatsApp

> **File**: [app/api/tier2/consultation/cosmetology/share-pdf/route.ts](app/api/tier2/consultation/cosmetology/share-pdf/route.ts)

This route generates the same PDF, but instead of returning it to the browser:

1. **Uploads it to S3:**
```ts
const uploadResult = await uploadToS3(pdfBuffer, "application/pdf", {
  folder: "REPORTS_PDF",
  customFileName: fileName,
});
```

2. **Creates a signed URL valid for 7 days:**
```ts
const SEVEN_DAYS = 7 * 24 * 60 * 60;
const signedUrl = getSignedUrl(uploadResult.key, SEVEN_DAYS);
```

3. **Returns the URL:**
```ts
return NextResponse.json({ success: true, url: signedUrl });
```

The frontend opens a WhatsApp share link with this URL. The patient receives a link they can click to download the PDF within 7 days.

---

<a id="18-gotchas"></a>
## 18. Gotchas

**1. Issue 1 data is stored in two places.**
The structured fields (`assessment`, `procedure`, etc.) hold Issue 1's data. But the same data also exists in `customFields._issues[0].formData`. If you update one, the other does not change automatically. The code handles this by using `customFields` as the source of truth for rendering.

**2. The PDF has TWO versions — download and share.**
`generate-pdf/route.ts` returns the PDF directly to the browser. `share-pdf/route.ts` uploads to S3 and returns a URL. They have **separate copies** of the PDF-building code. If you fix a bug in one, you must fix it in the other too.

**3. Signed URLs expire.**
Image URLs from S3 expire after 1 hour. The share PDF URL expires after 7 days. If a patient clicks the link after 7 days, they get an error.

**4. `skipAI=true` matters for cosmetology uploads.**
Without this flag, the upload route would try to run AI inference on the images. That's only needed for dermatology dermoscope images, not cosmetology photos.

**5. The `_multiIssue` flag is the only way to tell if a consultation has multiple issues.**
There is no separate "issueCount" field. Code must check `customFields._multiIssue === true && _issues.length > 1`.

**6. `flushSync` is used for streaming.**
Normal React batches state updates. `flushSync` forces an immediate re-render. This is needed to show the AI explanation streaming character-by-character. Without it, the text would appear in chunks.

**7. `void Patient; void Clinic;` in the GET handler.**
These lines look useless, but they are important. They tell the JavaScript bundler to keep the model imports. Without them, the bundler might remove the imports as "unused", and then `.populate()` would fail because the models are not registered.

---

<a id="19-if-i-changed-x-what-breaks"></a>
## 19. If I changed X, what breaks?

| If I change... | What breaks |
|----------------|-------------|
| The `ConsultationCosmetology` schema fields | The POST API that creates the document, the GET API that reads it, the PDF that renders it, the AI prompt that references it |
| The form settings API response shape | The visit form stops rendering fields correctly |
| The `_multiIssue` structure in `customFields` | Multi-issue rendering in the PDF, the AI prompt builder, the image comparison feature |
| The S3 upload bucket or path | Image display (signed URLs won't work), PDF sharing |
| The Claude model or prompt | The AI explanation quality and format changes |
| The `ANTHROPIC_API_KEY` env variable | AI explanation stops working (returns 503) |
| The font files in `public/fonts/` | Hindi/Kannada text in the PDF becomes unreadable |
| The `bufferPages: true` setting in pdfkit | Footers and page numbers stop working |
| The `status: "completed"` on appointment update | Dashboard still shows the appointment as active after the visit is done |
| The signed URL expiry time | Patients lose access to shared PDFs sooner (or later) |
