import { redirect } from "next/navigation";

/**
 * /admin/customers is a legacy / bookmarked URL.
 * The canonical customer management page lives at /customers.
 * Auth is already enforced by the (app) layout before this runs.
 */
export default function AdminCustomersRedirect() {
  redirect("/customers");
}
