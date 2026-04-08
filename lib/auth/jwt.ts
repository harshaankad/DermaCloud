import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET + "_refresh";
const ACCESS_TOKEN_EXPIRY = "24h";
const REFRESH_TOKEN_EXPIRY = "30d";

export interface JWTPayload {
  userId: string;
  email: string;
  tier: "tier2";
  clinicId?: string;
  jti: string; // unique token ID for revocation
}

// Extended payload for frontdesk staff
export interface FrontdeskJWTPayload {
  staffId: string;
  email: string;
  role: "frontdesk";
  clinicId: string;
  doctorId: string;
  jti: string; // unique token ID for revocation
}

export interface RefreshPayload {
  userId: string;
  email: string;
  type: "refresh";
  version: number; // rotation version — increments on each use
}

/**
 * Generate access JWT token for frontdesk staff
 */
export function generateFrontdeskToken(payload: Omit<FrontdeskJWTPayload, "jti">): string {
  return jwt.sign({ ...payload, jti: randomUUID() }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

/**
 * Verify and decode frontdesk JWT token
 */
export function verifyFrontdeskToken(token: string): FrontdeskJWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as FrontdeskJWTPayload;
    if (decoded.role !== "frontdesk") return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Generate access JWT token for authenticated user
 */
export function generateToken(payload: Omit<JWTPayload, "jti">): string {
  return jwt.sign({ ...payload, jti: randomUUID() }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

/**
 * Generate refresh token (version-locked for rotation)
 */
export function generateRefreshToken(userId: string, email: string, version = 0): string {
  return jwt.sign({ userId, email, type: "refresh", version }, REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
}

/**
 * Verify and decode refresh token
 */
export function verifyRefreshToken(token: string): RefreshPayload | null {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET) as RefreshPayload;
    if (decoded.type !== "refresh") return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}
