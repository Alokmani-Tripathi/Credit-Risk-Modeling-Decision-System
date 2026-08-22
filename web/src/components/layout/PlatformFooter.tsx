"use client";

import Link from "next/link";

export function PlatformFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-mist-200 bg-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-2 px-6 py-4 text-center md:px-8">
        <p className="text-[12px] leading-5 text-mist-500">
          Confidential · Decision support only — does not replace underwriting policy.
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px]" aria-label="Footer">
          <Link href="/governance/registry" className="font-medium text-signal hover:underline">
            Model registry
          </Link>
          <Link href="/governance/docs" className="font-medium text-signal hover:underline">
            Governance
          </Link>
          <Link href="/monitor/alerts" className="font-medium text-signal hover:underline">
            Alerts
          </Link>
        </nav>
        <p className="text-[11px] text-mist-400">© {year} Credit Risk Decision Platform</p>
      </div>
    </footer>
  );
}
