import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/auth";
import { ROLE_LANDING } from "@/lib/permissions";

/**
 * Root route — redirects based on auth state:
 * - No session → /login
 * - Active session → role-based landing page
 */
export default async function RootPage() {
  const session = await getAppSession();

  if (!session) {
    redirect("/login");
  }

  redirect(ROLE_LANDING[session.selectedRole.role]);
}
