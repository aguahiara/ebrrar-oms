"use client";

import { Fragment, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type VocabItem = { day: string; name: string };
type ParsedMenuOption = { day: string; optionLabel: string; name: string };
type ParsedMenu = {
  options: ParsedMenuOption[];
  proteins: VocabItem[];
  swallows: VocabItem[];
  notes: string[];
};
type SaveState = { menuVersionId: string; status: "Draft" | "Published" };

type MenuListItem = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  serviceWeekStart: string;
  status: string;
  sourceFilename: string | null;
  createdBy: string | null;
  createdAt: string;
  itemCount: number;
  proteinCount: number;
  swallowCount: number;
};

type MenuDetail = {
  items: {
    day_of_week: string;
    canonical_name: string;
    option_label: string | null;
  }[];
  proteins: { day_of_week: string; name: string }[];
  swallows: { day_of_week: string; name: string }[];
};

type CustomerOption = { id: string; display_name: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a YYYY-MM-DD service week start as "w/c 11 May 2026". */
function weekLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return (
    "w/c " +
    d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  );
}

/** Short locale date from an ISO timestamp. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "Published"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
      : status === "Draft"
        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800"
        : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400 dark:border-zinc-700";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      {status}
    </span>
  );
}

// ─── MenuDayCard ──────────────────────────────────────────────────────────────

function MenuDayCard({
  day,
  detail,
}: {
  day: string;
  detail: MenuDetail;
}) {
  const items = detail.items.filter((i) => i.day_of_week === day);
  const proteins = detail.proteins
    .filter((p) => p.day_of_week === day)
    .map((p) => p.name);
  const swallows = detail.swallows
    .filter((s) => s.day_of_week === day)
    .map((s) => s.name);

  if (items.length === 0 && proteins.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-2 font-semibold text-zinc-900 dark:text-zinc-50">
        {day}{" "}
        <span className="font-normal text-zinc-400">({items.length})</span>
      </p>
      <ol className="mb-2 space-y-1">
        {items.map((item) => (
          <li key={item.option_label ?? item.canonical_name} className="text-zinc-700 dark:text-zinc-300">
            {item.option_label && (
              <span className="text-zinc-400">{item.option_label}: </span>
            )}
            {item.canonical_name}
          </li>
        ))}
      </ol>
      {proteins.length > 0 && (
        <p className="text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Proteins: </span>
          {proteins.join(", ")}
        </p>
      )}
      {swallows.length > 0 && (
        <p className="text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Swallows: </span>
          {swallows.join(", ")}
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MenuUploadPage() {
  // ── Upload form state ──────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [serviceWeekStart, setServiceWeekStart] = useState("2026-05-11");
  const [menu, setMenu] = useState<ParsedMenu | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // ── List state ─────────────────────────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0);
  const [menus, setMenus] = useState<MenuListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterWeek, setFilterWeek] = useState("");

  // ── Row actions ────────────────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewData, setViewData] = useState<Record<string, MenuDetail>>({});
  const [viewLoading, setViewLoading] = useState<Record<string, boolean>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCustomerId, setEditCustomerId] = useState<string | null>(null);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [customersLoaded, setCustomersLoaded] = useState(false);

  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<Record<string, string | null>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ── Load list ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setListLoading(true);
    setListError(null);
    fetch("/api/menu/list")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Failed to load menus.");
        return data as MenuListItem[];
      })
      .then((data) => {
        if (!alive) return;
        setMenus(data);
        setListLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setListError(err instanceof Error ? err.message : "Failed to load menus.");
        setListLoading(false);
      });
    return () => { alive = false; };
  }, [refreshKey]);

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  // ── Upload form handlers ───────────────────────────────────────────────────
  function resetResults() {
    setUploadError(null);
    setMenu(null);
    setSaveState(null);
  }

  async function handlePreview() {
    if (!file) { setUploadError("Please select an .xlsx menu file first."); return; }
    setIsLoading(true);
    resetResults();
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/menu/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed.");
      setMenu(data as ParsedMenu);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveDraft() {
    if (!file) return;
    setIsSaving(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("serviceWeekStart", serviceWeekStart);
      const res = await fetch("/api/menu/save", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      setSaveState({ menuVersionId: data.menuVersionId, status: "Draft" });
      refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePublish() {
    if (!saveState) return;
    setIsPublishing(true);
    setUploadError(null);
    try {
      const res = await fetch("/api/menu/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuVersionId: saveState.menuVersionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Publish failed.");
      setSaveState({ ...saveState, status: "Published" });
      refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setIsPublishing(false);
    }
  }

  // ── Row action helpers ─────────────────────────────────────────────────────
  async function ensureCustomers() {
    if (customersLoaded) return;
    const r = await fetch("/api/customers/full");
    if (r.ok) {
      const data = (await r.json()) as CustomerOption[];
      setCustomerOptions(data);
      setCustomersLoaded(true);
    }
  }

  async function handleView(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (viewData[id]) return;
    setViewLoading((l) => ({ ...l, [id]: true }));
    try {
      const r = await fetch(`/api/menu/${id}`);
      const data = (await r.json()) as MenuDetail;
      setViewData((d) => ({ ...d, [id]: data }));
    } finally {
      setViewLoading((l) => ({ ...l, [id]: false }));
    }
  }

  async function handleEditStart(m: MenuListItem) {
    await ensureCustomers();
    setEditCustomerId(m.customerId);
    setEditingId(m.id);
    setActionError((e) => ({ ...e, [m.id]: null }));
  }

  async function handleEditSave(id: string) {
    setActionBusy((b) => ({ ...b, [id]: true }));
    setActionError((e) => ({ ...e, [id]: null }));
    try {
      const r = await fetch(`/api/menu/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: editCustomerId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Update failed.");
      setEditingId(null);
      refresh();
    } catch (err) {
      setActionError((e) => ({
        ...e,
        [id]: err instanceof Error ? err.message : "Update failed.",
      }));
    } finally {
      setActionBusy((b) => ({ ...b, [id]: false }));
    }
  }

  async function handleStatusChange(id: string, status: string) {
    setActionBusy((b) => ({ ...b, [id]: true }));
    setActionError((e) => ({ ...e, [id]: null }));
    try {
      const r = await fetch(`/api/menu/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Update failed.");
      refresh();
    } catch (err) {
      setActionError((e) => ({
        ...e,
        [id]: err instanceof Error ? err.message : "Update failed.",
      }));
    } finally {
      setActionBusy((b) => ({ ...b, [id]: false }));
    }
  }

  async function handleDelete(id: string) {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    setConfirmDelete(null);
    setActionBusy((b) => ({ ...b, [id]: true }));
    setActionError((e) => ({ ...e, [id]: null }));
    try {
      const r = await fetch(`/api/menu/${id}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Delete failed.");
      refresh();
    } catch (err) {
      setActionError((e) => ({
        ...e,
        [id]: err instanceof Error ? err.message : "Delete failed.",
      }));
    } finally {
      setActionBusy((b) => ({ ...b, [id]: false }));
    }
  }

  // ── Derived filter values ──────────────────────────────────────────────────
  const uniqueCustomers = [
    ...new Set(menus.map((m) => m.customerName ?? "General Menu")),
  ].sort();

  const filtered = menus.filter((m) => {
    if (filterCustomer !== "all") {
      const name = m.customerName ?? "General Menu";
      if (name !== filterCustomer) return false;
    }
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (filterWeek && !m.serviceWeekStart.includes(filterWeek)) return false;
    return true;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-5xl">
        {/* ── Upload section ── */}
        <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Upload weekly menu
        </h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          The Ebrrar &lsquo;Menu for the Week&rsquo; file (the Mon&ndash;Fri
          option grid).{" "}
          <a
            href="/upload"
            className="underline hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            Uploading customer orders instead?
          </a>
        </p>

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
            onChange={(e) => {
              setServiceWeekStart(e.target.value);
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
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
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
            {isLoading ? "Parsing…" : "Preview"}
          </button>

          {uploadError && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">
              {uploadError}
            </p>
          )}
        </div>

        {/* Preview results */}
        {menu && (
          <div className="mb-8 space-y-6">
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
                  {isSaving ? "Saving…" : "Save as Draft"}
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
                    {isPublishing ? "Publishing…" : "Publish"}
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
                {menu.notes.map((note, i) => (
                  <p key={i}>NB: {note}</p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
                        ({options.length})
                      </span>
                    </h2>
                    <ol className="mb-3 space-y-1">
                      {options.map((o) => (
                        <li key={o.optionLabel} className="text-zinc-700 dark:text-zinc-300">
                          <span className="text-zinc-400">{o.optionLabel}:</span>{" "}
                          {o.name}
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

        {/* ── Menu list section ── */}
        <div className="mb-4 mt-4 border-t border-zinc-200 pt-10 dark:border-zinc-800">
          <h2 className="mb-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Uploaded menus
          </h2>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            All menu versions — Draft, Published, and Archived.
          </p>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <option value="all">All customers</option>
              {uniqueCustomers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <option value="all">All statuses</option>
              <option value="Draft">Draft</option>
              <option value="Published">Published</option>
              <option value="Archived">Archived</option>
            </select>

            <input
              type="text"
              value={filterWeek}
              onChange={(e) => setFilterWeek(e.target.value)}
              placeholder="Filter by week (YYYY-MM-DD)…"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 placeholder-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:placeholder-zinc-600"
            />

            {(filterCustomer !== "all" ||
              filterStatus !== "all" ||
              filterWeek) && (
              <button
                type="button"
                onClick={() => {
                  setFilterCustomer("all");
                  setFilterStatus("all");
                  setFilterWeek("");
                }}
                className="text-sm text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Table */}
          {listLoading ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              Loading menus…
            </div>
          ) : listError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
              {listError}
            </div>
          ) : menus.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No menus uploaded yet.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              No menus match the current filters.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                      <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">
                        File
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">
                        Service Week
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">
                        Uploaded
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-zinc-700 dark:text-zinc-300">
                        Items
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-zinc-700 dark:text-zinc-300">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m) => {
                      const busy = actionBusy[m.id] ?? false;
                      const err = actionError[m.id] ?? null;
                      const isExpanded = expandedId === m.id;
                      const isEditing = editingId === m.id;
                      const awaitingDeleteConfirm = confirmDelete === m.id;

                      return (
                        <Fragment key={m.id}>
                          {/* Main row */}
                          <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                            {/* File */}
                            <td className="max-w-[180px] truncate px-4 py-3 text-zinc-800 dark:text-zinc-200">
                              {m.sourceFilename ?? (
                                <span className="text-zinc-400">—</span>
                              )}
                            </td>

                            {/* Customer */}
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <select
                                  value={editCustomerId ?? ""}
                                  onChange={(e) =>
                                    setEditCustomerId(
                                      e.target.value || null,
                                    )
                                  }
                                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                >
                                  <option value="">General Menu</option>
                                  {customerOptions.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.display_name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  className={
                                    m.customerName
                                      ? "text-zinc-800 dark:text-zinc-200"
                                      : "text-zinc-400 dark:text-zinc-500"
                                  }
                                >
                                  {m.customerName ?? "General Menu"}
                                </span>
                              )}
                            </td>

                            {/* Service week */}
                            <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                              {weekLabel(m.serviceWeekStart)}
                            </td>

                            {/* Uploaded */}
                            <td className="px-4 py-3" suppressHydrationWarning>
                              <span className="text-zinc-700 dark:text-zinc-300">
                                {shortDate(m.createdAt)}
                              </span>
                              {m.createdBy && (
                                <span className="block truncate text-xs text-zinc-400 dark:text-zinc-500">
                                  {m.createdBy}
                                </span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              <StatusBadge status={m.status} />
                            </td>

                            {/* Items */}
                            <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                              {m.itemCount}
                              {m.proteinCount > 0 && (
                                <span className="block text-xs text-zinc-400">
                                  +{m.proteinCount} prot.
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleEditSave(m.id)}
                                    className="rounded bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                                  >
                                    {busy ? "Saving…" : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingId(null)}
                                    className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                  {/* View */}
                                  <button
                                    type="button"
                                    onClick={() => handleView(m.id)}
                                    className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                  >
                                    {isExpanded ? "Hide" : "View"}
                                  </button>

                                  {/* Edit (customer assignment) */}
                                  <button
                                    type="button"
                                    onClick={() => handleEditStart(m)}
                                    className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                  >
                                    Edit
                                  </button>

                                  {/* Publish (Draft only) */}
                                  {m.status === "Draft" && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        handleStatusChange(m.id, "Published")
                                      }
                                      className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Publish
                                    </button>
                                  )}

                                  {/* Archive (Published only) */}
                                  {m.status === "Published" && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        handleStatusChange(m.id, "Archived")
                                      }
                                      className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                    >
                                      Archive
                                    </button>
                                  )}

                                  {/* Delete (Draft only) — two-step confirmation */}
                                  {m.status === "Draft" && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => handleDelete(m.id)}
                                      className={
                                        awaitingDeleteConfirm
                                          ? "rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                                          : "rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-500 hover:border-red-300 hover:text-red-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400"
                                      }
                                    >
                                      {awaitingDeleteConfirm
                                        ? "Confirm delete"
                                        : "Delete"}
                                    </button>
                                  )}

                                  {awaitingDeleteConfirm && (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDelete(null)}
                                      className="text-xs text-zinc-400 underline"
                                    >
                                      Cancel
                                    </button>
                                  )}
                                </div>
                              )}

                              {err && (
                                <p className="mt-1 text-right text-xs text-red-600 dark:text-red-400">
                                  {err}
                                </p>
                              )}
                            </td>
                          </tr>

                          {/* Expanded view row */}
                          {isExpanded && (
                            <tr className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/40">
                              <td colSpan={7} className="px-4 py-4">
                                {viewLoading[m.id] ? (
                                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                    Loading menu…
                                  </p>
                                ) : viewData[m.id] ? (
                                  <div>
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                      Menu items
                                    </p>
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                                      {DAYS.map((day) => (
                                        <MenuDayCard
                                          key={day}
                                          day={day}
                                          detail={viewData[m.id]}
                                        />
                                      ))}
                                    </div>
                                    {viewData[m.id].items.length === 0 && (
                                      <p className="text-sm text-zinc-400 dark:text-zinc-500">
                                        No items stored for this version.
                                      </p>
                                    )}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer: totals */}
              {filtered.length < menus.length && (
                <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  Showing {filtered.length} of {menus.length} menu
                  {menus.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
