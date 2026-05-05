import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, putRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_USER_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
}));

vi.mock("@/lib/defaultFormConfig", () => ({
  defaultDermatologyForm: [
    { sectionName: "Diagnosis", fields: [{ fieldName: "condition", type: "text", label: "Condition" }] },
  ],
  defaultCosmetologyForm: [
    { sectionName: "Treatment", fields: [{ fieldName: "procedure", type: "text", label: "Procedure" }] },
  ],
}));

const mockFormSettings = {
  _id: "fs1",
  userId: MOCK_USER_ID,
  formType: "dermatology",
  sections: [{ sectionName: "Diagnosis", fields: [{ fieldName: "condition", type: "text", label: "Condition" }] }],
  toObject: vi.fn().mockReturnValue({
    sections: [{ sectionName: "Diagnosis", fields: [{ fieldName: "condition", type: "text", label: "Condition" }] }],
  }),
  save: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/models/FormSettings", () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

import { verifyTier2Request } from "@/lib/auth/verify-request";
import FormSettings from "@/models/FormSettings";
import { GET, PUT } from "@/app/api/tier2/settings/forms/route";

describe("GET /api/tier2/settings/forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (FormSettings.findOne as any).mockResolvedValue(mockFormSettings);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/settings/forms?formType=dermatology"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a doctor", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    const res = await GET(getRequest("/api/tier2/settings/forms?formType=dermatology"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid formType", async () => {
    const res = await GET(getRequest("/api/tier2/settings/forms?formType=invalid"));
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Invalid form type");
  });

  it("creates default settings when none exist", async () => {
    (FormSettings.findOne as any).mockResolvedValue(null);
    (FormSettings.create as any).mockResolvedValue({
      ...mockFormSettings,
      toObject: mockFormSettings.toObject,
    });

    const res = await GET(getRequest("/api/tier2/settings/forms?formType=dermatology"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(FormSettings.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: MOCK_USER_ID, formType: "dermatology" })
    );
  });

  it("returns existing settings", async () => {
    const res = await GET(getRequest("/api/tier2/settings/forms?formType=dermatology"));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.sections).toBeDefined();
  });
});

describe("PUT /api/tier2/settings/forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (FormSettings.findOneAndUpdate as any).mockResolvedValue({
      sections: [{ sectionName: "Updated" }],
    });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await PUT(putRequest("/api/tier2/settings/forms", { formType: "dermatology", sections: [] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a doctor", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    const res = await PUT(putRequest("/api/tier2/settings/forms", { formType: "dermatology", sections: [] }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid formType", async () => {
    const res = await PUT(putRequest("/api/tier2/settings/forms", { formType: "invalid", sections: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when sections is not an array", async () => {
    const res = await PUT(putRequest("/api/tier2/settings/forms", { formType: "dermatology", sections: "bad" }));
    expect(res.status).toBe(400);
  });

  it("updates form settings successfully", async () => {
    const sections = [{ sectionName: "Diagnosis", fields: [] }];
    const res = await PUT(putRequest("/api/tier2/settings/forms", { formType: "dermatology", sections }));
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(FormSettings.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: MOCK_USER_ID, formType: "dermatology" },
      expect.objectContaining({ sections }),
      { new: true, upsert: true }
    );
  });
});
