import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, putRequest, deleteRequest, parseJson, MOCK_USER_ID } from "../_helpers";

process.env.JWT_SECRET = "test-jwt-secret-key";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-pw") },
}));
vi.mock("@/models/Clinic", () => ({
  default: { findOne: vi.fn() },
}));

const mockStaff = {
  _id: "staff1",
  name: "Staff A",
  email: "staff@test.com",
  doctorId: { toString: () => MOCK_USER_ID },
  status: "active",
  permissions: { appointments: true, patients: true, pharmacy: false, sales: false, reports: false },
  save: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/models/FrontdeskStaff", () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

import { generateToken } from "@/lib/auth/jwt";
import FrontdeskStaff from "@/models/FrontdeskStaff";
import { GET, PUT, DELETE } from "@/app/api/tier2/frontdesk/[id]/route";

const validToken = generateToken({ userId: MOCK_USER_ID, email: "doc@test.com", tier: "tier2" });
const params = Promise.resolve({ id: "staff1" });

describe("GET /api/tier2/frontdesk/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (FrontdeskStaff.findById as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockStaff),
      }),
    });
  });

  it("returns 401 when no token provided", async () => {
    const res = await GET(getRequest("/api/tier2/frontdesk/staff1"), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when staff not found", async () => {
    (FrontdeskStaff.findById as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue(null),
      }),
    });

    const res = await GET(getRequest("/api/tier2/frontdesk/staff1", { Authorization: `Bearer ${validToken}` }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when staff belongs to another doctor", async () => {
    (FrontdeskStaff.findById as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue({
          ...mockStaff,
          doctorId: { toString: () => "other-doctor" },
        }),
      }),
    });

    const res = await GET(getRequest("/api/tier2/frontdesk/staff1", { Authorization: `Bearer ${validToken}` }), { params });
    expect(res.status).toBe(403);
  });

  it("returns staff on success", async () => {
    const res = await GET(getRequest("/api/tier2/frontdesk/staff1", { Authorization: `Bearer ${validToken}` }), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.name).toBe("Staff A");
  });
});

describe("PUT /api/tier2/frontdesk/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (FrontdeskStaff.findById as any).mockResolvedValue({ ...mockStaff });
    (FrontdeskStaff.findByIdAndUpdate as any).mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...mockStaff, name: "Updated" }),
    });
  });

  it("returns 401 when no token provided", async () => {
    const res = await PUT(putRequest("/api/tier2/frontdesk/staff1", { name: "X" }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid update data", async () => {
    const res = await PUT(putRequest("/api/tier2/frontdesk/staff1", { phone: "invalid" }, { Authorization: `Bearer ${validToken}` }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when staff not found", async () => {
    (FrontdeskStaff.findById as any).mockResolvedValue(null);
    const res = await PUT(putRequest("/api/tier2/frontdesk/staff1", { name: "New Name" }, { Authorization: `Bearer ${validToken}` }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when staff belongs to another doctor", async () => {
    (FrontdeskStaff.findById as any).mockResolvedValue({
      ...mockStaff,
      doctorId: { toString: () => "other-doctor" },
    });
    const res = await PUT(putRequest("/api/tier2/frontdesk/staff1", { name: "New" }, { Authorization: `Bearer ${validToken}` }), { params });
    expect(res.status).toBe(403);
  });

  it("updates staff successfully", async () => {
    const res = await PUT(putRequest("/api/tier2/frontdesk/staff1", { name: "Updated Name" }, { Authorization: `Bearer ${validToken}` }), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(FrontdeskStaff.findByIdAndUpdate).toHaveBeenCalled();
  });
});

describe("DELETE /api/tier2/frontdesk/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (FrontdeskStaff.findById as any).mockResolvedValue({ ...mockStaff, save: vi.fn() });
  });

  it("returns 401 when no token provided", async () => {
    const res = await DELETE(deleteRequest("/api/tier2/frontdesk/staff1"), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when staff not found", async () => {
    (FrontdeskStaff.findById as any).mockResolvedValue(null);
    const res = await DELETE(deleteRequest("/api/tier2/frontdesk/staff1", { Authorization: `Bearer ${validToken}` }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when staff belongs to another doctor", async () => {
    (FrontdeskStaff.findById as any).mockResolvedValue({
      ...mockStaff,
      doctorId: { toString: () => "other-doctor" },
      save: vi.fn(),
    });
    const res = await DELETE(deleteRequest("/api/tier2/frontdesk/staff1", { Authorization: `Bearer ${validToken}` }), { params });
    expect(res.status).toBe(403);
  });

  it("soft-deletes by setting status to inactive", async () => {
    const staff = { ...mockStaff, save: vi.fn() };
    (FrontdeskStaff.findById as any).mockResolvedValue(staff);

    const res = await DELETE(deleteRequest("/api/tier2/frontdesk/staff1", { Authorization: `Bearer ${validToken}` }), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.message).toContain("deactivated");
    expect(staff.status).toBe("inactive");
    expect(staff.save).toHaveBeenCalled();
  });
});
