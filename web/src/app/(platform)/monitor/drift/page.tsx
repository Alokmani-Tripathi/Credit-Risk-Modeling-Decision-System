"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, SimpleTable, Badge } from "@/components/ui/primitives";
import { BarChartCard } from "@/components/charts/Charts";
import { num } from "@/lib/format";

export default function DriftPage() {
  const [mon, setMon] = useState<any>({});
  useEffect(() => {
    fetch("/artifacts/monitoring.json").then((r) => r.json()).then(setMon);
  }, []);
  const psi = mon.latest_feature_psi || [];

  return (
    <div>
      <PageHeader
        eyebrow="Monitor · Drift"
        title="Feature & prediction drift deep-dive"
        description="Latest cohort versus training/reference distribution using PSI."
      />
      <Panel title="Latest feature PSI">
        <BarChartCard
          data={psi.slice(0, 16).map((p: any) => ({ feature: p.feature, psi: Number(p.psi.toFixed(3)) }))}
          xKey="feature"
          yKey="psi"
          color="#B45309"
        />
        <div className="mt-4">
          <SimpleTable
            columns={[
              { key: "feature", label: "Feature" },
              { key: "psi", label: "PSI", align: "right" },
              { key: "status", label: "Status" },
            ]}
            rows={psi.map((p: any) => ({
              feature: p.feature,
              psi: num(p.psi),
              status: (
                <Badge tone={p.status === "stable" ? "approve" : p.status === "shift" ? "warn" : "decline"}>
                  {p.status}
                </Badge>
              ),
            }))}
          />
        </div>
      </Panel>
    </div>
  );
}
