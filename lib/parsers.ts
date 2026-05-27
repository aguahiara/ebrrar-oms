import { parseAvonExcel } from "@/lib/avon-excel";
import { parseElcrestExcel } from "@/lib/elcrest-excel";
import { parseHeirsExcel } from "@/lib/heirs-excel";
import { parseHgiExcel } from "@/lib/hgi-excel";
import type { OrderRecord } from "@/lib/order-types";

export type OrderParser = (buffer: Buffer) => OrderRecord[];

const parsers: Record<string, OrderParser> = {
  AVON: parseAvonExcel,
  HGI: parseHgiExcel,
  ELCREST: parseElcrestExcel,
  HEIRS: parseHeirsExcel,
  // HLA uses the same Forms-export layout as HGI (Sheet1, "Name", "Nth DAY"
  // columns, "Not Applicable" opt-out, protein embedded in the meal text).
  HLA: parseHgiExcel,
};

export function getParser(customerDisplayName: string): OrderParser {
  const parser = parsers[customerDisplayName];
  if (!parser) {
    throw new Error(
      `No upload parser registered for customer "${customerDisplayName}".`,
    );
  }
  return parser;
}
