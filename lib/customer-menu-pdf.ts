import type { CustomerMenu } from "@/lib/customer-menu";
import type { DayOfWeek } from "@/lib/order-types";
import { PDFDocument, type PDFFont, StandardFonts, rgb } from "pdf-lib";

const DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_LABEL: Record<DayOfWeek, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
};

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

/** Render a customer's weekly menu to a PDF (flowing layout, paginated). */
export async function buildMenuPdf(menu: CustomerMenu): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const lineGap = 5;

  let page = doc.addPage();
  const { width, height } = page.getSize();
  const maxWidth = width - margin * 2;
  let y = height - margin;

  const ensureSpace = (space: number) => {
    if (y - space < margin) {
      page = doc.addPage([width, height]);
      y = height - margin;
    }
  };

  const draw = (
    text: string,
    f: PDFFont,
    size: number,
    indent = 0,
  ) => {
    const lines = wrapText(text, f, size, maxWidth - indent);
    for (const line of lines) {
      ensureSpace(size + lineGap);
      page.drawText(line, {
        x: margin + indent,
        y: y - size,
        size,
        font: f,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= size + lineGap;
    }
  };

  draw(`${menu.customerName} — Weekly Menu`, bold, 18);
  y -= 10;

  for (const day of DAYS) {
    const options = menu.options
      .filter((o) => o.day_of_week === day)
      .sort((a, b) => (a.optionLabel ?? "").localeCompare(b.optionLabel ?? ""));
    if (options.length === 0) {
      continue;
    }

    ensureSpace(40);
    draw(DAY_LABEL[day], bold, 13);

    for (const option of options) {
      draw(
        `${option.optionLabel ?? "•"}   ${option.canonical_name}`,
        font,
        11,
        14,
      );
    }

    const proteins = menu.proteins
      .filter((p) => p.day_of_week === day)
      .map((p) => p.name)
      .join(", ");
    const swallows = menu.swallows
      .filter((s) => s.day_of_week === day)
      .map((s) => s.name)
      .join(", ");

    if (proteins) {
      draw(`Proteins: ${proteins}`, font, 10, 14);
    }
    if (swallows) {
      draw(`Swallows: ${swallows}`, font, 10, 14);
    }

    y -= 10;
  }

  return doc.save();
}
