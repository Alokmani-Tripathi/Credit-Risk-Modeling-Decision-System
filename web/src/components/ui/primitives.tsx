import { cn } from "@/lib/cn";

export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "approve" | "refer" | "decline" | "signal";
}) {
  const toneCls =
    tone === "approve"
      ? "text-approve"
      : tone === "refer"
        ? "text-refer"
        : tone === "decline"
          ? "text-decline"
          : tone === "signal"
            ? "text-signal"
            : "text-ink-900";
  return (
    <div className="panel-pad">
      <div className="label-caps">{label}</div>
      <div className={cn("mt-2 text-2xl font-semibold tracking-tight mono-num", toneCls)}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-mist-500">{hint}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "approve" | "refer" | "decline" | "signal" | "warn";
}) {
  const styles: Record<string, string> = {
    neutral: "bg-mist-100 text-mist-700",
    approve: "bg-emerald-50 text-approve",
    refer: "bg-amber-50 text-refer",
    decline: "bg-red-50 text-decline",
    signal: "bg-mist-100 text-signal",
    warn: "bg-amber-50 text-refer",
  };
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold", styles[tone])}>
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-mist-200 pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="label-caps text-signal">{eyebrow}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 md:text-[28px]">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-mist-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  children,
  action,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel", className)}>
      {title ? (
        <div className="flex items-center justify-between border-b border-mist-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function SimpleTable({
  columns,
  rows,
}: {
  columns: Array<{ key: string; label: string; align?: "left" | "right" }>;
  rows: Array<Record<string, React.ReactNode>>;
}) {
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-mist-200 text-mist-500">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em]",
                  c.align === "right" && "text-right",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-mist-100 last:border-0">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn("px-3 py-2.5 text-ink-800", c.align === "right" && "text-right mono-num")}
                >
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
