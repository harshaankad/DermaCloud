import { UsageTracking } from "@/models";
import { format } from "date-fns";

/**
 * Check if user has exceeded daily scan limit (Tier 1)
 */
export async function checkDailyLimit(
  userId: string,
  dailyLimit: number = 5
): Promise<{ allowed: boolean; remaining: number; scansToday: number }> {
  const today = format(new Date(), "yyyy-MM-dd");

  const usage = await UsageTracking.findOne({ userId, date: today });

  const scansToday = usage?.dailyScans || 0;
  const allowed = scansToday < dailyLimit;
  const remaining = Math.max(0, dailyLimit - scansToday);

  return { allowed, remaining, scansToday };
}

/**
 * Check if user has exceeded monthly scan limit (Tier 1)
 */
export async function checkMonthlyLimit(
  userId: string,
  monthlyLimit: number = 120
): Promise<{ allowed: boolean; remaining: number; scansThisMonth: number }> {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentMonth = today.substring(0, 7); // YYYY-MM

  // Get all usage records for current month
  const usageRecords = await UsageTracking.find({
    userId,
    date: { $regex: `^${currentMonth}` },
  });

  const scansThisMonth = usageRecords.reduce(
    (total, record) => total + record.dailyScans,
    0
  );

  const allowed = scansThisMonth < monthlyLimit;
  const remaining = Math.max(0, monthlyLimit - scansThisMonth);

  return { allowed, remaining, scansThisMonth };
}

/**
 * Increment scan count for a user
 */
export async function incrementScanCount(userId: string): Promise<void> {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentMonth = today.substring(0, 7); // YYYY-MM

  // Update or create today's usage record
  await UsageTracking.findOneAndUpdate(
    { userId, date: today },
    {
      $inc: { dailyScans: 1 },
      $set: { lastScanAt: new Date() },
    },
    { upsert: true, new: true }
  );

  // Update monthly count for all days in current month
  await UsageTracking.updateMany(
    { userId, date: { $regex: `^${currentMonth}` } },
    { $inc: { monthlyScans: 1 } }
  );
}

/**
 * Get usage statistics for a user
 */
export async function getUserUsageStats(userId: string): Promise<{
  today: number;
  thisMonth: number;
  totalAllTime: number;
}> {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentMonth = today.substring(0, 7);

  const todayUsage = await UsageTracking.findOne({ userId, date: today });
  const monthlyUsage = await UsageTracking.find({
    userId,
    date: { $regex: `^${currentMonth}` },
  });
  const allTimeUsage = await UsageTracking.find({ userId });

  return {
    today: todayUsage?.dailyScans || 0,
    thisMonth: monthlyUsage.reduce((sum, record) => sum + record.dailyScans, 0),
    totalAllTime: allTimeUsage.reduce((sum, record) => sum + record.dailyScans, 0),
  };
}

/**
 * Generate unique patient ID for a clinic
 */
export async function generatePatientId(clinicId: string): Promise<string> {
  const { Patient } = await import("@/models");

  // Get count of patients for this clinic
  const count = await Patient.countDocuments({ clinicId });
  const paddedNumber = String(count + 1).padStart(5, "0");

  return `PAT${paddedNumber}`;
}

/**
 * Validate custom field data against clinic settings
 */
export function validateCustomFields(
  data: Record<string, any>,
  customFieldDefinitions: any[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const fieldDef of customFieldDefinitions) {
    const value = data[fieldDef.fieldName];

    // Check required fields
    if (fieldDef.required && (!value || value === "")) {
      errors.push(`${fieldDef.fieldName} is required`);
    }

    // Type validation
    if (value) {
      switch (fieldDef.fieldType) {
        case "number":
          if (isNaN(Number(value))) {
            errors.push(`${fieldDef.fieldName} must be a number`);
          }
          break;
        case "select":
          if (fieldDef.options && !fieldDef.options.includes(value)) {
            errors.push(
              `${fieldDef.fieldName} must be one of: ${fieldDef.options.join(", ")}`
            );
          }
          break;
        case "date":
          if (isNaN(Date.parse(value))) {
            errors.push(`${fieldDef.fieldName} must be a valid date`);
          }
          break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
