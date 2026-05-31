import { getAppSession } from "@/lib/auth";
import { rejectUploadBatch } from "@/lib/avon-orders";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as { batchId?: string };
    const { batchId } = body;

    if (!batchId || typeof batchId !== "string") {
      return NextResponse.json(
        { error: "batchId is required." },
        { status: 400 },
      );
    }

    const { linesDeleted, exceptionsDeleted } = await rejectUploadBatch(batchId);

    return NextResponse.json({ ok: true, linesDeleted, exceptionsDeleted });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reject upload.";

    // 409 when a release is blocking rejection
    const status = message.includes("released for production") ? 409 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
