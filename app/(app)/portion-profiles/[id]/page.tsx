"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  PackagingProfile,
  PortionComponent,
  PortionProfileDetail,
  PortionProfileStatus,
  UpsertPortionComponentInput,
  UpsertPackagingProfileInput,
} from "@/lib/portion-types";
import { CopyProfileModal } from "@/app/(app)/portion-profiles/[id]/copy-modal";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PortionProfileStatus }) {
  const styles: Record<PortionProfileStatus, string> = {
    Draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    Active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    Superseded: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    Inactive: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.Draft}`}
    >
      {status}
    </span>
  );
}

// ─── Row helpers ──────────────────────────────────────────────────────────────

type LocalComponent = UpsertPortionComponentInput & { _key: string };

function blankComponent(): LocalComponent {
  return {
    _key: crypto.randomUUID(),
    meal_category: "",
    component_name: "",
    quantity: 1,
    unit: "",
    alternative_quantity: null,
    alternative_quantity_label: null,
    overage_percentage: null,
    sort_order: 0,
  };
}

function toLocalComponents(components: PortionComponent[]): LocalComponent[] {
  return components.map((c) => ({ ...c, _key: c.id }));
}

function blankPackaging(): UpsertPackagingProfileInput {
  return {
    pack_type: null,
    bowl_size: null,
    lid_type: null,
    bag_type: null,
    label_template: null,
    requires_employee_name: false,
    requires_customer_name: true,
    requires_meal_name: true,
    requires_date: true,
    requires_allergen_flag: false,
    reusable: false,
    return_instructions: null,
  };
}

function packagingToForm(p: PackagingProfile | null): UpsertPackagingProfileInput {
  if (!p) return blankPackaging();
  return {
    pack_type: p.pack_type,
    bowl_size: p.bowl_size,
    lid_type: p.lid_type,
    bag_type: p.bag_type,
    label_template: p.label_template,
    requires_employee_name: p.requires_employee_name,
    requires_customer_name: p.requires_customer_name,
    requires_meal_name: p.requires_meal_name,
    requires_date: p.requires_date,
    requires_allergen_flag: p.requires_allergen_flag,
    reusable: p.reusable,
    return_instructions: p.return_instructions,
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PortionProfileDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<PortionProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // General settings form
  const [profileName, setProfileName] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [defaultOverage, setDefaultOverage] = useState("0");
  const [notes, setNotes] = useState("");

  // Components table
  const [components, setComponents] = useState<LocalComponent[]>([]);

  // Packaging form
  const [packaging, setPackaging] = useState<UpsertPackagingProfileInput>(blankPackaging());

  // UI state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;

    fetch(`/api/portion-profiles/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load profile.");
        return data as PortionProfileDetail;
      })
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        setProfileName(p.name);
        setEffectiveFrom(p.effective_from);
        setEffectiveTo(p.effective_to ?? "");
        setDefaultOverage(String(p.default_overage_percentage ?? 0));
        setNotes(p.notes ?? "");
        setComponents(toLocalComponents(p.components));
        setPackaging(packagingToForm(p.packaging));
        setLoading(false);
        setLoadError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load profile.");
        setLoading(false);
      });

    return () => { alive = false; };
  }, [id, refreshKey]);

  async function handleSave() {
    setSaveError(null);
    setSaveSuccess(null);
    if (!profileName.trim() || !effectiveFrom) {
      setSaveError("Profile name and effective from date are required.");
      return;
    }
    const overagePct = Number(defaultOverage);
    if (isNaN(overagePct) || overagePct < 0 || overagePct > 100) {
      setSaveError("Default overage % must be between 0 and 100.");
      return;
    }
    for (const c of components) {
      if (!c.meal_category.trim() || !c.component_name.trim() || !c.unit.trim()) {
        setSaveError("All component rows must have a meal category, component name, and unit.");
        return;
      }
      if (c.quantity <= 0) {
        setSaveError("All component quantities must be greater than 0.");
        return;
      }
      if (
        c.overage_percentage != null &&
        (c.overage_percentage < 0 || c.overage_percentage > 100)
      ) {
        setSaveError("Component overage % must be between 0 and 100.");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/portion-profiles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileName.trim(),
          effective_from: effectiveFrom,
          effective_to: effectiveTo || null,
          default_overage_percentage: overagePct,
          notes: notes.trim() || null,
          components: components.map((c, i) => ({
            id: c.id,
            meal_category: c.meal_category,
            component_name: c.component_name,
            quantity: Number(c.quantity),
            unit: c.unit,
            alternative_quantity: c.alternative_quantity,
            alternative_quantity_label: c.alternative_quantity_label,
            overage_percentage: c.overage_percentage,
            sort_order: i,
          })),
          packaging,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      setSaveSuccess("Profile saved.");
      // Refresh to get server-assigned IDs for newly added components
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate() {
    if (
      !confirm(
        "Activate this profile? The current Active profile for this customer (if any) will be Superseded.",
      )
    )
      return;
    setSaveError(null);
    setSaveSuccess(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/portion-profiles/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Activation failed.");
      setSaveSuccess("Profile activated.");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Activation failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!confirm("Mark this profile as Inactive?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/portion-profiles/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deactivate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed.");
      setSaveSuccess("Profile marked Inactive.");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Component table helpers ─────────────────────────────────────────────────

  function addComponent() {
    setComponents((prev) => [...prev, blankComponent()]);
  }

  function removeComponent(key: string) {
    setComponents((prev) => prev.filter((c) => c._key !== key));
  }

  function updateComponent(key: string, field: keyof LocalComponent, value: unknown) {
    setComponents((prev) =>
      prev.map((c) => (c._key === key ? { ...c, [field]: value } : c)),
    );
  }

  function duplicateComponent(key: string) {
    setComponents((prev) => {
      const idx = prev.findIndex((c) => c._key === key);
      if (idx < 0) return prev;
      const copy: LocalComponent = { ...prev[idx], _key: crypto.randomUUID(), id: undefined };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }

  // ─── Packaging helpers ────────────────────────────────────────────────────────

  function updatePackaging(field: keyof UpsertPackagingProfileInput, value: unknown) {
    setPackaging((prev) => ({ ...prev, [field]: value }));
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      </div>
    );
  }

  if (!profile) return null;

  const status = profile.status as PortionProfileStatus;
  const canActivate = status === "Draft" || status === "Superseded";
  const canEdit = status !== "Inactive";

  return (
    <div className="flex flex-1 bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-4xl">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {profile.customer_name ?? "—"} · Kitchen planning
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
                {profile.name}
              </h1>
              <div className="mt-2 flex items-center gap-3">
                <StatusBadge status={status} />
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {profile.effective_from}
                  {profile.effective_to ? ` → ${profile.effective_to}` : " → ongoing"}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => router.push("/portion-profiles")}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                ← Back
              </button>
              <button
                onClick={() => setShowCopyModal(true)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Copy Profile
              </button>
              {canActivate && (
                <button
                  onClick={handleActivate}
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  Activate
                </button>
              )}
              {status === "Active" && (
                <button
                  onClick={handleDeactivate}
                  disabled={saving}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-zinc-900 dark:hover:bg-red-950"
                >
                  Deactivate
                </button>
              )}
              {canEdit && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              )}
            </div>
          </div>

          {saveError && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {saveError}
            </p>
          )}
          {saveSuccess && (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {saveSuccess}
            </p>
          )}
        </header>

        <div className="space-y-6">
          {/* Section A — General Settings */}
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                General Settings
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-5 px-6 py-6">
              <div className="col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Profile Name
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Effective From
                </label>
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Effective To{" "}
                  <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  type="date"
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Default Overage %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={defaultOverage}
                  onChange={(e) => setDefaultOverage(e.target.value)}
                  disabled={!canEdit}
                  className="w-32 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>

              <div className="col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>
            </div>
          </section>

          {/* Section B — Portion Components */}
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Portion Components
              </h2>
              {canEdit && (
                <button
                  onClick={addComponent}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  + Add Component
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                    {[
                      "Meal Category",
                      "Component Name",
                      "Qty",
                      "Unit",
                      "Alt Qty",
                      "Alt Label",
                      "Overage %",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {components.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                      >
                        No components yet.{" "}
                        {canEdit && (
                          <button
                            onClick={addComponent}
                            className="font-medium text-zinc-700 underline dark:text-zinc-300"
                          >
                            Add one
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    components.map((comp) => (
                      <tr
                        key={comp._key}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={comp.meal_category}
                            onChange={(e) =>
                              updateComponent(comp._key, "meal_category", e.target.value)
                            }
                            placeholder="e.g. Rice Meal"
                            disabled={!canEdit}
                            className="w-32 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={comp.component_name}
                            onChange={(e) =>
                              updateComponent(comp._key, "component_name", e.target.value)
                            }
                            placeholder="e.g. Jollof Rice"
                            disabled={!canEdit}
                            className="w-36 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={comp.quantity}
                            onChange={(e) =>
                              updateComponent(comp._key, "quantity", Number(e.target.value))
                            }
                            disabled={!canEdit}
                            className="w-16 rounded border border-zinc-200 bg-white px-2 py-1 text-right text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={comp.unit}
                            onChange={(e) =>
                              updateComponent(comp._key, "unit", e.target.value)
                            }
                            placeholder="grams"
                            disabled={!canEdit}
                            className="w-20 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={comp.alternative_quantity ?? ""}
                            onChange={(e) =>
                              updateComponent(
                                comp._key,
                                "alternative_quantity",
                                e.target.value === "" ? null : Number(e.target.value),
                              )
                            }
                            placeholder="—"
                            disabled={!canEdit}
                            className="w-16 rounded border border-zinc-200 bg-white px-2 py-1 text-right text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={comp.alternative_quantity_label ?? ""}
                            onChange={(e) =>
                              updateComponent(
                                comp._key,
                                "alternative_quantity_label",
                                e.target.value || null,
                              )
                            }
                            placeholder="—"
                            disabled={!canEdit}
                            className="w-28 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={comp.overage_percentage ?? ""}
                            onChange={(e) =>
                              updateComponent(
                                comp._key,
                                "overage_percentage",
                                e.target.value === "" ? null : Number(e.target.value),
                              )
                            }
                            placeholder="default"
                            disabled={!canEdit}
                            className="w-20 rounded border border-zinc-200 bg-white px-2 py-1 text-right text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {canEdit && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => duplicateComponent(comp._key)}
                                title="Duplicate row"
                                className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                              >
                                ⊕
                              </button>
                              <button
                                onClick={() => removeComponent(comp._key)}
                                title="Remove row"
                                className="rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {components.length > 0 && canEdit && (
              <div className="border-t border-zinc-100 px-6 py-3 dark:border-zinc-800">
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Leave Overage % blank to inherit the profile default (
                  {defaultOverage || 0}%).
                </p>
              </div>
            )}
          </section>

          {/* Section C — Packaging */}
          <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Packaging Requirements
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-5 px-6 py-6">
              {(
                [
                  { field: "pack_type", label: "Pack Type", placeholder: "e.g. foil pack" },
                  { field: "bowl_size", label: "Bowl Size", placeholder: "e.g. 500ml" },
                  { field: "lid_type", label: "Lid Type", placeholder: "e.g. clear dome" },
                  { field: "bag_type", label: "Bag Type", placeholder: "e.g. kraft paper" },
                ] as const
              ).map(({ field, label, placeholder }) => (
                <div key={field}>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {label}
                  </label>
                  <input
                    type="text"
                    value={(packaging[field] as string) ?? ""}
                    onChange={(e) => updatePackaging(field, e.target.value || null)}
                    placeholder={placeholder}
                    disabled={!canEdit}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </div>
              ))}

              <div className="col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Label Template
                </label>
                <input
                  type="text"
                  value={packaging.label_template ?? ""}
                  onChange={(e) => updatePackaging("label_template", e.target.value || null)}
                  placeholder="e.g. {customer} | {meal} | {date}"
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </div>

              <div className="col-span-2">
                <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Required Label Fields
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { field: "requires_customer_name", label: "Customer name" },
                      { field: "requires_employee_name", label: "Employee name" },
                      { field: "requires_meal_name", label: "Meal name" },
                      { field: "requires_date", label: "Date" },
                      { field: "requires_allergen_flag", label: "Allergen flag" },
                    ] as const
                  ).map(({ field, label }) => (
                    <label
                      key={field}
                      className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                    >
                      <input
                        type="checkbox"
                        checked={!!packaging[field]}
                        onChange={(e) => updatePackaging(field, e.target.checked)}
                        disabled={!canEdit}
                        className="rounded border-zinc-300"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={!!packaging.reusable}
                    onChange={(e) => updatePackaging("reusable", e.target.checked)}
                    disabled={!canEdit}
                    className="rounded border-zinc-300"
                  />
                  Reusable packaging
                </label>
              </div>

              {packaging.reusable && (
                <div className="col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Return Instructions
                  </label>
                  <textarea
                    value={packaging.return_instructions ?? ""}
                    onChange={(e) =>
                      updatePackaging("return_instructions", e.target.value || null)
                    }
                    rows={2}
                    disabled={!canEdit}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </div>
              )}
            </div>
          </section>

          {canEdit && (
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {saving ? "Saving…" : "Save All Changes"}
              </button>
            </div>
          )}
        </div>

        {showCopyModal && (
          <CopyProfileModal
            sourceProfileId={id}
            sourceProfileName={profile.name}
            onClose={() => setShowCopyModal(false)}
            onCopied={(newId: string) => {
              setShowCopyModal(false);
              router.push(`/portion-profiles/${newId}`);
            }}
          />
        )}
      </main>
    </div>
  );
}
