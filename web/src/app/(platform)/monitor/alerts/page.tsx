"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, SimpleTable, Badge } from "@/components/ui/primitives";
import { num, pct, int } from "@/lib/format";

export default function AlertsPage() {
  const [mon, setMon] = useState<any>({});
  useEffect(() => {
    fetch("/artifacts/monitoring.json").then((r) => r.json()).then(setMon);
  }, []);
  const alerts = mon.alerts || [];

  return (
    <div>
      <PageHeader
        eyebrow="Monitor · Alerts"
        title="Model degradation alerts"
        description="Triggered when feature PSI, prediction drift, or AUC drop crosses configured thresholds."
      />
      <Panel title={`${alerts.length} open alerts`}>
        {alerts.length === 0 ? (
          <p className="text-sm text-approve">No alert thresholds breached.</p>
        ) : (
          <SimpleTable
            columns={[
              { key: "vintage", label: "Vintage" },
              { key: "reasons", label: "Reasons" },
              { key: "n", label: "N", align: "right" },
              { key: "auc", label: "AUC", align: "right" },
              { key: "psi", label: "Max PSI", align: "right" },
              { key: "dr", label: "DR", align: "right" },
            ]}
            rows={alerts.map((a: any) => ({
              vintage: a.vintage,
              reasons: (
                <div className="flex flex-wrap gap-1">
                  {(a.reasons || []).map((r: string) => (
                    <Badge key={r} tone="warn">
                      {r}
                    </Badge>
                  ))}
                </div>
              ),
              n: int(a.n),
              auc: num(a.auc),
              psi: num(a.max_feature_psi),
              dr: pct(a.default_rate),
            }))}
          />
        )}
      </Panel>
    </div>
  );
}
