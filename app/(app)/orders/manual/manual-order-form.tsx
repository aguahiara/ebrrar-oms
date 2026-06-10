"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ManualOrderSource } from "@/lib/avon-orders";

// ─── Types ────────────────────────────────────────────────────────────────────

type Customer = { id: string; displayName: string };

type MenuData = {
  customerId: string;
  customerName: string;
  isSystemCustomer: boolean;
  serviceDay: string;
  dayOfWeek: string;
  menuItems: {
    id: string;
    canonicalName: string;
    proteinRequirement: "required" | "optional" | "not_required";
  }[];
  proteins: string[];
  swallows: string[];
  /** Next EXTRA-n sequence number for this customer + service day (preview hint). */
  nextExtraNumber: number;
  /** Next SPECIAL-n sequence number for this customer + service day (preview hint). */
  nextSpecialNumber: number;
};

type ProteinRequirement = "required" | "optional" | "not_required" | "";

type OrderLineState = {
  key: number; // stable React key
  /** Optional display name.  Blank = auto-generate EXTRA-n / SPECIAL-n on save. */
  employeeName: string;
  menuItemId: string;
  mealNameRaw: string;
  matchType: "Direct" | "FruitsOnly";
  /** Reflects the selected menu item's protein requirement, or "" when no meal selected. */
  proteinRequirement: ProteinRequirement;
  proteinName: string;
  swallowName: string;
  sideName: string;
  quantity: number;
  notes: string;
};

type OrderMode = "corporate" | "special";
type CorporateOrderType = "manual_corporate_addon" | "manual_corporate_direct";

/** Raw line data returned by GET /api/orders/manual/batch/[batchId]. */
type RawBatchLine = {
  id: string;
  employeeRef: string | null;
  menuItemId: string | null;
  mealNameRaw: string;
  matchType: "Direct" | "FruitsOnly";
  proteinName: string | null;
  swallowName: string | null;
  sideName: string | null;
  quantity: number;
  notes: string | null;
  orderSource: ManualOrderSource;
};

type RecentBatch = {
  id: string;
  customerName: string;
  serviceDay: string;
  channel: string;
  batchNotes: string | null;
  contactName: string | null;
  lineCount: number;
  totalQuantity: number;
  isReleased: boolean;
  releasedAt: string | null;
  createdAt: string;
};

type Props = {
  corporateCustomers: Customer[];
  specialOrdersCustomer: Customer | null;
  canEdit: boolean;
  recentBatches: RecentBatch[];
  /** When set, the form opens in edit mode for this batch on first render. */
  initialEditBatchId?: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Sentinel value for "swallow required but type not yet chosen." */
const NOT_SELECTED_SWALLOW = "Not Selected";

const FRUITS_ONLY_ITEM = {
  id: "__fruits_only__",
  canonicalName: "Fruits Only",
  proteinRequirement: "not_required" as const,
};

const EMPTY_LINE = (key: number): OrderLineState => ({
  key,
  employeeName: "",
  menuItemId: "",
  mealNameRaw: "",
  matchType: "Direct",
  proteinRequirement: "",
  proteinName: "",
  swallowName: "",
  sideName: "",
  quantity: 1,
  notes: "",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  disabled,
  className = "",
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      min={min}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-blue-400 dark:disabled:bg-zinc-700 ${className}`}
    />
  );
}

function Select({
  value,
  onChange,
  disabled,
  children,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-blue-400 dark:disabled:bg-zinc-700 ${className}`}
    >
      {children}
    </select>
  );
}

// ─── Order Line Row ────────────────────────────────────────────────────────────

