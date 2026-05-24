"use client";

import { mondayOfCurrentWeek } from "@/lib/calendar-date";
import { useState } from "react";

type UploadSummary = {
  totalOrders: number;
  matchedDirectly: number;
  linesInserted: number;
  unmatched: {
    employeeName: string;
    dayOfWeek: string;
    rawMealText: string;
  }[];
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [serviceDay, setServiceDay] = useState(mondayOfCurrentWeek);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Upload
        </h1>

        <div className="mb-6">
          <p className="mb-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Customer
          </p>
          <p className="text-lg text-zinc-900 dark:text-zinc-50">AVON</p>
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
              {summary.matchedDirectly} of {summary.totalOrders} order
              {summary.totalOrders === 1 ? "" : "s"} matched directly.
            </p>
            {summary.unmatched.length > 0 && (
              <div>
                <p className="mb-2 font-medium text-zinc-900 dark:text-zinc-50">
                  Unmatched ({summary.unmatched.length})
                </p>
                <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  {summary.unmatched.map((item, index) => (
                    <li
                      key={`${item.employeeName}-${item.dayOfWeek}-${index}`}
                      className="text-zinc-600 dark:text-zinc-400"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        {item.employeeName}
                      </span>{" "}
                      · {item.dayOfWeek} · &quot;{item.rawMealText}&quot;
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
