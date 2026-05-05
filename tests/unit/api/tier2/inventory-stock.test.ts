import { describe, it, expect, vi, beforeEach } from "vitest";
import { postRequest, parseJson, mockDoctorAuth, mockFrontdeskAuth, mockFailedAuth, MOCK_CLINIC_ID } from "../_helpers";

vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn() }));

vi.mock("@/lib/auth/verify-request", () => ({
  verifyTier2Request: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("@/models/InventoryItem", () => ({
  default: { findById: vi.fn() },
}));

vi.mock("@/models/InventoryTransaction", () => {
  function MockTx(data: any) { Object.assign(this, data); }
  MockTx.prototype.save = vi.fn().mockResolvedValue(undefined);
  return { default: MockTx };
});

import { verifyTier2Request, hasPermission } from "@/lib/auth/verify-request";
import InventoryItem from "@/models/InventoryItem";
import { POST } from "@/app/api/tier2/inventory/[id]/stock/route";

const params = Promise.resolve({ id: "item1" });

function makeItem(stock = 50) {
  return {
    _id: "item1",
    name: "Cream",
    currentStock: stock,
    status: "active",
    clinicId: { toString: () => MOCK_CLINIC_ID },
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe("POST /api/tier2/inventory/[id]/stock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (verifyTier2Request as any).mockResolvedValue(mockDoctorAuth);
    (hasPermission as any).mockReturnValue(true);
    (InventoryItem.findById as any).mockResolvedValue(makeItem());
  });

  it("returns 401 when not authenticated", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFailedAuth);
    const res = await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "stock-in", quantity: 10, reason: "r" }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no pharmacy permission", async () => {
    (verifyTier2Request as any).mockResolvedValue(mockFrontdeskAuth);
    (hasPermission as any).mockReturnValue(false);
    const res = await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "stock-in", quantity: 10, reason: "r" }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid adjustment type", async () => {
    const res = await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "invalid", quantity: 1, reason: "r" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when quantity is 0", async () => {
    const res = await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "stock-in", quantity: 0, reason: "r" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when reason is empty", async () => {
    const res = await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "stock-in", quantity: 5, reason: "" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 404 when item not found", async () => {
    (InventoryItem.findById as any).mockResolvedValue(null);
    const res = await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "stock-in", quantity: 10, reason: "r" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 403 when item belongs to another clinic", async () => {
    (InventoryItem.findById as any).mockResolvedValue({
      ...makeItem(),
      clinicId: { toString: () => "other-clinic" },
    });
    const res = await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "stock-in", quantity: 10, reason: "r" }), { params });
    expect(res.status).toBe(403);
  });

  it("increases stock for stock-in", async () => {
    const item = makeItem(50);
    (InventoryItem.findById as any).mockResolvedValue(item);

    const res = await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "stock-in", quantity: 10, reason: "Purchased" }), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(item.currentStock).toBe(60);
    expect(item.save).toHaveBeenCalled();
  });

  it("decreases stock for stock-out", async () => {
    const item = makeItem(50);
    (InventoryItem.findById as any).mockResolvedValue(item);

    const res = await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "stock-out", quantity: 5, reason: "Used" }), { params });

    expect(res.status).toBe(200);
    expect(item.currentStock).toBe(45);
  });

  it("returns 400 for stock-out with insufficient stock", async () => {
    (InventoryItem.findById as any).mockResolvedValue(makeItem(2));

    const res = await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "stock-out", quantity: 10, reason: "Used" }), { params });
    const body = await parseJson(res);

    expect(res.status).toBe(400);
    expect(body.message).toContain("Insufficient stock");
  });

  it("increases stock for return type", async () => {
    const item = makeItem(10);
    (InventoryItem.findById as any).mockResolvedValue(item);

    const res = await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "return", quantity: 3, reason: "Customer return" }), { params });

    expect(res.status).toBe(200);
    expect(item.currentStock).toBe(13);
  });

  it("sets status to out-of-stock when stock reaches 0", async () => {
    const item = makeItem(5);
    (InventoryItem.findById as any).mockResolvedValue(item);

    await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "stock-out", quantity: 5, reason: "Sold" }), { params });

    expect(item.currentStock).toBe(0);
    expect(item.status).toBe("out-of-stock");
  });

  it("reactivates out-of-stock item on stock-in", async () => {
    const item = makeItem(0);
    item.status = "out-of-stock";
    (InventoryItem.findById as any).mockResolvedValue(item);

    await POST(postRequest("/api/tier2/inventory/item1/stock", { type: "stock-in", quantity: 10, reason: "Restock" }), { params });

    expect(item.currentStock).toBe(10);
    expect(item.status).toBe("active");
  });
});
