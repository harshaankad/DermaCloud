import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, postRequest, putRequest, deleteRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID, MOCK_USER_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/ConsultationTemplate", () => {
  const chainable = {
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  };
  return {
    default: {
      find: vi.fn().mockReturnValue(chainable),
      findOne: vi.fn(),
      create: vi.fn(),
      deleteOne: vi.fn(),
      _chainable: chainable,
    },
  };
});

import { verifyTier2Request } from "@/lib/auth/verify-request";
import ConsultationTemplate from "@/models/ConsultationTemplate";
import { GET, POST, PUT, DELETE } from "@/app/api/tier2/templates/route";

describe("GET /api/tier2/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (ConsultationTemplate as any)._chainable.lean.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/templates"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a doctor", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    const res = await GET(getRequest("/api/tier2/templates"));
    expect(res.status).toBe(403);
  });

  it("returns templates list", async () => {
    const mockTemplates = [{ _id: "t1", name: "Acne Template" }];
    (ConsultationTemplate as any)._chainable.lean.mockResolvedValue(mockTemplates);

    const res = await GET(getRequest("/api/tier2/templates"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it("filters by category", async () => {
    await GET(getRequest("/api/tier2/templates?category=acne"));

    expect(ConsultationTemplate.find).toHaveBeenCalledWith(
      expect.objectContaining({ category: "acne" })
    );
  });

  it("filters by templateType", async () => {
    await GET(getRequest("/api/tier2/templates?templateType=cosmetology"));

    expect(ConsultationTemplate.find).toHaveBeenCalledWith(
      expect.objectContaining({ templateType: "cosmetology" })
    );
  });

  it("filters active-only by default", async () => {
    await GET(getRequest("/api/tier2/templates"));

    expect(ConsultationTemplate.find).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true })
    );
  });
});

describe("POST /api/tier2/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (ConsultationTemplate.create as any).mockResolvedValue({ _id: "t1", name: "New Template" });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await POST(postRequest("/api/tier2/templates", { name: "T" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a doctor", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    const res = await POST(postRequest("/api/tier2/templates", { name: "T" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name or templateData is missing", async () => {
    const res = await POST(postRequest("/api/tier2/templates", { name: "T" }));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("required");
  });

  it("creates template successfully", async () => {
    const res = await POST(postRequest("/api/tier2/templates", {
      name: "Acne Template",
      templateData: { diagnosis: "Acne Vulgaris" },
      category: "acne",
    }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(ConsultationTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: MOCK_CLINIC_ID,
        createdBy: MOCK_USER_ID,
        name: "Acne Template",
      })
    );
  });
});

describe("PUT /api/tier2/templates", () => {
  const mockTemplate = {
    _id: "t1",
    name: "Old Name",
    clinicId: MOCK_CLINIC_ID,
    save: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (ConsultationTemplate.findOne as any).mockResolvedValue({ ...mockTemplate, save: vi.fn() });
  });

  it("returns 400 when templateId is missing", async () => {
    const res = await PUT(putRequest("/api/tier2/templates", { name: "New" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when template not found", async () => {
    (ConsultationTemplate.findOne as any).mockResolvedValue(null);
    const res = await PUT(putRequest("/api/tier2/templates", { templateId: "t99", name: "X" }));
    expect(res.status).toBe(404);
  });

  it("updates template successfully", async () => {
    const template = { ...mockTemplate, save: vi.fn() };
    (ConsultationTemplate.findOne as any).mockResolvedValue(template);

    const res = await PUT(putRequest("/api/tier2/templates", { templateId: "t1", name: "Updated Name" }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(template.name).toBe("Updated Name");
    expect(template.save).toHaveBeenCalled();
  });
});

describe("DELETE /api/tier2/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
  });

  it("returns 400 when templateId is missing", async () => {
    const res = await DELETE(deleteRequest("/api/tier2/templates"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when template not found", async () => {
    (ConsultationTemplate.deleteOne as any).mockResolvedValue({ deletedCount: 0 });
    const res = await DELETE(deleteRequest("/api/tier2/templates?templateId=t99"));
    expect(res.status).toBe(404);
  });

  it("deletes template successfully", async () => {
    (ConsultationTemplate.deleteOne as any).mockResolvedValue({ deletedCount: 1 });
    const res = await DELETE(deleteRequest("/api/tier2/templates?templateId=t1"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(ConsultationTemplate.deleteOne).toHaveBeenCalledWith({
      _id: "t1",
      clinicId: MOCK_CLINIC_ID,
    });
  });
});
