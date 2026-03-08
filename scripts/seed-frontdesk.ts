/**
 * Seed script for Frontdesk Add-on Kit
 * Run with: npx ts-node scripts/seed-frontdesk.ts
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Import models
import User from "../models/User";
import Clinic from "../models/Clinic";
import Patient from "../models/Patient";
import FrontdeskStaff from "../models/FrontdeskStaff";
import Appointment from "../models/Appointment";
import InventoryItem from "../models/InventoryItem";
import Sale from "../models/Sale";

const MONGODB_URI = process.env.MONGODB_URI || "";

async function seedFrontdeskData() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Find existing tier2 doctor and clinic
    const doctor = await User.findOne({ tier: "tier2" });
    if (!doctor) {
      console.log("❌ No tier2 doctor found. Please run the main seed script first.");
      return;
    }
    console.log(`✅ Found doctor: ${doctor.name} (${doctor.email})`);

    const clinic = await Clinic.findOne({ doctorId: doctor._id });
    if (!clinic) {
      console.log("❌ No clinic found for the doctor.");
      return;
    }
    console.log(`✅ Found clinic: ${clinic.clinicName}`);

    // Find existing patients
    const patients = await Patient.find({ clinicId: clinic._id }).limit(5);
    if (patients.length === 0) {
      console.log("❌ No patients found. Please run the main seed script first.");
      return;
    }
    console.log(`✅ Found ${patients.length} patients`);

    // =====================
    // 1. Create Frontdesk Staff
    // =====================
    console.log("\n📝 Creating frontdesk staff...");

    const existingStaff = await FrontdeskStaff.findOne({ clinicId: clinic._id });
    if (existingStaff) {
      console.log("⚠️ Frontdesk staff already exists, skipping...");
    } else {
      const hashedPassword = await bcrypt.hash("frontdesk123", 10);

      const frontdeskData = [
        {
          name: "Priya Sharma",
          email: "frontdesk@dermahms.com",
          password: hashedPassword,
          phone: "9876543210",
          clinicId: clinic._id,
          doctorId: doctor._id,
          permissions: {
            appointments: true,
            patients: true,
            pharmacy: true,
            sales: true,
            reports: false,
          },
        },
        {
          name: "Ravi Kumar",
          email: "ravi.frontdesk@dermahms.com",
          password: hashedPassword,
          phone: "9876543211",
          clinicId: clinic._id,
          doctorId: doctor._id,
          permissions: {
            appointments: true,
            patients: true,
            pharmacy: true,
            sales: true,
            reports: true,
          },
        },
      ];

      for (const staffData of frontdeskData) {
        const staff = new FrontdeskStaff(staffData);
        await staff.save();
        console.log(`  ✅ Created: ${staff.name} (${staff.staffId})`);
      }
    }

    // =====================
    // 2. Create Inventory Items
    // =====================
    console.log("\n📦 Creating inventory items...");

    const existingItems = await InventoryItem.countDocuments({ clinicId: clinic._id });
    if (existingItems > 0) {
      console.log(`⚠️ ${existingItems} inventory items already exist, skipping...`);
    } else {
      const inventoryItems = [
        // Medicines
        {
          name: "Ketoconazole 200mg",
          genericName: "Ketoconazole",
          category: "medicine",
          type: "prescription",
          currentStock: 100,
          minStockLevel: 20,
          unit: "tablets",
          costPrice: 5,
          sellingPrice: 8,
          manufacturer: "Sun Pharma",
          batchNumber: "KET2024001",
          expiryDate: new Date("2026-12-31"),
          clinicId: clinic._id,
        },
        {
          name: "Fluconazole 150mg",
          genericName: "Fluconazole",
          category: "medicine",
          type: "prescription",
          currentStock: 50,
          minStockLevel: 15,
          unit: "tablets",
          costPrice: 12,
          sellingPrice: 18,
          manufacturer: "Cipla",
          batchNumber: "FLU2024002",
          expiryDate: new Date("2026-06-30"),
          clinicId: clinic._id,
        },
        {
          name: "Cetirizine 10mg",
          genericName: "Cetirizine",
          category: "medicine",
          type: "otc",
          currentStock: 200,
          minStockLevel: 50,
          unit: "tablets",
          costPrice: 1,
          sellingPrice: 2,
          manufacturer: "Dr. Reddy's",
          batchNumber: "CET2024003",
          expiryDate: new Date("2027-03-31"),
          clinicId: clinic._id,
        },
        // Creams
        {
          name: "Clobetasol Cream 15g",
          genericName: "Clobetasol Propionate",
          category: "cream",
          type: "prescription",
          currentStock: 30,
          minStockLevel: 10,
          unit: "tubes",
          costPrice: 45,
          sellingPrice: 65,
          manufacturer: "GSK",
          batchNumber: "CLO2024004",
          expiryDate: new Date("2025-12-31"),
          clinicId: clinic._id,
        },
        {
          name: "Betamethasone Cream 20g",
          genericName: "Betamethasone",
          category: "cream",
          type: "prescription",
          currentStock: 8,
          minStockLevel: 15,
          unit: "tubes",
          costPrice: 55,
          sellingPrice: 80,
          manufacturer: "Glenmark",
          batchNumber: "BET2024005",
          expiryDate: new Date("2025-09-30"),
          clinicId: clinic._id,
          status: "active", // Will be flagged as low stock
        },
        // Lotions
        {
          name: "Calamine Lotion 100ml",
          genericName: "Calamine",
          category: "lotion",
          type: "otc",
          currentStock: 40,
          minStockLevel: 10,
          unit: "bottles",
          costPrice: 35,
          sellingPrice: 50,
          manufacturer: "Lacto Calamine",
          batchNumber: "CAL2024006",
          expiryDate: new Date("2026-08-31"),
          clinicId: clinic._id,
        },
        {
          name: "Moisturizing Lotion 200ml",
          genericName: "Cetaphil",
          category: "lotion",
          type: "otc",
          currentStock: 0,
          minStockLevel: 5,
          unit: "bottles",
          costPrice: 280,
          sellingPrice: 350,
          manufacturer: "Cetaphil",
          batchNumber: "MOI2024007",
          expiryDate: new Date("2026-05-31"),
          clinicId: clinic._id,
          status: "out-of-stock",
        },
        // Supplements
        {
          name: "Biotin 5000mcg",
          genericName: "Biotin",
          category: "supplement",
          type: "otc",
          currentStock: 60,
          minStockLevel: 20,
          unit: "capsules",
          costPrice: 8,
          sellingPrice: 12,
          manufacturer: "HealthKart",
          batchNumber: "BIO2024008",
          expiryDate: new Date("2027-01-31"),
          clinicId: clinic._id,
        },
        {
          name: "Vitamin E 400IU",
          genericName: "Tocopherol",
          category: "supplement",
          type: "otc",
          currentStock: 90,
          minStockLevel: 25,
          unit: "capsules",
          costPrice: 6,
          sellingPrice: 10,
          manufacturer: "Evion",
          batchNumber: "VIT2024009",
          expiryDate: new Date("2026-11-30"),
          clinicId: clinic._id,
        },
        // Consumables
        {
          name: "Cotton Roll 500g",
          category: "consumable",
          type: "otc",
          currentStock: 20,
          minStockLevel: 5,
          unit: "pieces",
          costPrice: 80,
          sellingPrice: 100,
          manufacturer: "Generic",
          clinicId: clinic._id,
        },
      ];

      for (const itemData of inventoryItems) {
        const item = new InventoryItem(itemData);
        await item.save();
        console.log(`  ✅ Created: ${item.name} (${item.itemCode}) - Stock: ${item.currentStock}`);
      }
    }

    // =====================
    // 3. Create Appointments
    // =====================
    console.log("\n📅 Creating appointments...");

    const existingAppointments = await Appointment.countDocuments({ clinicId: clinic._id });
    if (existingAppointments > 0) {
      console.log(`⚠️ ${existingAppointments} appointments already exist, skipping...`);
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const appointmentData = [
        {
          patientId: patients[0]._id,
          doctorId: doctor._id,
          clinicId: clinic._id,
          appointmentDate: today,
          appointmentTime: "09:00",
          type: "dermatology",
          status: "completed",
          reason: "Skin rash follow-up",
          bookedBy: { id: doctor._id, name: "Doctor", role: "doctor" },
        },
        {
          patientId: patients[1]._id,
          doctorId: doctor._id,
          clinicId: clinic._id,
          appointmentDate: today,
          appointmentTime: "09:30",
          type: "dermatology",
          status: "checked-in",
          reason: "Acne treatment",
          bookedBy: { id: doctor._id, name: "Doctor", role: "doctor" },
        },
        {
          patientId: patients[2]._id,
          doctorId: doctor._id,
          clinicId: clinic._id,
          appointmentDate: today,
          appointmentTime: "10:00",
          type: "cosmetology",
          status: "scheduled",
          reason: "Facial consultation",
          bookedBy: { id: doctor._id, name: "Doctor", role: "doctor" },
        },
        {
          patientId: patients[3] ? patients[3]._id : patients[0]._id,
          doctorId: doctor._id,
          clinicId: clinic._id,
          appointmentDate: today,
          appointmentTime: "10:30",
          type: "follow-up",
          status: "scheduled",
          reason: "Eczema follow-up",
          bookedBy: { id: doctor._id, name: "Doctor", role: "doctor" },
        },
        {
          patientId: patients[4] ? patients[4]._id : patients[1]._id,
          doctorId: doctor._id,
          clinicId: clinic._id,
          appointmentDate: today,
          appointmentTime: "11:00",
          type: "dermatology",
          status: "scheduled",
          reason: "Fungal infection",
          bookedBy: { id: doctor._id, name: "Doctor", role: "doctor" },
        },
        // Tomorrow's appointments
        {
          patientId: patients[0]._id,
          doctorId: doctor._id,
          clinicId: clinic._id,
          appointmentDate: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          appointmentTime: "09:00",
          type: "dermatology",
          status: "scheduled",
          reason: "New consultation",
          bookedBy: { id: doctor._id, name: "Doctor", role: "doctor" },
        },
      ];

      for (const aptData of appointmentData) {
        const appointment = new Appointment(aptData);
        await appointment.save();
        console.log(`  ✅ Created: ${appointment.appointmentId} - ${aptData.appointmentTime} (${aptData.status})`);
      }
    }

    // =====================
    // Summary
    // =====================
    console.log("\n" + "=".repeat(50));
    console.log("🎉 FRONTDESK SEED COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(50));

    const staffCount = await FrontdeskStaff.countDocuments({ clinicId: clinic._id });
    const itemCount = await InventoryItem.countDocuments({ clinicId: clinic._id });
    const aptCount = await Appointment.countDocuments({ clinicId: clinic._id });

    console.log(`\n📊 Summary:`);
    console.log(`   - Frontdesk Staff: ${staffCount}`);
    console.log(`   - Inventory Items: ${itemCount}`);
    console.log(`   - Appointments: ${aptCount}`);

    console.log(`\n🔐 Frontdesk Login Credentials:`);
    console.log(`   Email: frontdesk@dermahms.com`);
    console.log(`   Password: frontdesk123`);
    console.log(`   URL: http://localhost:3000/frontdesk/login`);

    console.log(`\n👨‍⚕️ Doctor Dashboard:`);
    console.log(`   Manage staff at: http://localhost:3000/tier2/settings/frontdesk`);

  } catch (error) {
    console.error("❌ Error seeding data:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

seedFrontdeskData();
