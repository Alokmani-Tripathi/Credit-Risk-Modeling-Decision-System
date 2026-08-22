import { loadArtifactServer } from "@/lib/artifacts";
import { PageHeader, Panel, SimpleTable, MetricCard } from "@/components/ui/primitives";
import { BarChartCard } from "@/components/charts/Charts";
import { money, num, pct } from "@/lib/format";

export default async function QuantificationPage() {
  const q = await loadArtifactServer<any>("quantification.json");
  const cal = q.calibrated_pd || {};
  const stress = q.stress || [];
  const grades = cal.by_grade || [];

  return (
    <div>
      <PageHeader
        eyebrow="Validate · Phase 10"
        title="PD / LGD / EAD quantification"
        description="Expected loss on the out-of-time book using calibrated PD and policy LGD, plus stress multipliers."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Mean PD (cal)" value={pct(cal.mean_pd)} />
        <MetricCard label="Total EAD" value={money(cal.total_ead)} />
        <MetricCard label="Total EL" value={money(cal.total_el)} />
        <MetricCard label="EL rate" value={pct(cal.el_rate)} tone="refer" />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="EL by risk grade">
          <BarChartCard
            data={grades.map((g: any) => ({ grade: g.grade, el: Math.round(g.el) }))}
            xKey="grade"
            yKey="el"
          />
        </Panel>
        <Panel title="Stress scenarios">
          <SimpleTable
            columns={[
              { key: "scenario", label: "Scenario" },
              { key: "pdm", label: "PD ×", align: "right" },
              { key: "lgd", label: "LGD", align: "right" },
              { key: "el", label: "Total EL", align: "right" },
              { key: "delta", label: "vs baseline", align: "right" },
            ]}
            rows={stress.map((s: any) => ({
              scenario: s.scenario,
              pdm: num(s.pd_multiplier, 2),
              lgd: pct(s.lgd, 0),
              el: money(s.total_el),
              delta: pct(s.el_vs_baseline, 1),
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
