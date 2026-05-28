"use client";

import { useState } from "react";
import type { AppSession } from "@/lib/auth-types";
import Sidebar from "./sidebar";
import Topbar from "./topbar";

interface Props {
  session: AppSession;
  children: React.ReactNode;
}

export default function AppShell({ session, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <Sidebar
        session={session}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar
          session={session}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
