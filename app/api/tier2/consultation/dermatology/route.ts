/**
 * Tier 2 Dermatology Consultation API
 * Handles saving and retrieving dermatology consultations
 */

import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import Patient from "@/models/Patient";
import Clinic from "@/models/Clinic";
import { getSignedUrl } from "@/lib/aws/signed-url";

// Common skin condition causes database for generating patient explanations
const conditionCauses: Record<string, { causes: string[]; tips: string[] }> = {
  eczema: {
    causes: [
      "Genetic predisposition and family history",
      "Dry skin and impaired skin barrier",
      "Environmental triggers (dust, pollen, pet dander)",
      "Stress and emotional factors",
      "Certain soaps, detergents, or fabrics",
      "Weather changes (especially dry, cold weather)",
    ],
    tips: [
      "Keep skin moisturized with fragrance-free creams",
      "Avoid hot showers; use lukewarm water",
      "Wear soft, breathable cotton clothing",
      "Identify and avoid personal triggers",
      "Manage stress through relaxation techniques",
    ],
  },
  psoriasis: {
    causes: [
      "Immune system dysfunction (autoimmune condition)",
      "Genetic factors and family history",
      "Stress and emotional triggers",
      "Certain medications",
      "Skin injuries or infections",
      "Smoking and alcohol consumption",
    ],
    tips: [
      "Keep skin moisturized regularly",
      "Get moderate sun exposure (with doctor's guidance)",
      "Avoid skin injuries and scratching",
      "Manage stress effectively",
      "Avoid smoking and limit alcohol",
    ],
  },
  acne: {
    causes: [
      "Excess oil (sebum) production",
      "Hormonal changes (puberty, menstruation, PCOS)",
      "Bacteria (Propionibacterium acnes)",
      "Clogged hair follicles",
      "Certain medications or cosmetics",
      "Diet high in refined sugars and dairy (in some cases)",
    ],
    tips: [
      "Wash face twice daily with gentle cleanser",
      "Avoid touching or picking at pimples",
      "Use non-comedogenic (non-pore-clogging) products",
      "Change pillowcases regularly",
      "Stay hydrated and maintain a balanced diet",
    ],
  },
  vitiligo: {
    causes: [
      "Autoimmune condition (immune system attacks melanocytes)",
      "Genetic predisposition",
      "Oxidative stress in skin cells",
      "Nerve-related factors",
      "Triggered by sunburn or skin trauma",
      "Associated with other autoimmune conditions",
    ],
    tips: [
      "Protect skin from sun with sunscreen (SPF 30+)",
      "Avoid skin injuries when possible",
      "Consider cosmetic camouflage options",
      "Join support groups for emotional support",
      "Follow treatment plan consistently",
    ],
  },
  fungal: {
    causes: [
      "Fungal organisms (dermatophytes, yeasts)",
      "Warm, moist environments",
      "Weakened immune system",
      "Close contact with infected persons or animals",
      "Sharing personal items (towels, combs)",
      "Poor hygiene or excessive sweating",
    ],
    tips: [
      "Keep affected areas clean and dry",
      "Wear loose, breathable clothing",
      "Don't share personal items",
      "Change socks and underwear daily",
      "Complete full course of antifungal treatment",
    ],
  },
  dermatitis: {
    causes: [
      "Contact with irritants or allergens",
      "Genetic susceptibility",
      "Environmental factors",
      "Stress and immune dysfunction",
      "Occupational exposure to chemicals",
      "Certain foods or medications",
    ],
    tips: [
      "Identify and avoid triggers",
      "Use gentle, fragrance-free products",
      "Moisturize regularly",
      "Wear protective gloves when needed",
      "Apply prescribed medications as directed",
    ],
  },
  urticaria: {
    causes: [
      "Allergic reactions to food, medications, or insect stings",
      "Infections (viral, bacterial)",
      "Physical triggers (pressure, cold, heat, sun)",
      "Stress and emotional factors",
      "Autoimmune conditions",
      "Unknown causes (chronic idiopathic urticaria)",
    ],
    tips: [
      "Identify and avoid known triggers",
      "Keep a diary to track flare-ups",
      "Avoid tight clothing",
      "Stay cool and avoid hot showers",
      "Take antihistamines as prescribed",
    ],
  },
  melanoma: {
    causes: [
      "UV radiation exposure (sun, tanning beds)",
      "Fair skin, light hair, light eyes",
      "Many moles or atypical moles",
      "Family history of melanoma",
      "Weakened immune system",
      "Previous severe sunburns",
    ],
    tips: [
      "Use broad-spectrum sunscreen (SPF 30+) daily",
      "Avoid tanning beds completely",
      "Wear protective clothing and hats",
      "Perform regular self-skin exams",
      "Follow up regularly with your dermatologist",
    ],
  },
  default: {
    causes: [
      "Genetic and hereditary factors",
      "Environmental triggers",
      "Immune system responses",
      "Infections or irritants",
      "Lifestyle and dietary factors",
    ],
    tips: [
      "Follow your doctor's treatment plan",
      "Keep the affected area clean",
      "Avoid scratching or irritating the area",
      "Maintain good overall skin hygiene",
      "Attend follow-up appointments",
    ],
  },
};

