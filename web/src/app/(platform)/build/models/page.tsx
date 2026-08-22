"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, SimpleTable, Badge, MetricCard } from "@/components/ui/primitives";
import { LineChartCard } from "@/components/charts/Charts";
import { num } from "@/lib/format";

type EvalPack = Record<
  string,
  {
    roc_auc: number;
    gini: number;
    ks: number;
    pr_auc: number;
    brier: number;
    encoding?: string;
    roc_curve?: { fpr: number[]; tpr: number[] };
  }
>;

const LABELS: Record<string, string> = {
  logistic_regression: "Logistic Regression (WoE)",
  random_forest: "Random Forest",
  xgboost: "XGBoost",
};

export default function ModelsPage() {
  const [ev, setEv] = useState<EvalPack>({});
  const [champion, setChampion] = useState("xgboost");

  useEffect(() => {
    Promise.all([
      fetch("/artifacts/evaluation_pack.json").then((r) => r.json()),
      fetch("/artifacts/metrics.json").then((r) => r.json()),
    ]).then(([e, m]) => {
      setEv(e);
      setChampion(m.champion || "xgboost");
    });
  }, []);

  const rows = Object.keys(LABELS).filter((k) => ev[k]);
  const rocData = (() => {
    const champ = ev[champion]?.roc_curve;
    if (!champ) return [];
    return champ.fpr.map((f, i) => {
      const point: Record<string, number> = { fpr: f, random: f };
      for (const k of rows) {
        const curve = ev[k]?.roc_curve;
        point[k] = curve?.tpr[i] ?? 0;
      }
      return point;
    });
  })();

  return (
    <div>
      <PageHeader
        eyebrow="Build · Phase 7"
        title="Model development & champion comparison"
        description="WoE logistic scorecard baseline versus tree ensembles on the same screened application-time feature set."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {rows.map((k) => (
          <MetricCard
            key={k}
            label={LABELS[k]}
            value={num(ev[k].roc_auc)}
            hint={`KS ${num(ev[k].ks)} · ${ev[k].encoding}`}
            tone={k === champion ? "signal" : "default"}
          />
        ))}
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Holdout metrics" action={champion ? <Badge tone="signal">Champion · {champion}</Badge> : null}>
          <SimpleTable
            columns={[
              { key: "model", label: "Model" },
              { key: "auc", label: "AUC", align: "right" },
              { key: "gini", label: "Gini", align: "right" },
              { key: "ks", label: "KS", align: "right" },
              { key: "pr", label: "PR-AUC", align: "right" },
              { key: "brier", label: "Brier", align: "right" },
            ]}
            rows={rows.map((k) => ({
              model: (
                <span className="inline-flex items-center gap-2">
                  {LABELS[k]}
                  {k === champion ? <Badge tone="signal">Champion</Badge> : null}
                </span>
              ),
              auc: num(ev[k].roc_auc),
              gini: num(ev[k].gini),
              ks: num(ev[k].ks),
              pr: num(ev[k].pr_auc),
              brier: num(ev[k].brier),
            }))}
          />
        </Panel>
        <Panel title="ROC curves (out-of-time)">
          <LineChartCard
            data={rocData}
            xKey="fpr"
            series={[
              { key: "logistic_regression", color: "#1B4060", name: "LR" },
              { key: "random_forest", color: "#B45309", name: "RF" },
              { key: "xgboost", color: "#016FD0", name: "XGB" },
              { key: "random", color: "#94A3B8", name: "Random" },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
