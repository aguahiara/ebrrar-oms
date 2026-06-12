import { redirect } from "next/navigation";
import { getAppSession, getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import AppShell from "./components/app-shell";

/**
 * Authenticated app shell layout.
 *
 * This route group `(app)` is URL-transparent — pages placed here are served
 * at their natural paths (e.g. app/(app)/dashboard/page.tsx → /dashboard).
 * The layout enforces authentication and renders the sidebar + topbar for
 * every page inside this group.
 *
 * When session is null but the user IS authenticated (valid cookie), we check
 * whether they are suspended/deactivated rather than silently looping them
 * back to /login.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAppSession();

  if (!session) {
    const user = await getCurrentUser();
    if (user) {
      // Authenticated but no valid session — check profile status
      const supabase = await createSupabaseServerClient();
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("status")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (profile?.status === "suspended" || profile?.status === "inactive") {
        redirect("/auth/suspended");
      }
    }
    redirect("/login");
  }

  return <AppShell session={session}>{children}</AppShell>;
}
