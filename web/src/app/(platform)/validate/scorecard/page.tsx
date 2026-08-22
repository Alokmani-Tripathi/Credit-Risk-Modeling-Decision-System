"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, SimpleTable, MetricCard } from "@/components/ui/primitives";
import { num } from "@/lib/format";

export default function ScorecardPage() {
  const [sc, setSc] = useState<any>({});
  const [active, setActive] = useState("");

  useEffect(() => {
    fetch("/artifacts/scorecard.json")
      .then((r) => r.json())
      .then((d) => {
        setSc(d);
        setActive(d.variables?.[0]?.feature || "");
      });
  }, []);

  const variable = (sc.variables || []).find((v: any) => v.feature === active) || sc.variables?.[0];

  return (
    <div>
      <PageHeader
        eyebrow="Validate · Scorecard"
        title="WoE logistic credit scorecard"
        description="Classic points-based scorecard scaled with PDO / base odds. Used by the Decision Engine for transparent PD and reason codes."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Base points" value={num(sc.base_points, 1)} />
        <MetricCard label="Factor" value={num(sc.factor, 2)} />
        <MetricCard label="PDO" value={String(sc.config?.pdo ?? "—")} />
        <MetricCard label="Base odds" value={String(sc.config?.base_odds ?? "—")} />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-[240px_1fr]">
        <Panel title="Variables">
          <div className="space-y-1">
            {(sc.variables || []).map((v: any) => (
              <button
                key={v.feature}
                onClick={() => setActive(v.feature)}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                  active === v.feature ? "bg-signal text-white" : "hover:bg-mist-50"
                }`}
              >
                {v.feature}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title={variable ? `${variable.feature} · coef ${num(variable.coefficient, 3)}` : "Bins"}>
          <SimpleTable
            columns={[
              { key: "bin", label: "Bin" },
              { key: "n", label: "N", align: "right" },
              { key: "bad", label: "Bad rate", align: "right" },
              { key: "woe", label: "WoE", align: "right" },
              { key: "points", label: "Points", align: "right" },
            ]}
            rows={(variable?.bins || []).map((b: any) => ({
              bin: b.bin,
              n: b.n,
              bad: num(b.bad_rate, 3),
              woe: num(b.woe, 3),
              points: num(b.points, 2),
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
