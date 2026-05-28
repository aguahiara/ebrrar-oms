"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppSession } from "@/lib/auth-types";
import { ROLE_LABELS, ROLE_NAV } from "@/lib/permissions";
import type { NavItem } from "@/lib/permissions";

interface Props {
  session: AppSession;
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ session, open, onClose }: Props) {
  const pathname = usePathname();
  const navItems = ROLE_NAV[session.selectedRole.role] ?? [];
  const roleName = ROLE_LABELS[session.selectedRole.role];

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-30 flex flex-col w-64 bg-zinc-900 dark:bg-zinc-950 border-r border-zinc-800 transition-transform duration-200",
          "md:relative md:translate-x-0 md:z-auto",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-600 shrink-0">
            <span className="text-white font-bold text-sm tracking-tighter">E</span>
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">
            Ebrrar OMS
          </span>
          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="ml-auto text-zinc-400 hover:text-zinc-200 md:hidden p-1"
            aria-label="Close sidebar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {navItems.map((item) =>
            item.children ? (
              <NavGroup key={item.label} item={item} pathname={pathname} />
            ) : (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ),
          )}
        </nav>

        {/* Footer: user + role */}
        <div className="border-t border-zinc-800 px-4 py-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-zinc-700 text-zinc-300 text-xs font-semibold shrink-0 uppercase">
              {session.profile.full_name?.charAt(0) ?? session.user.email.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-200 truncate">
                {session.profile.full_name || session.user.email}
              </p>
              <p className="text-xs text-zinc-500 truncate">{session.user.email}</p>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/60 text-emerald-400 border border-emerald-800">
                {roleName}
              </span>
              {session.selectedRole.customer_name && (
                <span className="text-xs text-zinc-500 truncate">
                  {session.selectedRole.customer_name}
                </span>
              )}
            </div>
            <Link
              href="/select-role"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              Switch role
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Nav link (leaf) ──────────────────────────────────────────────────────────

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive =
    item.href !== "#" &&
    (pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <Link
      href={item.href}
      className={[
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        isActive
          ? "bg-emerald-700/20 text-emerald-400"
          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800",
      ].join(" ")}
    >
      {item.label}
    </Link>
  );
}

// ─── Nav group (accordion) ────────────────────────────────────────────────────

function NavGroup({ item, pathname }: { item: NavItem; pathname: string }) {
  const isChildActive = item.children?.some(
    (c) => pathname === c.href || pathname.startsWith(c.href + "/"),
  );
  const [open, setOpen] = useState(isChildActive ?? false);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={[
          "w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          isChildActive
            ? "text-emerald-400"
            : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800",
        ].join(" ")}
      >
        <span>{item.label}</span>
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && item.children && (
        <div className="mt-0.5 ml-3 pl-3 border-l border-zinc-800 space-y-0.5">
          {item.children.map((child) => (
            <NavLink key={child.href + child.label} item={child} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}
