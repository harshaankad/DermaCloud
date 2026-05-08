import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import ShortLink from "@/models/ShortLink";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    if (!code) {
      return new NextResponse("Link not found", { status: 404 });
    }

    await connectDB();

    const link = await ShortLink.findOne({ code }).lean<{ url: string; expiresAt: Date } | null>();

    if (!link) {
      return new NextResponse("This link is invalid or no longer exists.", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      return new NextResponse("This link has expired. Please request a new one from the clinic.", {
        status: 410,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return NextResponse.redirect(link.url, 302);
  } catch (error: any) {
    console.error("Short link redirect error:", error);
    return new NextResponse("Something went wrong.", { status: 500 });
  }
}
