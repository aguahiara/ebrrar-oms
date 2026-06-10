import { redirect } from "next/navigation";
import {
  getCurrentUser,
  getCurrentUserProfile,
  getActiveRoleAssignments,
} from "@/lib/auth";
import { ROLE_LANDING } from "@/lib/permissions";
import SelectRoleClient from "./select-role-client";

export default async function SelectRolePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/auth/profile-not-configured");

  const allRoles = await getActiveRoleAssignments(profile.id);
  if (allRoles.length === 0) redirect("/auth/no-role");

  // Single assigned role: skip the selection UI entirely — redirect server-side.
  // This avoids the client round-trip and is the only place the landing URL is
  // chosen for a single-role user (no client input involved).
  if (allRoles.length === 1) {
    redirect(ROLE_LANDING[allRoles[0].role]);
  }

  return <SelectRoleClient roles={allRoles} />;
}
