// Types for the Portion Specifications and Production Quantity Planning feature.
// (FR 5.3, 5.10, 5.11)

export type PortionProfileStatus = "Draft" | "Active" | "Superseded" | "Inactive";

export type PortionProfile = {
  id: string;
  customer_id: string;
  name: string;
  status: PortionProfileStatus;
  effective_from: string; // YYYY-MM-DD
  effective_to: string | null;
  default_overage_percentage: number;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  // joined
  customer_name?: string;
};

export type PortionComponent = {
  id: string;
  portion_profile_id: string;
  meal_category: string;
  component_name: string;
  quantity: number;
  unit: string;
  alternative_quantity: number | null;
  alternative_quantity_label: string | null;
  overage_percentage: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
};

export type PackagingProfile = {
  id: string;
  portion_profile_id: string;
  pack_type: string | null;
  bowl_size: string | null;
  lid_type: string | null;
  bag_type: string | null;
  label_template: string | null;
  requires_employee_name: boolean;
  requires_customer_name: boolean;
  requires_meal_name: boolean;
  requires_date: boolean;
  requires_allergen_flag: boolean;
  reusable: boolean;
  return_instructions: string | null;
  created_at: string;
  updated_at: string | null;
};

export type PortionProfileDetail = PortionProfile & {
  components: PortionComponent[];
  packaging: PackagingProfile | null;
};

export type ProductionQuantityRun = {
  id: string;
  service_day: string;
  dashboard_snapshot_id: string | null;
  status: string;
  generated_by: string | null;
  generated_at: string;
  notes: string | null;
};

export type ProductionQuantityLine = {
  id: string;
  production_quantity_run_id: string;
  customer_id: string | null;
  meal_category: string | null;
  component_name: string;
  total_required: number;
  overage_percentage: number;
  total_with_overage: number;
  unit: string;
  source_meal_count: number;
  portion_quantity: number | null;
  created_at: string;
  // joined
  customer_name?: string;
};

// ─── Computed report types ───────────────────────────────────────────────────

/** One row in the aggregate kitchen report (all customers combined). */
export type AggregateReportLine = {
  component_name: string;
  unit: string;
  total_required: number;
  overage_percentage: number;
  total_with_overage: number;
  source_meal_count: number;
  customer_lines: CustomerReportLine[];
};

/** One per-customer detail row within an aggregate line. */
export type CustomerReportLine = {
  customer_id: string;
  customer_name: string;
  meal_category: string;
  component_name: string;
  portion_quantity: number;
  source_meal_count: number;
  total_required: number;
  overage_percentage: number;
  total_with_overage: number;
  unit: string;
};

export type MissingProfileFlag = {
  customer_name: string;
  customer_id: string;
  reason: "no_active_profile" | "no_component_for_category";
  meal_category?: string;
};

export type ProductionQuantityReport = {
  service_day: string;
  generated_at: string;
  aggregate_lines: AggregateReportLine[];
  missing_flags: MissingProfileFlag[];
  summary: {
    total_meals: number;
    customer_count: number;
    component_count: number;
    missing_count: number;
  };
};

// ─── Form/input types ────────────────────────────────────────────────────────

export type CreatePortionProfileInput = {
  customer_id: string;
  name: string;
  effective_from: string;
  effective_to?: string | null;
  default_overage_percentage?: number;
  notes?: string | null;
};

export type UpdatePortionProfileInput = Partial<CreatePortionProfileInput> & {
  status?: PortionProfileStatus;
};

export type UpsertPortionComponentInput = {
  id?: string;
  meal_category: string;
  component_name: string;
  quantity: number;
  unit: string;
  alternative_quantity?: number | null;
  alternative_quantity_label?: string | null;
  overage_percentage?: number | null;
  sort_order?: number;
};

export type UpsertPackagingProfileInput = {
  pack_type?: string | null;
  bowl_size?: string | null;
  lid_type?: string | null;
  bag_type?: string | null;
  label_template?: string | null;
  requires_employee_name?: boolean;
  requires_customer_name?: boolean;
  requires_meal_name?: boolean;
  requires_date?: boolean;
  requires_allergen_flag?: boolean;
  reusable?: boolean;
  return_instructions?: string | null;
};

export type CopyPortionProfileInput = {
  source_profile_id: string;
  target_customer_id: string;
  new_name: string;
  effective_from: string;
};
