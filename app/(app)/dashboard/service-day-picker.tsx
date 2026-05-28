"use client";

import { useRouter } from "next/navigation";

type ServiceDayPickerProps = {
  serviceDay: string;
};

export function ServiceDayPicker({ serviceDay }: ServiceDayPickerProps) {
  const router = useRouter();

  return (
    <input
      id="serviceDay"
      type="date"
      value={serviceDay}
      onChange={(event) => {
        const date = event.target.value;
        if (date) {
          router.push(`/dashboard?date=${date}`);
        }
      }}
      className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
    />
  );
}