// Medicine purpose explanations
const medicinePurposes: Record<string, string> = {
  // Topicals
  "corticosteroid": "reduces inflammation, redness, and itching",
  "steroid": "reduces inflammation and immune response in the skin",
  "moisturizer": "hydrates skin and repairs the skin barrier",
  "emollient": "softens and moisturizes dry, rough skin",
  "antifungal": "kills or stops the growth of fungus causing the infection",
  "antibiotic": "kills bacteria or prevents bacterial infection",
  "retinoid": "promotes skin cell turnover and prevents clogged pores",
  "salicylic": "helps unclog pores and remove dead skin cells",
  "benzoyl peroxide": "kills acne-causing bacteria and reduces oil",
  "calcineurin": "reduces inflammation without steroid side effects",
  "tacrolimus": "suppresses immune response to reduce inflammation",
  "pimecrolimus": "reduces inflammation for sensitive areas",
  "coal tar": "slows skin cell growth and reduces scaling",
  "vitamin d": "slows skin cell growth in psoriasis",
  "calcipotriol": "synthetic vitamin D that slows rapid skin cell growth",
  "hydroquinone": "lightens dark spots by reducing melanin production",
  "azelaic acid": "reduces bacteria and helps with pigmentation",
  "clindamycin": "antibiotic that kills acne-causing bacteria",
  "erythromycin": "antibiotic for bacterial skin infections",
  "mupirocin": "treats bacterial skin infections like impetigo",
  "ketoconazole": "antifungal for yeast and fungal infections",
  "terbinafine": "antifungal that kills fungus causing infection",
  "clotrimazole": "antifungal for ringworm and other fungal infections",

  // Oral medications
  "antihistamine": "blocks allergic reactions and reduces itching",
  "cetirizine": "antihistamine that reduces allergic symptoms and itching",
  "loratadine": "antihistamine for allergies without causing drowsiness",
  "fexofenadine": "antihistamine for allergic reactions",
  "prednisolone": "steroid that reduces severe inflammation",
  "prednisone": "oral steroid for serious inflammatory conditions",
  "methotrexate": "slows down overactive immune system",
  "cyclosporine": "suppresses immune system in severe skin conditions",
  "isotretinoin": "reduces oil production and prevents severe acne",
  "doxycycline": "antibiotic that also reduces inflammation",
  "azithromycin": "antibiotic for bacterial infections",
  "fluconazole": "oral antifungal for widespread fungal infections",
  "itraconazole": "antifungal for stubborn fungal infections",
  "griseofulvin": "antifungal specifically for skin, hair, nail fungus",
  "acyclovir": "antiviral for herpes and related viral infections",
  "valacyclovir": "antiviral that treats viral skin infections",
};

