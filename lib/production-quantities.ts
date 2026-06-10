import { supabase } from "@/lib/supabase";
import { fetchActivePortionProfile } from "@/lib/portion-profiles";
import type {
  AggregateReportLine,
  CustomerReportLine,
  MissingProfileFlag,
  ProductionQuantityReport,
} from "@/lib/portion-types";

// ─── Released meal counts ─────────────────────────────────────────────────────

type MealCategoryCount = {
  category: string;
  count: number;
};

type ReleasedCustomer = {
  customer_id: string;
  customer_name: string;
};

/** Returns customers whose dashboard has been released for the given service day. */
async function fetchReleasedCustomers(serviceDay: string): Promise<ReleasedCustomer[]> {
  const { data, error } = await supabase
    .from("dashboard_release")
    .select("customer_id, customer:customer_id(display_name)")
    .eq("service_day", serviceDay)
    .is("revoked_at", null); // exclude revoked releases

  if (error) throw new Error(`Failed to load releases: ${error.message}`);

  return (data ?? []).map((row) => {
    const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer;
    const name =
      customer && typeof customer === "object" && "display_name" in customer
        ? String(customer.display_name)
        : "Unknown";
    return { customer_id: row.customer_id as string, customer_name: name };
  });
}

/**
 * Returns meal counts grouped by menu_item.category for a customer + service day.
 * Only lines with a matched menu_item are counted (unmatched lines have no category).
 */
async function fetchMealCountsByCategory(
  customerId: string,
  serviceDay: string,
): Promise<MealCategoryCount[]> {
  const { data, error } = await supabase
    .from("order_line")
    .select("menu_item:menu_item_id(category), quantity")
    .eq("customer_id", customerId)
    .eq("service_day", serviceDay)
    .not("menu_item_id", "is", null)
    .is("deleted_at", null);

  if (error) throw new Error(`Failed to load order lines: ${error.message}`);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const mi = Array.isArray(row.menu_item) ? row.menu_item[0] : row.menu_item;
    const cat =
      mi && typeof mi === "object" && "category" in mi && mi.category
        ? String(mi.category)
        : null;
    if (!cat) continue;
    // quantity is stored per-row (Option A); sum rather than count.
    const qty = Math.max(1, Number((row as Record<string, unknown>).quantity) || 1);
    counts.set(cat, (counts.get(cat) ?? 0) + qty);
  }

  return [...counts.entries()].map(([category, count]) => ({ category, count }));
}

// ─── Core calculation ─────────────────────────────────────────────────────────

/**
 * Generates a production quantity report for a service day.
 *
 * For each released customer:
 *  1. Fetch meal counts by menu_item.category.
 *  2. Find the active portion profile for that customer on serviceDay.
 *  3. For each category, find matching portion_components.
 *  4. Compute total_required and total_with_overage per component.
 * Aggregate across all customers by component_name + unit.
 */
