"use client";

import type { AggregateReportLine } from "@/lib/portion-types";

type Props = {
  line: AggregateReportLine;
  onClose: () => void;
};

export function BreakdownModal({ line, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {line.component_name}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              Customer breakdown · {line.unit}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                {[
                  "Customer",
                  "Meal Category",
                  "Portion Qty",
                  "Meal Count",
                  "Total Required",
                  "Overage %",
                  "Total + Overage",
                  "Unit",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {line.customer_lines.map((cl, i) => (
                <tr
                  key={i}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                    {cl.customer_name}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {cl.meal_category}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                    {cl.portion_quantity}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                    {cl.source_meal_count}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                    {cl.total_required.toLocaleString("en-NG", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                    {cl.overage_percentage}%
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                    {cl.total_with_overage.toLocaleString("en-NG", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{cl.unit}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-zinc-50 font-semibold dark:bg-zinc-900">
                <td colSpan={4} className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                  Total
                </td>
                <td className="px-4 py-3 tabular-nums text-zinc-900 dark:text-zinc-50">
                  {line.total_required.toLocaleString("en-NG", { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 tabular-nums text-zinc-900 dark:text-zinc-50">
                  {line.total_with_overage.toLocaleString("en-NG", { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{line.unit}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
