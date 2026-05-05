import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, putRequest, deleteRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
  hasPermission: vi.fn(),
}));

const mockItem = {
  _id: "item1",
  name: "Betamethasone Cream",
  clinicId: { toString: () => MOCK_CLINIC_ID },
  status: "active",
  save: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/models/InventoryItem", () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock("@/models/InventoryTransaction", () => {
  const chainable = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  return {
    default: {
      find: vi.fn().mockReturnValue(chainable),
      _chainable: chainable,
    },
  };
});

import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import InventoryItem from "@/models/InventoryItem";
import { GET, PUT, DELETE } from "@/app/api/tier2/inventory/[id]/route";

const params = Promise.resolve({ id: "item1" });

describe("GET /api/tier2/inventory/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (InventoryItem.findById as any).mockResolvedValue(mockItem);
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await GET(getRequest("/api/tier2/inventory/item1"), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no pharmacy permission", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    (hasPermission as any).mockReturnValue(false);
    const res = await GET(getRequest("/api/tier2/inventory/item1"), { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 when item not found", async () => {
    (InventoryItem.findById as any).mockResolvedValue(null);
    const res = await GET(getRequest("/api/tier2/inventory/item1"), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when item belongs to another clinic", async () => {
    (InventoryItem.findById as any).mockResolvedValue({
      ...mockItem,
      clinicId: { toString: () => "other-clinic" },
    });
    const res = await GET(getRequest("/api/tier2/inventory/item1"), { params });
    expect(res.status).toBe(403);
  });

  it("returns item with transactions on success", async () => {
    const res = await GET(getRequest("/api/tier2/inventory/item1"), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.data.item).toBeDefined();
    expect(body.data.transactions).toBeDefined();
  });
});

describe("PUT /api/tier2/inventory/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (InventoryItem.findById as any).mockResolvedValue(mockItem);
    (InventoryItem.findByIdAndUpdate as any).mockResolvedValue({ ...mockItem, name: "Updated" });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await PUT(putRequest("/api/tier2/inventory/item1", { name: "X" }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid update data", async () => {
    const res = await PUT(putRequest("/api/tier2/inventory/item1", { category: "invalid-cat" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when item not found", async () => {
    (InventoryItem.findById as any).mockResolvedValue(null);
    const res = await PUT(putRequest("/api/tier2/inventory/item1", { name: "New" }), { params });
    expect(res.status).toBe(404);
  });

  it("updates item successfully", async () => {
    const res = await PUT(putRequest("/api/tier2/inventory/item1", { name: "Updated Cream" }), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(InventoryItem.findByIdAndUpdate).toHaveBeenCalled();
  });
});

describe("DELETE /api/tier2/inventory/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (InventoryItem.findById as any).mockResolvedValue({ ...mockItem, save: vi.fn() });
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await DELETE(deleteRequest("/api/tier2/inventory/item1"), { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when item not found", async () => {
    (InventoryItem.findById as any).mockResolvedValue(null);
    const res = await DELETE(deleteRequest("/api/tier2/inventory/item1"), { params });
    expect(res.status).toBe(404);
  });

  it("soft-deletes by setting status to discontinued", async () => {
    const item = { ...mockItem, save: vi.fn() };
    (InventoryItem.findById as any).mockResolvedValue(item);

    const res = await DELETE(deleteRequest("/api/tier2/inventory/item1"), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.message).toContain("discontinued");
    expect(item.status).toBe("discontinued");
    expect(item.save).toHaveBeenCalled();
  });
});
