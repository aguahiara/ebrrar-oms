"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { OrderLineDetail, BatchSummary } from "@/lib/avon-customer-orders";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sourceLabel(orderSource: string | null, batchChannel: string): string {
  if (orderSource === "manual_corporate_addon") return "Add-on";
  if (orderSource === "manual_corporate_direct") return "Direct";
  if (orderSource === "special_order") return "Special";
  if (orderSource === "bulk_upload" || batchChannel === "BulkUpload") return "Bulk";
  return orderSource ?? "—";
}

function matchTypeLabel(matchType: string | null): string {
  if (!matchType) return "—";
  if (matchType === "FruitsOnly") return "Fruits";
  return matchType;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const REMOVAL_REASONS: { value: string; label: string }[] = [
  { value: "customer_cancelled", label: "Customer cancelled order" },
  { value: "duplicate_order", label: "Duplicate order" },
  { value: "wrong_customer", label: "Wrong customer" },
  { value: "wrong_service_date", label: "Wrong service date" },
  { value: "wrong_upload_file", label: "Wrong upload file" },
  { value: "employee_no_longer_requires_meal", label: "Employee no longer requires meal" },
  { value: "incorrect_manual_entry", label: "Incorrect manual entry" },
  { value: "other", label: "Other" },
];

// ─── Confirmation modal shell ────────────────────────────────────────────────

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Remove Order modal ──────────────────────────────────────────────────────

function RemoveOrderModal({
  line,
  onClose,
  onRemoved,
}: {
  line: OrderLineDetail;
  onClose: () => void;
  onRemoved: (lineId: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) { setError("Please select a reason."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/lines/${line.id}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, notes: notes.trim() || undefined, source: "order_review" }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; released?: boolean };
      if (!res.ok) {
        if (data.released) {
          setError("This customer has already been released for production. Revoke the release before removing orders.");
        } else {
          setError(data.error ?? "Failed to remove order.");
        }
        setSubmitting(false);
        return;
      }
      onRemoved(line.id);
      onClose();
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Remove Order" onClose={onClose}>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Remove this order from the customer&apos;s production total? This action will also
        remove any linked unresolved exceptions.
      </p>
      <div className="mb-3 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="font-medium text-zinc-800 dark:text-zinc-100">
          {line.canonicalName ?? line.mealNameRaw}
        </p>
        {line.employeeRef && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{line.employeeRef}</p>
        )}
      </div>
      {error && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Reason <span className="text-red-500">*</span>
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">Select a reason…</option>
            {REMOVAL_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Any additional detail…"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? "Removing…" : "Remove Order"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit Quantity modal ──────────────────────────────────────────────────────

function EditQuantityModal({
  line,
  onClose,
  onUpdated,
}: {
  line: OrderLineDetail;
  onClose: () => void;
  onUpdated: (lineId: string, newQty: number) => void;
}) {
  const [qty, setQty] = useState(String(line.quantity));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newQty = parseInt(qty, 10);
    if (!Number.isInteger(newQty) || newQty < 1) {
      setError("Quantity must be a whole number of at least 1.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/lines/${line.id}/quantity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQty }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; released?: boolean };
      if (!res.ok) {
        setError(data.error ?? "Failed to update quantity.");
        setSubmitting(false);
        return;
      }
      onUpdated(line.id, newQty);
      onClose();
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Edit Quantity" onClose={onClose}>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Adjust the quantity for this manual order line. The total meal count will
        update immediately.
      </p>
      <div className="mb-3 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="font-medium text-zinc-800 dark:text-zinc-100">
          {line.canonicalName ?? line.mealNameRaw}
        </p>
        {line.employeeRef && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{line.employeeRef}</p>
        )}
      </div>
      {error && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Quantity <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
            className="w-28 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <span className="ml-2 text-sm text-zinc-500">
            (was {line.quantity})
          </span>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save Quantity"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Remove Batch modal ──────────────────────────────────────────────────────

function RemoveBatchModal({
  batch,
  customerName,
  serviceDay,
  onClose,
  onRemoved,
}: {
  batch: BatchSummary;
  customerName: string;
  serviceDay: string;
  onClose: () => void;
  onRemoved: (batchId: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const channelLabel = batch.channel === "ManualEntry" ? "Manual Entry" : "Bulk Upload";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) { setError("Please select a reason."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/batch/${batch.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, notes: notes.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; released?: boolean };
      if (!res.ok) {
        if (data.released) {
          setError("This customer has already been released for production. Revoke the release before removing this batch.");
        } else {
          setError(data.error ?? "Failed to remove batch.");
        }
        setSubmitting(false);
        return;
      }
      onRemoved(batch.id);
      onClose();
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Remove Upload Batch" onClose={onClose}>
      <p className="mb-4 text-sm text-red-700 dark:text-red-400">
        This will permanently remove all orders and exceptions from this batch.
        This action cannot be undone. Unrelated batches for the same customer
        will not be affected.
      </p>
      <div className="mb-4 space-y-1 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p><span className="text-zinc-500 dark:text-zinc-400">Customer: </span>
          <span className="font-medium text-zinc-800 dark:text-zinc-100">{customerName}</span></p>
        <p><span className="text-zinc-500 dark:text-zinc-400">Service day: </span>
          <span className="font-medium text-zinc-800 dark:text-zinc-100">{serviceDay}</span></p>
        <p><span className="text-zinc-500 dark:text-zinc-400">Source: </span>
          <span className="font-medium text-zinc-800 dark:text-zinc-100">{channelLabel}</span></p>
        {batch.sourceFilename && (
          <p><span className="text-zinc-500 dark:text-zinc-400">File: </span>
            <span className="font-medium text-zinc-800 dark:text-zinc-100">{batch.sourceFilename}</span></p>
        )}
        <p><span className="text-zinc-500 dark:text-zinc-400">Order lines: </span>
          <span className="font-medium text-zinc-800 dark:text-zinc-100">{batch.lineCount}</span></p>
        {batch.openExceptionCount > 0 && (
          <p><span className="text-zinc-500 dark:text-zinc-400">Open exceptions: </span>
            <span className="font-medium text-red-600 dark:text-red-400">{batch.openExceptionCount}</span></p>
        )}
        {batch.createdAt && (
          <p><span className="text-zinc-500 dark:text-zinc-400">Uploaded: </span>
            <span className="font-medium text-zinc-800 dark:text-zinc-100">{formatDate(batch.createdAt)}</span></p>
        )}
      </div>
      {error && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Reason <span className="text-red-500">*</span>
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">Select a reason…</option>
            {REMOVAL_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Any additional detail…"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? "Removing…" : "Remove Batch"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Main order table ─────────────────────────────────────────────────────────

export function OrderTableClient({
  initialLines,
  initialBatches,
  editableBatchIds: editableBatchIdsProp,
  isReleased,
  canManageOrders,
  customerName,
  serviceDay,
}: {
  initialLines: OrderLineDetail[];
  initialBatches: BatchSummary[];
  editableBatchIds: string[];
  isReleased: boolean;
  canManageOrders: boolean;
  customerName: string;
  serviceDay: string;
}) {
  const editableBatchIdsSet = new Set(editableBatchIdsProp);

  // Local state — optimistically update after mutations
  const [lines, setLines] = useState<OrderLineDetail[]>(initialLines);
  const [batches, setBatches] = useState<BatchSummary[]>(initialBatches);

  // Modal state
  const [removeLineTarget, setRemoveLineTarget] = useState<OrderLineDetail | null>(null);
  const [editQtyTarget, setEditQtyTarget] = useState<OrderLineDetail | null>(null);
  const [removeBatchTarget, setRemoveBatchTarget] = useState<BatchSummary | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function showSuccess(msg: string) {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 6000);
  }

  function handleLineRemoved(lineId: string) {
    setLines((prev) => {
      const updated = prev.filter((l) => l.id !== lineId);
      // Update batch line count
      const removedLine = prev.find((l) => l.id === lineId);
      if (removedLine) {
        setBatches((bs) =>
          bs.map((b) =>
            b.id === removedLine.batchId
              ? { ...b, lineCount: Math.max(0, b.lineCount - removedLine.quantity) }
              : b,
          ),
        );
      }
      return updated;
    });
    showSuccess("Order removed successfully.");
  }

  function handleQuantityUpdated(lineId: string, newQty: number) {
    setLines((prev) => {
      const old = prev.find((l) => l.id === lineId);
      const updated = prev.map((l) =>
        l.id === lineId ? { ...l, quantity: newQty } : l,
      );
      // Adjust batch line count by the delta
      if (old) {
        const delta = newQty - old.quantity;
        setBatches((bs) =>
          bs.map((b) =>
            b.id === old.batchId ? { ...b, lineCount: b.lineCount + delta } : b,
          ),
        );
      }
      return updated;
    });
    showSuccess("Quantity updated successfully.");
  }

  function handleBatchRemoved(batchId: string) {
    setLines((prev) => prev.filter((l) => l.batchId !== batchId));
    setBatches((prev) => prev.filter((b) => b.id !== batchId));
    showSuccess("Batch removed successfully.");
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-8 py-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No active orders found for this customer and service day.
        </p>
      </div>
    );
  }

  const batchMap = new Map(batches.map((b) => [b.id, b]));
  const batchSeen = new Set<string>();

  return (
    <>
      {successMessage && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 dark:border-emerald-800 dark:bg-emerald-950/60">
          <p className="text-sm text-emerald-800 dark:text-emerald-300">{successMessage}</p>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="ml-4 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* Modals */}
      {removeLineTarget && (
        <RemoveOrderModal
          line={removeLineTarget}
          onClose={() => setRemoveLineTarget(null)}
          onRemoved={handleLineRemoved}
        />
      )}
      {editQtyTarget && (
        <EditQuantityModal
          line={editQtyTarget}
          onClose={() => setEditQtyTarget(null)}
          onUpdated={handleQuantityUpdated}
        />
      )}
      {removeBatchTarget && (
        <RemoveBatchModal
          batch={removeBatchTarget}
          customerName={customerName}
          serviceDay={serviceDay}
          onClose={() => setRemoveBatchTarget(null)}
          onRemoved={handleBatchRemoved}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <th className="px-3 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">#</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Employee / Name</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Meal</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Swallow</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Protein</th>
              <th className="px-3 py-3 text-right font-medium text-zinc-600 dark:text-zinc-400">Qty</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Source</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Match</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Notes</th>
              {canManageOrders && !isReleased && (
                <th className="px-3 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const showBatchHeader = !batchSeen.has(line.batchId);
              if (showBatchHeader) batchSeen.add(line.batchId);
              const canEdit = editableBatchIdsSet.has(line.batchId) && !isReleased;
              const batchInfo = batchMap.get(line.batchId);

              return (
                <React.Fragment key={line.id}>
                  {showBatchHeader && (
                    <tr className="border-b border-zinc-100 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/50">
                      <td
                        colSpan={canManageOrders && !isReleased ? 9 : 9}
                        className="px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400"
                      >
                        {line.batchChannel === "ManualEntry" ? "Manual Entry" : "Bulk Upload"} batch
                        <span className="ml-2 font-mono text-zinc-400 dark:text-zinc-500">
                          {line.batchId.slice(0, 8)}&hellip;
                        </span>
                        {batchInfo?.sourceFilename && (
                          <span className="ml-2 text-zinc-400 dark:text-zinc-500">
                            · {batchInfo.sourceFilename}
                          </span>
                        )}
                      </td>
                      {canManageOrders && !isReleased && (
                        <td className="px-3 py-1.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canEdit && (
                              <Link
                                href={`/orders/manual?editBatchId=${line.batchId}`}
                                className="rounded px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                              >
                                Edit batch
                              </Link>
                            )}
                            {batchInfo && (
                              <button
                                type="button"
                                onClick={() => setRemoveBatchTarget(batchInfo)}
                                className="rounded border border-red-200 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                              >
                                Remove batch
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )}
                  <tr className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60 dark:border-zinc-800 dark:hover:bg-zinc-900/40">
                    <td className="px-3 py-2.5 tabular-nums text-zinc-400 dark:text-zinc-500">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-900 dark:text-zinc-100">
                      {line.employeeRef ?? <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-900 dark:text-zinc-100">
                      {line.canonicalName ?? line.mealNameRaw}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300">
                      {line.swallowName ?? <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-700 dark:text-zinc-300">
                      {line.proteinName === "(No protein)" ? (
                        <span className="italic text-zinc-400">none</span>
                      ) : (
                        line.proteinName ?? <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                      {line.quantity}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400">
                      {sourceLabel(line.orderSource, line.batchChannel)}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400">
                      {matchTypeLabel(line.matchType)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {line.lineNotes ?? <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                    </td>
                    {canManageOrders && !isReleased && (
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {line.isManual && (
                            <button
                              type="button"
                              onClick={() => setEditQtyTarget(line)}
                              className="rounded px-2 py-0.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            >
                              Edit qty
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setRemoveLineTarget(line)}
                            className="rounded border border-red-200 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {isReleased && (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          This customer has been released for production. Revoke the release to enable
          order removal.
        </p>
      )}
    </>
  );
}
