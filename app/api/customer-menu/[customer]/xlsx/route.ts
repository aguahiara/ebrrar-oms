import { getAppSession } from "@/lib/auth";
import { fetchCustomerMenu } from "@/lib/customer-menu";
import { buildMenuWorkbook } from "@/lib/customer-menu-xlsx";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ customer: string }> },
) {
  const session = await getAppSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    const { customer } = await params;
    const name = decodeURIComponent(customer);
    const menu = await fetchCustomerMenu(name);
    const buffer = buildMenuWorkbook(menu);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}-weekly-menu.xlsx"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
