"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, isGroupActive } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { useShell } from "@/components/layout/ShellContext";

export function Sidebar() {
  const pathname = usePathname();
  const { closeSidebar } = useShell();

  return (
    <aside
      className="relative flex h-screen w-[280px] shrink-0 flex-col text-white shadow-[8px_0_32px_rgba(0,23,90,0.28)]"
      style={{ backgroundColor: "#016FD0" }}
      aria-label="Workspace menu"
    >
      <div className="relative border-b border-white/15 px-5 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] bg-white shadow-sm">
            <span className="text-[10px] font-bold leading-none tracking-tight" style={{ color: "#016FD0" }}>
              CR
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">
              Credit Risk
            </div>
            <div className="mt-0.5 truncate text-[15px] font-semibold leading-tight tracking-tight text-white">
              Workspace menu
            </div>
            <div className="mt-1.5 text-[10px] tracking-wide text-white/55">
              Secondary navigation
            </div>
          </div>
          <button
            type="button"
            onClick={closeSidebar}
            className="mt-0.5 rounded-md p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
            aria-label="Hide workspace menu"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <nav className="relative flex-1 overflow-y-auto px-3 py-3" aria-label="Platform workspaces">
        {NAV.map((group, idx) => {
          const groupActive = isGroupActive(group, pathname);
          const hasChildren = group.items.length > 0;

          return (
            <section key={group.id} className={cn("px-1", idx > 0 && "mt-1")}>
              {idx > 0 ? <div className="mx-2 mb-2 border-t border-white/12" aria-hidden /> : null}

              <div className={cn("rounded-lg py-1.5 transition-colors", groupActive && "bg-white/12")}>
                <Link
                  href={group.href}
                  onClick={closeSidebar}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2.5 py-1.5 transition",
                    "hover:bg-white/10",
                  )}
                  aria-current={groupActive ? "true" : undefined}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full transition",
                      groupActive
                        ? "bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.22)]"
                        : "bg-white/35 group-hover:bg-white/55",
                    )}
                  />
                  <span
                    className={cn(
                      "flex-1 text-[11px] font-bold uppercase tracking-[0.15em]",
                      groupActive ? "text-white" : "text-white/70 group-hover:text-white",
                    )}
                  >
                    {group.label}
                  </span>
                </Link>

                {hasChildren ? (
                  <div className="ml-2 mt-0.5 border-l border-white/18 pl-3">
                    <ul className="space-y-0.5 pb-1">
                      {group.items.map((item) => {
                        const active = pathname === item.href;
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              onClick={closeSidebar}
                              className={cn(
                                "relative block rounded-md py-1.5 pl-2.5 pr-2 text-[13px] leading-snug transition",
                                active
                                  ? "bg-white font-semibold shadow-sm"
                                  : "text-white/75 hover:bg-white/10 hover:text-white",
                              )}
                              style={active ? { color: "#016FD0" } : undefined}
                              aria-current={active ? "page" : undefined}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </nav>

      <div className="relative border-t border-white/15 px-5 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
          Expected loss
        </div>
        <div className="mt-1 font-mono text-xs text-white/90">EL = PD × LGD × EAD</div>
        <div className="mt-2.5 flex items-center gap-2 text-[10px] text-white/55">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
          Artifacts synced · Demo env
        </div>
      </div>
    </aside>
  );
}
