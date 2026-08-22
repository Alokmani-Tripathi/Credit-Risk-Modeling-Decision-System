"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, activeGroup } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { useShell } from "@/components/layout/ShellContext";

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden>
      {open ? (
        <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <>
          <path d="M4 5.5h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4 14.5h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function LifecycleBar() {
  const pathname = usePathname();
  const current = activeGroup(pathname);
  const { sidebarOpen, toggleSidebar } = useShell();

  return (
    <section className="text-white" style={{ backgroundColor: "#016FD0" }} aria-label="Platform hero">
      <div className="w-full px-6 md:px-8">
        {/* Title row — icon + title aligned */}
        <div className="flex items-center justify-between gap-4 pt-4 md:pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/12 text-white ring-1 ring-white/25 transition hover:bg-white/20"
              aria-label={sidebarOpen ? "Hide workspace menu" : "Show workspace menu"}
              aria-expanded={sidebarOpen}
              aria-controls="workspace-sidebar"
            >
              <MenuIcon open={sidebarOpen} />
            </button>
            <h1 className="truncate text-[18px] font-semibold leading-none tracking-tight md:text-[22px]">
              Credit Risk Modeling &amp; Decision Platform
            </h1>
          </div>

          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <span className="rounded-[3px] bg-white/15 px-2 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20">
              Demo
            </span>
            <span
              className="rounded-[3px] bg-white px-2 py-1 text-[11px] font-semibold"
              style={{ color: "#016FD0" }}
            >
              XGBoost
            </span>
          </div>
        </div>

        {/* Independent lifecycle buttons — outlined chips, not a tray */}
        <nav className="mt-4 pb-4" aria-label="Lifecycle stages">
          <ul className="flex w-full gap-2">
            {NAV.map((group) => {
              const active = group.id === current.id;
              return (
                <li key={group.id} className="flex min-w-0 flex-1 justify-center">
                  <Link
                    href={group.href}
                    className={cn(
                      "group relative flex w-fit items-center justify-center rounded-md px-10 py-2 text-center text-[13px] tracking-tight transition-colors duration-150 md:text-[14px]",
                      active
                        ? "bg-white font-bold shadow-[0_2px_8px_rgba(0,23,90,0.18)]"
                        : "font-semibold text-white hover:bg-white/10",
                    )}
                    style={active ? { color: "#016FD0" } : undefined}
                    aria-current={active ? "page" : undefined}
                    title={group.tagline}
                  >
                    {group.label}
                    {!active ? (
                      <span className="absolute inset-x-8 bottom-0 h-px origin-center scale-x-0 bg-white/75 transition-transform duration-150 group-hover:scale-x-100" />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </section>
  );
}
