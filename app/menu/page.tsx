"use client";

import { useState } from "react";

type VocabItem = { day: string; name: string };
type Option = { day: string; optionLabel: string; name: string };
type ParsedMenu = {
  options: Option[];
  proteins: VocabItem[];
  swallows: VocabItem[];
  notes: string[];
};

type SaveState = { menuVersionId: string; status: "Draft" | "Published" };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export default function MenuUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [serviceWeekStart, setServiceWeekStart] = useState("2026-05-11");
  const [menu, setMenu] = useState<ParsedMenu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  function resetResults() {
    setError(null);
    setMenu(null);
    setSaveState(null);
  }

  async function handlePreview() {
    if (!file) {
      setError("Please select an .xlsx menu file first.");
      setMenu(null);
      return;
    }

    setIsLoading(true);
    resetResults();

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/menu/preview", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Preview failed.");
      }

      setMenu(data as ParsedMenu);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveDraft() {
    if (!file) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("serviceWeekStart", serviceWeekStart);

      const response = await fetch("/api/menu/save", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Save failed.");
      }

      setSaveState({ menuVersionId: data.menuVersionId, status: "Draft" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePublish() {
    if (!saveState) {
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      const response = await fetch("/api/menu/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuVersionId: saveState.menuVersionId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Publish failed.");
      }

      setSaveState({ ...saveState, status: "Published" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-4xl">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Weekly Menu Upload
        </h1>

        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <label
            htmlFor="serviceWeekStart"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Service week start
          </label>
          <input
            id="serviceWeekStart"
            type="date"
            value={serviceWeekStart}
            onChange={(event) => {
              setServiceWeekStart(event.target.value);
              setSaveState(null);
            }}
            className="mb-4 w-full max-w-xs rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />

          <label
            htmlFor="file"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Menu Excel file (&lsquo;Menu for the Week&rsquo; template)
          </label>
          <input
            id="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              resetResults();
            }}
            className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-900 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-50 dark:hover:file:bg-zinc-700"
          />

          <button
            type="button"
            onClick={handlePreview}
            disabled={isLoading}
            className="mt-4 rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isLoading ? "Parsing..." : "Preview"}
          </button>

          {error && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        {menu && (
          <div className="space-y-6">
            <p className="text-sm text-green-700 dark:text-green-400">
              Parsed {menu.options.length} options, {menu.proteins.length}{" "}
              proteins, and {menu.swallows.length} swallows.
            </p>

            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              {!saveState && (
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {isSaving ? "Saving..." : "Save as Draft"}
                </button>
              )}

              {saveState?.status === "Draft" && (
                <>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Saved as draft.
                  </span>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={isPublishing}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPublishing ? "Publishing..." : "Publish"}
                  </button>
                </>
              )}

              {saveState?.status === "Published" && (
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Published — this is now the live menu.
                </span>
              )}
            </div>

            {menu.notes.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                {menu.notes.map((note, index) => (
                  <p key={index}>NB: {note}</p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {DAYS.map((day) => {
                const options = menu.options.filter((o) => o.day === day);
                const proteins = menu.proteins
                  .filter((p) => p.day === day)
                  .map((p) => p.name);
                const swallows = menu.swallows
                  .filter((s) => s.day === day)
                  .map((s) => s.name);

                return (
                  <div
                    key={day}
                    className="rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <h2 className="mb-3 font-semibold text-zinc-900 dark:text-zinc-50">
                      {day}{" "}
                      <span className="font-normal text-zinc-400">
                        ({options.length} options)
                      </span>
                    </h2>

                    <ol className="mb-3 space-y-1">
                      {options.map((option) => (
                        <li
                          key={option.optionLabel}
                          className="text-zinc-700 dark:text-zinc-300"
                        >
                          <span className="text-zinc-400">
                            {option.optionLabel}:
                          </span>{" "}
                          {option.name}
                        </li>
                      ))}
                    </ol>

                    <p className="text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        Proteins:
                      </span>{" "}
                      {proteins.length > 0 ? proteins.join(", ") : "—"}
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        Swallows:
                      </span>{" "}
                      {swallows.length > 0 ? swallows.join(", ") : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
