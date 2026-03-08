import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { z } from "zod";

const PLANS = {
  monthly: { amount: 250000, label: "Monthly" }, // ₹2,500 in paise
  yearly: { amount: 2500000, label: "Yearly" },  // ₹25,000 in paise
};

const createSubscriptionSchema = z.object({
  plan: z.enum(["monthly", "yearly"]),
  email: z.string().email("Email is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validationResult = createSubscriptionSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, message: "Validation failed", errors: validationResult.error.errors },
        { status: 400 }
      );
    }

    const { plan, email } = validationResult.data;

    // Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const planConfig = PLANS[plan];

    // Create Razorpay order (no user or subscription created in DB yet)
    const order = await razorpay.orders.create({
      amount: planConfig.amount,
      currency: "INR",
      receipt: `sub_${Date.now()}`,
      notes: {
        email,
        plan,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        amount: planConfig.amount,
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error("Create subscription error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create order" },
      { status: 500 }
    );
  }
}
