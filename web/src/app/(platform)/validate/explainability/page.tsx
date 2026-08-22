"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel } from "@/components/ui/primitives";
import { BarChartCard } from "@/components/charts/Charts";

export default function ExplainabilityPage() {
  const [ex, setEx] = useState<any>({});

  useEffect(() => {
    fetch("/artifacts/explainability.json").then((r) => r.json()).then(setEx);
  }, []);

  const xgb = ex.xgboost || {};
  const lr = ex.logistic_regression || {};

  return (
    <div>
      <PageHeader
        eyebrow="Validate · Phase 9"
        title="Explainability & reason codes"
        description="Global drivers for champion trees (SHAP) and WoE-logistic attributions for the scorecard path."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="XGBoost · mean |SHAP|">
          {xgb.error ? (
            <p className="text-sm text-decline">{xgb.error}</p>
          ) : (
            <BarChartCard
              data={(xgb.features || [])
                .slice(0, 15)
                .map((f: string, i: number) => ({ feature: f, importance: Number(xgb.mean_abs_shap[i].toFixed(4)) }))
                .reverse()}
              xKey="feature"
              yKey="importance"
              color="#016FD0"
            />
          )}
        </Panel>
        <Panel title="Logistic WoE · mean |attribution|">
          {lr.error ? (
            <p className="text-sm text-decline">{lr.error}</p>
          ) : (
            <BarChartCard
              data={(lr.features || [])
                .slice(0, 15)
                .map((f: string, i: number) => ({ feature: f, importance: Number(lr.mean_abs_shap[i].toFixed(4)) }))
                .reverse()}
              xKey="feature"
              yKey="importance"
              color="#1B4060"
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