function OrderLineRow({
  line,
  index,
  menuData,
  onChange,
  onRemove,
  canRemove,
  showNameField,
}: {
  line: OrderLineState;
  index: number;
  menuData: MenuData | null;
  onChange: (idx: number, field: keyof OrderLineState, value: unknown) => void;
  onRemove: (idx: number) => void;
  canRemove: boolean;
  showNameField: boolean;
}) {
  const allMenuItems = useMemo(() => {
    if (!menuData) return [FRUITS_ONLY_ITEM];
    return [...menuData.menuItems, FRUITS_ONLY_ITEM];
  }, [menuData]);

  const isFruitsOnly = line.menuItemId === FRUITS_ONLY_ITEM.id;
  const proteinDisabled =
    !menuData || !line.menuItemId || line.proteinRequirement === "not_required";

  const handleMealChange = (mealId: string) => {
    const item = allMenuItems.find((m) => m.id === mealId);
    const isfo = mealId === FRUITS_ONLY_ITEM.id;
    onChange(index, "menuItemId", mealId);
    onChange(index, "mealNameRaw", item?.canonicalName ?? "");
    onChange(index, "matchType", isfo ? "FruitsOnly" : "Direct");
    const req: ProteinRequirement = isfo
      ? "not_required"
      : ((item?.proteinRequirement ?? "required") as ProteinRequirement);
    onChange(index, "proteinRequirement", req);
    // Clear protein when the meal doesn't need one
    if (req === "not_required") {
      onChange(index, "proteinName", "");
    }
  };

  // Responsive column widths depend on whether the name field is shown.
  const mealColClass = showNameField ? "col-span-12 sm:col-span-3" : "col-span-12 sm:col-span-4";

  return (
    <div className="grid grid-cols-12 gap-2 items-start rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
      {/* Row header */}
      <div className="col-span-12 flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
          Row {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            Remove
          </button>
        )}
      </div>

      {/* Name (corporate only, optional) */}
      {showNameField && (
        <div className="col-span-12 sm:col-span-3">
          <FieldLabel>Name (optional)</FieldLabel>
          <Input
            value={line.employeeName}
            onChange={(v) => onChange(index, "employeeName", v)}
            placeholder="Leave blank to auto-assign"
            disabled={!menuData}
          />
        </div>
      )}

      {/* Meal */}
      <div className={mealColClass}>
        <FieldLabel>Meal *</FieldLabel>
        <Select
          value={line.menuItemId}
          onChange={handleMealChange}
          disabled={!menuData}
        >
          <option value="">-- Select meal --</option>
          {menuData?.menuItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.canonicalName}
            </option>
          ))}
          <option value={FRUITS_ONLY_ITEM.id}>Fruits Only</option>
        </Select>
      </div>

      {/* Protein */}
      <div className="col-span-6 sm:col-span-2">
        <FieldLabel>
          Protein
          {line.proteinRequirement !== "not_required" && line.menuItemId && (
            <span className="ml-1 text-zinc-400 font-normal">(optional)</span>
          )}
        </FieldLabel>
        <Select
          value={line.proteinName}
          onChange={(v) => onChange(index, "proteinName", v)}
          disabled={proteinDisabled}
        >
          <option value="">-- None --</option>
          {(menuData?.proteins ?? []).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </div>

      {/* Swallow */}
      <div className="col-span-6 sm:col-span-2">
        <FieldLabel>Swallow</FieldLabel>
        <Select
          value={line.swallowName}
          onChange={(v) => onChange(index, "swallowName", v)}
          disabled={!menuData || !line.menuItemId}
        >
          <option value="">None</option>
          {/* "Not Selected" = swallow required but type unspecified. Counts in totals. */}
          <option value={NOT_SELECTED_SWALLOW}>Not Selected</option>
          {(menuData?.swallows ?? [])
            .filter((s) => s !== NOT_SELECTED_SWALLOW)
            .map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
        </Select>
      </div>

      {/* Side */}
      <div className="col-span-6 sm:col-span-1">
        <FieldLabel>Side</FieldLabel>
        <Input
          value={line.sideName}
          onChange={(v) => onChange(index, "sideName", v)}
          placeholder="e.g. Dodo"
          disabled={!menuData || !line.menuItemId}
        />
      </div>

      {/* Quantity */}
      <div className="col-span-3 sm:col-span-1">
        <FieldLabel>Qty *</FieldLabel>
        <Input
          type="number"
          value={line.quantity}
          onChange={(v) => onChange(index, "quantity", Math.max(1, parseInt(v, 10) || 1))}
          min={1}
          disabled={!menuData}
        />
      </div>

      {/* Notes */}
      <div className="col-span-9 sm:col-span-1">
        <FieldLabel>Notes</FieldLabel>
        <Input
          value={line.notes}
          onChange={(v) => onChange(index, "notes", v)}
          placeholder="Optional"
          disabled={!menuData}
        />
      </div>
    </div>
  );
}

