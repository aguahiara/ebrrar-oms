"use client";

import { useRouter } from "next/navigation";

type CustomerPickerProps = {
  customer: string;
  serviceDay: string;
  customers: string[];
};

export function CustomerPicker({
  customer,
  serviceDay,
  customers,
}: CustomerPickerProps) {
  const router = useRouter();

  return (
    <select
      id="customer"
      value={customer}
      onChange={(event) => {
        router.push(
          `/dashboard?customer=${encodeURIComponent(event.target.value)}&date=${serviceDay}`,
        );
      }}
      className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
    >
      {customers.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
