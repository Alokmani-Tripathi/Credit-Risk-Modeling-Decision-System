"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, SimpleTable, MetricCard, Badge } from "@/components/ui/primitives";
import { LineChartCard } from "@/components/charts/Charts";
import { num } from "@/lib/format";

export default function CalibrationPage() {
  const [cal, setCal] = useState<any>({});

  useEffect(() => {
    fetch("/artifacts/calibration_pack.json").then((r) => r.json()).then(setCal);
  }, []);

  const methods = cal.methods || {};
  const seriesData = (() => {
    const raw = cal.raw?.reliability || [];
    return raw.map((r: any, i: number) => {
      const row: any = { pred: r.pred_pd, raw: r.actual_dr, perfect: r.pred_pd };
      for (const [name, m] of Object.entries(methods) as any) {
        row[name] = m.reliability?.[i]?.actual_dr ?? null;
      }
      return row;
    });
  })();

  return (
    <div>
      <PageHeader
        eyebrow="Validate · Phase 11"
        title="Probability calibration"
        description="Reliability of predicted PD versus observed default rates. Champion calibrator selected by lowest ECE."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Champion model" value={cal.champion_model || "—"} tone="signal" />
        <MetricCard label="Best method" value={cal.champion_method || "—"} />
        <MetricCard label="Raw ECE" value={num(cal.raw?.ece)} />
        <MetricCard label="Best ECE" value={num(methods[cal.champion_method]?.ece)} tone="approve" />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Reliability diagram" action={<Badge tone="signal">Lower ECE wins</Badge>}>
          <LineChartCard
            data={seriesData}
            xKey="pred"
            series={[
              { key: "raw", color: "#94A3B8", name: "Raw" },
              { key: "platt", color: "#B45309", name: "Platt" },
              { key: "isotonic", color: "#016FD0", name: "Isotonic" },
              { key: "perfect", color: "#CBD5E1", name: "Perfect" },
            ]}
          />
        </Panel>
        <Panel title="Calibration metrics">
          <SimpleTable
            columns={[
              { key: "method", label: "Method" },
              { key: "brier", label: "Brier", align: "right" },
              { key: "ece", label: "ECE", align: "right" },
            ]}
            rows={[
              { method: "raw", brier: num(cal.raw?.brier), ece: num(cal.raw?.ece) },
              ...Object.entries(methods).map(([k, v]: any) => ({
                method: k === cal.champion_method ? `${k} (champion)` : k,
                brier: num(v.brier),
                ece: num(v.ece),
              })),
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
