// Central permission map — single source of truth for role labels, landing
// routes, navigation, and permission flags.
// Do not scatter role logic across files; import from here.

import type { UserRole } from "@/lib/auth-types";

// ─── Role metadata ────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<UserRole, string> = {
  ebrrar_super_admin:      "Ebrrar Super Admin",
  ebrrar_operations_admin: "Ebrrar Operations Admin",
  kitchen_operations:      "Kitchen Operations",
  corporate_admin:         "Corporate Admin",
  corporate_employee:      "Corporate Employee",
  management_viewer:       "Management Viewer",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ebrrar_super_admin:      "Full system access including users, settings, and all operations.",
  ebrrar_operations_admin: "Day-to-day operations: orders, menus, production, and exceptions.",
  kitchen_operations:      "Read-only access to released dashboards and kitchen reports.",
  corporate_admin:         "Manage your company's orders, menus, and employees.",
  corporate_employee:      "Submit and view your own meal selections.",
  management_viewer:       "Read-only access to management dashboards and production reports.",
};

export const ROLE_LANDING: Record<UserRole, string> = {
  ebrrar_super_admin:      "/admin/dashboard",
  ebrrar_operations_admin: "/admin/dashboard",
  kitchen_operations:      "/kitchen/dashboard",
  corporate_admin:         "/corporate/dashboard",
  corporate_employee:      "/employee/orders",
  management_viewer:       "/management/dashboard",
};

// ─── Navigation items ─────────────────────────────────────────────────────────

export type NavItem = {
  label: string;
  href: string;
  children?: NavItem[];
};

export const ROLE_NAV: Record<UserRole, NavItem[]> = {
  ebrrar_super_admin: [
    { label: "Dashboard", href: "/admin/dashboard" },
    { label: "Customers", href: "/customers" },
    { label: "Menus", href: "/menu" },
    { label: "Portion Profiles", href: "/portion-profiles" },
    {
      label: "Orders",
      href: "#",
      children: [
        { label: "Upload Orders", href: "/upload" },
        { label: "Exceptions", href: "/exceptions" },
        { label: "Order Review", href: "/dashboard" },
      ],
    },
    {
      label: "Production",
      href: "#",
      children: [
        { label: "Daily Dashboard", href: "/production/daily-dashboard" },
        { label: "Kitchen Quantities", href: "/production-quantities" },
      ],
    },
    { label: "Reports", href: "/management/dashboard" },
    { label: "Users & Roles", href: "/admin/users" },
    { label: "Invitations", href: "/admin/invitations" },
  ],

  ebrrar_operations_admin: [
    { label: "Dashboard", href: "/admin/dashboard" },
    { label: "Customers", href: "/customers" },
    { label: "Menus", href: "/menu" },
    { label: "Portion Profiles", href: "/portion-profiles" },
    {
      label: "Orders",
      href: "#",
      children: [
        { label: "Upload Orders", href: "/upload" },
        { label: "Exceptions", href: "/exceptions" },
        { label: "Order Review", href: "/dashboard" },
      ],
    },
    {
      label: "Production",
      href: "#",
      children: [
        { label: "Daily Dashboard", href: "/production/daily-dashboard" },
        { label: "Kitchen Quantities", href: "/production-quantities" },
      ],
    },
    { label: "Reports", href: "/management/dashboard" },
  ],

  kitchen_operations: [
    { label: "Today's Dashboard", href: "/kitchen/dashboard" },
    { label: "Kitchen Quantities", href: "/production-quantities" },
    { label: "Portion Specs", href: "/portion-profiles" },
    { label: "Order Review", href: "/dashboard" },
  ],

  corporate_admin: [
    { label: "My Dashboard", href: "/corporate/dashboard" },
    { label: "Menu Approval", href: "/corporate/dashboard" },
    {
      label: "Submit Orders",
      href: "#",
      children: [{ label: "Upload Schedule", href: "/upload" }],
    },
  ],

  corporate_employee: [
    { label: "My Meal Orders", href: "/employee/orders" },
    { label: "Weekly Menu", href: "/employee/orders" },
  ],

  management_viewer: [
    { label: "Management Dashboard", href: "/management/dashboard" },
    { label: "Production Reports", href: "/production-quantities" },
    { label: "Customer Summaries", href: "/dashboard" },
  ],
};

