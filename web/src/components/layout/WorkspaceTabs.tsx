"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeGroup } from "@/lib/nav";
import { cn } from "@/lib/cn";

export function WorkspaceTabs() {
  const pathname = usePathname();
  const group = activeGroup(pathname);

  if (group.items.length <= 1) return null;

  return (
    <div className="border-b border-mist-200 bg-white">
      <nav
        className="flex w-full gap-0 overflow-x-auto px-6 md:px-8"
        aria-label={`${group.label} pages`}
      >
        {group.items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative shrink-0 whitespace-nowrap px-3 py-2.5 text-[13px] transition md:px-4",
                active ? "font-semibold text-signal" : "text-mist-600 hover:text-ink-900",
              )}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
              {active ? (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-signal" />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
