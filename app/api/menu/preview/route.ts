import { getAppSession } from "@/lib/auth";
import { parseWeeklyMenu } from "@/lib/menu-excel";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Only .xlsx files are allowed." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const menu = parseWeeklyMenu(buffer);

    return NextResponse.json(menu);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to parse the menu file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
