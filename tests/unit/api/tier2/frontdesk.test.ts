import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, postRequest, parseJson, MOCK_USER_ID, MOCK_CLINIC_ID } from "../_helpers";

process.env.JWT_SECRET = "test-jwt-secret-key";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-pw") },
}));

vi.mock("@/models/Clinic", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("@/models/FrontdeskStaff", () => {
  const MockStaff = vi.fn().mockImplementation(function (this: any, data: any) {
    Object.assign(this, data, {
      _id: "staff1",
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({ _id: "staff1", name: data.name, email: data.email }),
    });
  }) as any;
  MockStaff.find = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      sort: vi.fn().mockResolvedValue([]),
    }),
  });
  MockStaff.findOne = vi.fn().mockResolvedValue(null);
  return { default: MockStaff };
});

import { generateToken } from "@/lib/auth/jwt";
import Clinic from "@/models/Clinic";
import FrontdeskStaff from "@/models/FrontdeskStaff";
import { GET, POST } from "@/app/api/tier2/frontdesk/route";

const validToken = generateToken({ userId: MOCK_USER_ID, email: "doc@test.com", tier: "tier2" });

describe("GET /api/tier2/frontdesk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Clinic.findOne as any).mockResolvedValue({ _id: MOCK_CLINIC_ID });
  });

  it("returns 401 when no token provided", async () => {
    const res = await GET(getRequest("/api/tier2/frontdesk"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for invalid token", async () => {
    const res = await GET(getRequest("/api/tier2/frontdesk", { Authorization: "Bearer invalid" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when clinic not found", async () => {
    (Clinic.findOne as any).mockResolvedValue(null);
    const res = await GET(getRequest("/api/tier2/frontdesk", { Authorization: `Bearer ${validToken}` }));
    expect(res.status).toBe(404);
  });

  it("returns staff list on success", async () => {
    const mockStaff = [{ _id: "s1", name: "Staff A" }];
    (FrontdeskStaff.find as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockResolvedValue(mockStaff),
      }),
    });

    const res = await GET(getRequest("/api/tier2/frontdesk", { Authorization: `Bearer ${validToken}` }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });
});

describe("POST /api/tier2/frontdesk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Clinic.findOne as any).mockResolvedValue({ _id: MOCK_CLINIC_ID });
    (FrontdeskStaff.findOne as any).mockResolvedValue(null);
  });

  it("returns 401 when no token provided", async () => {
    const res = await POST(postRequest("/api/tier2/frontdesk", { name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid staff data", async () => {
    const res = await POST(postRequest("/api/tier2/frontdesk", { name: "A" }, { Authorization: `Bearer ${validToken}` }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Validation failed");
  });

  it("returns 400 when email already exists", async () => {
    (FrontdeskStaff.findOne as any).mockResolvedValue({ _id: "existing" });

    const res = await POST(postRequest("/api/tier2/frontdesk", {
      name: "New Staff",
      email: "existing@test.com",
      password: "password123",
      phone: "9876543210",
    }, { Authorization: `Bearer ${validToken}` }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("already exists");
  });

  it("creates frontdesk staff successfully", async () => {
    const res = await POST(postRequest("/api/tier2/frontdesk", {
      name: "New Staff",
      email: "newstaff@test.com",
      password: "password123",
      phone: "9876543210",
    }, { Authorization: `Bearer ${validToken}` }));
    const body = await parseJson(res);

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.password).toBeUndefined();
  });

  it("returns 404 when doctor has no clinic", async () => {
    (Clinic.findOne as any).mockResolvedValue(null);

    const res = await POST(postRequest("/api/tier2/frontdesk", {
      name: "New Staff",
      email: "newstaff@test.com",
      password: "password123",
      phone: "9876543210",
    }, { Authorization: `Bearer ${validToken}` }));

    expect(res.status).toBe(404);
  });
});
