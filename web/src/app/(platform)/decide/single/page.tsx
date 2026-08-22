"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, Panel, MetricCard, Badge, SimpleTable } from "@/components/ui/primitives";
import { defaultApplicant, scoreApplicant, type Applicant, type DecisionResult } from "@/lib/decision-engine";
import { money, pct } from "@/lib/format";

export default function DecisionEnginePage() {
  const [applicant, setApplicant] = useState<Applicant>(defaultApplicant());
  const [scorecard, setScorecard] = useState<any>(null);
  const [woeBins, setWoeBins] = useState<any>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);

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

  function update<K extends keyof Applicant>(key: K, value: Applicant[K]) {
    const next = { ...applicant, [key]: value };
    setApplicant(next);
    if (scorecard && woeBins) setResult(scoreApplicant(next, scorecard, woeBins));
  }

  const fields = useMemo(
    () =>
      [
        ["loan_amnt", "Loan amount", 1000, 40000, 500],
        ["annual_inc", "Annual income", 10000, 500000, 1000],
        ["dti", "DTI", 0, 50, 0.1],
        ["fico_range_low", "FICO", 610, 850, 1],
        ["emp_length", "Employment length", 0, 10, 1],
        ["mort_acc", "Mortgage accounts", 0, 15, 1],
        ["acc_open_past_24mths", "Accounts opened 24m", 0, 25, 1],
        ["num_actv_rev_tl", "Active revolving", 0, 25, 1],
        ["mths_since_recent_inq", "Months since inquiry", 0, 36, 1],
        ["mths_since_recent_bc", "Months since bankcard", 0, 120, 1],
        ["mo_sin_old_rev_tl_op", "Oldest revolving (m)", 12, 600, 1],
        ["mo_sin_rcnt_tl", "Recent trade (m)", 0, 120, 1],
        ["avg_cur_bal", "Avg current balance", 0, 250000, 500],
        ["total_bc_limit", "Bankcard limit", 0, 300000, 500],
      ] as Array<[keyof Applicant, string, number, number, number]>,
    [],
  );

  return (
    <div>
      <PageHeader
        eyebrow="Decide · Phase 12"
        title="Credit decision engine"
        description="Scorecard PD with policy overlay: approve / refer / decline, limit suggestion, risk-based spread, and point contributions."
      />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Panel title="Applicant inputs">
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-mist-500">Term</span>
              <select
                className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2"
                value={applicant.term}
                onChange={(e) => update("term", Number(e.target.value))}
              >
                <option value={36}>36 months</option>
                <option value={60}>60 months</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-mist-500">Home ownership</span>
              <select
                className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2"
                value={applicant.home_ownership}
                onChange={(e) => update("home_ownership", e.target.value as Applicant["home_ownership"])}
              >
                <option value="MORTGAGE">Mortgage</option>
                <option value="RENT">Rent</option>
                <option value="OWN">Own</option>
              </select>
            </label>
            {fields.map(([key, label, min, max, step]) => (
              <label key={key} className="block text-sm">
                <span className="text-mist-500">{label}</span>
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2 mono-num"
                  value={Number(applicant[key])}
                  min={min}
                  max={max}
                  step={step}
                  onChange={(e) => update(key, Number(e.target.value) as never)}
                />
              </label>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
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
                <li key={r}>• {r}</li>
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
