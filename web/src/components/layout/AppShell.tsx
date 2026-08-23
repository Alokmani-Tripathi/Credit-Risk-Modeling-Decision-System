"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { LifecycleBar } from "@/components/layout/LifecycleBar";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { ShellProvider, useShell } from "@/components/layout/ShellContext";
import { cn } from "@/lib/cn";

function ShellFrame({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, closeSidebar } = useShell();

  return (
    <div className="relative min-h-screen bg-mist-50">
      <button
        type="button"
        aria-label="Close workspace menu"
        className={cn(
          "fixed inset-0 z-30 bg-ink-950/40 transition-opacity duration-200",
          sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={closeSidebar}
        tabIndex={sidebarOpen ? 0 : -1}
      />

      <div
        id="workspace-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar />
      </div>

      <div className="flex min-h-screen min-w-0 flex-col">
        <div className="sticky top-0 z-20 shadow-[0_8px_24px_rgba(0,23,90,0.08)]">
          <LifecycleBar />
          <WorkspaceTabs />
        </div>
        <main className="w-full flex-1 px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-7">{children}</main>
        <PlatformFooter />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <ShellFrame>{children}</ShellFrame>
    </ShellProvider>
  );
}
