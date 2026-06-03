"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ManualOrderSource } from "@/lib/avon-orders";

// ─── Types ────────────────────────────────────────────────────────────────────

type Customer = { id: string; displayName: string };

type MenuData = {
  customerId: string;
  customerName: string;
  isSystemCustomer: boolean;
  serviceDay: string;
  dayOfWeek: string;
  menuItems: { id: string; canonicalName: string; proteinRequirement: "required" | "optional" | "not_required" }[];
  proteins: string[];
  swallows: string[];
};

type OrderLineState = {
  key: number; // stable react key
  menuItemId: string;
  mealNameRaw: string;
  matchType: "Direct" | "FruitsOnly";
  proteinName: string;
  swallowName: string;
  sideName: string;
  quantity: number;
  notes: string;
  proteinRequired: boolean;
};

type OrderMode = "corporate" | "special";
type CorporateOrderType = "manual_corporate_addon" | "manual_corporate_direct";

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
};

// ─── Constants ────────────────────────────────────────────────────────────────

const FRUITS_ONLY_ITEM = {
  id: "__fruits_only__",
  canonicalName: "Fruits Only",
  proteinRequirement: "not_required" as const,
};

const EMPTY_LINE = (key: number): OrderLineState => ({
  key,
  menuItemId: "",
  mealNameRaw: "",
  matchType: "Direct",
  proteinName: "",
  swallowName: "",
  sideName: "",
  quantity: 1,
  notes: "",
  proteinRequired: false,
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
}: {
  line: OrderLineState;
  index: number;
  menuData: MenuData | null;
  onChange: (idx: number, field: keyof OrderLineState, value: unknown) => void;
  onRemove: (idx: number) => void;
  canRemove: boolean;
}) {
  const allMenuItems = useMemo(() => {
    if (!menuData) return [FRUITS_ONLY_ITEM];
    return [...menuData.menuItems, FRUITS_ONLY_ITEM];
  }, [menuData]);

  const selectedMenuItem = allMenuItems.find((m) => m.id === line.menuItemId);
  const isFruitsOnly = line.menuItemId === FRUITS_ONLY_ITEM.id;
  const proteinRequired =
    !isFruitsOnly &&
    (selectedMenuItem?.proteinRequirement === "required" ||
      selectedMenuItem?.proteinRequirement === "optional");

  const handleMealChange = (mealId: string) => {
    const item = allMenuItems.find((m) => m.id === mealId);
    const isfo = mealId === FRUITS_ONLY_ITEM.id;
    onChange(index, "menuItemId", mealId);
    onChange(index, "mealNameRaw", item?.canonicalName ?? "");
    onChange(index, "matchType", isfo ? "FruitsOnly" : "Direct");
    onChange(index, "proteinRequired", !isfo && item?.proteinRequirement !== "not_required");
    // Clear protein if meal doesn't require it
    if (isfo || item?.proteinRequirement === "not_required") {
      onChange(index, "proteinName", "");
    }
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-start rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
      {/* Row number */}
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

      {/* Meal */}
      <div className="col-span-12 sm:col-span-4">
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
          {proteinRequired && selectedMenuItem?.proteinRequirement === "required" && (
            <span className="ml-1 text-red-500">*</span>
          )}
        </FieldLabel>
        <Select
          value={line.proteinName}
          onChange={(v) => onChange(index, "proteinName", v)}
          disabled={!menuData || isFruitsOnly || !line.menuItemId}
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
          <option value="">-- None --</option>
          {(menuData?.swallows ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {/* Side */}
      <div className="col-span-6 sm:col-span-2">
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

function PreviewSummary({
  lines,
  menuData,
}: {
  lines: OrderLineState[];
  menuData: MenuData | null;
}) {
  const validLines = lines.filter((l) => l.menuItemId && l.quantity >= 1);
  if (validLines.length === 0) return null;

  const totalQuantity = validLines.reduce((s, l) => s + l.quantity, 0);

  const mealBreakdown = new Map<string, number>();
  const warnings: string[] = [];

  for (const line of validLines) {
    const meal = line.mealNameRaw || "Unknown";
    mealBreakdown.set(meal, (mealBreakdown.get(meal) ?? 0) + line.quantity);

    // Protein warning
    if (
      line.matchType === "Direct" &&
      !line.proteinName &&
      line.proteinRequired
    ) {
      const item = menuData?.menuItems.find((m) => m.id === line.menuItemId);
      if (item?.proteinRequirement === "required") {
        warnings.push(`Row "${meal}": protein is required but not selected.`);
      }
    }
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
      <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
        Order Preview
      </h3>
      <p className="text-sm text-blue-700 dark:text-blue-400 mb-3">
        <span className="font-medium">{validLines.length}</span>{" "}
        {validLines.length === 1 ? "line" : "lines"},{" "}
        <span className="font-medium">{totalQuantity}</span> total meals
      </p>
      <div className="space-y-0.5">
        {[...mealBreakdown.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([meal, qty]) => (
            <div key={meal} className="flex justify-between text-xs text-blue-700 dark:text-blue-400">
              <span>{meal}</span>
              <span className="font-medium">{qty}</span>
            </div>
          ))}
      </div>
      {warnings.length > 0 && (
        <div className="mt-3 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Recent Batches List ───────────────────────────────────────────────────────

function RecentBatchList({
  batches,
  onDelete,
}: {
  batches: RecentBatch[];
  onDelete: (id: string) => void;
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
              {b.lineCount} {b.lineCount === 1 ? "line" : "lines"},{" "}
              {b.totalQuantity} meals
              {b.batchNotes && (
                <span className="ml-1 italic">&mdash; {b.batchNotes}</span>
              )}
            </p>
          </div>
          {!b.isReleased && (
            <button
              type="button"
              onClick={() => onDelete(b.id)}
              className="ml-3 shrink-0 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
            >
              Delete
            </button>
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

  // ── Submission ──────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedBatchId, setSavedBatchId] = useState<string | null>(null);
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
        // Reset lines when menu changes
        setLines([EMPTY_LINE(nextKey++)]);
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

    // Client-side validation
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

    const body = {
      customerId: effectiveCustomerId,
      serviceDay,
      batchNotes: batchNotes.trim() || undefined,
      ...(mode === "special"
        ? {
            contactName: contactName.trim(),
            contactPhone: contactPhone.trim() || undefined,
            pickupDelivery,
            deliveryNotes: deliveryNotes.trim() || undefined,
          }
        : {}),
      lines: validLines.map((l) => ({
        menuItemId: l.menuItemId === FRUITS_ONLY_ITEM.id ? null : l.menuItemId,
        mealNameRaw: l.mealNameRaw,
        matchType: l.matchType,
        proteinName: l.proteinName || null,
        swallowName: l.swallowName || null,
        sideName: l.sideName.trim() || null,
        quantity: l.quantity,
        notes: l.notes.trim() || null,
        orderSource: source,
      })),
    };

    setSaving(true);
    try {
      const res = await fetch("/api/orders/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(
          (data as { error?: string }).error ?? `Save failed (${res.status})`,
        );
        return;
      }
      setSavedBatchId((data as { batchId: string }).batchId);
      const linesInserted: number = (data as { linesInserted: number }).linesInserted ?? validLines.length;
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
        alert((data as { error?: string }).error ?? "Failed to delete batch.");
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
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
          New Manual Order Batch
        </h2>

        {/* Mode selector */}
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
                onClick={() => setMode(opt.value)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  mode === opt.value
                    ? "bg-blue-600 text-white"
                    : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Header fields */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
          {mode === "corporate" ? (
            <>
              <div>
                <FieldLabel>Customer *</FieldLabel>
                <Select value={customerId} onChange={setCustomerId}>
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
                <FieldLabel>Contact Name *</FieldLabel>
                <Input
                  value={contactName}
                  onChange={setContactName}
                  placeholder="Full name"
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
            <FieldLabel>Service Date *</FieldLabel>
            <Input
              type="date"
              value={serviceDay}
              onChange={setServiceDay}
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
          <PreviewSummary lines={lines} menuData={menuData} />
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
            Orders saved successfully. Batch ID: {savedBatchId.slice(0, 8)}...
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
        />
      </div>
    </div>
  );
}
