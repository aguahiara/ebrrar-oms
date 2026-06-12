import { notFound } from "next/navigation";
import { requirePermission, adminGetUserProfileWithRoles } from "@/lib/auth";
import UserDetailClient from "./user-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * /admin/users/[id] — User detail page (Super Admin only).
 *
 * Server component: enforces permission, fetches initial data, then delegates
 * interactivity to the client component.  No sensitive logic runs client-side.
 */
export default async function UserDetailPage({ params }: Props) {
  // Permission check — redirects to /unauthorized if not Super Admin
  const session = await requirePermission("manage_users");

  const { id } = await params;
  const user = await adminGetUserProfileWithRoles(id);
  if (!user) notFound();

  return (
    <UserDetailClient
      user={user}
      actorId={session.user.id}
    />
  );
}
