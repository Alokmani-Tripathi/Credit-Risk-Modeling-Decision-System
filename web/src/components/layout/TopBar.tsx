"use client";

import { usePathname } from "next/navigation";
import { activeGroup } from "@/lib/nav";
import { Badge } from "@/components/ui/primitives";

export function TopBar() {
  const pathname = usePathname();
  const group = activeGroup(pathname);
  const page = group.items.find((i) => i.href === pathname)?.label || group.label;

  return (
    <header className="flex h-12 items-center justify-between border-b border-mist-200 bg-white px-4 sm:px-6 md:px-8">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="truncate text-mist-500">{group.label}</span>
        <span className="text-mist-300" aria-hidden>
          /
        </span>
        <span className="truncate font-medium text-ink-900">{page}</span>
      </div>
      <div className="hidden shrink-0 items-center gap-2 md:flex">
        <Badge tone="signal">Env · Demo</Badge>
        <Badge tone="neutral">Champion · XGBoost</Badge>
        <Badge tone="warn">Calibration · Isotonic</Badge>
      </div>
    </header>
  );
}