// ─── Route allow-lists ────────────────────────────────────────────────────────
// Each role may access routes whose prefix appears in this list.
// proxy.ts and layout.tsx use this for role-based route guarding.

export const ROLE_ALLOWED_PREFIXES: Record<UserRole, string[]> = {
  ebrrar_super_admin: ["/"],           // full access
  ebrrar_operations_admin: [
    "/admin/dashboard",
    "/customers",
    "/menu",
    "/portion-profiles",
    "/production",
    "/production-quantities",
    "/upload",
    "/exceptions",
    "/dashboard",
    "/assignments",
    "/customer-menu",
    "/management/dashboard",
    "/api/",
  ],
  kitchen_operations: [
    "/kitchen/dashboard",
    "/production-quantities",
    "/portion-profiles",
    "/dashboard",
    "/api/production-quantities",
    "/api/portion-profiles",
  ],
  corporate_admin: [
    "/corporate/dashboard",
    "/upload",
    "/customer-menu",
    "/api/upload",
    "/api/customer-menu",
    "/api/customers",
  ],
  corporate_employee: [
    "/employee/orders",
    "/customer-menu",
    "/api/customer-menu",
  ],
  management_viewer: [
    "/management/dashboard",
    "/production-quantities",
    "/dashboard",
    "/api/production-quantities",
  ],
};

// ─── Permission flags ─────────────────────────────────────────────────────────

export type Permission =
  | "manage_users"
  | "manage_customers"
  | "manage_menus"
  | "manage_portion_profiles"
  | "view_portion_profiles"
  | "generate_production_quantities"
  | "view_kitchen_quantities"
  | "manage_orders"
  | "upload_orders"
  | "resolve_exceptions"
  | "release_dashboard"
  | "view_reports"
  | "view_audit"
  | "manage_settings"
  | "submit_employee_order"
  | "approve_menu"
  | "submit_corporate_summary"
  | "manage_invitations";

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ebrrar_super_admin: [
    "manage_users",
    "manage_customers",
    "manage_menus",
    "manage_portion_profiles",
    "view_portion_profiles",
    "generate_production_quantities",
    "view_kitchen_quantities",
    "manage_orders",
    "upload_orders",
    "resolve_exceptions",
    "release_dashboard",
    "view_reports",
    "view_audit",
    "manage_settings",
    "manage_invitations",
  ],
  ebrrar_operations_admin: [
    "manage_customers",
    "manage_menus",
    "manage_portion_profiles",
    "view_portion_profiles",
    "generate_production_quantities",
    "view_kitchen_quantities",
    "manage_orders",
    "upload_orders",
    "resolve_exceptions",
    "release_dashboard",
    "view_reports",
  ],
  kitchen_operations: [
    "view_portion_profiles",
    "view_kitchen_quantities",
  ],
  corporate_admin: [
    "upload_orders",
    "approve_menu",
    "submit_corporate_summary",
    "view_reports",
  ],
  corporate_employee: [
    "submit_employee_order",
  ],
  management_viewer: [
    "view_kitchen_quantities",
    "view_reports",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAccessRoute(path: string, role: UserRole): boolean {
  const prefixes = ROLE_ALLOWED_PREFIXES[role];
  if (!prefixes) return false;
  if (prefixes.includes("/")) return true; // super admin full access
  return prefixes.some((prefix) => path.startsWith(prefix));
}

// Routes that any authenticated user can access regardless of role
export const SHARED_AUTHENTICATED_ROUTES = [
  "/select-role",
  "/auth/",
  "/unauthorized",
];

// Public routes (no auth required)
export const PUBLIC_ROUTES = ["/login", "/auth/callback"];
