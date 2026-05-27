import { supabase } from "@/lib/supabase";
import type {
  CopyPortionProfileInput,
  CreatePortionProfileInput,
  PackagingProfile,
  PortionComponent,
  PortionProfile,
  PortionProfileDetail,
  UpdatePortionProfileInput,
  UpsertPackagingProfileInput,
  UpsertPortionComponentInput,
} from "@/lib/portion-types";

// ─── Portion Profiles ────────────────────────────────────────────────────────

export async function fetchPortionProfiles(filters?: {
  customerId?: string;
  status?: string;
}): Promise<PortionProfile[]> {
  let query = supabase
    .from("portion_profiles")
    .select("*, customer:customer_id(display_name)")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (filters?.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load portion profiles: ${error.message}`);

  return (data ?? []).map((row) => {
    const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer;
    return {
      ...row,
      customer_name:
        customer && typeof customer === "object" && "display_name" in customer
          ? String(customer.display_name)
          : undefined,
    } as PortionProfile;
  });
}

export async function fetchPortionProfileById(id: string): Promise<PortionProfileDetail> {
  const [profileRes, componentsRes, packagingRes] = await Promise.all([
    supabase
      .from("portion_profiles")
      .select("*, customer:customer_id(display_name)")
      .eq("id", id)
      .single(),
    supabase
      .from("portion_components")
      .select("*")
      .eq("portion_profile_id", id)
      .order("sort_order")
      .order("meal_category"),
    supabase
      .from("packaging_profiles")
      .select("*")
      .eq("portion_profile_id", id)
      .maybeSingle(),
  ]);

  if (profileRes.error) throw new Error(`Profile not found: ${profileRes.error.message}`);

  const row = profileRes.data;
  const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer;

  const profile: PortionProfile = {
    ...row,
    customer_name:
      customer && typeof customer === "object" && "display_name" in customer
        ? String(customer.display_name)
        : undefined,
  };

  return {
    ...profile,
    components: (componentsRes.data ?? []) as PortionComponent[],
    packaging: (packagingRes.data ?? null) as PackagingProfile | null,
  };
}

export async function createPortionProfile(
  input: CreatePortionProfileInput,
): Promise<PortionProfile> {
  const { data, error } = await supabase
    .from("portion_profiles")
    .insert({
      customer_id: input.customer_id,
      name: input.name,
      status: "Draft",
      effective_from: input.effective_from,
      effective_to: input.effective_to ?? null,
      default_overage_percentage: input.default_overage_percentage ?? 0,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create portion profile: ${error.message}`);
  return data as PortionProfile;
}

