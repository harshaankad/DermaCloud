import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Import models
import User from "../models/User";
import Clinic from "../models/Clinic";
import FrontdeskStaff from "../models/FrontdeskStaff";
import InventoryItem from "../models/InventoryItem";
import Appointment from "../models/Appointment";
import Patient from "../models/Patient";

async function seedFrontdeskData() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI not found in environment variables");
    }

    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Find the doctor (tier2 user)
    const doctor = await User.findOne({ email: "dr.sharma@dermaclinic.com", tier: "tier2" });
    if (!doctor) {
      console.log("❌ Doctor not found. Please make sure dr.sharma@dermaclinic.com exists.");
      process.exit(1);
    }

    console.log(`✅ Found doctor: ${doctor.name} (${doctor.email})`);
    const doctorId = doctor._id.toString();

    // Find the clinic for this doctor
    const clinic = await Clinic.findOne({ doctorId: doctor._id });
    if (!clinic) {
      console.log("❌ Clinic not found for this doctor. Please set up clinic first.");
      process.exit(1);
    }
    const clinicId = clinic._id.toString();
    console.log(`✅ Found clinic: ${clinic.clinicName} (${clinicId})`);

    // Clean up any existing frontdesk data
    const existingStaff = await FrontdeskStaff.findOne({ email: "reception@dermaclinic.com" });
    if (existingStaff) {
      console.log("⚠️ Frontdesk staff already exists, deleting old data...");
      await FrontdeskStaff.deleteMany({ email: "reception@dermaclinic.com" });
    }
    // Clean inventory and appointments for this clinic (try both old doctorId-based and correct clinicId)
    await InventoryItem.deleteMany({ clinicId: { $in: [clinicId, doctorId] } });
    await Appointment.deleteMany({ clinicId: { $in: [clinicId, doctorId] } });
    await Appointment.deleteMany({ doctorId });

    // Create frontdesk staff
    const hashedPassword = await bcrypt.hash("reception123", 10);
    const frontdeskStaff = new FrontdeskStaff({
      name: "Priya Receptionist",
      email: "reception@dermaclinic.com",
      phone: "9876543210",
      password: hashedPassword,
      clinicId,
      doctorId,
      permissions: {
        appointments: true,
        patients: true,
        pharmacy: true,
        sales: true,
        reports: false,
      },
      status: "active",
    });
    await frontdeskStaff.save();
    console.log(`✅ Created frontdesk staff: ${frontdeskStaff.name}`);
    console.log(`   Email: reception@dermaclinic.com`);
    console.log(`   Password: reception123`);
    console.log(`   Staff ID: ${frontdeskStaff.staffId}`);

    // Create inventory items
    // Valid categories: "medicine", "cream", "lotion", "supplement", "equipment", "consumable", "other"
    const inventoryItems = [
      {
        name: "Betnovate-C Cream",
        genericName: "Betamethasone + Clioquinol",
        category: "cream",
        description: "Topical corticosteroid cream for skin conditions",
        currentStock: 50,
        minStockLevel: 10,
        unit: "tubes",
        costPrice: 45,
        sellingPrice: 65,
        manufacturer: "GSK Pharma",
        clinicId,
      },
      {
        name: "Clobetasol Propionate Cream",
        genericName: "Clobetasol",
        category: "cream",
        description: "Super potent topical steroid",
        currentStock: 30,
        minStockLevel: 5,
        unit: "tubes",
        costPrice: 80,
        sellingPrice: 120,
        manufacturer: "Cipla",
        clinicId,
      },
      {
        name: "Ketoconazole Shampoo",
        genericName: "Ketoconazole 2%",
        category: "other",
        description: "Anti-fungal shampoo for dandruff and seborrheic dermatitis",
        currentStock: 25,
        minStockLevel: 5,
        unit: "bottles",
        costPrice: 150,
        sellingPrice: 220,
        manufacturer: "Torrent Pharma",
        clinicId,
      },
      {
        name: "Tacrolimus Ointment 0.1%",
        genericName: "Tacrolimus",
        category: "cream",
        description: "Immunosuppressant for eczema and atopic dermatitis",
        currentStock: 20,
        minStockLevel: 5,
        unit: "tubes",
        costPrice: 350,
        sellingPrice: 480,
        manufacturer: "Glenmark",
        clinicId,
      },
      {
        name: "Isotretinoin 20mg Capsules",
        genericName: "Isotretinoin",
        category: "medicine",
        description: "Oral retinoid for severe acne",
        currentStock: 100,
        minStockLevel: 20,
        unit: "capsules",
        costPrice: 15,
        sellingPrice: 25,
        manufacturer: "Sun Pharma",
        clinicId,
      },
      {
        name: "Calamine Lotion",
        genericName: "Calamine + Zinc Oxide",
        category: "lotion",
        description: "Soothing lotion for skin irritation",
        currentStock: 40,
        minStockLevel: 10,
        unit: "bottles",
        costPrice: 50,
        sellingPrice: 80,
        manufacturer: "Johnson & Johnson",
        clinicId,
      },
      {
        name: "Sunscreen SPF 50",
        genericName: "Zinc Oxide + Titanium Dioxide",
        category: "other",
        description: "Broad spectrum sunscreen",
        currentStock: 35,
        minStockLevel: 10,
        unit: "tubes",
        costPrice: 200,
        sellingPrice: 350,
        manufacturer: "La Shield",
        clinicId,
      },
      {
        name: "Vitamin E Capsules",
        genericName: "Tocopherol 400mg",
        category: "supplement",
        description: "Antioxidant supplement for skin health",
        currentStock: 200,
        minStockLevel: 50,
        unit: "capsules",
        costPrice: 5,
        sellingPrice: 10,
        manufacturer: "Evion",
        clinicId,
      },
      {
        name: "Mupirocin Ointment",
        genericName: "Mupirocin 2%",
        category: "cream",
        description: "Antibiotic for skin infections",
        currentStock: 8,
        minStockLevel: 10,
        unit: "tubes",
        costPrice: 90,
        sellingPrice: 140,
        manufacturer: "Cipla",
        clinicId,
      },
      {
        name: "Cetaphil Moisturizer",
        genericName: "Cetyl Alcohol + Glycerin",
        category: "lotion",
        description: "Non-comedogenic moisturizer",
        currentStock: 0,
        minStockLevel: 10,
        unit: "bottles",
        costPrice: 400,
        sellingPrice: 600,
        manufacturer: "Galderma",
        status: "out-of-stock",
        clinicId,
      },
    ];

    for (const item of inventoryItems) {
      const inventoryItem = new InventoryItem(item);
      await inventoryItem.save();
    }
    console.log(`✅ Created ${inventoryItems.length} inventory items`);

    // Find or create patients for appointments
    let patients = await Patient.find({ clinicId }).limit(3);

    if (patients.length === 0) {
      // Create sample patients if none exist
      const samplePatients = [
        {
          clinicId,
          patientId: "PAT-001",
          name: "Rahul Kumar",
          age: 34,
          phone: "9876543001",
          email: "rahul.kumar@email.com",
          gender: "male",
        },
        {
          clinicId,
          patientId: "PAT-002",
          name: "Anita Desai",
          age: 39,
          phone: "9876543002",
          email: "anita.desai@email.com",
          gender: "female",
        },
        {
          clinicId,
          patientId: "PAT-003",
          name: "Vikram Singh",
          age: 46,
          phone: "9876543003",
          email: "vikram.singh@email.com",
          gender: "male",
        },
      ];

      for (const p of samplePatients) {
        const patient = new Patient(p);
        await patient.save();
        patients.push(patient);
      }
      console.log(`✅ Created ${samplePatients.length} sample patients`);
    }

    // Create appointments
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Appointment types: "dermatology", "cosmetology", "follow-up", "consultation"
    // Time format: "HH:MM"
    const appointmentData = [
      {
        patientId: patients[0]._id,
        clinicId,
        doctorId,
        appointmentDate: today,
        appointmentTime: "10:00",
        type: "consultation",
        reason: "Acne treatment follow-up",
        status: "scheduled",
        bookedBy: {
          id: frontdeskStaff._id,
          name: frontdeskStaff.name,
          role: "frontdesk",
        },
      },
      {
        patientId: patients[1]._id,
        clinicId,
        doctorId,
        appointmentDate: today,
        appointmentTime: "11:00",
        type: "dermatology",
        reason: "Eczema check-up",
        status: "checked-in",
        bookedBy: {
          id: frontdeskStaff._id,
          name: frontdeskStaff.name,
          role: "frontdesk",
        },
      },
      {
        patientId: patients[2]._id,
        clinicId,
        doctorId,
        appointmentDate: today,
        appointmentTime: "14:00",
        type: "follow-up",
        reason: "Psoriasis treatment review",
        status: "scheduled",
        bookedBy: {
          id: frontdeskStaff._id,
          name: frontdeskStaff.name,
          role: "frontdesk",
        },
      },
      {
        patientId: patients[0]._id,
        clinicId,
        doctorId,
        appointmentDate: tomorrow,
        appointmentTime: "09:30",
        type: "consultation",
        reason: "New skin rash evaluation",
        status: "scheduled",
        bookedBy: {
          id: frontdeskStaff._id,
          name: frontdeskStaff.name,
          role: "frontdesk",
        },
      },
      {
        patientId: patients[1]._id,
        clinicId,
        doctorId,
        appointmentDate: tomorrow,
        appointmentTime: "15:00",
        type: "cosmetology",
        reason: "Mole removal procedure",
        status: "scheduled",
        bookedBy: {
          id: frontdeskStaff._id,
          name: frontdeskStaff.name,
          role: "frontdesk",
        },
      },
    ];

    for (const apt of appointmentData) {
      const appointment = new Appointment(apt);
      await appointment.save();
    }
    console.log(`✅ Created ${appointmentData.length} appointments`);

    console.log("\n" + "=".repeat(60));
    console.log("🎉 SEED COMPLETE!");
    console.log("=".repeat(60));
    console.log("\n📋 CREDENTIALS:");
    console.log("-".repeat(40));
    console.log("DOCTOR LOGIN:");
    console.log("  URL: http://localhost:3000/tier2/login");
    console.log("  Email: dr.sharma@dermaclinic.com");
    console.log("  Password: doctor123");
    console.log("-".repeat(40));
    console.log("FRONTDESK LOGIN:");
    console.log("  URL: http://localhost:3000/frontdesk/login");
    console.log("  Email: reception@dermaclinic.com");
    console.log("  Password: reception123");
    console.log("-".repeat(40));
    console.log("\n📦 DATA CREATED:");
    console.log(`  • 1 Frontdesk Staff`);
    console.log(`  • ${inventoryItems.length} Pharmacy Items`);
    console.log(`  • ${appointmentData.length} Appointments`);
    console.log(`  • ${patients.length} Patients`);
    console.log("=".repeat(60) + "\n");

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding data:", error);
    process.exit(1);
  }
}

seedFrontdeskData();
