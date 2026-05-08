import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { connectDB } from "@/lib/db/connection";
import ShortLink from "@/models/ShortLink";

function generateCode(): string {
  return crypto.randomBytes(6).toString("base64url");
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await authMiddleware(request);
    if (authResult instanceof NextResponse) return authResult;

    const { user: authUser } = authResult;

    const body = await request.json();
    const { url, expiresInDays = 7 } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { success: false, message: "url is required" },
        { status: 400 }
      );
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return NextResponse.json(
          { success: false, message: "Invalid URL protocol" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid URL" },
        { status: 400 }
      );
    }

    await connectDB();

    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateCode();
      const existing = await ShortLink.findOne({ code: candidate }).lean();
      if (!existing) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      return NextResponse.json(
        { success: false, message: "Failed to generate unique code" },
        { status: 500 }
      );
    }

    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    await ShortLink.create({
      code,
      url,
      clinicId: authUser.clinicId,
      expiresAt,
    });

    const origin = request.headers.get("origin") || request.nextUrl.origin;
    const shortUrl = `${origin}/r/${code}`;

    return NextResponse.json({ success: true, code, shortUrl });
  } catch (error: any) {
    console.error("Short link create error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create short link", error: error.message },
      { status: 500 }
    );
  }
}
