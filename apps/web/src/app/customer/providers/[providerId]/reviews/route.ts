import {NextResponse} from "next/server";
import {decodePublicReviewCursor, getPublicReviewPage} from "@/lib/customer/providers/public-review-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, {params}: {params: Promise<{providerId: string}>}) {
  const {providerId} = await params;
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  try {
    if (cursor) decodePublicReviewCursor(cursor, providerId);
  } catch {
    return NextResponse.json({error: "Invalid review cursor."}, {status: 400});
  }
  try {
    const page = await getPublicReviewPage(providerId, cursor);
    return NextResponse.json(page ?? {error: "Provider unavailable."}, {
      status: page ? 200 : 404, headers: {"Cache-Control": "private, no-store"},
    });
  } catch {
    return NextResponse.json({error: "Reviews are unavailable. Please try again."}, {status: 503});
  }
}
