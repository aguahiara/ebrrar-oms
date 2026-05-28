"use client";

import { mondayOfCurrentWeek } from "@/lib/calendar-date";
import { useEffect, useState } from "react";

type UploadSummary = {
  totalOrders: number;
  matchedDirect: number;
  matchedAlias: number;
  matchedFuzzy: number;
  proteinsCaptured: number;
  swallowsCaptured: number;
  linesInserted: number;
  exceptionsInserted: number;
  duplicatesSkipped: number;
  exceptions: {
    employeeName: string;
    dayOfWeek: string;
    rawMealText: string;
    bestScore: number | null;
  }[];
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [serviceDay, setServiceDay] = useState(mondayOfCurrentWeek);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [customer, setCustomer] = useState("AVON");
  const [customers, setCustomers] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d: { customers?: string[] }) => {
        const list = d.customers ?? [];
        setCustomers(list);
        setCustomer((c) => (list.includes(c) ? c : (list[0] ?? c)));
      })
      .catch(() => {});
  }, []);

  async function handleUpload() {
    if (!file) {
      setError("Please select an .xlsx file first.");
      setSummary(null);
      return;
    }

    setIsUploading(true);
    setError(null);
    setSummary(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("serviceDay", serviceDay);
      formData.append("customer", customer);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Upload failed.");
      }

      setSummary(data as UploadSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Upload customer orders
        </h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          A customer&rsquo;s weekly order file (AVON, HGI, ELCREST).{" "}
          <a
            href="/menu"
            className="underline hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            Uploading the weekly menu instead?
          </a>
        </p>

        <div className="mb-6">
          <label
            htmlFor="customer"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Customer
          </label>
          <select
            id="customer"
            value={customer}
            onChange={(event) => {
              setCustomer(event.target.value);
              setError(null);
              setSummary(null);
            }}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-6">
          <label
            htmlFor="serviceDay"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Service week start
          </label>
          <input
            id="serviceDay"
            type="date"
            value={serviceDay}
            onChange={(event) => {
              setServiceDay(event.target.value);
              setError(null);
              setSummary(null);
            }}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <div className="mb-6">
          <label
            htmlFor="file"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Excel file
          </label>
          <input
            id="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
              setSummary(null);
            }}
            className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-900 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-50 dark:hover:file:bg-zinc-700"
          />
        </div>

        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading}
          className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isUploading ? "Uploading..." : "Upload"}
        </button>

        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {summary && (
          <div className="mt-6 space-y-4 text-sm">
            <p className="text-green-700 dark:text-green-400">
              Inserted {summary.linesInserted} line
              {summary.linesInserted === 1 ? "" : "s"}.{" "}
              {summary.matchedDirect +
                summary.matchedAlias +
                summary.matchedFuzzy}{" "}
              of {summary.totalOrders} order
              {summary.totalOrders === 1 ? "" : "s"} matched (Direct{" "}
              {summary.matchedDirect}, Alias {summary.matchedAlias}, Fuzzy{" "}
              {summary.matchedFuzzy}).
            </p>
            <p className="text-zinc-600 dark:text-zinc-400">
              Captured {summary.proteinsCaptured} protein
              {summary.proteinsCaptured === 1 ? "" : "s"} and{" "}
              {summary.swallowsCaptured} swallow
              {summary.swallowsCaptured === 1 ? "" : "s"} from the order text.
            </p>
            {summary.duplicatesSkipped > 0 && (
              <p className="text-amber-700 dark:text-amber-400">
                Skipped {summary.duplicatesSkipped} duplicate
                {summary.duplicatesSkipped === 1 ? "" : "s"} (employee already
                counted for that service day).
              </p>
            )}
            {summary.exceptions.length > 0 && (
              <div>
                <p className="mb-2 font-medium text-zinc-900 dark:text-zinc-50">
                  Exceptions ({summary.exceptions.length})
                </p>
                <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  {summary.exceptions.map((item, index) => (
                    <li
                      key={`${item.employeeName}-${item.dayOfWeek}-${index}`}
                      className="text-zinc-600 dark:text-zinc-400"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        {item.employeeName}
                      </span>{" "}
                      · {item.dayOfWeek} · &quot;{item.rawMealText}&quot;
                      {item.bestScore !== null && (
                        <>
                          {" "}
                          · closest {Math.round(item.bestScore * 100)}%
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
