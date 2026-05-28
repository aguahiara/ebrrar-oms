"use client";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client for Client Components.
 * Uses @supabase/ssr so it keeps the auth session in sync with the
 * server-side cookie automatically.
 *
 * Safe to call multiple times — createBrowserClient is idempotent.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
