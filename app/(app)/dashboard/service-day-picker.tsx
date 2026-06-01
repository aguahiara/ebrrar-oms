"use client";

import { useRouter } from "next/navigation";

type ServiceDayPickerProps = {
  serviceDay: string;
  /** The page path to navigate to when the date changes. Defaults to "/dashboard". */
  basePath?: string;
};

export function ServiceDayPicker({
  serviceDay,
  basePath = "/dashboard",
}: ServiceDayPickerProps) {
  const router = useRouter();

  return (
    <input
      id="serviceDay"
      type="date"
      value={serviceDay}
      onChange={(event) => {
        const date = event.target.value;
        if (date) {
          router.push(`${basePath}?date=${date}`);
        }
      }}
      className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
    />
  );
}
