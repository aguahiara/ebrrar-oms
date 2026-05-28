import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/auth";
import AppShell from "./components/app-shell";

/**
 * Authenticated app shell layout.
 *
 * This route group `(app)` is URL-transparent — pages placed here are served
 * at their natural paths (e.g. app/(app)/dashboard/page.tsx → /dashboard).
 * The layout enforces authentication and renders the sidebar + topbar for
 * every page inside this group.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAppSession();
  if (!session) redirect("/login");

  return <AppShell session={session}>{children}</AppShell>;
}