// ─── Preview Summary ───────────────────────────────────────────────────────────
//
// Shows one entry per form row (Option A — single order_line row per entry,
// quantity stored in the quantity column).  Assigns estimated EXTRA-n /
// SPECIAL-n names for unnamed rows.  Names are approximate — the server
// assigns the definitive names using a fresh DB count at save time.

function PreviewSummary({
  lines,
  menuData,
  mode,
}: {
  lines: OrderLineState[];
  menuData: MenuData | null;
  mode: OrderMode;
}) {
  const validLines = lines.filter((l) => l.menuItemId && l.quantity >= 1);
  if (validLines.length === 0) return null;

  let extraCounter = menuData?.nextExtraNumber ?? 1;
  let specialCounter = menuData?.nextSpecialNumber ?? 1;

  type PreviewRow = {
    displayName: string;
    meal: string;
    quantity: number;
    protein: string;
    swallow: string;
    side: string;
    notes: string;
  };

  const previewRows: PreviewRow[] = [];

  for (const line of validLines) {
    const baseName = line.employeeName.trim();
    let displayName: string;
    if (baseName) {
      displayName = baseName;
    } else if (mode === "special") {
      displayName = `SPECIAL-${specialCounter++}`;
    } else {
      displayName = `EXTRA-${extraCounter++}`;
    }

    previewRows.push({
      displayName,
      meal: line.mealNameRaw || "?",
      quantity: line.quantity,
      protein: line.proteinName,
      swallow: line.swallowName,
      side: line.sideName.trim(),
      notes: line.notes.trim(),
    });
  }

  const totalRows = previewRows.length;
  const totalMeals = previewRows.reduce((s, r) => s + r.quantity, 0);

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
      <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
        Order Preview
      </h3>
      <p className="text-sm text-blue-700 dark:text-blue-400 mb-3">
        <span className="font-medium">{totalRows}</span>{" "}
        {totalRows === 1 ? "row" : "rows"},{" "}
        <span className="font-medium">{totalMeals}</span>{" "}
        {totalMeals === 1 ? "meal" : "meals"} total
        {menuData && (
          <span className="ml-1 text-blue-500 dark:text-blue-500">
            — names are estimated; server assigns the final sequence
          </span>
        )}
      </p>
      <div className="space-y-1 max-h-60 overflow-y-auto">
        {previewRows.map((row, i) => (
          <div
            key={i}
            className="flex flex-wrap gap-x-2 text-xs text-blue-700 dark:text-blue-400"
          >
            <span className="font-semibold min-w-[6rem]">{row.displayName}</span>
            <span>— {row.meal}</span>
            {row.quantity > 1 && (
              <span className="font-semibold text-blue-800 dark:text-blue-200">
                × {row.quantity}
              </span>
            )}
            {row.protein && <span className="text-blue-600 dark:text-blue-300">+ {row.protein}</span>}
            {row.swallow && <span className="text-blue-600 dark:text-blue-300">+ {row.swallow}</span>}
            {row.side && <span>+ {row.side}</span>}
            {row.notes && <span className="italic text-blue-500 dark:text-blue-500">({row.notes})</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent Batches List ───────────────────────────────────────────────────────

function RecentBatchList({
  batches,
  onDelete,
  onEdit,
}: {
  batches: RecentBatch[];
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  if (batches.length === 0) {
    return (
      <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
        No manual order batches in the last 60 days.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {batches.map((b) => (
        <div
          key={b.id}
          className="flex items-start justify-between rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800/60"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {b.customerName}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {formatDate(b.serviceDay)}
              </span>
              {b.contactName && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Contact: {b.contactName}
                </span>
              )}
              {b.isReleased ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                  Released
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                  Pending Review
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {b.lineCount} {b.lineCount === 1 ? "order" : "orders"},{" "}
              {b.totalQuantity} meals
              {b.batchNotes && (
                <span className="ml-1 italic">&mdash; {b.batchNotes}</span>
              )}
            </p>
          </div>
          {!b.isReleased && (
            <div className="ml-3 shrink-0 flex items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(b.id)}
                className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(b.id)}
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Form ────────────────────────────────────────────────────────────────

let nextKey = 1;

export default function ManualOrderForm({
  corporateCustomers,
  specialOrdersCustomer,
  recentBatches: initialBatches,
  initialEditBatchId,
}: Props) {
  const router = useRouter();

  // ── Mode & header fields ────────────────────────────────────────────────────
  const [mode, setMode] = useState<OrderMode>("corporate");
  const [customerId, setCustomerId] = useState("");
  const [serviceDay, setServiceDay] = useState(todayIso());
  const [orderType, setOrderType] = useState<CorporateOrderType>("manual_corporate_addon");
  const [batchNotes, setBatchNotes] = useState("");
  // Special order fields
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [pickupDelivery, setPickupDelivery] = useState<"Pickup" | "Delivery">("Pickup");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  // ── Menu data ───────────────────────────────────────────────────────────────
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);

  // ── Order lines ─────────────────────────────────────────────────────────────
  const [lines, setLines] = useState<OrderLineState[]>([EMPTY_LINE(nextKey++)]);

  // ── Edit mode ───────────────────────────────────────────────────────────────
  // When editBatchId is set the form is in "edit" mode: customer + service day
  // are locked to the existing batch, and Save calls PATCH instead of POST.
  const [editBatchId, setEditBatchId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // Holds raw lines from GET while we wait for the menu to finish loading.
  const pendingEditLinesRef = useRef<RawBatchLine[] | null>(null);
  // Ref to the form card so we can scroll it into view when edit starts.
  const formCardRef = useRef<HTMLDivElement | null>(null);

  // ── Submission ──────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedBatchId, setSavedBatchId] = useState<string | null>(null);
  const [savedWasEdit, setSavedWasEdit] = useState(false);
  const [recentBatches, setRecentBatches] = useState<RecentBatch[]>(initialBatches);

  // Effective customer ID considering mode
  const effectiveCustomerId =
    mode === "special" ? (specialOrdersCustomer?.id ?? "") : customerId;

  // ── Fetch menu when customer + service day change ───────────────────────────
  const fetchMenu = useCallback(async (cid: string, sd: string) => {
    if (!cid || !sd) {
      setMenuData(null);
      return;
    }
    setMenuLoading(true);
    setMenuError(null);
    try {
      const res = await fetch(
        `/api/orders/manual/menu?customerId=${encodeURIComponent(cid)}&serviceDay=${encodeURIComponent(sd)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMenuError((body as { error?: string }).error ?? "Failed to load menu.");
        setMenuData(null);
      } else {
        const data = await res.json();
        setMenuData(data as MenuData);
        // Only reset lines when NOT in the middle of pre-populating an edit.
        // If pendingEditLinesRef.current is set, the useEffect below will
        // convert them into OrderLineState once menuData is available.
        if (!pendingEditLinesRef.current) {
          setLines([EMPTY_LINE(nextKey++)]);
        }
      }
    } catch {
      setMenuError("Network error loading menu.");
      setMenuData(null);
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu(effectiveCustomerId, serviceDay);
  }, [effectiveCustomerId, serviceDay, fetchMenu]);

  // ── Convert pending edit lines once menu data is available ──────────────────
  // When the user clicks Edit on a batch, handleStartEdit fetches the batch
  // data and stores raw lines in pendingEditLinesRef, then triggers a menu
  // fetch (which sets menuData).  This effect fires when menuData arrives and
  // converts the raw lines into OrderLineState, pre-populating the form.
  useEffect(() => {
    const pending = pendingEditLinesRef.current;
    if (!pending || !menuData) return;
    pendingEditLinesRef.current = null;

    const allMenuItems = [...menuData.menuItems, FRUITS_ONLY_ITEM];

    setLines(
      pending.map((raw) => {
        const isFruitsOnly =
          raw.menuItemId === null && raw.matchType === "FruitsOnly";
        const menuId = isFruitsOnly ? FRUITS_ONLY_ITEM.id : (raw.menuItemId ?? "");
        const menuItem = allMenuItems.find((m) => m.id === menuId);

        // Strip the "(No protein)" sentinel so the dropdown shows blank, not
        // the raw sentinel string — the server re-applies it on save.
        const displayProtein =
          raw.proteinName === "(No protein)" ? "" : (raw.proteinName ?? "");

        return {
          key: nextKey++,
          employeeName: raw.employeeRef ?? "",
          menuItemId: menuId,
          mealNameRaw: raw.mealNameRaw,
          matchType: raw.matchType,
          proteinRequirement: isFruitsOnly
            ? "not_required"
            : ((menuItem?.proteinRequirement ?? "required") as ProteinRequirement),
          proteinName: displayProtein,
          swallowName: raw.swallowName ?? "",
          sideName: raw.sideName ?? "",
          quantity: raw.quantity,
          notes: raw.notes ?? "",
        };
      }),
    );
  }, [menuData]);

  // ── Start editing an existing batch ────────────────────────────────────────
  const handleStartEdit = useCallback(async (batchId: string) => {
    setEditLoading(true);
    setEditError(null);
    setSaveError(null);
    setSavedBatchId(null);

    try {
      const res = await fetch(`/api/orders/manual/batch/${batchId}`);
      const data = await res.json() as {
        id: string;
        customerId: string;
        customerName: string;
        isSystemCustomer: boolean;
        serviceDay: string;
        batchNotes: string | null;
        contactName: string | null;
        contactPhone: string | null;
        pickupDelivery: "Pickup" | "Delivery" | null;
        deliveryNotes: string | null;
        isReleased: boolean;
        lines: RawBatchLine[];
        error?: string;
      };

      if (!res.ok) {
        setEditError(data.error ?? `Failed to load batch (${res.status})`);
        return;
      }
      if (data.isReleased) {
        setEditError("This batch has been released for production and can no longer be edited.");
        return;
      }

      // Determine mode from the batch data.
      const newMode: OrderMode = data.isSystemCustomer ? "special" : "corporate";
      const firstSource = data.lines[0]?.orderSource ?? "manual_corporate_addon";
      const newOrderType: CorporateOrderType =
        firstSource === "manual_corporate_direct"
          ? "manual_corporate_direct"
          : "manual_corporate_addon";

      // Store pending lines BEFORE triggering the menu fetch so the fetch
      // callback sees them and skips the lines-reset.
      pendingEditLinesRef.current = data.lines;

      // Apply form-header state.
      setMode(newMode);
      setCustomerId(newMode === "corporate" ? data.customerId : "");
      setServiceDay(data.serviceDay);
      setOrderType(newOrderType);
      setBatchNotes(data.batchNotes ?? "");
      setContactName(data.contactName ?? "");
      setContactPhone(data.contactPhone ?? "");
      setPickupDelivery((data.pickupDelivery as "Pickup" | "Delivery") ?? "Pickup");
      setDeliveryNotes(data.deliveryNotes ?? "");
      setEditBatchId(batchId);

      // Scroll form into view.
      setTimeout(() => formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch {
      setEditError("Network error loading batch for editing.");
    } finally {
      setEditLoading(false);
    }
  }, []);

  // ── Auto-start edit when initialEditBatchId is provided (from URL param) ────
  const initialEditTriggered = useRef(false);
  useEffect(() => {
    if (initialEditBatchId && !initialEditTriggered.current) {
      initialEditTriggered.current = true;
      void handleStartEdit(initialEditBatchId);
    }
  // handleStartEdit is stable (useCallback []); initialEditBatchId is from props.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cancel edit ─────────────────────────────────────────────────────────────
  const handleCancelEdit = useCallback(() => {
    setEditBatchId(null);
    setEditError(null);
    pendingEditLinesRef.current = null;
    resetForm();
  }, []);   // resetForm defined below — see eslint-disable comment

  // ── Line mutations ──────────────────────────────────────────────────────────
  const handleLineChange = useCallback(
    (idx: number, field: keyof OrderLineState, value: unknown) => {
      setLines((prev) =>
        prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)),
      );
    },
    [],
  );

  const addLine = () => setLines((prev) => [...prev, EMPTY_LINE(nextKey++)]);

  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));

  // ── Reset form after save ──────────────────────────────────────────────────
  const resetForm = () => {
    setLines([EMPTY_LINE(nextKey++)]);
    setBatchNotes("");
    setContactName("");
    setContactPhone("");
    setDeliveryNotes("");
    setSaveError(null);
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaveError(null);
    setSavedBatchId(null);

    // ── Client-side validation ──────────────────────────────────────────────
    if (!effectiveCustomerId) {
      setSaveError("Please select a customer.");
      return;
    }
    const validLines = lines.filter((l) => l.menuItemId && l.quantity >= 1);
    if (validLines.length === 0) {
      setSaveError("Please add at least one order line with a meal selected.");
      return;
    }
    if (mode === "special" && !contactName.trim()) {
      setSaveError("Contact name is required for Special Orders.");
      return;
    }

    const source: ManualOrderSource =
      mode === "special" ? "special_order" : orderType;

    const linePayload = validLines.map((l) => ({
      employeeName: l.employeeName.trim() || null,
      menuItemId: l.menuItemId === FRUITS_ONLY_ITEM.id ? null : l.menuItemId,
      mealNameRaw: l.mealNameRaw,
      matchType: l.matchType,
      proteinName: l.proteinName || null,
      swallowName: l.swallowName || null,
      sideName: l.sideName.trim() || null,
      quantity: l.quantity,
      notes: l.notes.trim() || null,
      orderSource: source,
    }));

    const specialFields = mode === "special"
      ? {
          contactName: contactName.trim(),
          contactPhone: contactPhone.trim() || undefined,
          pickupDelivery,
          deliveryNotes: deliveryNotes.trim() || undefined,
        }
      : {};

    setSaving(true);
    try {
      // ── Edit mode: PATCH existing batch ──────────────────────────────────
      if (editBatchId) {
        const body = {
          batchNotes: batchNotes.trim() || undefined,
          ...specialFields,
          lines: linePayload,
        };

        const res = await fetch(`/api/orders/manual/batch/${editBatchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 409) {
            setSaveError(
              (data as { error?: string }).error ??
                "This batch has been released and can no longer be edited.",
            );
          } else if (res.status === 401) {
            setSaveError("Your session has expired. Please sign in again.");
          } else if (res.status === 403) {
            setSaveError("You do not have permission to edit manual orders.");
          } else {
            setSaveError(
              (data as { error?: string }).error ?? `Update failed (${res.status})`,
            );
          }
          return;
        }

        // Update the batch in the recent-batches list.
        const totalQty = validLines.reduce((s, l) => s + l.quantity, 0);
        setRecentBatches((prev) =>
          prev.map((b) =>
            b.id === editBatchId
              ? {
                  ...b,
                  batchNotes: batchNotes.trim() || null,
                  contactName: mode === "special" ? contactName.trim() : b.contactName,
                  lineCount: validLines.length,
                  totalQuantity: totalQty,
                }
              : b,
          ),
        );

        const prevId = editBatchId;
        setEditBatchId(null);
        setSavedBatchId(prevId);
        setSavedWasEdit(true);
        pendingEditLinesRef.current = null;
        resetForm();
        router.refresh();
        return;
      }

      // ── Create mode: POST new batch ───────────────────────────────────────
      const body = {
        customerId: effectiveCustomerId,
        serviceDay,
        batchNotes: batchNotes.trim() || undefined,
        ...specialFields,
        lines: linePayload,
      };

      const res = await fetch("/api/orders/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setSaveError("Your session has expired. Please sign in again.");
        } else if (res.status === 403) {
          setSaveError("You do not have permission to create manual orders.");
        } else {
          setSaveError(
            (data as { error?: string }).error ?? `Save failed (${res.status})`,
          );
        }
        return;
      }
      setSavedBatchId((data as { batchId: string }).batchId);
      setSavedWasEdit(false);
      const linesInserted: number =
        (data as { linesInserted: number }).linesInserted ??
        validLines.reduce((s, l) => s + l.quantity, 0);
      const totalQty = validLines.reduce((s, l) => s + l.quantity, 0);

      // Optimistically prepend to recent batches list.
      const customerName =
        mode === "special"
          ? (specialOrdersCustomer?.displayName ?? "Special Orders")
          : (corporateCustomers.find((c) => c.id === customerId)?.displayName ?? "");

      setRecentBatches((prev) => [
        {
          id: (data as { batchId: string }).batchId,
          customerName,
          serviceDay,
          channel: "ManualEntry",
          batchNotes: batchNotes.trim() || null,
          contactName: mode === "special" ? contactName.trim() : null,
          lineCount: linesInserted,
          totalQuantity: totalQty,
          isReleased: false,
          releasedAt: null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      resetForm();
      router.refresh();
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete batch ────────────────────────────────────────────────────────────
  const handleDeleteBatch = async (id: string) => {
    if (!confirm("Delete this manual order batch? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/orders/manual/batch/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          alert("Your session has expired. Please sign in again.");
        } else if (res.status === 403) {
          alert("You do not have permission to delete manual order batches.");
        } else {
          alert((data as { error?: string }).error ?? "Failed to delete batch.");
        }
        return;
      }
      setRecentBatches((prev) => prev.filter((b) => b.id !== id));
      router.refresh();
    } catch {
      alert("Network error. Please try again.");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const isWeekend = (() => {
    try {
      const [y, m, d] = serviceDay.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      return dow === 0 || dow === 6;
    } catch {
      return false;
    }
  })();

  return (
    <div className="space-y-8">
      {/* ── Form card ─────────────────────────────────────────────────────── */}
      <div ref={formCardRef} className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">

        {/* Edit mode banner */}
        {editBatchId && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            <span className="font-semibold">Editing batch</span>{" "}
            <span className="font-mono text-xs">{editBatchId.slice(0, 8)}&hellip;</span>
            {" — "}customer and service date are locked. To change those fields,
            delete this batch and create a new one.
          </div>
        )}

        {/* Edit loading / error */}
        {editLoading && (
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">Loading batch for editing&hellip;</p>
        )}
        {editError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
            {editError}
          </div>
        )}

        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
          {editBatchId ? "Edit Manual Order Batch" : "New Manual Order Batch"}
        </h2>

        {/* Mode selector — locked during edit */}
        <div className="mb-6">
          <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            {(
              [
                { value: "corporate", label: "Corporate Order" },
                { value: "special", label: "Special Order" },
              ] as { value: OrderMode; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { if (!editBatchId) setMode(opt.value); }}
                disabled={!!editBatchId}
                className={`px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  mode === opt.value
                    ? "bg-blue-600 text-white"
                    : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-60"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {editBatchId && (
            <span className="ml-3 text-xs text-zinc-400 dark:text-zinc-500">
              Locked while editing
            </span>
          )}
        </div>

        {/* Header fields */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
          {mode === "corporate" ? (
            <>
              <div>
                <FieldLabel>
                  Customer *
                  {editBatchId && <span className="ml-1 text-xs text-zinc-400">(locked)</span>}
                </FieldLabel>
                <Select value={customerId} onChange={setCustomerId} disabled={!!editBatchId}>
                  <option value="">-- Select customer --</option>
                  {corporateCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel>Order Type</FieldLabel>
                <Select
                  value={orderType}
                  onChange={(v) => setOrderType(v as CorporateOrderType)}
                >
                  <option value="manual_corporate_addon">Additional / Add-on</option>
                  <option value="manual_corporate_direct">Direct / Replacement</option>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div>
                <FieldLabel>Contact Name (optional)</FieldLabel>
                <Input
                  value={contactName}
                  onChange={setContactName}
                  placeholder="Full name (or leave blank)"
                />
              </div>
              <div>
                <FieldLabel>Contact Phone</FieldLabel>
                <Input
                  value={contactPhone}
                  onChange={setContactPhone}
                  placeholder="Optional"
                />
              </div>
              <div>
                <FieldLabel>Pickup / Delivery</FieldLabel>
                <Select
                  value={pickupDelivery}
                  onChange={(v) => setPickupDelivery(v as "Pickup" | "Delivery")}
                >
                  <option value="Pickup">Pickup</option>
                  <option value="Delivery">Delivery</option>
                </Select>
              </div>
              {pickupDelivery === "Delivery" && (
                <div className="sm:col-span-2">
                  <FieldLabel>Delivery Notes</FieldLabel>
                  <Input
                    value={deliveryNotes}
                    onChange={setDeliveryNotes}
                    placeholder="Address or instructions"
                  />
                </div>
              )}
            </>
          )}

          <div>
            <FieldLabel>
              Service Date *
              {editBatchId && <span className="ml-1 text-xs text-zinc-400">(locked)</span>}
            </FieldLabel>
            <Input
              type="date"
              value={serviceDay}
              onChange={setServiceDay}
              disabled={!!editBatchId}
            />
            {isWeekend && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Note: selected date is a weekend.
              </p>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <FieldLabel>Batch Notes</FieldLabel>
            <Input
              value={batchNotes}
              onChange={setBatchNotes}
              placeholder="Optional notes for this batch"
            />
          </div>
        </div>

        {/* Menu status */}
        {menuLoading && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Loading menu...
          </p>
        )}
        {menuError && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
            {menuError}
          </div>
        )}
        {menuData && !menuLoading && (
          <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
            Showing menu for{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {menuData.customerName}
            </span>{" "}
            &mdash; {menuData.dayOfWeek} {formatDate(serviceDay)}.
            {menuData.menuItems.length === 0 && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                No menu items found for this day.
              </span>
            )}
          </p>
        )}
        {!menuData && !menuLoading && !menuError && effectiveCustomerId && (
          <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
            Select a valid weekday service date to load the menu.
          </p>
        )}

        {/* Special Orders warning when no customer configured */}
        {mode === "special" && !specialOrdersCustomer && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
            The Special Orders system customer is not configured. Run migration
            026 and ensure the database record exists.
          </div>
        )}

        {/* Name hint for corporate mode */}
        {mode === "corporate" && menuData && (
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Leave the <span className="font-medium">Name</span> field blank to automatically assign{" "}
            <span className="font-mono">EXTRA-{menuData.nextExtraNumber}</span>,{" "}
            <span className="font-mono">EXTRA-{menuData.nextExtraNumber + 1}</span>, &hellip; for each slot.
          </p>
        )}

        {/* Order lines */}
        <div className="space-y-3 mb-4">
          {lines.map((line, idx) => (
            <OrderLineRow
              key={line.key}
              line={line}
              index={idx}
              menuData={menuData}
              onChange={handleLineChange}
              onRemove={removeLine}
              canRemove={lines.length > 1}
              showNameField={mode === "corporate"}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addLine}
          disabled={!menuData}
          className="mb-6 inline-flex items-center gap-1.5 rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:border-zinc-400 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
        >
          + Add another row
        </button>

        {/* Preview */}
        <div className="mb-6">
          <PreviewSummary lines={lines} menuData={menuData} mode={mode} />
        </div>

        {/* Save error */}
        {saveError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
            {saveError}
          </div>
        )}

        {/* Save success */}
        {savedBatchId && (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
            {savedWasEdit ? "Batch updated successfully." : "Orders saved successfully."}{" "}
            Batch ID: {savedBatchId.slice(0, 8)}&hellip;
            These orders will appear in Order Review for the selected
            customer and service date.
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !menuData || !effectiveCustomerId}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Manual Orders"}
          </button>
          <button
            type="button"
            onClick={resetForm}
            disabled={saving}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Clear
          </button>
        </div>
      </div>

      {/* ── Recent batches ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
          Recent Manual Order Batches
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Showing batches from the last 60 days. Released batches cannot be deleted.
        </p>
        <RecentBatchList
          batches={recentBatches}
          onDelete={handleDeleteBatch}
          onEdit={handleStartEdit}
        />
      </div>
    </div>
  );
}
