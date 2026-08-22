"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, MetricCard } from "@/components/ui/primitives";
import { LineChartCard } from "@/components/charts/Charts";
import { pct, int } from "@/lib/format";

export default function MonitorDashboardPage() {
  const [mon, setMon] = useState<any>({});

  useEffect(() => {
    fetch("/artifacts/monitoring.json").then((r) => r.json()).then(setMon);
  }, []);

  const series = (mon.series || []).map((s: any) => ({
    vintage: s.vintage,
    auc: Number(s.auc.toFixed(3)),
    ks: Number(s.ks.toFixed(3)),
    default_rate: Number((s.default_rate * 100).toFixed(2)),
    mean_pd: Number((s.mean_pd * 100).toFixed(2)),
    max_feature_psi: Number(s.max_feature_psi.toFixed(3)),
    score_psi: Number(s.score_psi.toFixed(3)),
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Monitor · Phase 14"
        title="Production monitoring dashboard"
        description="Vintage performance and stability proxies built from out-of-time scored cohorts."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Reference n" value={int(mon.reference_n)} />
        <MetricCard label="Reference DR" value={pct(mon.reference_default_rate)} />
        <MetricCard label="Vintages" value={String(series.length)} />
        <MetricCard label="Open alerts" value={String(mon.alerts?.length || 0)} tone="refer" />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="AUC / KS by vintage">
          <LineChartCard
            data={series}
            xKey="vintage"
            series={[
              { key: "auc", color: "#016FD0", name: "AUC" },
              { key: "ks", color: "#1B4060", name: "KS" },
            ]}
          />
        </Panel>
        <Panel title="Default rate vs mean PD (%)">
          <LineChartCard
            data={series}
            xKey="vintage"
            series={[
              { key: "default_rate", color: "#B42318", name: "Actual DR %" },
              { key: "mean_pd", color: "#016FD0", name: "Mean PD %" },
            ]}
          />
        </Panel>
        <Panel title="PSI trends" className="xl:col-span-2">
          <LineChartCard
            data={series}
            xKey="vintage"
            series={[
              { key: "max_feature_psi", color: "#B45309", name: "Max feature PSI" },
              { key: "score_psi", color: "#1B4060", name: "Score PSI" },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
