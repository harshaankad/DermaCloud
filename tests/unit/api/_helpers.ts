import { vi } from "vitest";
import { NextRequest } from "next/server";

// --- Request builders ---

export function postRequest(url: string, body: Record<string, unknown>, headers?: Record<string, string>): NextRequest {
  const h = new Headers({ "content-type": "application/json", ...headers });
  return new NextRequest(`http://localhost:3000${url}`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
}

export function getRequest(url: string, headers?: Record<string, string>): NextRequest {
  const h = new Headers(headers);
  return new NextRequest(`http://localhost:3000${url}`, { method: "GET", headers: h });
}

export function putRequest(url: string, body: Record<string, unknown>, headers?: Record<string, string>): NextRequest {
  const h = new Headers({ "content-type": "application/json", ...headers });
  return new NextRequest(`http://localhost:3000${url}`, {
    method: "PUT",
    headers: h,
    body: JSON.stringify(body),
  });
}

export function authedPost(url: string, body: Record<string, unknown>, token = "Bearer valid-token"): NextRequest {
  return postRequest(url, body, { Authorization: token });
}

export function authedGet(url: string, token = "Bearer valid-token"): NextRequest {
  return getRequest(url, { Authorization: token });
}

export function deleteRequest(url: string, headers?: Record<string, string>): NextRequest {
  const h = new Headers(headers);
  return new NextRequest(`http://localhost:3000${url}`, { method: "DELETE", headers: h });
}

export function authedPut(url: string, body: Record<string, unknown>, token = "Bearer valid-token"): NextRequest {
  return putRequest(url, body, { Authorization: token });
}

export function authedDelete(url: string, token = "Bearer valid-token"): NextRequest {
  return deleteRequest(url, { Authorization: token });
}

// --- Response parser ---

export async function parseJson(response: Response) {
  return response.json();
}

// --- Common mock user data ---

export const MOCK_USER_ID = "507f1f77bcf86cd799439011";
export const MOCK_CLINIC_ID = "507f1f77bcf86cd799439022";
export const MOCK_DOCTOR_ID = "507f1f77bcf86cd799439011";

export const mockDoctorAuth = {
  success: true,
  userId: MOCK_USER_ID,
  email: "doc@test.com",
  clinicId: MOCK_CLINIC_ID,
  clinicName: "TestClinic",
  doctorId: MOCK_DOCTOR_ID,
  role: "doctor" as const,
  name: "Dr. Test",
  permissions: {
    appointments: true,
    patients: true,
    pharmacy: true,
    sales: true,
    reports: true,
  },
};

export const mockFrontdeskAuth = {
  success: true,
  userId: "507f1f77bcf86cd799439033",
  email: "fd@test.com",
  clinicId: MOCK_CLINIC_ID,
  clinicName: "TestClinic",
  doctorId: MOCK_DOCTOR_ID,
  role: "frontdesk" as const,
  name: "FD Staff",
  permissions: {
    appointments: true,
    patients: true,
    pharmacy: false,
    sales: false,
    reports: false,
  },
};

export const mockFailedAuth = {
  success: false,
  error: "Invalid or expired token",
  status: 401,
};