export async function updatePortionProfile(
  id: string,
  input: UpdatePortionProfileInput,
): Promise<PortionProfile> {
  const { data, error } = await supabase
    .from("portion_profiles")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update portion profile: ${error.message}`);
  return data as PortionProfile;
}

/**
 * Activates a portion profile.
 * Supersedes any previously Active profile for the same customer,
 * then sets the target profile to Active.
 * Blocks activation if the profile has no components.
 */
export async function activatePortionProfile(
  id: string,
): Promise<{ supersededId: string | null }> {
  // Load the profile to activate
  const { data: profile, error: loadErr } = await supabase
    .from("portion_profiles")
    .select("id, customer_id, status")
    .eq("id", id)
    .single();

  if (loadErr || !profile) throw new Error("Profile not found.");

  // Must have at least one component
  const { count, error: countErr } = await supabase
    .from("portion_components")
    .select("id", { count: "exact", head: true })
    .eq("portion_profile_id", id);

  if (countErr) throw new Error(`Failed to check components: ${countErr.message}`);
  if ((count ?? 0) === 0) throw new Error("Cannot activate a profile with no components.");

  // Supersede the current Active profile for this customer (if any)
  const { data: prev, error: prevErr } = await supabase
    .from("portion_profiles")
    .update({ status: "Superseded", updated_at: new Date().toISOString() })
    .eq("customer_id", profile.customer_id)
    .eq("status", "Active")
    .neq("id", id)
    .select("id")
    .maybeSingle();

  if (prevErr) throw new Error(`Failed to supersede old profile: ${prevErr.message}`);

  // Activate the target profile
  const { error: activateErr } = await supabase
    .from("portion_profiles")
    .update({ status: "Active", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (activateErr) throw new Error(`Failed to activate profile: ${activateErr.message}`);

  return { supersededId: prev?.id ?? null };
}

/**
 * Copies a portion profile (all components + packaging) to another customer.
 * The new profile starts as Draft.
 */
export async function copyPortionProfile(
  input: CopyPortionProfileInput,
): Promise<PortionProfile> {
  const source = await fetchPortionProfileById(input.source_profile_id);

  // Create the new profile header
  const { data: newProfile, error: profileErr } = await supabase
    .from("portion_profiles")
    .insert({
      customer_id: input.target_customer_id,
      name: input.new_name,
      status: "Draft",
      effective_from: input.effective_from,
      effective_to: null,
      default_overage_percentage: source.default_overage_percentage,
      notes: source.notes,
    })
    .select()
    .single();

  if (profileErr) throw new Error(`Failed to create copied profile: ${profileErr.message}`);

  // Copy components
  if (source.components.length > 0) {
    const newComponents = source.components.map((c) => ({
      portion_profile_id: newProfile.id,
      meal_category: c.meal_category,
      component_name: c.component_name,
      quantity: c.quantity,
      unit: c.unit,
      alternative_quantity: c.alternative_quantity,
      alternative_quantity_label: c.alternative_quantity_label,
      overage_percentage: c.overage_percentage,
      sort_order: c.sort_order,
    }));
    const { error: compErr } = await supabase
      .from("portion_components")
      .insert(newComponents);
    if (compErr) throw new Error(`Failed to copy components: ${compErr.message}`);
  }

  // Copy packaging
  if (source.packaging) {
    const p = source.packaging;
    const { error: packErr } = await supabase.from("packaging_profiles").insert({
      portion_profile_id: newProfile.id,
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
    });
    if (packErr) throw new Error(`Failed to copy packaging: ${packErr.message}`);
  }

  return newProfile as PortionProfile;
}

/**
 * Returns the Active portion profile for a customer on a given service date,
 * or null if none exists.
 */
export async function fetchActivePortionProfile(
  customerId: string,
  serviceDay: string,
): Promise<PortionProfileDetail | null> {
  const { data, error } = await supabase
    .from("portion_profiles")
    .select("id")
    .eq("customer_id", customerId)
    .eq("status", "Active")
    .lte("effective_from", serviceDay)
    .or(`effective_to.is.null,effective_to.gte.${serviceDay}`)
    .maybeSingle();

  if (error) throw new Error(`Failed to find active profile: ${error.message}`);
  if (!data) return null;

  return fetchPortionProfileById(data.id);
}

// ─── Portion Components ──────────────────────────────────────────────────────

/**
 * Replaces all components for a profile with the given list.
 * Deletes all existing rows then inserts the new set. The caller re-fetches
 * after save so losing old UUIDs is fine.
 */
export async function replacePortionComponents(
  profileId: string,
  components: UpsertPortionComponentInput[],
): Promise<PortionComponent[]> {
  // Delete everything that currently belongs to this profile
  const { error: delErr } = await supabase
    .from("portion_components")
    .delete()
    .eq("portion_profile_id", profileId);
  if (delErr) throw new Error(`Failed to clear components: ${delErr.message}`);

  if (components.length === 0) return [];

  const rows = components.map((c, i) => ({
    portion_profile_id: profileId,
    meal_category: c.meal_category,
    component_name: c.component_name,
    quantity: c.quantity,
    unit: c.unit,
    alternative_quantity: c.alternative_quantity ?? null,
    alternative_quantity_label: c.alternative_quantity_label ?? null,
    overage_percentage: c.overage_percentage ?? null,
    sort_order: c.sort_order ?? i,
  }));

  const { data, error } = await supabase
    .from("portion_components")
    .insert(rows)
    .select();

  if (error) throw new Error(`Failed to save components: ${error.message}`);
  return (data ?? []) as PortionComponent[];
}

// ─── Packaging Profile ───────────────────────────────────────────────────────

export async function upsertPackagingProfile(
  profileId: string,
  input: UpsertPackagingProfileInput,
): Promise<PackagingProfile> {
  // Check if one already exists
  const { data: existing } = await supabase
    .from("packaging_profiles")
    .select("id")
    .eq("portion_profile_id", profileId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("packaging_profiles")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update packaging: ${error.message}`);
    return data as PackagingProfile;
  }

  const { data, error } = await supabase
    .from("packaging_profiles")
    .insert({ ...input, portion_profile_id: profileId })
    .select()
    .single();
  if (error) throw new Error(`Failed to create packaging: ${error.message}`);
  return data as PackagingProfile;
}
