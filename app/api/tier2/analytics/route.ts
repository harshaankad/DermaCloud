/**
 * Analytics API — single endpoint, one aggregation call per collection,
 * results merged server-side. Responses are cached for 10 minutes per doctor.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyTier2Request } from "@/lib/auth/verify-request";
import { connectDB } from "@/lib/db/connection";
import ConsultationDermatology from "@/models/ConsultationDermatology";
import ConsultationCosmetology from "@/models/ConsultationCosmetology";
import User from "@/models/User";
import Sale from "@/models/Sale";
import InventoryItem from "@/models/InventoryItem";
import mongoose from "mongoose";

// ── Server-side cache (resets on cold start — acceptable for serverless) ──────
const analyticsCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// ── AI pricing (100 % markup over base cost) ──────────────────────────────────
const AI_PRICE = { report: 8, translation: 18, patientSummary: 3 };

// ── Helper ────────────────────────────────────────────────────────────────────
const ex = (facet: { count: number }[]) => facet?.[0]?.count ?? 0;

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyTier2Request(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
    }
    if (auth.role !== "doctor") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const rangeParam = parseInt(searchParams.get("range") ?? "30", 10);
    const range = ([7, 30, 90, 180] as const).includes(rangeParam as 7 | 30 | 90 | 180)
      ? (rangeParam as 7 | 30 | 90 | 180)
      : 30;

    // Return cached result if fresh
    const cacheKey = `${auth.userId}_${range}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data, cached: true });
    }

    await connectDB();
    const doctorId = new mongoose.Types.ObjectId(auth.userId);
    const clinicId = auth.clinicId ? new mongoose.Types.ObjectId(auth.clinicId) : null;

    // ── Date boundaries ───────────────────────────────────────────────────────
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rangeStart = new Date(todayStart);
    rangeStart.setDate(todayStart.getDate() - range + 1);

    // ── Single $facet aggregation per collection (one round-trip each) ────────
    const sharedFacets = {
      allTime:    [{ $count: "count" }],
      thisMonth:  [{ $match: { consultationDate: { $gte: monthStart } } }, { $count: "count" }],
      today:      [{ $match: { consultationDate: { $gte: todayStart } } }, { $count: "count" }],
      trend: [
        { $match: { consultationDate: { $gte: rangeStart } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$consultationDate", timezone: "Asia/Kolkata" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ],
      gender: [
        { $group: { _id: { $toLower: "$patientInfo.gender" }, count: { $sum: 1 } } },
      ],
      ageGroups: [
        {
          $bucket: {
            groupBy: "$patientInfo.age",
            boundaries: [0, 18, 36, 51, 200],
            default: "other",
            output: { count: { $sum: 1 } },
          },
        },
      ],
      returningPatients: [
        { $group: { _id: "$patientId", visits: { $sum: 1 } } },
        { $match: { visits: { $gt: 1 } } },
        { $count: "count" },
      ],
      aiReports:          [{ $match: { "patientSummary.aiGenerated":         { $exists: true, $ne: "" }, consultationDate: { $gte: monthStart } } }, { $count: "count" }],
      hindiTranslations:  [{ $match: { "patientSummary.translations.hindi":  { $exists: true, $ne: "" }, consultationDate: { $gte: monthStart } } }, { $count: "count" }],
      kannadaTranslations:[{ $match: { "patientSummary.translations.kannada":{ $exists: true, $ne: "" }, consultationDate: { $gte: monthStart } } }, { $count: "count" }],
    };

    const yearMonth = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [dermAgg, cosAgg, dermPatientIds, cosPatientIds, doctorUser, saleAgg, inventoryAgg] = await Promise.all([
      ConsultationDermatology.aggregate([
        { $match: { doctorId } },
        {
          $facet: {
            ...sharedFacets,
            topConditions: [
              { $match: { "diagnosis.provisional": { $exists: true, $ne: "" } } },
              { $group: { _id: "$diagnosis.provisional", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 8 },
            ],
          },
        },
      ]),
      ConsultationCosmetology.aggregate([
        { $match: { doctorId } },
        {
          $facet: {
            ...sharedFacets,
            topProcedures: [
              { $match: { "procedure.name": { $exists: true, $ne: "" } } },
              {
                $group: {
                  _id: "$procedure.name",
                  count: { $sum: 1 },
                  revenue: { $sum: { $ifNull: ["$procedure.totalAmount", 0] } },
                  gstCollected: { $sum: { $ifNull: ["$procedure.gstAmount", 0] } },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 8 },
            ],
            procedureRevenueMonth: [
              { $match: { consultationDate: { $gte: monthStart } } },
              {
                $group: {
                  _id: null,
                  totalBase: { $sum: { $ifNull: ["$procedure.basePrice", 0] } },
                  totalGst: { $sum: { $ifNull: ["$procedure.gstAmount", 0] } },
                  totalRevenue: { $sum: { $ifNull: ["$procedure.totalAmount", 0] } },
                  count: {
                    $sum: {
                      $cond: [{ $gt: [{ $ifNull: ["$procedure.basePrice", 0] }, 0] }, 1, 0],
                    },
                  },
                },
              },
            ],
            procedureRevenueAllTime: [
              {
                $group: {
                  _id: null,
                  totalRevenue: { $sum: { $ifNull: ["$procedure.totalAmount", 0] } },
                  totalGst: { $sum: { $ifNull: ["$procedure.gstAmount", 0] } },
                },
              },
            ],
          },
        },
      ]),
      ConsultationDermatology.distinct("patientId", { doctorId }),
      ConsultationCosmetology.distinct("patientId", { doctorId }),
      User.findById(doctorId, { aiPatientSummaries: 1 }).lean(),
      // Sales — only run when clinicId is available
      clinicId
        ? Sale.aggregate([
            { $match: { clinicId, createdAt: { $gte: monthStart } } },
            {
              $facet: {
                summary: [
                  {
                    $group: {
                      _id: null,
                      totalRevenue:    { $sum: "$totalAmount" },
                      collectedAmount: { $sum: "$amountPaid" },
                      pendingAmount:   { $sum: "$amountDue" },
                      salesCount:      { $sum: 1 },
                    },
                  },
                ],
                paymentMethods: [
                  { $group: { _id: "$paymentMethod", count: { $sum: 1 }, amount: { $sum: "$amountPaid" } } },
                  { $sort: { amount: -1 } },
                ],
                topItems: [
                  { $unwind: "$items" },
                  { $group: { _id: "$items.itemName", qty: { $sum: "$items.quantity" }, revenue: { $sum: "$items.total" } } },
                  { $sort: { qty: -1 } },
                  { $limit: 5 },
                ],
                todaySales: [
                  { $match: { createdAt: { $gte: todayStart } } },
                  { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$totalAmount" } } },
                ],
              },
            },
          ])
        : Promise.resolve(null),
      // Inventory — only run when clinicId is available
      clinicId
        ? InventoryItem.aggregate([
            { $match: { clinicId, status: { $ne: "discontinued" } } },
            {
              $facet: {
                total:    [{ $count: "count" }],
                lowStock: [
                  { $match: { $expr: { $lte: ["$currentStock", "$minStockLevel"] } } },
                  { $count: "count" },
                ],
                outOfStock: [
                  { $match: { status: "out-of-stock" } },
                  { $count: "count" },
                ],
              },
            },
          ])
        : Promise.resolve(null),
    ]);

    const d = dermAgg[0];
    const c = cosAgg[0];

    // ── Unique patients — exact union across both collections ─────────────────
    const patientUnion = new Set([
      ...dermPatientIds.map(String),
      ...cosPatientIds.map(String),
    ]);
    const uniquePatients = patientUnion.size;

    // ── Return rate ───────────────────────────────────────────────────────────
    const returningCount = ex(d.returningPatients) + ex(c.returningPatients);
    const returnRate = uniquePatients > 0 ? Math.round((returningCount / uniquePatients) * 100) : 0;

    // ── Trend — fill every date in range with 0 defaults ─────────────────────
    const trendMap = new Map<string, { derm: number; cos: number }>();
    for (let i = 0; i < range; i++) {
      const dt = new Date(rangeStart);
      dt.setDate(rangeStart.getDate() + i);
      trendMap.set(dt.toISOString().split("T")[0], { derm: 0, cos: 0 });
    }
    d.trend.forEach((item: { _id: string; count: number }) => {
      const existing = trendMap.get(item._id) ?? { derm: 0, cos: 0 };
      trendMap.set(item._id, { ...existing, derm: item.count });
    });
    c.trend.forEach((item: { _id: string; count: number }) => {
      const existing = trendMap.get(item._id) ?? { derm: 0, cos: 0 };
      trendMap.set(item._id, { ...existing, cos: item.count });
    });
    const trend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    // ── Gender — merge both collections ───────────────────────────────────────
    const genderMap: Record<string, number> = {};
    [...d.gender, ...c.gender].forEach(({ _id, count }: { _id: string; count: number }) => {
      if (_id) genderMap[_id] = (genderMap[_id] ?? 0) + count;
    });

    // ── Age groups — $bucket boundaries produce _id = lower boundary ──────────
    const AGE_LABELS: Record<number, string> = { 0: "Under 18", 18: "18–35", 36: "36–50", 51: "51+" };
    const ageRaw: Record<number, number> = {};
    [...d.ageGroups, ...c.ageGroups].forEach(({ _id, count }: { _id: number | string; count: number }) => {
      if (typeof _id === "number") ageRaw[_id] = (ageRaw[_id] ?? 0) + count;
    });
    const ageGroups = [0, 18, 36, 51].map(b => ({ label: AGE_LABELS[b], count: ageRaw[b] ?? 0 }));

    // ── Pharmacy / Sales (current month) ─────────────────────────────────────
    const saleSummary  = saleAgg?.[0]?.summary?.[0]  ?? null;
    const pharmacy = clinicId ? {
      thisMonth: {
        totalRevenue:    saleSummary?.totalRevenue    ?? 0,
        collectedAmount: saleSummary?.collectedAmount ?? 0,
        pendingAmount:   saleSummary?.pendingAmount   ?? 0,
        salesCount:      saleSummary?.salesCount      ?? 0,
      },
      today: {
        count:  saleAgg?.[0]?.todaySales?.[0]?.count  ?? 0,
        amount: saleAgg?.[0]?.todaySales?.[0]?.amount ?? 0,
      },
      paymentMethods: (saleAgg?.[0]?.paymentMethods ?? []) as { _id: string; count: number; amount: number }[],
      topItems: (saleAgg?.[0]?.topItems ?? []) as { _id: string; qty: number; revenue: number }[],
      inventory: {
        total:      (inventoryAgg?.[0]?.total?.[0]?.count      ?? 0) as number,
        lowStock:   (inventoryAgg?.[0]?.lowStock?.[0]?.count   ?? 0) as number,
        outOfStock: (inventoryAgg?.[0]?.outOfStock?.[0]?.count ?? 0) as number,
      },
    } : null;

    // ── AI usage (current month) ──────────────────────────────────────────────
    const reports           = ex(d.aiReports)           + ex(c.aiReports);
    const translations      = ex(d.hindiTranslations)   + ex(c.hindiTranslations)
                            + ex(d.kannadaTranslations) + ex(c.kannadaTranslations);
    const patientSummaries  = (doctorUser as any)?.aiPatientSummaries?.[yearMonth] ?? 0;

    // ── Assemble response ─────────────────────────────────────────────────────
    const data = {
      quickStats: {
        totalConsultations: ex(d.allTime) + ex(c.allTime),
        thisMonth:          ex(d.thisMonth) + ex(c.thisMonth),
        today:              ex(d.today)   + ex(c.today),
        uniquePatients,
        returnRate,
        dermCount: ex(d.allTime),
        cosCount:  ex(c.allTime),
      },
      trend,
      specialtySplit: { derm: ex(d.allTime), cos: ex(c.allTime) },
      topConditions: (d.topConditions ?? []).map((item: { _id: string; count: number }) => ({
        condition: item._id,
        count: item.count,
      })),
      cosmetologyProcedures: {
        top: (c.topProcedures ?? []).map((item: { _id: string; count: number; revenue: number; gstCollected: number }) => ({
          name: item._id,
          count: item.count,
          revenue: Math.round(item.revenue || 0),
          gstCollected: Math.round(item.gstCollected || 0),
        })),
        thisMonth: {
          totalBase: Math.round(c.procedureRevenueMonth?.[0]?.totalBase ?? 0),
          totalGst: Math.round(c.procedureRevenueMonth?.[0]?.totalGst ?? 0),
          totalRevenue: Math.round(c.procedureRevenueMonth?.[0]?.totalRevenue ?? 0),
          count: c.procedureRevenueMonth?.[0]?.count ?? 0,
        },
        allTime: {
          totalRevenue: Math.round(c.procedureRevenueAllTime?.[0]?.totalRevenue ?? 0),
          totalGst: Math.round(c.procedureRevenueAllTime?.[0]?.totalGst ?? 0),
        },
      },
      demographics: { gender: genderMap, ageGroups },
      pharmacy,
      aiUsage: {
        reports,
        translations,
        patientSummaries,
        cost: {
          reports:          reports          * AI_PRICE.report,
          translations:     translations     * AI_PRICE.translation,
          patientSummaries: patientSummaries * AI_PRICE.patientSummary,
          total:            reports          * AI_PRICE.report
                          + translations     * AI_PRICE.translation
                          + patientSummaries * AI_PRICE.patientSummary,
        },
        pricing: AI_PRICE,
      },
      range,
    };

    analyticsCache.set(cacheKey, { data, ts: Date.now() });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Analytics] Error:", msg);
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
