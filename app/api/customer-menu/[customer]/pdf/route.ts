import { fetchCustomerMenu } from "@/lib/customer-menu";
import { buildMenuPdf } from "@/lib/customer-menu-pdf";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ customer: string }> },
) {
  try {
    const { customer } = await params;
    const name = decodeURIComponent(customer);
    const menu = await fetchCustomerMenu(name);
    const pdf = await buildMenuPdf(menu);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}-weekly-menu.pdf"`,
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
