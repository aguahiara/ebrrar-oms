/**
 * Shared portion-profile readiness check.
 *
 * Used by BOTH the release API guard AND the dashboard card fetch so that
 * "can this customer be released?" and "can quantities be generated?" never
 * disagree.  The release API calls this as Guard 5 (after protein check).
 * The dashboard calls it in parallel for every non-released customer card.
 */

import { fetchActivePortionProfile } from "@/lib/portion-profiles";
import { supabase } from "@/lib/supabase";

export type PortionReadiness = {
  /** ready = profile exists and covers all ordered meal categories. */
  status: "ready" | "missing" | "incomplete";
  /**
   * Human-readable message for display / API error responses.
   * null when status === "ready".
   */
  message: string | null;
  /**
   * Meal categories present in the orders that have no matching portion
   * component in the active profile.  Empty when status !== "incomplete".
   */
  unmappedCategories: string[];
};

/**
 * Checks whether a customer's portion profile setup is sufficient for the
 * given service day.
 *
 * Steps:
 *  1. Resolve the ordered meal categories (distinct menu_item.category values
 *     from matched order_line rows for this customer + service day).
 *  2. Fetch the Active portion profile effective on serviceDay.
 *  3. Verify each category has ≥ 1 matching portion component.
 *
 * @param precomputedCategories
 *   Pass this when you already know the ordered categories (e.g. from the
 *   dashboard query) to skip a redundant DB round-trip.
 */
export async function checkPortionReadiness(
  customerId: string,
  customerName: string,
  serviceDay: string,
  precomputedCategories?: string[],
): Promise<PortionReadiness> {
  // ── Step 1: resolve ordered meal categories ────────────────────────────────
  let categories: string[];

  if (precomputedCategories !== undefined) {
    categories = precomputedCategories;
  } else {
    const { data, error } = await supabase
      .from("order_line")
      .select("menu_item:menu_item_id(category)")
      .eq("customer_id", customerId)
      .eq("service_day", serviceDay)
      .not("menu_item_id", "is", null);

    if (error)
      throw new Error(`Failed to fetch meal categories: ${error.message}`);

    const catSet = new Set<string>();
    for (const row of data ?? []) {
      const mi = Array.isArray(row.menu_item) ? row.menu_item[0] : row.menu_item;
      const cat =
        mi && typeof mi === "object" && "category" in mi && mi.category
          ? String(mi.category)
          : null;
      if (cat) catSet.add(cat);
    }
    categories = [...catSet];
  }

  // No matched lines yet — prior guards (unmatched / protein) will have blocked
  // release; treat as ready so we don't emit a misleading readiness message.
  if (categories.length === 0) {
    return { status: "ready", message: null, unmappedCategories: [] };
  }

  // ── Step 2: find the active portion profile ────────────────────────────────
  const profile = await fetchActivePortionProfile(customerId, serviceDay);

  if (!profile) {
    return {
      status: "missing",
      message: `Cannot release: no active portion profile found for ${customerName}.`,
      unmappedCategories: [],
    };
  }

  // ── Step 3: verify every ordered category is covered ─────────────────────
  const coveredCategories = new Set(
    profile.components.map((c) => c.meal_category.toLowerCase()),
  );

  const unmappedCategories = categories.filter(
    (cat) => !coveredCategories.has(cat.toLowerCase()),
  );

  if (unmappedCategories.length > 0) {
    const n = unmappedCategories.length;
    const listed = unmappedCategories.join(", ");
    return {
      status: "incomplete",
      message:
        n === 1
          ? `Cannot release: meal category "${listed}" has no portion mapping in the active profile for ${customerName}.`
          : `Cannot release: ${n} meal categories have no portion mapping for ${customerName} — ${listed}.`,
      unmappedCategories,
    };
  }

  return { status: "ready", message: null, unmappedCategories: [] };
}
