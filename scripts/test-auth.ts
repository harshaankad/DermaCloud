/**
 * Test script for authentication system
 * Run with: npx tsx scripts/test-auth.ts
 */

const BASE_URL = "http://localhost:3000";

interface SignupResponse {
  success: boolean;
  message: string;
  data?: {
    userId: string;
    email: string;
  };
}

interface VerifyOTPResponse {
  success: boolean;
  message: string;
  data?: {
    token: string;
    user: any;
  };
}

interface LoginResponse {
  success: boolean;
  message: string;
  data?: {
    token: string;
    user: any;
  };
}

async function testSignup() {
  console.log("\n🔹 Testing Signup...");

  const response = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "test@dermahms.com",
      password: "Test@1234",
      name: "Test User",
      tier: "tier1",
      phone: "9876543210", // Must be exactly 10 digits
    }),
  });

  const data: SignupResponse = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (data.success) {
    console.log("✅ Signup successful! Check your email for OTP.");
    console.log("📧 Email:", data.data?.email);
    return data.data?.email;
  } else {
    console.log("❌ Signup failed:", data.message);
    return null;
  }
}

async function testVerifyOTP(email: string, otp: string) {
  console.log("\n🔹 Testing OTP Verification...");

  const response = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      otp,
    }),
  });

  const data: VerifyOTPResponse = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (data.success) {
    console.log("✅ OTP verified successfully!");
    console.log("🔑 Token:", data.data?.token?.substring(0, 50) + "...");
    return data.data?.token;
  } else {
    console.log("❌ OTP verification failed:", data.message);
    return null;
  }
}

async function testLogin(email: string, password: string) {
  console.log("\n🔹 Testing Login...");

  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const data: LoginResponse = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (data.success) {
    console.log("✅ Login successful!");
    console.log("🔑 Token:", data.data?.token?.substring(0, 50) + "...");
    return data.data?.token;
  } else {
    console.log("❌ Login failed:", data.message);
    return null;
  }
}

async function testGetMe(token: string) {
  console.log("\n🔹 Testing Get Current User...");

  const response = await fetch(`${BASE_URL}/api/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (data.success) {
    console.log("✅ Get user successful!");
    console.log("👤 User:", data.data.user.name);
  } else {
    console.log("❌ Get user failed:", data.message);
  }
}

async function main() {
  console.log("🚀 Starting Authentication System Tests");
  console.log("======================================\n");

  try {
    // Test 1: Signup
    const email = await testSignup();
    if (!email) {
      console.log("\n⚠️  Signup failed. Please check if the user already exists or email configuration is correct.");
      return;
    }

    // Wait for OTP input
    console.log("\n⏳ Waiting for OTP...");
    console.log("📨 Please check your email and enter the OTP when prompted.");
    console.log("💡 You can also test the other endpoints manually using the OTP from your email.\n");

    // For automated testing, you would need to read OTP from console or file
    // For now, we'll skip OTP verification in automated mode
    console.log("ℹ️  To complete the test:");
    console.log("1. Check your email for the OTP");
    console.log("2. Use this curl command to verify:");
    console.log(`\ncurl -X POST ${BASE_URL}/api/auth/verify-otp \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"email": "${email}", "otp": "YOUR_OTP_HERE"}'`);

    console.log("\n3. Then test login:");
    console.log(`\ncurl -X POST ${BASE_URL}/api/auth/login \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"email": "${email}", "password": "Test@1234"}'`);

    console.log("\n\n✅ Test script completed!");
    console.log("📋 Check the email and complete verification manually.");
  } catch (error) {
    console.error("\n❌ Error during testing:", error);
  }
}

main();
