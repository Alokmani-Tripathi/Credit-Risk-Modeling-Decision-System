import { loadArtifactServer } from "@/lib/artifacts";
import { PageHeader, Panel, SimpleTable, Badge } from "@/components/ui/primitives";
import { pct } from "@/lib/format";

export default async function BusinessPage() {
  const biz = await loadArtifactServer<Record<string, unknown>>("business_definition.json");
  const strategy = (biz.decision_strategy || {}) as Record<string, number>;
  const kpis = (biz.kpis || []) as string[];

  return (
    <div>
      <PageHeader
        eyebrow="Build · Phase 1–2"
        title="Business strategy & target definition"
        description="Risk appetite, default outcome definition, and decision policy that constrain model use."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Product & objective">
          <dl className="space-y-3 text-sm">
            {[
              ["Product", biz.product],
              ["Objective", biz.objective],
              ["Population", biz.population],
              ["Risk appetite", biz.risk_appetite],
              ["Default", biz.default_definition],
              ["Good", biz.good_definition],
              ["Observation window", biz.observation_window],
              ["Performance window", biz.performance_window],
              ["Reject inference", biz.reject_inference],
            ].map(([k, v]) => (
              <div key={String(k)} className="grid grid-cols-[160px_1fr] gap-3 border-b border-mist-100 pb-2">
                <dt className="text-mist-500">{String(k)}</dt>
                <dd className="font-medium text-ink-900">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <div className="space-y-4">
          <Panel title="Decision strategy">
            <SimpleTable
              columns={[
                { key: "rule", label: "Rule" },
                { key: "value", label: "Value", align: "right" },
              ]}
              rows={[
                { rule: "Auto-approve max PD", value: pct(strategy.approve_pd) },
                { rule: "Decline min PD", value: pct(strategy.refer_pd) },
                { rule: "Hard-cut FICO", value: String(strategy.hard_cut_fico) },
                { rule: "Hard-cut DTI", value: String(strategy.hard_cut_dti) },
              ]}
            />
          </Panel>
          <Panel title="Success KPIs">
            <ul className="space-y-2 text-sm text-mist-700">
              {kpis.map((k) => (
                <li key={k} className="flex items-start gap-2">
                  <Badge tone="signal">KPI</Badge>
                  <span>{k}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-lg bg-mist-50 p-3 font-mono text-sm text-ink-900">
              {String(biz.fundamental_identity)}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
