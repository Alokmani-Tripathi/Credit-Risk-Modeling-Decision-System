"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, SimpleTable, MetricCard } from "@/components/ui/primitives";
import { BarChartCard, LineChartCard } from "@/components/charts/Charts";
import { num, pct } from "@/lib/format";

export default function EvaluationPage() {
  const [pack, setPack] = useState<Record<string, any>>({});
  const [model, setModel] = useState("xgboost");

  useEffect(() => {
    fetch("/artifacts/evaluation_pack.json")
      .then((r) => r.json())
      .then((d) => {
        setPack(d);
        if (d.xgboost) setModel("xgboost");
      });
  }, []);

  const ev = pack[model] || {};
  const deciles = (ev.deciles || []).map((d: any) => ({
    decile: d.decile,
    actual_dr: Number((d.actual_dr * 100).toFixed(2)),
    avg_pd: Number((d.avg_pd * 100).toFixed(2)),
    lift: Number(Number(d.lift).toFixed(2)),
  }));
  const gains = (ev.lift_gain || []).map((d: any) => ({
    pop: Number((d.pct_population * 100).toFixed(1)),
    capture: Number((d.cum_capture * 100).toFixed(1)),
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Validate · Phase 8"
        title="Model evaluation"
        description="Discrimination, ranking quality, and threshold trade-offs on out-of-time loans."
      />
      <div className="mb-4 flex gap-2">
        {["logistic_regression", "random_forest", "xgboost"].map((m) => (
          <button
            key={m}
            onClick={() => setModel(m)}
            className={`rounded-md px-3 py-1.5 text-sm ${model === m ? "bg-signal text-white" : "border border-mist-300 bg-white text-ink-900"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="ROC-AUC" value={num(ev.roc_auc)} />
        <MetricCard label="KS" value={num(ev.ks)} />
        <MetricCard label="Gini" value={num(ev.gini)} />
        <MetricCard label="Brier" value={num(ev.brier)} />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Decile actual vs predicted DR (%)">
          <BarChartCard data={deciles} xKey="decile" yKey="actual_dr" />
        </Panel>
        <Panel title="Cumulative gains (% defaults captured)">
          <LineChartCard data={gains} xKey="pop" series={[{ key: "capture", color: "#016FD0", name: "Capture %" }]} />
        </Panel>
      </div>
      <div className="mt-6">
        <Panel title="Decile table">
          <SimpleTable
            columns={[
              { key: "decile", label: "Decile" },
              { key: "n", label: "N", align: "right" },
              { key: "avg_pd", label: "Avg PD", align: "right" },
              { key: "actual_dr", label: "Actual DR", align: "right" },
              { key: "lift", label: "Lift", align: "right" },
              { key: "capture", label: "Cum capture", align: "right" },
            ]}
            rows={(ev.deciles || []).map((d: any) => ({
              decile: d.decile,
              n: d.n,
              avg_pd: pct(d.avg_pd),
              actual_dr: pct(d.actual_dr),
              lift: num(d.lift, 2),
              capture: pct(d.cum_capture),
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
