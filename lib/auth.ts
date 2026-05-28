import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";
import type {
  AppSession,
  CreateInvitationInput,
  CreateRoleAssignmentInput,
  CreateUserProfileInput,
  RoleAssignment,
  UserProfile,
  UserRole,
} from "@/lib/auth-types";
import type { Permission } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

export const SELECTED_ROLE_COOKIE = "ebrrar-role";
export const SELECTED_CUSTOMER_COOKIE = "ebrrar-customer-id";

// ─── Current user (memoised per request via React cache) ─────────────────────

export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
});

// ─── User profile ─────────────────────────────────────────────────────────────

export const getCurrentUserProfile = cache(async (): Promise<UserProfile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;
  return data as UserProfile;
});

// ─── Role assignments ─────────────────────────────────────────────────────────

export const getActiveRoleAssignments = cache(
  async (profileId: string): Promise<RoleAssignment[]> => {
    const supabase = await createSupabaseServerClient();
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("role_assignments")
      .select("*, customer:customer_id(display_name)")
      .eq("user_profile_id", profileId)
      .eq("active", true)
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`);

    if (error || !data) return [];

    return data.map((row) => {
      const cust = Array.isArray(row.customer) ? row.customer[0] : row.customer;
      return {
        ...row,
        customer_name:
          cust && typeof cust === "object" && "display_name" in cust
            ? String(cust.display_name)
            : undefined,
      } as RoleAssignment;
    });
  },
);

// ─── Selected role (from cookie) ─────────────────────────────────────────────

export async function getSelectedRole(
  allRoles: RoleAssignment[],
): Promise<RoleAssignment | null> {
  if (allRoles.length === 0) return null;
  const cookieStore = await cookies();
  const cookieRole = cookieStore.get(SELECTED_ROLE_COOKIE)?.value as UserRole | undefined;
  const cookieCustomer = cookieStore.get(SELECTED_CUSTOMER_COOKIE)?.value;

  if (cookieRole) {
    const match = allRoles.find(
      (r) =>
        r.role === cookieRole &&
        (r.customer_id ?? undefined) === (cookieCustomer ?? undefined),
    );
    if (match) return match;
  }

  // Fall back to default role or first active role
  return allRoles.find((r) => r.is_default) ?? allRoles[0];
}

// ─── Full session ─────────────────────────────────────────────────────────────

export const getAppSession = cache(async (): Promise<AppSession | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await getCurrentUserProfile();
  if (!profile) return null;

  const allRoles = await getActiveRoleAssignments(profile.id);
  if (allRoles.length === 0) return null;

  const selectedRole = await getSelectedRole(allRoles);
  if (!selectedRole) return null;

  return { user: { id: user.id, email: user.email! }, profile, selectedRole, allRoles };
});

// ─── Guards (server-side) ─────────────────────────────────────────────────────

/** Redirects to /login if not authenticated. */
export async function requireAuth(): Promise<NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Requires an active profile; redirects appropriately if missing. */
export async function requireProfile(): Promise<UserProfile> {
  await requireAuth();
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/auth/profile-not-configured");
  return profile;
}

/**
 * Requires the current session to have one of the specified roles.
 * Redirects to /unauthorized if the role doesn't match.
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<AppSession> {
  const session = await getAppSession();
  if (!session) redirect("/login");
  if (session.allRoles.length === 0) redirect("/auth/no-role");
  if (!allowedRoles.includes(session.selectedRole.role)) redirect("/unauthorized");
  return session;
}

/**
 * Requires the session to have a specific permission derived from the role.
 */
export async function requirePermission(permission: Permission): Promise<AppSession> {
  const session = await getAppSession();
  if (!session) redirect("/login");
  if (!hasPermission(session.selectedRole.role, permission)) redirect("/unauthorized");
  return session;
}

/**
 * For corporate roles: ensures the requested customerId matches the
 * customer scope of the current session. Logs an audit event on violation.
 */
export async function requireCustomerScope(customerId: string): Promise<void> {
  const session = await getAppSession();
  if (!session) redirect("/login");

  const role = session.selectedRole.role;
  const isCorporate = role === "corporate_admin" || role === "corporate_employee";
  if (!isCorporate) return; // Ebrrar-internal roles are not customer-scoped

  if (session.selectedRole.customer_id !== customerId) {
    await logAuditEvent({
      event_type: "unauthorized_access_attempt",
      actor_user_id: session.user.id,
      actor_role: role,
      target_type: "customer",
      target_id: customerId,
      customer_id: session.selectedRole.customer_id ?? undefined,
    });
    redirect("/unauthorized");
  }
}

// ─── Audit logging ────────────────────────────────────────────────────────────

type AuditPayload = {
  event_type: string;
  actor_user_id?: string;
  actor_role?: string;
  target_type?: string;
  target_id?: string;
  customer_id?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export async function logAuditEvent(payload: AuditPayload): Promise<void> {
  try {
    const service = createSupabaseServiceClient();
    await service.from("audit_events").insert(payload);
  } catch {
    // Audit failures must not break the main flow
  }
}

// ─── Admin: user profile management ──────────────────────────────────────────

export async function adminCreateUserProfile(input: CreateUserProfileInput): Promise<UserProfile> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("user_profiles")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(`Failed to create user profile: ${error.message}`);
  return data as UserProfile;
}

export async function adminAssignRole(input: CreateRoleAssignmentInput): Promise<RoleAssignment> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("role_assignments")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(`Failed to assign role: ${error.message}`);
  return data as RoleAssignment;
}

export async function adminListUserProfiles(opts?: {
  search?: string;
  status?: string;
}): Promise<(UserProfile & { roles?: RoleAssignment[] })[]> {
  const service = createSupabaseServiceClient();
  let query = service
    .from("user_profiles")
    .select("*")
    .order("full_name");

  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.search) {
    query = query.or(
      `full_name.ilike.%${opts.search}%,email.ilike.%${opts.search}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list profiles: ${error.message}`);
  return (data ?? []) as UserProfile[];
}

export async function adminGetUserProfileWithRoles(profileId: string): Promise<
  (UserProfile & { roles: RoleAssignment[] }) | null
> {
  const service = createSupabaseServiceClient();
  const [profileRes, rolesRes] = await Promise.all([
    service.from("user_profiles").select("*").eq("id", profileId).maybeSingle(),
    service
      .from("role_assignments")
      .select("*, customer:customer_id(display_name)")
      .eq("user_profile_id", profileId)
      .order("created_at"),
  ]);

  if (!profileRes.data) return null;

  const roles = (rolesRes.data ?? []).map((row: Record<string, unknown>) => {
    const cust = Array.isArray(row.customer) ? row.customer[0] : row.customer;
    return {
      ...row,
      customer_name:
        cust && typeof cust === "object" && "display_name" in cust
          ? String((cust as Record<string, unknown>).display_name)
          : undefined,
    } as RoleAssignment;
  });

  return { ...(profileRes.data as UserProfile), roles };
}

export async function adminUpdateUserProfile(
  profileId: string,
  updates: Partial<UserProfile>,
): Promise<UserProfile> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("user_profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", profileId)
    .select()
    .single();
  if (error) throw new Error(`Failed to update profile: ${error.message}`);
  return data as UserProfile;
}

export async function adminDeactivateRole(roleAssignmentId: string): Promise<void> {
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("role_assignments")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", roleAssignmentId);
  if (error) throw new Error(`Failed to deactivate role: ${error.message}`);
}

// ─── Invitations ──────────────────────────────────────────────────────────────

export async function adminCreateInvitation(input: CreateInvitationInput) {
  const service = createSupabaseServiceClient();

  // Record the invitation in our DB
  const { data: inv, error: invErr } = await service
    .from("user_invitations")
    .insert({
      email: input.email,
      full_name: input.full_name ?? null,
      role: input.role,
      customer_id: input.customer_id ?? null,
      invited_by: input.invited_by ?? null,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (invErr) throw new Error(`Failed to record invitation: ${invErr.message}`);

  // Attempt to send Supabase invite email
  let emailSent = false;
  try {
    const { error: authErr } = await service.auth.admin.inviteUserByEmail(
      input.email,
      {
        data: {
          full_name: input.full_name ?? "",
          invited_role: input.role,
          customer_id: input.customer_id ?? null,
        },
      },
    );
    emailSent = !authErr;
  } catch {
    // Email sending may fail if not configured — log but don't throw
  }

  return { invitation: inv, emailSent };
}

export async function adminListInvitations() {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("user_invitations")
    .select("*, customer:customer_id(display_name)")
    .order("invited_at", { ascending: false });

  if (error) throw new Error(`Failed to list invitations: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const cust = Array.isArray(row.customer) ? row.customer[0] : row.customer;
    return {
      ...row,
      customer_name:
        cust && typeof cust === "object" && "display_name" in cust
          ? String((cust as Record<string, unknown>).display_name)
          : undefined,
    };
  });
}
