"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, MetricCard, Badge, SimpleTable } from "@/components/ui/primitives";
import { defaultApplicant, scoreApplicant, type Applicant, type DecisionResult } from "@/lib/decision-engine";
import { money, pct } from "@/lib/format";
import { cn } from "@/lib/cn";

type FieldDef = {
  key: keyof Applicant;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
};

const FIELD_GROUPS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: "Loan Details",
    fields: [
      { key: "loan_amnt", label: "Loan amount", min: 1000, max: 40000, step: 500, suffix: "$" },
    ],
  },
  {
    title: "Borrower Profile",
    fields: [
      { key: "annual_inc", label: "Annual income", min: 10000, max: 500000, step: 1000, suffix: "$" },
      { key: "emp_length", label: "Employment length", min: 0, max: 10, step: 1, suffix: "yrs" },
    ],
  },
  {
    title: "Credit Score & Debt",
    fields: [
      { key: "fico_range_low", label: "FICO score", min: 610, max: 850, step: 1 },
      { key: "dti", label: "Debt-to-income", min: 0, max: 50, step: 0.1, suffix: "%" },
      { key: "mort_acc", label: "Mortgage accounts", min: 0, max: 15, step: 1 },
    ],
  },
  {
    title: "Credit History",
    fields: [
      { key: "acc_open_past_24mths", label: "Accounts opened (24m)", min: 0, max: 25, step: 1 },
      { key: "num_actv_rev_tl", label: "Active revolving TLs", min: 0, max: 25, step: 1 },
      { key: "mths_since_recent_inq", label: "Months since inquiry", min: 0, max: 36, step: 1 },
      { key: "mths_since_recent_bc", label: "Months since bankcard", min: 0, max: 120, step: 1 },
      { key: "mo_sin_old_rev_tl_op", label: "Oldest revolving (months)", min: 12, max: 600, step: 1 },
      { key: "mo_sin_rcnt_tl", label: "Recent trade (months)", min: 0, max: 120, step: 1 },
    ],
  },
  {
    title: "Balances & Limits",
    fields: [
      { key: "avg_cur_bal", label: "Average current balance", min: 0, max: 250000, step: 500, suffix: "$" },
      { key: "total_bc_limit", label: "Total bankcard limit", min: 0, max: 300000, step: 500, suffix: "$" },
    ],
  },
];

