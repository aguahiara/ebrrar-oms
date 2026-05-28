"use client";

import { PARSER_FORMAT_OPTIONS } from "@/lib/parsers";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CustomerData = {
  id: string;
  displayName: string;
  customerCode: string | null;
  status: string;
  parserFormat: string | null;
  notes: string | null;
};

type Props = {
  customer: CustomerData;
  canEdit: boolean;
};

export function CustomerEditForm({ customer, canEdit }: Props) {
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [displayName, setDisplayName] = useState(customer.displayName);
  const [customerCode, setCustomerCode] = useState(customer.customerCode ?? "");
  const [status, setStatus] = useState(customer.status);
  const [parserFormat, setParserFormat] = useState(customer.parserFormat ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");

  function handleCancel() {
    setDisplayName(customer.displayName);
    setCustomerCode(customer.customerCode ?? "");
    setStatus(customer.status);
    setParserFormat(customer.parserFormat ?? "");
    setNotes(customer.notes ?? "");
    setError(null);
    setEditing(false);
  }

  async function handleSave() {
    if (!displayName.trim()) {
      setError("Customer name cannot be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          customerCode: customerCode.trim() || null,
          status,
          parserFormat: parserFormat || null,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to save.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── View mode ────────────────────────────────────────────────────────────────
  if (!editing) {
    const formatLabel =
      PARSER_FORMAT_OPTIONS.find((o) => o.value === customer.parserFormat)
        ?.label ?? "— not set —";

    return (
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Customer details
          </h2>
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Edit
            </button>
          )}
        </div>

        <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <Row label="Name" value={customer.displayName} />
          <Row label="Customer code" value={customer.customerCode ?? "—"} />
          <Row label="Status">
            <StatusChip status={customer.status} />
          </Row>
          <Row label="Order file format" value={formatLabel} />
          <Row
            label="Notes"
            value={
              customer.notes ? (
                <span className="whitespace-pre-wrap">{customer.notes}</span>
              ) : (
                "—"
              )
            }
          />
        </dl>
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Edit customer
        </h2>
      </div>

      <div className="space-y-5 px-6 py-5">
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        )}

        <Field label="Customer name" required>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
            placeholder="e.g. Acme Corporation"
          />
        </Field>

        <Field label="Customer code">
          <input
            type="text"
            value={customerCode}
            onChange={(e) => setCustomerCode(e.target.value)}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
            placeholder="Short code (optional)"
          />
        </Field>

        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </Field>

        <Field label="Order file format">
          <select
            value={parserFormat}
            onChange={(e) => setParserFormat(e.target.value)}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">— not set —</option>
            {PARSER_FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder-zinc-500"
            placeholder="Internal notes about this customer…"
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <button
          onClick={handleCancel}
          disabled={saving}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 px-6 py-3">
      <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="col-span-2 text-sm text-zinc-900 dark:text-zinc-50">
        {children ?? value}
      </dd>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const active = status === "Active";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      {status}
    </span>
  );
}
