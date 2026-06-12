// Types for the authentication and role-based access layer.

export type UserRole =
  | "ebrrar_super_admin"
  | "ebrrar_operations_admin"
  | "kitchen_operations"
  | "corporate_admin"
  | "corporate_employee"
  | "management_viewer";

export type UserProfileStatus = "active" | "inactive" | "invited" | "suspended";

export type UserProfile = {
  id: string;
  auth_user_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: UserProfileStatus;
  default_role: string | null;
  default_customer_id: string | null;
  last_login_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

export type RoleAssignment = {
  id: string;
  user_profile_id: string;
  role: UserRole;
  customer_id: string | null;
  is_default: boolean;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
  created_at: string;
  // joined
  customer_name?: string;
};

export type UserInvitation = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  customer_id: string | null;
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
  expires_at: string | null;
  status: "pending" | "accepted" | "expired" | "cancelled";
  cancelled_by: string | null;
  cancelled_at: string | null;
  // joined
  customer_name?: string;
  invited_by_name?: string;
};

export type AuditEvent = {
  id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_role: string | null;
  target_type: string | null;
  target_id: string | null;
  customer_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

/** The resolved session used throughout the app shell. */
export type AppSession = {
  user: {
    id: string; // Supabase auth user id
    email: string;
  };
  profile: UserProfile;
  selectedRole: RoleAssignment;
  allRoles: RoleAssignment[];
};

export type CreateUserProfileInput = {
  auth_user_id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  status?: UserProfileStatus;
};

export type CreateRoleAssignmentInput = {
  user_profile_id: string;
  role: UserRole;
  customer_id?: string | null;
  is_default?: boolean;
  effective_from?: string;
  effective_to?: string | null;
};

export type CreateInvitationInput = {
  email: string;
  full_name?: string | null;
  role: UserRole;
  customer_id?: string | null;
  invited_by?: string | null;
};
