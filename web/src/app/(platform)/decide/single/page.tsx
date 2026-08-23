"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, MetricCard, Badge, SimpleTable } from "@/components/ui/primitives";
import { defaultApplicant, scoreApplicant, type Applicant, type DecisionResult } from "@/lib/decision-engine";
import { money, pct } from "@/lib/format";

type FieldDef = [keyof Applicant, string, number, number, number];

const FIELD_GROUPS: Array<{ title: string; icon: string; fields: FieldDef[] }> = [
  {
    title: "Loan Details",
    icon: "💳",
    fields: [
      ["loan_amnt", "Loan amount ($)", 1000, 40000, 500],
    ],
  },
  {
    title: "Borrower Profile",
    icon: "👤",
    fields: [
      ["annual_inc", "Annual income ($)", 10000, 500000, 1000],
      ["emp_length", "Employment length (yrs)", 0, 10, 1],
    ],
  },
  {
    title: "Credit Score & Debt",
    icon: "📊",
    fields: [
      ["fico_range_low", "FICO score", 610, 850, 1],
      ["dti", "Debt-to-income ratio (%)", 0, 50, 0.1],
      ["mort_acc", "Mortgage accounts", 0, 15, 1],
    ],
  },
  {
    title: "Credit History",
    icon: "📅",
    fields: [
      ["acc_open_past_24mths", "Accounts opened (24 months)", 0, 25, 1],
      ["num_actv_rev_tl", "Active revolving accounts", 0, 25, 1],
      ["mths_since_recent_inq", "Months since last inquiry", 0, 36, 1],
      ["mths_since_recent_bc", "Months since last bankcard", 0, 120, 1],
      ["mo_sin_old_rev_tl_op", "Oldest revolving account (months)", 12, 600, 1],
      ["mo_sin_rcnt_tl", "Most recent trade (months)", 0, 120, 1],
    ],
  },
  {
    title: "Balances & Limits",
    icon: "🏦",
    fields: [
      ["avg_cur_bal", "Average current balance ($)", 0, 250000, 500],
      ["total_bc_limit", "Total bankcard limit ($)", 0, 300000, 500],
    ],
  },
];

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
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Panel title="Application inputs">
            <div className="space-y-5">
              {/* Loan & Term group */}
              <fieldset>
                <legend className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-signal">
                  <span>Loan Details</span>
                </legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="text-mist-500">Loan amount ($)</span>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2 mono-num"
                      value={Number(applicant.loan_amnt)}
                      min={1000}
                      max={40000}
                      step={500}
                      onChange={(e) => updateField("loan_amnt", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-mist-500">Term</span>
                    <select
                      className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2"
                      value={applicant.term}
                      onChange={(e) => updateField("term", Number(e.target.value))}
                    >
                      <option value={36}>36 months</option>
                      <option value={60}>60 months</option>
                    </select>
                  </label>
                </div>
              </fieldset>

              {/* Borrower Profile group */}
              <fieldset>
                <legend className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-signal">
                  <span>Borrower Profile</span>
                </legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="text-mist-500">Annual income ($)</span>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2 mono-num"
                      value={Number(applicant.annual_inc)}
                      min={10000}
                      max={500000}
                      step={1000}
                      onChange={(e) => updateField("annual_inc", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-mist-500">Employment (yrs)</span>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2 mono-num"
                      value={Number(applicant.emp_length)}
                      min={0}
                      max={10}
                      step={1}
                      onChange={(e) => updateField("emp_length", Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="text-mist-500">Home ownership</span>
                    <select
                      className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2"
                      value={applicant.home_ownership}
                      onChange={(e) => updateField("home_ownership", e.target.value as Applicant["home_ownership"])}
                    >
                      <option value="MORTGAGE">Mortgage</option>
                      <option value="RENT">Rent</option>
                      <option value="OWN">Own</option>
                    </select>
                  </label>
                </div>
              </fieldset>

              {/* Remaining groups from FIELD_GROUPS */}
              {FIELD_GROUPS.slice(2).map((group) => (
                <fieldset key={group.title}>
                  <legend className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-signal">
                    <span>{group.title}</span>
                  </legend>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {group.fields.map(([key, label, min, max, step]) => (
                      <label key={key} className="block text-sm">
                        <span className="text-mist-500">{label}</span>
                        <input
                          type="number"
                          className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2 mono-num"
                          value={Number(applicant[key])}
                          min={min}
                          max={max}
                          step={step}
                          onChange={(e) => updateField(key, Number(e.target.value) as never)}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex items-center gap-3 border-t border-mist-200 pt-4">
              <button
                type="button"
                onClick={handleScore}
                className="btn-primary relative flex items-center gap-2"
              >
                Score Application
                {hasChanges && (
                  <span className="absolute -right-1 -top-1 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="btn-secondary"
              >
                Reset
              </button>
              {hasChanges && (
                <span className="text-xs text-refer font-medium">Inputs changed — click Score to update</span>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3">
            <MetricCard label="Decision" value={result?.decision || "—"} tone={tone as any} />
            <MetricCard label="PD" value={pct(result?.pd)} />
            <MetricCard label="Grade" value={result?.grade || "—"} />
            <MetricCard label="Score" value={String(result?.score ?? "—")} />
            <MetricCard label="Expected loss" value={money(result?.expected_loss)} />
            <MetricCard label="Limit" value={money(result?.recommended_limit)} tone="signal" />
          </div>
          <Panel title="Decision detail">
            <div className="flex flex-wrap gap-2">
              <Badge tone={tone as any}>{result?.decision}</Badge>
              <Badge tone="neutral">Spread {result?.suggested_spread_bps ?? 0} bps</Badge>
              <Badge tone="neutral">LGD {pct(result?.lgd, 0)}</Badge>
              <Badge tone="neutral">UL {money(result?.unexpected_loss)}</Badge>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-mist-700">
              {(result?.reasons || []).map((r) => (
                <li key={r}>&#8226; {r}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-mist-500">EL = PD × LGD × EAD · Scorecard path (WoE logistic)</p>
          </Panel>
          <Panel title="Top point contributions">
            <SimpleTable
              columns={[
                { key: "feature", label: "Feature" },
                { key: "woe", label: "WoE", align: "right" },
                { key: "points", label: "Points", align: "right" },
              ]}
              rows={(result?.breakdown || []).slice(0, 10).map((b) => ({
                feature: b.feature,
                woe: b.woe.toFixed(3),
                points: b.points.toFixed(2),
              }))}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
