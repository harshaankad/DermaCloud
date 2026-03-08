/**
 * Seed script for Cosmetology consultation data with dummy images
 * Creates 1 patient with 3 cosmetology visits (Chemical Peel for Melasma)
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Simple 1x1 pixel PNG generator (different colors for progression)
function createDummyPNG(r, g, b) {
  // Minimal PNG with a single colored pixel
  const header = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR length
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x64, // width: 100
    0x00, 0x00, 0x00, 0x64, // height: 100
    0x08, 0x02, // bit depth: 8, color type: 2 (RGB)
    0x00, 0x00, 0x00, // compression, filter, interlace
  ]);

  // For simplicity, we'll create a basic colored square image
  // This is a minimal valid PNG
  return header;
}

// Create simple SVG placeholder images instead (more reliable)
function createPlaceholderSVG(text, bgColor, textColor = 'white') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <rect width="300" height="300" fill="${bgColor}"/>
  <text x="150" y="140" font-family="Arial, sans-serif" font-size="16" fill="${textColor}" text-anchor="middle">${text}</text>
  <text x="150" y="170" font-family="Arial, sans-serif" font-size="12" fill="${textColor}" text-anchor="middle">Placeholder Image</text>
</svg>`;
}

async function seedCosmetologyData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get existing clinic and doctor
    const clinic = await mongoose.connection.db.collection('clinics').findOne({});
    const doctor = await mongoose.connection.db.collection('users').findOne({ email: 'dr.sharma@dermaclinic.com' });

    if (!clinic || !doctor) {
      console.error('Please run the dermatology seed script first to create clinic and doctor');
      process.exit(1);
    }

    console.log('Using clinic:', clinic.clinicName);
    console.log('Using doctor:', doctor.name);

    // Create dummy images directory
    const imagesDir = path.join(__dirname, '..', 'public', 'dummy-images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Create placeholder images for 3 visits (showing progression)
    const images = [
      { name: 'cosmo-visit1-face.svg', text: 'Visit 1 - Baseline', color: '#8B4513' }, // Brown - heavy pigmentation
      { name: 'cosmo-visit2-face.svg', text: 'Visit 2 - Week 2', color: '#A0522D' },   // Sienna - lighter
      { name: 'cosmo-visit3-face.svg', text: 'Visit 3 - Week 4', color: '#DEB887' },   // Burlywood - much lighter
    ];

    console.log('\nCreating placeholder images...');
    for (const img of images) {
      const svgContent = createPlaceholderSVG(img.text, img.color);
      const filePath = path.join(imagesDir, img.name);
      fs.writeFileSync(filePath, svgContent);
      console.log(`  Created: ${img.name}`);
    }

    // Create a new patient for cosmetology
    console.log('\nCreating cosmetology patient...');
    const patientData = {
      _id: new mongoose.Types.ObjectId(),
      clinicId: clinic._id,
      patientId: 'PAT-COSMO-001',
      name: 'Anita Mehta',
      age: 34,
      gender: 'female',
      phone: '9876543100',
      email: 'anita.mehta@email.com',
      address: '25 MG Road, Koramangala, Bangalore',
      medicalHistory: 'No significant medical history. Non-smoker.',
      allergies: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await mongoose.connection.db.collection('patients').insertOne(patientData);
    console.log(`  Created patient: ${patientData.name} (${patientData.patientId})`);

    // Create 3 cosmetology consultations (Chemical Peel for Melasma)
    console.log('\nCreating 3 cosmetology consultations...');

    const consultations = [
      // Visit 1 - Initial consultation and first peel
      {
        _id: new mongoose.Types.ObjectId(),
        clinicId: clinic._id,
        patientId: patientData._id,
        doctorId: doctor._id,
        consultationDate: new Date('2025-01-10'),
        patientInfo: {
          name: 'Anita Mehta',
          age: 34,
          gender: 'female',
          skinType: 'Type IV (Fitzpatrick)',
          primaryConcern: 'Melasma on cheeks and forehead, uneven skin tone',
        },
        assessment: {
          findings: 'Bilateral symmetric hyperpigmented patches on malar area and forehead. Melasma pattern: Centrofacial. No active acne or inflammation.',
          diagnosis: 'Melasma - Epidermal type',
          baselineEvaluation: 'MASI Score: 12 (Moderate). Pigmentation depth: Epidermal (confirmed with Wood\'s lamp). Skin hydration: Normal.',
          contraindicationsCheck: 'No active infections, not pregnant, no isotretinoin use in past 6 months, no history of keloids.',
        },
        procedure: {
          name: 'Chemical Peel - Glycolic Acid 35%',
          goals: 'Reduce melasma pigmentation, improve skin texture, achieve even skin tone',
          sessionNumber: 1,
          package: '6-session Chemical Peel Package',
          productsAndParameters: 'Glycolic Acid 35%, applied for 3 minutes. Neutralized with sodium bicarbonate solution. Post-peel: Calming serum + SPF 50.',
          immediateOutcome: 'Mild erythema observed. No frosting. Patient tolerated well.',
        },
        images: [
          {
            url: '/dummy-images/cosmo-visit1-face.svg',
            uploadedAt: new Date('2025-01-10'),
          },
        ],
        aftercare: {
          instructions: 'Avoid sun exposure for 1 week. No exfoliating products for 5 days. Apply prescribed moisturizer twice daily. Use SPF 50 every 2-3 hours when outdoors.',
          homeProducts: 'Cetaphil Gentle Cleanser, La Roche-Posay Cicaplast Baume B5, Neutrogena Ultra Sheer SPF 50+',
          followUpDate: new Date('2025-01-24'),
          expectedResults: 'Mild peeling expected in 2-3 days. Initial lightening visible after first peel. Full results after completing 6 sessions.',
        },
        consent: {
          risksExplained: 'Temporary redness, peeling, dryness, and sun sensitivity explained. Risk of post-inflammatory hyperpigmentation if sun protection not followed.',
          consentConfirmed: true,
        },
        reportSummary: {
          doctorNotes: 'First session completed successfully. Patient educated on strict sun protection. Started on 2% hydroquinone for home use.',
          signature: 'Dr. Priya Sharma',
        },
        status: 'completed',
        createdAt: new Date('2025-01-10'),
        updatedAt: new Date('2025-01-10'),
      },

      // Visit 2 - Second peel session
      {
        _id: new mongoose.Types.ObjectId(),
        clinicId: clinic._id,
        patientId: patientData._id,
        doctorId: doctor._id,
        consultationDate: new Date('2025-01-24'),
        patientInfo: {
          name: 'Anita Mehta',
          age: 34,
          gender: 'female',
          skinType: 'Type IV (Fitzpatrick)',
          primaryConcern: 'Melasma treatment - Follow up session',
        },
        assessment: {
          findings: 'Pigmentation shows 15-20% improvement from baseline. No adverse reactions from first peel. Skin well-hydrated.',
          diagnosis: 'Melasma - Epidermal type (Improving)',
          baselineEvaluation: 'MASI Score: 10 (Previously 12). Visible lightening on forehead patches. Malar pigmentation slightly reduced.',
          contraindicationsCheck: 'No new contraindications. Skin fully recovered from previous peel.',
        },
        procedure: {
          name: 'Chemical Peel - Glycolic Acid 50%',
          goals: 'Continue pigmentation reduction, increase peel strength for better efficacy',
          sessionNumber: 2,
          package: '6-session Chemical Peel Package',
          productsAndParameters: 'Glycolic Acid 50%, applied for 3 minutes. Neutralized with sodium bicarbonate solution. Increased concentration from 35% as skin tolerated well.',
          immediateOutcome: 'Moderate erythema. Light frosting on forehead. Patient reported mild tingling (expected).',
        },
        images: [
          {
            url: '/dummy-images/cosmo-visit2-face.svg',
            uploadedAt: new Date('2025-01-24'),
          },
        ],
        aftercare: {
          instructions: 'Strict sun avoidance for 10 days. Peeling expected to be more pronounced. Continue moisturizer and SPF regimen. Avoid makeup for 48 hours.',
          homeProducts: 'Cetaphil Gentle Cleanser, La Roche-Posay Cicaplast Baume B5, Neutrogena Ultra Sheer SPF 50+, 2% Hydroquinone (night)',
          followUpDate: new Date('2025-02-07'),
          expectedResults: 'More noticeable peeling expected in 3-5 days. Expect 30-40% overall improvement after this session.',
        },
        consent: {
          risksExplained: 'Reviewed risks again. Higher concentration may cause more peeling - this is expected and beneficial.',
          consentConfirmed: true,
        },
        reportSummary: {
          doctorNotes: 'Good response to treatment. Increased acid concentration. Patient compliant with home care. Continue hydroquinone.',
          signature: 'Dr. Priya Sharma',
        },
        status: 'completed',
        createdAt: new Date('2025-01-24'),
        updatedAt: new Date('2025-01-24'),
      },

      // Visit 3 - Third peel session with significant improvement
      {
        _id: new mongoose.Types.ObjectId(),
        clinicId: clinic._id,
        patientId: patientData._id,
        doctorId: doctor._id,
        consultationDate: new Date('2025-02-07'),
        patientInfo: {
          name: 'Anita Mehta',
          age: 34,
          gender: 'female',
          skinType: 'Type IV (Fitzpatrick)',
          primaryConcern: 'Melasma treatment - Session 3',
        },
        assessment: {
          findings: 'Significant improvement noted. Forehead patches reduced by ~50%. Malar pigmentation much lighter. Overall skin tone more even.',
          diagnosis: 'Melasma - Responding well to treatment',
          baselineEvaluation: 'MASI Score: 6 (Baseline was 12 - 50% improvement!). Skin texture improved. No PIH observed.',
          contraindicationsCheck: 'No contraindications. Excellent compliance with sun protection.',
        },
        procedure: {
          name: 'Chemical Peel - Glycolic Acid 50% + Kojic Acid',
          goals: 'Maintain improvement, target remaining pigmentation, enhance brightening',
          sessionNumber: 3,
          package: '6-session Chemical Peel Package',
          productsAndParameters: 'Glycolic Acid 50% + Kojic Acid 2% combination peel. Applied for 4 minutes. Added Kojic acid for enhanced melanin inhibition.',
          immediateOutcome: 'Moderate erythema with even frosting. Patient comfortable throughout procedure.',
        },
        images: [
          {
            url: '/dummy-images/cosmo-visit3-face.svg',
            uploadedAt: new Date('2025-02-07'),
          },
        ],
        aftercare: {
          instructions: 'Continue strict sun protection. Maintain current home care routine. Can resume light makeup after 48 hours. Next session in 2 weeks.',
          homeProducts: 'Cetaphil Gentle Cleanser, La Roche-Posay Cicaplast Baume B5, EltaMD UV Clear SPF 46, 4% Hydroquinone (night) - increased strength',
          followUpDate: new Date('2025-02-21'),
          expectedResults: 'Expect 60-70% overall improvement after this session. 3 more sessions remaining for optimal results.',
        },
        consent: {
          risksExplained: 'All risks reviewed. Patient very satisfied with progress.',
          consentConfirmed: true,
        },
        reportSummary: {
          doctorNotes: 'Excellent response! 50% improvement in MASI score after just 3 sessions. Patient very happy. Increased hydroquinone to 4% for enhanced home care. Will reassess after 6 sessions for maintenance plan.',
          signature: 'Dr. Priya Sharma',
        },
        status: 'completed',
        createdAt: new Date('2025-02-07'),
        updatedAt: new Date('2025-02-07'),
      },
    ];

    await mongoose.connection.db.collection('consultationcosmetologies').insertMany(consultations);
    console.log(`  Created ${consultations.length} cosmetology consultations`);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('COSMETOLOGY DATA SEEDING COMPLETE');
    console.log('='.repeat(60));

    console.log('\n📋 PATIENT ADDED:');
    console.log(`  Name: ${patientData.name}`);
    console.log(`  Age: ${patientData.age}, Gender: ${patientData.gender}`);
    console.log(`  Patient ID: ${patientData.patientId}`);
    console.log(`  MongoDB ID: ${patientData._id}`);

    console.log('\n🏥 CONSULTATIONS ADDED (Chemical Peel for Melasma):');
    consultations.forEach((c, i) => {
      const date = new Date(c.consultationDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      console.log(`\n  Visit ${i + 1} (${date}):`);
      console.log(`    Procedure: ${c.procedure.name}`);
      console.log(`    Session: ${c.procedure.sessionNumber} of 6`);
      console.log(`    MASI Score: ${c.assessment.baselineEvaluation.match(/MASI Score: (\d+)/)?.[1] || 'N/A'}`);
      console.log(`    Outcome: ${c.procedure.immediateOutcome.substring(0, 60)}...`);
      console.log(`    Image: ${c.images[0].url}`);
    });

    console.log('\n🖼️ PLACEHOLDER IMAGES CREATED:');
    images.forEach(img => {
      console.log(`  /public/dummy-images/${img.name} - ${img.text}`);
    });

    console.log('\n✅ You can now:');
    console.log('  1. View patient at: /tier2/patients/' + patientData._id);
    console.log('  2. View consultations at: /tier2/visit/cosmetology');
    console.log('  3. Compare images across the 3 visits to see progression');

    await mongoose.disconnect();
    console.log('\nDone!');

  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

seedCosmetologyData();