function generatePatientExplanation(
  diagnosis: string,
  topicals: string,
  orals: string,
  complaint: string,
  severity: string
): string {
  const diagnosisLower = diagnosis?.toLowerCase() || "";

  // Find matching condition
  let matchedCondition = "default";
  for (const condition of Object.keys(conditionCauses)) {
    if (condition !== "default" && diagnosisLower.includes(condition)) {
      matchedCondition = condition;
      break;
    }
  }

  const conditionInfo = conditionCauses[matchedCondition];

  // Generate medicine explanations
  const allMedicines = `${topicals || ""} ${orals || ""}`.toLowerCase();
  const medicineExplanations: string[] = [];

  for (const [medicine, purpose] of Object.entries(medicinePurposes)) {
    if (allMedicines.includes(medicine)) {
      medicineExplanations.push(`• Medicines containing ${medicine}: ${purpose}`);
    }
  }

  // Build the explanation
  let explanation = `## Understanding Your Skin Condition\n\n`;

  // What's the problem
  explanation += `### What's Happening?\n`;
  if (complaint) {
    explanation += `You came to us with concerns about: ${complaint}. `;
  }
  explanation += `Based on the examination, you have been diagnosed with **${diagnosis || "a skin condition"}**`;
  if (severity) {
    explanation += ` (${severity} severity)`;
  }
  explanation += `.\n\n`;

  // Why it happens
  explanation += `### Common Causes\n`;
  explanation += `This condition can be caused by:\n`;
  conditionInfo.causes.forEach((cause) => {
    explanation += `• ${cause}\n`;
  });
  explanation += `\n`;

  // Medicine explanations
  if (medicineExplanations.length > 0) {
    explanation += `### Why These Medicines?\n`;
    explanation += `Your prescribed medications work in the following ways:\n`;
    medicineExplanations.forEach((med) => {
      explanation += `${med}\n`;
    });
    explanation += `\n`;
  }

  // Tips
  explanation += `### Tips for Better Recovery\n`;
  conditionInfo.tips.forEach((tip) => {
    explanation += `• ${tip}\n`;
  });
  explanation += `\n`;

  // Disclaimer
  explanation += `---\n`;
  explanation += `*This explanation is generated to help you understand your condition better. Always follow your doctor's specific advice and attend follow-up appointments as scheduled.*`;

  return explanation;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: authUser } = authResult;

    // Verify user is Tier 2
    if (authUser.tier !== "tier2") {
      return NextResponse.json(
        {
          success: false,
          message: "This endpoint is only for Tier 2 users",
        },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      patientId,
      formData,
      aiAnalysis,
      dermoscopeImageUrls,
      clinicalImageUrls,
    } = body;

    if (!patientId) {
      return NextResponse.json(
        {
          success: false,
          message: "Patient ID is required",
        },
        { status: 400 }
      );
    }

    await connectDB();

    console.log("Creating consultation for patient:", patientId);
    console.log("Form data:", formData);
    console.log("AI Analysis:", aiAnalysis);

    // Get patient info
    const patient = await Patient.findById(patientId);
    if (!patient) {
      console.log("Patient not found:", patientId);
      return NextResponse.json(
        {
          success: false,
          message: "Patient not found",
        },
        { status: 404 }
      );
    }

    console.log("Patient found:", patient.name);

    // Prepare images array
    const images: { url: string; type: string; uploadedAt: Date }[] = [];

    // Add dermoscope images with AI results
    if (dermoscopeImageUrls && dermoscopeImageUrls.length > 0) {
      dermoscopeImageUrls.forEach((url: string) => {
        images.push({
          url,
          type: "dermoscopic",
          uploadedAt: new Date(),
        });
      });
    }

    // Add clinical images
    if (clinicalImageUrls && clinicalImageUrls.length > 0) {
      clinicalImageUrls.forEach((url: string) => {
        images.push({
          url,
          type: "clinical",
          uploadedAt: new Date(),
        });
      });
    }

    // Create consultation document
    console.log("Creating consultation document...");
    console.log("Images to save:", images);
    console.log("Dermoscope URLs received:", dermoscopeImageUrls);
    console.log("Clinical URLs received:", clinicalImageUrls);

    // Generate patient-friendly AI explanation
    const diagnosis = formData.provisional || formData.provisionalDiagnosis || "";
    const topicals = formData.topicals || formData.topicalMedications || "";
    const orals = formData.orals || formData.oralMedications || "";
    const complaint = formData.complaint || formData.chiefComplaint || "";
    const severity = formData.severity || "";

    const aiExplanation = generatePatientExplanation(
      diagnosis,
      topicals,
      orals,
      complaint,
      severity
    );

    console.log("Generated AI explanation for patient");

    try {
      const consultation = await ConsultationDermatology.create({
        clinicId: authUser.clinicId,
        patientId: patient._id,
        doctorId: authUser.userId,
        consultationDate: new Date(),
        patientInfo: {
          name: formData.patientName || patient.name,
          age: formData.patientAge || patient.age,
          gender: formData.patientGender || patient.gender,
          complaint: formData.complaint || formData.chiefComplaint,
          duration: formData.duration,
          previousTreatment: formData.previousTreatment,
        },
        clinicalExamination: {
          lesionSite: formData.lesionSite,
          morphology: formData.morphology,
          distribution: formData.distribution,
          severity: formData.severity,
        },
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
              finalInterpretation: formData.finalInterpretation || formData.dermoscopicFindings,
            }
          : {
              finalInterpretation: formData.finalInterpretation || formData.dermoscopicFindings,
            },
        diagnosis: {
          provisional: formData.provisional || formData.provisionalDiagnosis,
          differentials: (formData.differentials || formData.differentialDiagnosis)
            ? (formData.differentials || formData.differentialDiagnosis).split(",").map((d: string) => d.trim())
            : [],
        },
        treatmentPlan: {
          topicals: formData.topicals || formData.topicalMedications,
          orals: formData.orals || formData.oralMedications,
          lifestyleChanges: formData.lifestyleChanges || formData.lifestyleAdvice,
          investigations: formData.investigations,
        },
        images,
        followUp: (formData.date || formData.followUpDate)
          ? {
              date: new Date(formData.date || formData.followUpDate),
              reason: formData.reason || formData.followUpReason,
            }
          : undefined,
        patientSummary: {
          aiGenerated: aiExplanation,
        },
        customFields: formData,
        status: "completed",
      });

      console.log("Consultation created successfully with ID:", consultation._id);

      return NextResponse.json({
        success: true,
        message: "Consultation saved successfully",
        data: {
          consultationId: consultation._id,
          patientId: patient._id,
          patientName: patient.name,
        },
      });
    } catch (createError: any) {
      console.error("Error creating consultation document:", createError);
      console.error("Error details:", createError.message);
      console.error("Error stack:", createError.stack);
      throw createError;
    }
  } catch (error: any) {
    console.error("Save consultation error:", error);
    console.error("Full error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to save consultation",
        error: error.message,
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch consultation details
export async function GET(request: NextRequest) {
  try {
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user: authUser } = authResult;

    if (authUser.tier !== "tier2") {
      return NextResponse.json(
        {
          success: false,
          message: "This endpoint is only for Tier 2 users",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const consultationId = searchParams.get("consultationId");

    if (!consultationId) {
      return NextResponse.json(
        {
          success: false,
          message: "Consultation ID is required",
        },
        { status: 400 }
      );
    }

    await connectDB();

    console.log("Fetching consultation with ID:", consultationId);

    const consultation = await ConsultationDermatology.findById(consultationId);

    if (!consultation) {
      console.log("Consultation not found");
      return NextResponse.json(
        {
          success: false,
          message: "Consultation not found",
        },
        { status: 404 }
      );
    }

    console.log("Consultation found, populating references...");

    // Populate patient and clinic separately to handle errors better
    try {
      await consultation.populate("patientId");
      console.log("Patient populated successfully");
    } catch (popError: any) {
      console.error("Error populating patient:", popError);
    }

    try {
      await consultation.populate("clinicId");
      console.log("Clinic populated successfully");
    } catch (popError: any) {
      console.error("Error populating clinic:", popError);
      // If clinic population fails, we'll still return the consultation
    }

    console.log("Successfully populated consultation data");

    // Convert to plain object to modify
    const consultationObj = consultation.toObject();

    // Generate signed URLs for images
    if (consultationObj.images && consultationObj.images.length > 0) {
      consultationObj.images = consultationObj.images.map((image: any) => {
        // Extract S3 key from URL
        let s3Key = "";
        if (image.url) {
          // URL format: https://bucket.s3.region.amazonaws.com/key or https://s3.region.amazonaws.com/bucket/key
          try {
            const url = new URL(image.url);
            // Get path after bucket name
            s3Key = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
          } catch {
            s3Key = image.url;
          }
        }

        if (s3Key) {
          const signedUrl = getSignedUrl(s3Key, 3600); // 1 hour expiry
          return {
            ...image,
            url: signedUrl,
            originalUrl: image.url,
          };
        }
        return image;
      });
    }

    console.log("Images with signed URLs:", consultationObj.images?.length || 0);

    return NextResponse.json({
      success: true,
      data: consultationObj,
    });
  } catch (error: any) {
    console.error("Get consultation error:", error);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch consultation",
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