function InputField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-mist-600">{field.label}</span>
        {field.suffix && <span className="text-[11px] text-mist-400">{field.suffix}</span>}
      </div>
      <input
        type="number"
        className="w-full rounded-lg border border-mist-200 bg-mist-50/50 px-3 py-2.5 text-sm font-medium text-ink-900 mono-num transition-colors focus:border-signal focus:bg-white focus:outline-none focus:ring-2 focus:ring-signal/20"
        value={value}
        min={field.min}
        max={field.max}
        step={field.step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export default function DecisionEnginePage() {
  const [applicant, setApplicant] = useState<Applicant>(defaultApplicant());
  const [scorecard, setScorecard] = useState<any>(null);
  const [woeBins, setWoeBins] = useState<any>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/artifacts/scorecard.json").then((r) => r.json()),
      fetch("/artifacts/woe_bins.json").then((r) => r.json()),
    ]).then(([sc, woe]) => {
      setScorecard(sc);
      setWoeBins(woe);
      setResult(scoreApplicant(defaultApplicant(), sc, woe));
    });
  }, []);

  const tone = result?.decision === "APPROVE" ? "approve" : result?.decision === "REFER" ? "refer" : "decline";

  function updateField<K extends keyof Applicant>(key: K, value: Applicant[K]) {
    setApplicant((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }

  function handleScore() {
    if (scorecard && woeBins) {
      setResult(scoreApplicant(applicant, scorecard, woeBins));
      setHasChanges(false);
    }
  }

  function handleReset() {
    const defaults = defaultApplicant();
    setApplicant(defaults);
    if (scorecard && woeBins) {
      setResult(scoreApplicant(defaults, scorecard, woeBins));
    }
    setHasChanges(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Decide · Phase 12"
        title="Credit decision engine"
        description="Scorecard PD with policy overlay: approve / refer / decline, limit suggestion, risk-based spread, and point contributions."
      />
      <div className="grid gap-6 xl:grid-cols-[440px_1fr]">
        {/* LEFT PANEL — Application form */}
        <div>
          <Panel title="Application inputs">
            <div className="space-y-6">
              {/* Loan Details + Term */}
              <fieldset className="space-y-3">
                <legend className="mb-1 border-b border-mist-100 pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-signal">
                  Loan Details
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <InputField
                    field={{ key: "loan_amnt", label: "Loan amount", min: 1000, max: 40000, step: 500, suffix: "$" }}
                    value={Number(applicant.loan_amnt)}
                    onChange={(v) => updateField("loan_amnt", v)}
                  />
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] font-medium text-mist-600">Term</span>
                      <span className="text-[11px] text-mist-400">months</span>
                    </div>
                    <select
                      className="w-full rounded-lg border border-mist-200 bg-mist-50/50 px-3 py-2.5 text-sm font-medium text-ink-900 transition-colors focus:border-signal focus:bg-white focus:outline-none focus:ring-2 focus:ring-signal/20"
                      value={applicant.term}
                      onChange={(e) => updateField("term", Number(e.target.value))}
                    >
                      <option value={36}>36 months</option>
                      <option value={60}>60 months</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              {/* Borrower Profile */}
              <fieldset className="space-y-3">
                <legend className="mb-1 border-b border-mist-100 pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-signal">
                  Borrower Profile
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <InputField
                    field={{ key: "annual_inc", label: "Annual income", min: 10000, max: 500000, step: 1000, suffix: "$" }}
                    value={Number(applicant.annual_inc)}
                    onChange={(v) => updateField("annual_inc", v)}
                  />
                  <InputField
                    field={{ key: "emp_length", label: "Employment length", min: 0, max: 10, step: 1, suffix: "yrs" }}
                    value={Number(applicant.emp_length)}
                    onChange={(v) => updateField("emp_length", v)}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[13px] font-medium text-mist-600">Home ownership</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(["MORTGAGE", "RENT", "OWN"] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateField("home_ownership", opt)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                          applicant.home_ownership === opt
                            ? "border-signal bg-signal/10 text-signal ring-1 ring-signal/30"
                            : "border-mist-200 bg-mist-50/50 text-mist-600 hover:border-mist-300 hover:bg-white",
                        )}
                      >
                        {opt.charAt(0) + opt.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </fieldset>

              {/* Credit Score & Debt — force even grid */}
              <fieldset className="space-y-3">
                <legend className="mb-1 border-b border-mist-100 pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-signal">
                  Credit Score & Debt
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <InputField
                    field={{ key: "fico_range_low", label: "FICO score", min: 610, max: 850, step: 1 }}
                    value={Number(applicant.fico_range_low)}
                    onChange={(v) => updateField("fico_range_low", v)}
                  />
                  <InputField
                    field={{ key: "dti", label: "Debt-to-income", min: 0, max: 50, step: 0.1, suffix: "%" }}
                    value={Number(applicant.dti)}
                    onChange={(v) => updateField("dti", v)}
                  />
                  <InputField
                    field={{ key: "mort_acc", label: "Mortgage accounts", min: 0, max: 15, step: 1 }}
                    value={Number(applicant.mort_acc)}
                    onChange={(v) => updateField("mort_acc", v)}
                  />
                  <div />
                </div>
              </fieldset>

              {/* Credit History */}
              <fieldset className="space-y-3">
                <legend className="mb-1 border-b border-mist-100 pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-signal">
                  Credit History
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  {FIELD_GROUPS[3].fields.map((field) => (
                    <InputField
                      key={field.key}
                      field={field}
                      value={Number(applicant[field.key])}
                      onChange={(v) => updateField(field.key, v as never)}
                    />
                  ))}
                </div>
              </fieldset>

              {/* Balances & Limits */}
              <fieldset className="space-y-3">
                <legend className="mb-1 border-b border-mist-100 pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-signal">
                  Balances & Limits
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  {FIELD_GROUPS[4].fields.map((field) => (
                    <InputField
                      key={field.key}
                      field={field}
                      value={Number(applicant[field.key])}
                      onChange={(v) => updateField(field.key, v as never)}
                    />
                  ))}
                </div>
              </fieldset>
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex flex-col gap-3 border-t border-mist-200 pt-5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleScore}
                className={cn(
                  "relative rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all",
                  hasChanges
                    ? "bg-signal ring-2 ring-signal/30 hover:bg-ink-600"
                    : "bg-signal hover:bg-ink-600",
                )}
              >
                Score Application
                {hasChanges && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-refer opacity-75" />
                    <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-refer" />
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg border border-mist-300 bg-white px-4 py-2.5 text-sm font-medium text-mist-700 transition hover:border-mist-400 hover:text-ink-900"
              >
                Reset defaults
              </button>
              {hasChanges && (
                <span className="text-[12px] font-medium text-refer">
                  Inputs modified — score to update results
                </span>
              )}
            </div>
          </Panel>
        </div>

        {/* RIGHT PANEL — Results */}
        <div className="space-y-4">
          {/* Decision Hero */}
          <div className={cn(
            "flex items-center gap-4 rounded-xl border p-5 shadow-sm",
            tone === "approve" ? "border-emerald-200 bg-emerald-50/50" :
            tone === "refer" ? "border-amber-200 bg-amber-50/50" :
            "border-red-200 bg-red-50/50",
          )}>
            <div className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white",
              tone === "approve" ? "bg-approve" : tone === "refer" ? "bg-refer" : "bg-decline",
            )}>
              {tone === "approve" ? "\u2713" : tone === "refer" ? "?" : "\u2717"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-mist-500">Decision</div>
              <div className={cn(
                "mt-0.5 text-2xl font-bold tracking-tight",
                tone === "approve" ? "text-approve" : tone === "refer" ? "text-refer" : "text-decline",
              )}>
                {result?.decision || "—"}
              </div>
            </div>
            <div className="hidden text-right sm:block">
              <div className="text-xs text-mist-500">Grade</div>
              <div className="text-xl font-bold text-ink-900">{result?.grade || "—"}</div>
            </div>
            <div className="hidden text-right md:block">
              <div className="text-xs text-mist-500">Score</div>
              <div className="text-xl font-bold mono-num text-ink-900">{result?.score ?? "—"}</div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <MetricCard label="PD" value={pct(result?.pd)} />
            <MetricCard label="Expected loss" value={money(result?.expected_loss)} tone="refer" />
            <MetricCard label="Credit limit" value={money(result?.recommended_limit)} tone="signal" />
            <MetricCard label="Spread" value={`${result?.suggested_spread_bps ?? 0} bps`} />
          </div>

          {/* Decision Detail */}
          <Panel title="Risk assessment">
            <div className="flex flex-wrap gap-2">
              <Badge tone={tone as any}>{result?.decision}</Badge>
              <Badge tone="neutral">LGD {pct(result?.lgd, 0)}</Badge>
              <Badge tone="neutral">UL {money(result?.unexpected_loss)}</Badge>
              <Badge tone="neutral">EAD {money(result?.ead)}</Badge>
            </div>
            {(result?.reasons || []).length > 0 && (
              <div className="mt-4 rounded-lg bg-mist-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-mist-500">Reason codes</div>
                <ul className="mt-2 space-y-1.5">
                  {(result?.reasons || []).map((r) => (
                    <li key={r} className="flex items-start gap-2 text-sm text-mist-700">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-mist-400" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-4 text-[11px] text-mist-400">EL = PD × LGD × EAD · Scorecard path (WoE logistic regression)</p>
          </Panel>

          {/* Point Contributions */}
          <Panel title="Scorecard point contributions">
            <SimpleTable
              columns={[
                { key: "feature", label: "Feature" },
                { key: "woe", label: "WoE", align: "right" },
                { key: "points", label: "Points", align: "right" },
              ]}
              rows={(result?.breakdown || []).slice(0, 10).map((b) => ({
                feature: b.feature.replace(/_/g, " "),
                woe: b.woe.toFixed(3),
                points: b.points.toFixed(1),
              }))}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
