"use client";

import { useEffect, useState } from "react";
import { BarChartCard } from "@/components/charts/Charts";
import { MetricCard, PageHeader, Panel, SimpleTable } from "@/components/ui/primitives";
import { usePortfolio } from "@/components/portfolio/PortfolioProvider";
import { apiConfig, apiFetch } from "@/lib/api";
import { reverseStress, stressPortfolio } from "@/lib/portfolio";
import { money, pct } from "@/lib/format";

const SCENARIOS = [
  { name: "Baseline", pd: 1, lgd: 0.55, fico: 0, dti: 0 },
  { name: "Mild macro downturn", pd: 1.2, lgd: 0.6, fico: -10, dti: 2 },
  { name: "Severe macro downturn", pd: 1.5, lgd: 0.7, fico: -30, dti: 5 },
  { name: "Combined severe", pd: 2, lgd: 0.8, fico: -50, dti: 8 },
  { name: "High-risk segment", pd: 1.5, lgd: 0.7, fico: 0, dti: 0, grades: ["E", "F", "G"] },
];

export default function StressTestingPage() {
  const { records, loading } = usePortfolio();
  const [scenario, setScenario] = useState(SCENARIOS[2]);
  const [apiResult, setApiResult] = useState<any>(null);
  const [apiError, setApiError] = useState(false);
  const localResult = stressPortfolio(records, scenario.pd, scenario.lgd, scenario.fico, scenario.dti, scenario.grades);

  useEffect(() => {
    if (!apiConfig() || loading) return;
    apiFetch<any>("/api/v1/stress/run", {
      method: "POST",
      body: JSON.stringify({ pd_multiplier: scenario.pd, lgd: scenario.lgd, fico_shift: scenario.fico, dti_shift: scenario.dti, grades: scenario.grades }),
    }).then(setApiResult).then(() => setApiError(false)).catch(() => setApiError(true));
  }, [loading, records, scenario]);

  const result = apiResult
    ? { base: { ...apiResult.baseline, mean_pd: apiResult.baseline.weighted_pd }, stressed: { ...apiResult.stressed, mean_pd: apiResult.stressed.weighted_pd } }
    : localResult;
  const reverse = reverseStress(records, 0.08);
  const comparison = [
    { metric: "Weighted PD", baseline: result.base.weighted_pd, stressed: result.stressed.mean_pd, format: pct },
    { metric: "Expected loss", baseline: result.base.expected_loss, stressed: result.stressed.expected_loss, format: money },
    { metric: "EL rate", baseline: result.base.el_rate, stressed: result.stressed.el_rate, format: pct },
    { metric: "Unexpected loss", baseline: result.base.unexpected_loss, stressed: result.stressed.unexpected_loss, format: money },
    { metric: "Capital proxy", baseline: result.base.capital_proxy, stressed: result.stressed.capital_proxy, format: money },
  ];

  return (
    <div>
      <PageHeader eyebrow="Monitor · Stress testing" title="Stress & scenario testing" description="Apply controlled PD and LGD shocks to the current cumulative approved portfolio and compare loss outcomes." />
      <Panel title="Scenario controls">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm"><span className="text-mist-500">Scenario</span><select className="mt-1 w-full rounded-md border border-mist-300 bg-white px-3 py-2" value={scenario.name} onChange={(e) => setScenario(SCENARIOS.find((s) => s.name === e.target.value) || SCENARIOS[0])}>{SCENARIOS.map((s) => <option key={s.name}>{s.name}</option>)}</select></label>
          <label className="text-sm"><span className="text-mist-500">PD multiplier</span><input className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2" type="number" min="1" max="3" step="0.1" value={scenario.pd} onChange={(e) => setScenario({ ...scenario, pd: Number(e.target.value) || 1, name: "Custom scenario" })} /></label>
          <label className="text-sm"><span className="text-mist-500">Stressed LGD</span><input className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2" type="number" min="0" max="1" step="0.05" value={scenario.lgd} onChange={(e) => setScenario({ ...scenario, lgd: Number(e.target.value) || 0.55, name: "Custom scenario" })} /></label>
          <label className="text-sm"><span className="text-mist-500">FICO shift</span><input className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2" type="number" min="-100" max="0" step="5" value={scenario.fico} onChange={(e) => setScenario({ ...scenario, fico: Number(e.target.value) || 0, name: "Custom scenario" })} /></label>
          <label className="text-sm"><span className="text-mist-500">DTI shift</span><input className="mt-1 w-full rounded-md border border-mist-300 px-3 py-2" type="number" min="0" max="30" step="1" value={scenario.dti} onChange={(e) => setScenario({ ...scenario, dti: Number(e.target.value) || 0, name: "Custom scenario" })} /></label>
        </div>
        <p className="mt-3 text-xs text-mist-500">Stress is applied to the current portfolio using PD uplift and LGD severity. EAD remains constant at origination exposure.</p>
        {apiError ? <p className="mt-2 text-xs text-refer">Backend stress service unavailable; showing local calculation.</p> : null}
      </Panel>

      {loading ? <p className="mt-6 text-sm text-mist-500">Loading portfolio...</p> : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Stressed PD" value={pct(result.stressed.mean_pd)} tone="refer" />
            <MetricCard label="Stressed EL" value={money(result.stressed.expected_loss)} tone="refer" />
            <MetricCard label="EL increase" value={pct(result.stressed.expected_loss / Math.max(result.base.expected_loss, 1) - 1)} tone="decline" />
            <MetricCard label="Stressed UL" value={money(result.stressed.unexpected_loss)} tone="decline" />
            <MetricCard label="Stressed capital" value={money(result.stressed.capital_proxy)} tone="decline" />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <MetricCard label="Scenario severity" value={`${scenario.pd.toFixed(1)}× PD / ${(scenario.lgd * 100).toFixed(0)}% LGD`} tone="refer" />
            <MetricCard label="Reverse stress trigger" value={`${(reverse.multiplier).toFixed(1)}× PD`} hint="Approx. multiplier to reach 8% EL rate" tone="decline" />
            <MetricCard label="Stressed EAD" value={money(result.stressed.ead)} />
          </div>
          <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1.4fr]">
            <Panel title="Scenario impact">
              <BarChartCard data={[{ metric: "Base EL", value: Math.round(result.base.expected_loss) }, { metric: "Stress EL", value: Math.round(result.stressed.expected_loss) }, { metric: "Base capital", value: Math.round(result.base.capital_proxy) }, { metric: "Stress capital", value: Math.round(result.stressed.capital_proxy) }]} xKey="metric" yKey="value" color="#B42318" />
            </Panel>
            <Panel title="Baseline versus stressed portfolio">
              <SimpleTable columns={[{ key: "metric", label: "Metric" }, { key: "baseline", label: "Baseline", align: "right" }, { key: "stressed", label: "Stressed", align: "right" }, { key: "change", label: "Change", align: "right" }]} rows={comparison.map((row) => ({ metric: row.metric, baseline: row.format(row.baseline), stressed: row.format(row.stressed), change: row.format(row.stressed / Math.max(row.baseline, row.format === pct ? 0.000001 : 1) - 1) }))} />
            </Panel>
          </div>
          <div className="mt-6">
            <Panel title="Stress methodology and controls">
              <p className="text-sm leading-6 text-mist-700">Scenarios apply PD uplift, LGD severity, borrower-quality shifts, and optional grade-segment targeting. EAD remains at origination exposure. Reverse stress estimates the PD multiplier required to breach an 8% portfolio expected-loss rate.</p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}