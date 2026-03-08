import { connectDB } from "@/lib/db/connection";
import AuditLog from "@/models/AuditLog";
import { scrub } from "@/lib/safe-log";

interface AuditParams {
  clinicId?: string;
  userId: string;
  userEmail: string;
  role: "doctor" | "frontdesk" | "system";
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  details?: Record<string, any>;
  success?: boolean;
}

/**
 * Fire-and-forget audit log. Errors are silently swallowed so they never
 * break the primary request.
 */
export async function auditLog(params: AuditParams): Promise<void> {
  try {
    await connectDB();
    await AuditLog.create({
      clinicId: params.clinicId,
      userId: params.userId,
      userEmail: params.userEmail,
      role: params.role,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      ipAddress: params.ipAddress,
      details: params.details ? scrub(params.details) as Record<string, any> : undefined,
      success: params.success ?? true,
    });
  } catch {
    // Never let audit logging break the main request
  }
}
