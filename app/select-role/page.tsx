import { redirect } from "next/navigation";
import {
  getCurrentUser,
  getCurrentUserProfile,
  getActiveRoleAssignments,
} from "@/lib/auth";
import SelectRoleClient from "./select-role-client";

export default async function SelectRolePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/auth/profile-not-configured");

  const allRoles = await getActiveRoleAssignments(profile.id);
  if (allRoles.length === 0) redirect("/auth/no-role");

  return <SelectRoleClient roles={allRoles} />;
}
