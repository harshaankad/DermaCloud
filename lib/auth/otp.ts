import OTP from "@/models/OTP";
import { connectDB } from "@/lib/db/connection";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;

/**
 * Generate a random 6-digit OTP
 */
export function generateOTP(): string {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  return otp;
}

/**
 * Store OTP in database
 */
export async function storeOTP(email: string, otp: string): Promise<void> {
  await connectDB();

  // Delete any existing OTPs for this email
  await OTP.deleteMany({ email });

  // Create new OTP with expiry
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

  await OTP.create({
    email,
    otp,
    expiresAt,
  });
}

/**
 * Verify OTP for an email
 */
export async function verifyOTP(email: string, otp: string): Promise<boolean> {
  await connectDB();

  const otpRecord = await OTP.findOne({ email, otp });

  if (!otpRecord) {
    return false;
  }

  // Check if OTP has expired
  if (new Date() > otpRecord.expiresAt) {
    await OTP.deleteOne({ _id: otpRecord._id });
    return false;
  }

  // OTP is valid, delete it
  await OTP.deleteOne({ _id: otpRecord._id });
  return true;
}

/**
 * Clean up expired OTPs (can be called periodically)
 */
export async function cleanupExpiredOTPs(): Promise<void> {
  await connectDB();
  await OTP.deleteMany({ expiresAt: { $lt: new Date() } });
}