export async function generateProductionQuantities(
  serviceDay: string,
  filterCustomerId?: string,
): Promise<ProductionQuantityReport> {
  const allReleased = await fetchReleasedCustomers(serviceDay);

  const released = filterCustomerId
    ? allReleased.filter((c) => c.customer_id === filterCustomerId)
    : allReleased;

  const missingFlags: MissingProfileFlag[] = [];
  const allCustomerLines: CustomerReportLine[] = [];
  let totalMeals = 0;

  for (const customer of released) {
    const categoryCounts = await fetchMealCountsByCategory(customer.customer_id, serviceDay);

    if (categoryCounts.length === 0) continue;

    const totalForCustomer = categoryCounts.reduce((s, r) => s + r.count, 0);
    totalMeals += totalForCustomer;

    const profile = await fetchActivePortionProfile(customer.customer_id, serviceDay);

    if (!profile) {
      missingFlags.push({
        customer_name: customer.customer_name,
        customer_id: customer.customer_id,
        reason: "no_active_profile",
      });
      continue;
    }

    for (const { category, count } of categoryCounts) {
      const components = profile.components.filter(
        (c) => c.meal_category.toLowerCase() === category.toLowerCase(),
      );

      if (components.length === 0) {
        missingFlags.push({
          customer_name: customer.customer_name,
          customer_id: customer.customer_id,
          reason: "no_component_for_category",
          meal_category: category,
        });
        continue;
      }

      for (const comp of components) {
        const overagePct =
          comp.overage_percentage != null
            ? comp.overage_percentage
            : (profile.default_overage_percentage ?? 0);

        const totalRequired = count * comp.quantity;
        const totalWithOverage = totalRequired * (1 + overagePct / 100);

        allCustomerLines.push({
          customer_id: customer.customer_id,
          customer_name: customer.customer_name,
          meal_category: category,
          component_name: comp.component_name,
          unit: comp.unit,
          portion_quantity: comp.quantity,
          source_meal_count: count,
          total_required: totalRequired,
          overage_percentage: overagePct,
          total_with_overage: totalWithOverage,
        });
      }
    }
  }

  // ─── Aggregate by component_name + unit ─────────────────────────────────────
  const aggregateMap = new Map<string, AggregateReportLine>();

  for (const line of allCustomerLines) {
    const key = `${line.component_name}||${line.unit}`;
    const existing = aggregateMap.get(key);

    if (!existing) {
      aggregateMap.set(key, {
        component_name: line.component_name,
        unit: line.unit,
        total_required: line.total_required,
        overage_percentage: line.overage_percentage,
        total_with_overage: line.total_with_overage,
        source_meal_count: line.source_meal_count,
        customer_lines: [line],
      });
    } else {
      existing.total_required += line.total_required;
      existing.total_with_overage += line.total_with_overage;
      existing.source_meal_count += line.source_meal_count;
      existing.customer_lines.push(line);
      // Use the max overage percentage for display on the aggregate row
      existing.overage_percentage = Math.max(
        existing.overage_percentage,
        line.overage_percentage,
      );
    }
  }

  const aggregateLines = [...aggregateMap.values()].sort((a, b) =>
    a.component_name.localeCompare(b.component_name),
  );

  return {
    service_day: serviceDay,
    generated_at: new Date().toISOString(),
    aggregate_lines: aggregateLines,
    missing_flags: missingFlags,
    summary: {
      total_meals: totalMeals,
      customer_count: released.length,
      component_count: aggregateLines.length,
      missing_count: missingFlags.length,
    },
  };
}

// ─── Persist a run (optional) ─────────────────────────────────────────────────

export async function saveProductionQuantityRun(
  report: ProductionQuantityReport,
): Promise<string> {
  const { data: run, error: runErr } = await supabase
    .from("production_quantity_runs")
    .insert({
      service_day: report.service_day,
      status: "Generated",
      generated_at: report.generated_at,
    })
    .select("id")
    .single();

  if (runErr) throw new Error(`Failed to save run: ${runErr.message}`);
  const runId = run.id as string;

  // Flatten all customer lines
  const lines = report.aggregate_lines.flatMap((agg) =>
    agg.customer_lines.map((cl) => ({
      production_quantity_run_id: runId,
      customer_id: cl.customer_id,
      meal_category: cl.meal_category,
      component_name: cl.component_name,
      total_required: cl.total_required,
      overage_percentage: cl.overage_percentage,
      total_with_overage: cl.total_with_overage,
      unit: cl.unit,
      source_meal_count: cl.source_meal_count,
      portion_quantity: cl.portion_quantity,
    })),
  );

  if (lines.length > 0) {
    const { error: linesErr } = await supabase
      .from("production_quantity_lines")
      .insert(lines);
    if (linesErr) throw new Error(`Failed to save lines: ${linesErr.message}`);
  }

  return runId;
}

export async function fetchRecentProductionRuns(
  limit = 10,
): Promise<import("@/lib/portion-types").ProductionQuantityRun[]> {
  const { data, error } = await supabase
    .from("production_quantity_runs")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load runs: ${error.message}`);
  return (data ?? []) as import("@/lib/portion-types").ProductionQuantityRun[];
}
