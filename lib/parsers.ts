import { parseAvonExcel } from "@/lib/avon-excel";
import type { OrderRecord } from "@/lib/order-types";

export type OrderParser = (buffer: Buffer) => OrderRecord[];

const parsers: Record<string, OrderParser> = {
  AVON: parseAvonExcel,
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
