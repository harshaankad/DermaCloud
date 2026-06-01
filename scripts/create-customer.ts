import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import User from "../models/User";
import Clinic from "../models/Clinic";
import Subscription from "../models/Subscription";

const MONGODB_URI = process.env.MONGODB_URI || "";

const CUSTOMER = {
  name: "Ashwini M Shetty",
  email: "ash6780in@yahoo.com",
  password: "Ashwini@123",
  phone: "9845611559",
  clinicName: "Apollo Hospital",
};

async function createCustomer() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    // Check if user already exists
    const existing = await User.findOne({ email: CUSTOMER.email });
    if (existing) {
      console.log(`\nUser already exists: ${existing.email}`);
      console.log(`User ID: ${existing._id}`);
      console.log(`Clinic ID: ${existing.clinicId}`);
      await mongoose.disconnect();
      return;
    }

    // 1. Create User
    console.log("\n--- Creating User ---");
    const hashedPassword = await bcrypt.hash(CUSTOMER.password, 10);
    const user = await User.create({
      email: CUSTOMER.email,
      password: hashedPassword,
      name: CUSTOMER.name,
      tier: "tier2",
      phone: CUSTOMER.phone,
      isVerified: true,
      authProvider: "local",
      subscriptionStatus: "active",
    });
    console.log(`Created User: ${user.name} (${user.email})`);
    console.log(`User ID: ${user._id}`);

    // 2. Create Clinic
    console.log("\n--- Creating Clinic ---");
    const clinic = await Clinic.create({
      doctorId: user._id,
      clinicName: CUSTOMER.clinicName,
      phone: CUSTOMER.phone,
    });
    console.log(`Created Clinic: ${clinic.clinicName}`);
    console.log(`Clinic ID: ${clinic._id}`);

    // 3. Create Subscription (yearly, bypassing Razorpay)
    console.log("\n--- Creating Subscription ---");
    const now = new Date();
    const endDate = new Date(now);
    endDate.setFullYear(endDate.getFullYear() + 1);

    const subscription = await Subscription.create({
      userId: user._id,
      plan: "yearly",
      amount: 25000,
      status: "active",
      razorpayOrderId: `MIGRATION_${Date.now()}`,
      startDate: now,
      endDate,
    });
    console.log(`Created Subscription: ${subscription.plan} (active until ${endDate.toDateString()})`);

    // 4. Link subscription and clinic to user
    await User.findByIdAndUpdate(user._id, {
      clinicId: clinic._id,
      subscriptionId: subscription._id,
    });
    console.log("\nLinked clinic and subscription to user");

    // Summary
    console.log("\n========== CUSTOMER CREATED ==========");
    console.log(`Name:     ${CUSTOMER.name}`);
    console.log(`Email:    ${CUSTOMER.email}`);
    console.log(`Password: ${CUSTOMER.password}`);
    console.log(`Phone:    ${CUSTOMER.phone}`);
    console.log(`Clinic:   ${CUSTOMER.clinicName}`);
    console.log(`User ID:  ${user._id}`);
    console.log(`Clinic ID: ${clinic._id}`);
    console.log("=======================================");

    await mongoose.disconnect();
    console.log("\nDone.");
  } catch (error: any) {
    console.error("Error:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createCustomer();
