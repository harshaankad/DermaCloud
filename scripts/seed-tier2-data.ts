/**
 * Seed Script for Tier 2 Test Data
 * Run with: npx ts-node scripts/seed-tier2-data.ts
 *
 * This script creates:
 * 1. A Tier 2 User (Doctor)
 * 2. A Clinic
 * 3. Multiple Patients with varied demographics
 * 4. Dermatology Consultation Templates
 * 5. Dermatology Consultations with various skin conditions
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

// Import models
import User from "../models/User";
import Clinic from "../models/Clinic";
import Patient from "../models/Patient";
import ConsultationTemplate from "../models/ConsultationTemplate";
import ConsultationDermatology from "../models/ConsultationDermatology";

const MONGODB_URI = process.env.MONGODB_URI || "";

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log("\n--- Clearing existing data ---");
    await ConsultationDermatology.deleteMany({});
    await ConsultationTemplate.deleteMany({});
    await Patient.deleteMany({});
    await Clinic.deleteMany({});
    await User.deleteMany({ tier: "tier2" });
    console.log("Cleared existing Tier 2 data");

    // ==========================================
    // 1. CREATE TIER 2 USER (DOCTOR)
    // ==========================================
    console.log("\n--- Creating Tier 2 Doctor ---");
    const hashedPassword = await bcrypt.hash("doctor123", 10);

    const doctor = await User.create({
      email: "dr.sharma@dermaclinic.com",
      password: hashedPassword,
      name: "Dr. Priya Sharma",
      tier: "tier2",
      phone: "9876543210",
      isVerified: true,
    });
    console.log(`Created Doctor: ${doctor.name} (${doctor.email})`);
    console.log(`Login credentials: Email: dr.sharma@dermaclinic.com, Password: doctor123`);

    // ==========================================
    // 2. CREATE CLINIC
    // ==========================================
    console.log("\n--- Creating Clinic ---");
    const clinic = await Clinic.create({
      doctorId: doctor._id,
      clinicName: "Sharma Dermatology & Skin Care Center",
      address: "123 Medical Complex, MG Road, Bangalore - 560001",
      phone: "9876543210",
      email: "info@sharmaderma.com",
    });
    console.log(`Created Clinic: ${clinic.clinicName}`);

    // Update doctor with clinic reference
    await User.findByIdAndUpdate(doctor._id, { clinicId: clinic._id });

    // ==========================================
    // 3. CREATE PATIENTS
    // ==========================================
    console.log("\n--- Creating Patients ---");

    const patientsData = [
      {
        patientId: "PAT-001",
        name: "Rajesh Kumar",
        age: 35,
        gender: "male",
        phone: "9876543001",
        email: "rajesh.kumar@email.com",
        address: "45 Park Street, Bangalore",
        medicalHistory: "Diabetes Type 2 (controlled), No known drug allergies",
        allergies: ["Sulfa drugs"],
      },
      {
        patientId: "PAT-002",
        name: "Sunita Devi",
        age: 28,
        gender: "female",
        phone: "9876543002",
        email: "sunita.devi@email.com",
        address: "78 Gandhi Nagar, Bangalore",
        medicalHistory: "Hypothyroidism, on Levothyroxine 50mcg",
        allergies: [],
      },
      {
        patientId: "PAT-003",
        name: "Mohammed Arif",
        age: 45,
        gender: "male",
        phone: "9876543003",
        address: "12 Commercial Street, Bangalore",
        medicalHistory: "Hypertension, on Amlodipine 5mg",
        allergies: ["Penicillin"],
      },
      {
        patientId: "PAT-004",
        name: "Priya Nair",
        age: 22,
        gender: "female",
        phone: "9876543004",
        email: "priya.nair@email.com",
        address: "34 Brigade Road, Bangalore",
        medicalHistory: "No significant past history",
        allergies: [],
      },
      {
        patientId: "PAT-005",
        name: "Vikram Singh",
        age: 55,
        gender: "male",
        phone: "9876543005",
        address: "89 Jayanagar, Bangalore",
        medicalHistory: "Coronary artery disease, on Aspirin and Statins",
        allergies: ["Iodine contrast"],
      },
    ];

    const patients = await Promise.all(
      patientsData.map((p) =>
        Patient.create({ ...p, clinicId: clinic._id })
      )
    );
    console.log(`Created ${patients.length} patients:`);
    patients.forEach((p) => console.log(`  - ${p.name} (${p.patientId}), Age: ${p.age}, Gender: ${p.gender}`));

    // ==========================================
    // 4. CREATE DERMATOLOGY TEMPLATES
    // ==========================================
    console.log("\n--- Creating Dermatology Templates ---");

    const templatesData = [
      {
        name: "Tinea Corporis (Ringworm) Template",
        description: "Standard template for fungal skin infections",
        category: "Fungal Infections",
        templateType: "dermatology",
        templateData: {
          complaint: "Circular itchy rash on body",
          duration: "2 weeks",
          lesionSite: "Trunk, Arms",
          morphology: "Annular erythematous scaly plaque with central clearing",
          distribution: "Localized",
          severity: "Mild",
          provisional: "Tinea Corporis",
          differentials: "Nummular Eczema, Pityriasis Rosea",
          topicals: "Clotrimazole 1% cream - Apply twice daily for 4 weeks",
          orals: "Terbinafine 250mg - Once daily for 2 weeks (if extensive)",
          lifestyleChanges: "Keep area clean and dry, avoid sharing towels, wear loose cotton clothes",
          followUpReason: "Review response to treatment",
        },
      },
      {
        name: "Acne Vulgaris Template",
        description: "Standard template for acne treatment",
        category: "Acne",
        templateType: "dermatology",
        templateData: {
          complaint: "Pimples and bumps on face",
          duration: "6 months",
          lesionSite: "Face (forehead, cheeks, chin)",
          morphology: "Comedones, papules, pustules",
          distribution: "Face, upper back",
          severity: "Moderate",
          provisional: "Acne Vulgaris (Moderate)",
          differentials: "Rosacea, Folliculitis",
          topicals: "Adapalene 0.1% gel - Apply at night, Benzoyl Peroxide 2.5% - Morning",
          orals: "Doxycycline 100mg - Twice daily for 6 weeks",
          lifestyleChanges: "Non-comedogenic products only, wash face twice daily, avoid touching face",
          followUpReason: "Assess improvement, check for side effects",
        },
      },
      {
        name: "Psoriasis Template",
        description: "Standard template for psoriasis management",
        category: "Autoimmune",
        templateType: "dermatology",
        templateData: {
          complaint: "Scaly patches on elbows and knees",
          duration: "3 months",
          lesionSite: "Elbows, Knees, Scalp",
          morphology: "Well-defined erythematous plaques with silvery scales",
          distribution: "Symmetrical, extensor surfaces",
          severity: "Moderate",
          provisional: "Psoriasis Vulgaris",
          differentials: "Seborrheic Dermatitis, Lichen Simplex Chronicus",
          topicals: "Betamethasone dipropionate 0.05% - Twice daily, Calcipotriol ointment - Once daily",
          orals: "None (consider Methotrexate if unresponsive)",
          lifestyleChanges: "Moisturize regularly, stress management, avoid skin injuries",
          followUpReason: "PASI score assessment, treatment response",
        },
      },
      {
        name: "Eczema/Atopic Dermatitis Template",
        description: "Standard template for eczema management",
        category: "Eczema",
        templateType: "dermatology",
        templateData: {
          complaint: "Itchy dry skin with rash",
          duration: "Recurrent since childhood",
          lesionSite: "Flexures (antecubital, popliteal)",
          morphology: "Erythematous papules and vesicles with lichenification",
          distribution: "Flexural areas",
          severity: "Moderate",
          provisional: "Atopic Dermatitis",
          differentials: "Contact Dermatitis, Scabies",
          topicals: "Mometasone furoate 0.1% cream - Twice daily for flares, Ceramide moisturizer - TDS",
          orals: "Cetirizine 10mg - At bedtime for itch",
          lifestyleChanges: "Avoid triggers, fragrance-free products, lukewarm baths, cotton clothing",
          followUpReason: "Flare prevention, maintenance therapy",
        },
      },
      {
        name: "Melasma Template",
        description: "Standard template for melasma treatment",
        category: "Pigmentation",
        templateType: "dermatology",
        templateData: {
          complaint: "Dark patches on face",
          duration: "1 year, worsened after pregnancy",
          lesionSite: "Face (cheeks, forehead, upper lip)",
          morphology: "Hyperpigmented macules and patches with irregular borders",
          distribution: "Centrofacial pattern",
          severity: "Moderate",
          provisional: "Melasma (Centrofacial pattern)",
          differentials: "Post-inflammatory hyperpigmentation, Lichen Planus Pigmentosus",
          topicals: "Triple combination cream (Hydroquinone 2% + Tretinoin 0.025% + Fluocinolone 0.01%) - At night, Sunscreen SPF 50 - Every 2 hours",
          orals: "Tranexamic acid 250mg - Twice daily (optional)",
          lifestyleChanges: "Strict sun protection, avoid hormonal triggers if possible",
          followUpReason: "Monitor for hypopigmentation, treatment efficacy",
        },
      },
    ];

    const templates = await Promise.all(
      templatesData.map((t) =>
        ConsultationTemplate.create({
          ...t,
          clinicId: clinic._id,
          createdBy: doctor._id,
          isActive: true,
        })
      )
    );
    console.log(`Created ${templates.length} consultation templates:`);
    templates.forEach((t) => console.log(`  - ${t.name} (${t.category})`));

    // ==========================================
    // 5. CREATE DERMATOLOGY CONSULTATIONS
    // ==========================================
    console.log("\n--- Creating Dermatology Consultations ---");

    const consultationsData = [
      // Patient 1 (Rajesh Kumar) - Tinea Corporis
      {
        patientIndex: 0,
        consultationDate: new Date("2025-01-20"),
        patientInfo: {
          name: "Rajesh Kumar",
          age: 35,
          gender: "male",
          complaint: "Circular itchy rash on trunk for 2 weeks",
          duration: "2 weeks",
          previousTreatment: "Applied coconut oil, no improvement",
        },
        clinicalExamination: {
          lesionSite: "Trunk (right side of abdomen)",
          morphology: "Annular erythematous plaque with raised scaly border and central clearing, 4cm diameter",
          distribution: "Single lesion, localized",
          severity: "Mild",
        },
        dermoscopeFindings: {
          patterns: "Dotted vessels at periphery, white scales",
          aiResults: {
            predictions: [
              { condition: "Tinea Corporis", probability: 0.85 },
              { condition: "Nummular Eczema", probability: 0.10 },
              { condition: "Pityriasis Rosea", probability: 0.05 },
            ],
            topPrediction: "Tinea Corporis",
            confidence: 0.85,
            timestamp: new Date(),
          },
          finalInterpretation: "Classic presentation of tinea corporis with annular morphology",
        },
        diagnosis: {
          provisional: "Tinea Corporis",
          differentials: ["Nummular Eczema", "Pityriasis Rosea"],
        },
        treatmentPlan: {
          topicals: "Clotrimazole 1% cream - Apply twice daily to affected area for 4 weeks",
          orals: "None required for single lesion",
          lifestyleChanges: "Keep area clean and dry, avoid sharing towels, wear loose cotton clothing",
          investigations: "KOH mount if not responding to treatment",
        },
        followUp: {
          date: new Date("2025-02-03"),
          reason: "Review treatment response after 2 weeks",
        },
      },
      // Patient 2 (Sunita Devi) - Acne Vulgaris
      {
        patientIndex: 1,
        consultationDate: new Date("2025-01-18"),
        patientInfo: {
          name: "Sunita Devi",
          age: 28,
          gender: "female",
          complaint: "Persistent pimples on face for 6 months",
          duration: "6 months",
          previousTreatment: "OTC face washes, home remedies",
        },
        clinicalExamination: {
          lesionSite: "Face - Forehead, cheeks, chin",
          morphology: "Multiple open and closed comedones, inflammatory papules and pustules, few post-inflammatory macules",
          distribution: "T-zone predominant, extending to cheeks",
          severity: "Moderate",
        },
        dermoscopeFindings: {
          patterns: "Follicular plugging, perifollicular erythema",
          aiResults: {
            predictions: [
              { condition: "Acne Vulgaris", probability: 0.92 },
              { condition: "Rosacea", probability: 0.05 },
              { condition: "Folliculitis", probability: 0.03 },
            ],
            topPrediction: "Acne Vulgaris",
            confidence: 0.92,
            timestamp: new Date(),
          },
          finalInterpretation: "Moderate acne vulgaris with comedonal and inflammatory components",
        },
        diagnosis: {
          provisional: "Acne Vulgaris - Moderate (Grade 2)",
          differentials: ["Rosacea", "Perioral Dermatitis"],
        },
        treatmentPlan: {
          topicals: "Adapalene 0.1% gel - Apply at night to entire face, Benzoyl Peroxide 2.5% gel - Morning to active lesions",
          orals: "Doxycycline 100mg - Once daily after breakfast for 6 weeks",
          lifestyleChanges: "Use non-comedogenic products, wash face twice daily with gentle cleanser, avoid touching face, change pillowcases frequently",
          investigations: "Hormonal workup if not responding (FSH, LH, Testosterone, DHEAS)",
        },
        followUp: {
          date: new Date("2025-02-15"),
          reason: "Review at 4 weeks - assess improvement, check for retinoid dermatitis",
        },
      },
      // Patient 3 (Mohammed Arif) - Psoriasis
      {
        patientIndex: 2,
        consultationDate: new Date("2025-01-15"),
        patientInfo: {
          name: "Mohammed Arif",
          age: 45,
          gender: "male",
          complaint: "Scaly patches on elbows and knees with itching",
          duration: "3 months, gradually worsening",
          previousTreatment: "Clobetasol cream from local pharmacy - temporary relief",
        },
        clinicalExamination: {
          lesionSite: "Bilateral elbows, knees, lower back, scalp",
          morphology: "Well-defined erythematous plaques with thick silvery-white scales, Auspitz sign positive",
          distribution: "Symmetrical involvement of extensor surfaces",
          severity: "Moderate (BSA ~8%)",
        },
        dermoscopeFindings: {
          patterns: "Regularly distributed dotted/glomerular vessels on erythematous background, white scales",
          aiResults: {
            predictions: [
              { condition: "Psoriasis Vulgaris", probability: 0.88 },
              { condition: "Seborrheic Dermatitis", probability: 0.07 },
              { condition: "Lichen Simplex Chronicus", probability: 0.05 },
            ],
            topPrediction: "Psoriasis Vulgaris",
            confidence: 0.88,
            timestamp: new Date(),
          },
          finalInterpretation: "Classic plaque psoriasis with typical dermoscopic features",
        },
        diagnosis: {
          provisional: "Psoriasis Vulgaris - Plaque type, Moderate",
          differentials: ["Seborrheic Dermatitis", "Lichen Simplex Chronicus"],
        },
        treatmentPlan: {
          topicals: "Calcipotriol + Betamethasone dipropionate combo - Once daily for 4 weeks, then Calcipotriol alone for maintenance",
          orals: "Consider Methotrexate if inadequate response (discuss at follow-up)",
          lifestyleChanges: "Stress management, avoid skin trauma (Koebner phenomenon), moisturize regularly, limit alcohol",
          investigations: "CBC, LFT, RFT (baseline before considering systemic therapy)",
        },
        followUp: {
          date: new Date("2025-02-12"),
          reason: "PASI assessment, decide on systemic therapy",
        },
      },
      // Patient 4 (Priya Nair) - Melasma
      {
        patientIndex: 3,
        consultationDate: new Date("2025-01-22"),
        patientInfo: {
          name: "Priya Nair",
          age: 22,
          gender: "female",
          complaint: "Dark patches on cheeks noticed after sun exposure",
          duration: "4 months, gradually darkening",
          previousTreatment: "None",
        },
        clinicalExamination: {
          lesionSite: "Bilateral cheeks, forehead, upper lip",
          morphology: "Hyperpigmented brown macules and patches with irregular borders",
          distribution: "Centrofacial pattern - malar and supralabial",
          severity: "Mild to Moderate",
        },
        dermoscopeFindings: {
          patterns: "Brown reticular pattern, epidermal melanin deposition",
          finalInterpretation: "Epidermal type melasma with centrofacial distribution",
        },
        diagnosis: {
          provisional: "Melasma - Epidermal type, Centrofacial pattern",
          differentials: ["Post-inflammatory Hyperpigmentation", "Lichen Planus Pigmentosus"],
        },
        treatmentPlan: {
          topicals: "Hydroquinone 2% cream - At night for 8 weeks, Sunscreen SPF 50 - Apply every 2 hours during sun exposure, Vitamin C serum - Morning",
          orals: "Tranexamic acid 250mg - Twice daily for 3 months (after counseling)",
          lifestyleChanges: "Strict sun protection (hat, sunglasses), avoid heat exposure, use broad-spectrum sunscreen even indoors",
          investigations: "Thyroid function tests (rule out thyroid-related pigmentation)",
        },
        followUp: {
          date: new Date("2025-02-19"),
          reason: "MASI score assessment, evaluate response",
        },
      },
      // Patient 5 (Vikram Singh) - Seborrheic Dermatitis + Follow-up consultation
      {
        patientIndex: 4,
        consultationDate: new Date("2025-01-10"),
        patientInfo: {
          name: "Vikram Singh",
          age: 55,
          gender: "male",
          complaint: "Scaly, greasy patches on scalp and face with itching",
          duration: "2 months, recurrent episodes",
          previousTreatment: "Ketoconazole shampoo - partial improvement",
        },
        clinicalExamination: {
          lesionSite: "Scalp, nasolabial folds, eyebrows",
          morphology: "Erythematous patches with yellowish greasy scales",
          distribution: "Seborrheic areas - scalp, face (nasolabial folds, eyebrows)",
          severity: "Moderate",
        },
        dermoscopeFindings: {
          patterns: "Yellow scales, linear vessels, orange-yellow structureless areas",
          aiResults: {
            predictions: [
              { condition: "Seborrheic Dermatitis", probability: 0.90 },
              { condition: "Psoriasis", probability: 0.06 },
              { condition: "Rosacea", probability: 0.04 },
            ],
            topPrediction: "Seborrheic Dermatitis",
            confidence: 0.90,
            timestamp: new Date(),
          },
          finalInterpretation: "Classic seborrheic dermatitis involving scalp and face",
        },
        diagnosis: {
          provisional: "Seborrheic Dermatitis",
          differentials: ["Scalp Psoriasis", "Rosacea"],
        },
        treatmentPlan: {
          topicals: "Ketoconazole 2% shampoo - Use alternate days for scalp, Hydrocortisone 1% + Clotrimazole cream - Twice daily for face (1 week only)",
          orals: "None",
          lifestyleChanges: "Stress management, avoid oily cosmetics, manage underlying conditions",
          investigations: "None required",
        },
        followUp: {
          date: new Date("2025-01-24"),
          reason: "Review response, adjust maintenance therapy",
        },
      },
      // Second consultation for Patient 1 (Rajesh Kumar) - Follow up for Tinea
      {
        patientIndex: 0,
        consultationDate: new Date("2025-01-24"),
        patientInfo: {
          name: "Rajesh Kumar",
          age: 35,
          gender: "male",
          complaint: "Follow-up for ringworm treatment",
          duration: "4 weeks since diagnosis",
          previousTreatment: "Clotrimazole 1% cream for 2 weeks - significant improvement",
        },
        clinicalExamination: {
          lesionSite: "Trunk (right side of abdomen)",
          morphology: "Faint erythematous macule, no active border, minimal scaling",
          distribution: "Same site as before, healing well",
          severity: "Resolving",
        },
        dermoscopeFindings: {
          finalInterpretation: "Healing tinea corporis, no active fungal elements visible",
        },
        diagnosis: {
          provisional: "Tinea Corporis - Resolving",
          differentials: [],
        },
        treatmentPlan: {
          topicals: "Continue Clotrimazole 1% cream for 2 more weeks to prevent recurrence",
          orals: "None",
          lifestyleChanges: "Continue preventive measures - keep area dry, separate towels",
          investigations: "None required",
        },
        followUp: {
          date: new Date("2025-02-10"),
          reason: "Final review if symptoms recur",
        },
      },
    ];

    const consultations = [];
    for (const c of consultationsData) {
      const patient = patients[c.patientIndex];
      const consultation = await ConsultationDermatology.create({
        clinicId: clinic._id,
        patientId: patient._id,
        doctorId: doctor._id,
        consultationDate: c.consultationDate,
        patientInfo: c.patientInfo,
        clinicalExamination: c.clinicalExamination,
        dermoscopeFindings: c.dermoscopeFindings,
        diagnosis: c.diagnosis,
        treatmentPlan: c.treatmentPlan,
        followUp: c.followUp,
        status: "completed",
        images: [], // No images for test data
      });
      consultations.push(consultation);
    }

    console.log(`Created ${consultations.length} dermatology consultations:`);
    for (let i = 0; i < consultations.length; i++) {
      const c = consultationsData[i];
      const patient = patients[c.patientIndex];
      console.log(`  - ${patient.name}: ${c.diagnosis.provisional} (${c.consultationDate.toDateString()})`);
    }

    // ==========================================
    // SUMMARY
    // ==========================================
    console.log("\n========================================");
    console.log("SEED DATA SUMMARY");
    console.log("========================================");
    console.log(`\nDoctor Login Credentials:`);
    console.log(`  Email: dr.sharma@dermaclinic.com`);
    console.log(`  Password: doctor123`);
    console.log(`\nClinic: ${clinic.clinicName}`);
    console.log(`\nPatients Created: ${patients.length}`);
    console.log(`Templates Created: ${templates.length}`);
    console.log(`Consultations Created: ${consultations.length}`);
    console.log(`\nConditions covered in consultations:`);
    console.log(`  - Tinea Corporis (Fungal infection)`);
    console.log(`  - Acne Vulgaris (Moderate)`);
    console.log(`  - Psoriasis Vulgaris`);
    console.log(`  - Melasma`);
    console.log(`  - Seborrheic Dermatitis`);
    console.log(`\nYou can now:`);
    console.log(`  1. Login at http://localhost:3000/login`);
    console.log(`  2. View patients at /tier2/patients`);
    console.log(`  3. View patient details and AI summary at /tier2/patients/{patientId}`);
    console.log(`  4. View consultation details at /tier2/consultation/{consultationId}`);
    console.log(`  5. Manage templates at /tier2/templates`);
    console.log("========================================\n");

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seedDatabase();
