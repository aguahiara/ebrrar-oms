import type { DayOfWeek } from "@/lib/order-types";
import type { MenuItemAliasForMatch } from "@/lib/matchMeal";
import { supabase } from "@/lib/supabase";

export type AvonMenuItem = {
  id: string;
  day_of_week: DayOfWeek;
  canonical_name: string;
  /** Whether this meal requires a protein selection. Defaults to "required". */
  protein_requirement: "required" | "optional" | "not_required";
  /**
   * Where this item's menu version came from.
   * "assigned" — the customer had an explicit menu_assignment to a published
   *              version for this service week.
   * "general"  — no assignment existed; the system fell back to the latest
   *              published global (customer_id IS NULL) menu version.
   */
  menuSource: "assigned" | "general";
};

export type MenuVocabItem = {
  day_of_week: DayOfWeek;
  name: string;
};

// ─── Shared version resolver ──────────────────────────────────────────────────

/**
 * Find the correct menu_version_id to use for a customer and service week.
 *
 * Priority:
 *   1. The customer's assigned (via menu_assignment) published version for this
 *      exact service week.
 *   2. The latest published global (customer_id IS NULL) version for this week.
 *   3. The latest published global version for any week (safety fallback so that
 *      an unassigned customer never silently gets zero items).
 *
 * Returns null only when no published menu exists at all.
 */
async function resolveMenuVersionId(
  customerDisplayName: string,
  serviceWeekStart?: string,
): Promise<{ versionId: string; source: "assigned" | "general" } | null> {
  if (serviceWeekStart) {
    // ── Step 1: customer-assigned published version for this exact week ────────
    // Joins: menu_version → menu_assignment (one-to-many) → customer (many-to-one)
    const { data: assigned } = await supabase
      .from("menu_version")
      .select(
        `id, menu_assignment!inner ( customer!inner ( display_name ) )`,
      )
      .eq("status", "Published")
      .eq("service_week_start", serviceWeekStart)
      .eq("menu_assignment.customer.display_name", customerDisplayName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const assignedId = assigned ? (assigned as { id: string }).id : null;
    if (assignedId) return { versionId: assignedId, source: "assigned" };

    // ── Step 2: latest published global version for this exact week ────────────
    const { data: globalForWeek } = await supabase
      .from("menu_version")
      .select("id")
      .is("customer_id", null)
      .eq("status", "Published")
      .eq("service_week_start", serviceWeekStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (globalForWeek?.id) {
      return { versionId: globalForWeek.id as string, source: "general" };
    }
  }

  // ── Step 3: latest published global version (any week — safety fallback) ─────
  // This ensures that even if the menu was published for a different service week
  // (or the upload's serviceWeekStart doesn't match the stored week), operators
  // still see candidates in the exception resolver rather than an empty list.
  const { data: latestGlobal } = await supabase
    .from("menu_version")
    .select("id")
    .is("customer_id", null)
    .eq("status", "Published")
    .order("service_week_start", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestGlobal?.id) {
    return { versionId: latestGlobal.id as string, source: "general" };
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Menu items for the applicable published version for a customer and service week.
 *
 * When `serviceWeekStart` (YYYY-MM-DD Monday) is supplied the resolver first
 * checks for an explicit menu_assignment for that week, then falls back to the
 * latest published global menu for that week, then to the latest global menu of
 * any week.  When omitted it goes straight to the global fallback — useful for
 * contexts where the exact week is unknown (e.g. loading all proteins for a
 * customer's exception page without a date filter).
 *
 * Every returned item carries `menuSource` so callers can tell the user whether
 * the data comes from an assigned or a general menu.
 */
export async function fetchMenuItems(
  customerDisplayName: string,
  serviceWeekStart?: string,
): Promise<AvonMenuItem[]> {
  const resolved = await resolveMenuVersionId(customerDisplayName, serviceWeekStart);
  if (!resolved) return [];

  const { versionId, source } = resolved;

  const { data, error } = await supabase
    .from("menu_item")
    .select("id, day_of_week, canonical_name, protein_requirement")
    .eq("menu_version_id", versionId);

  if (error) {
    throw new Error(
      `Failed to load menu items for ${customerDisplayName}: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    day_of_week: row.day_of_week as DayOfWeek,
    canonical_name: row.canonical_name,
    protein_requirement: (row.protein_requirement ?? "required") as
      | "required"
      | "optional"
      | "not_required",
    menuSource: source,
  }));
}

/**
 * Aliases for published menu items, used as step 2 of matchMeal.
 * normalized_text is stored pre-normalized so matching is a plain equality check.
 *
 * Uses the same version-resolution logic as fetchMenuItems so alias lookup and
 * direct matching are always against the same menu version.
 */
export async function fetchAliases(
  customerDisplayName: string,
  serviceWeekStart?: string,
): Promise<MenuItemAliasForMatch[]> {
  const resolved = await resolveMenuVersionId(customerDisplayName, serviceWeekStart);
  if (!resolved) return [];

  const { versionId } = resolved;

  // Filter aliases to only those whose menu_item belongs to the resolved version.
  const { data, error } = await supabase
    .from("menu_item_alias")
    .select(
      `menu_item_id, normalized_text, menu_item!inner ( menu_version_id )`,
    )
    .eq("menu_item.menu_version_id", versionId);

  if (error) {
    throw new Error(
      `Failed to load menu aliases for ${customerDisplayName}: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    menu_item_id: row.menu_item_id,
    normalized_text: row.normalized_text,
  }));
}

/** Protein vocabulary for the applicable menu version. */
export async function fetchProteins(
  customerDisplayName: string,
  serviceWeekStart?: string,
): Promise<MenuVocabItem[]> {
  const resolved = await resolveMenuVersionId(customerDisplayName, serviceWeekStart);
  if (!resolved) return [];

  const { versionId } = resolved;

  const { data, error } = await supabase
    .from("protein_option")
    .select("day_of_week, name")
    .eq("menu_version_id", versionId);

  if (error) {
    throw new Error(
      `Failed to load proteins for ${customerDisplayName}: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    day_of_week: row.day_of_week as DayOfWeek,
    name: row.name,
  }));
}

/** Swallow vocabulary for the applicable menu version. */
export async function fetchSwallows(
  customerDisplayName: string,
  serviceWeekStart?: string,
): Promise<MenuVocabItem[]> {
  const resolved = await resolveMenuVersionId(customerDisplayName, serviceWeekStart);
  if (!resolved) return [];

  const { versionId } = resolved;

  const { data, error } = await supabase
    .from("swallow_option")
    .select("day_of_week, name")
    .eq("menu_version_id", versionId);

  if (error) {
    throw new Error(
      `Failed to load swallows for ${customerDisplayName}: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    day_of_week: row.day_of_week as DayOfWeek,
    name: row.name,
  }));
}
