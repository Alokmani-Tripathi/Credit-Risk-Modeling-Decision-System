import { PageHeader, Panel, SimpleTable } from "@/components/ui/primitives";
import { POLICY } from "@/lib/decision-engine";
import { pct } from "@/lib/format";

export default function PolicyPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Decide · Policy"
        title="Underwriting policy overlay"
        description="Statistical PD is combined with hard cuts and auto-approve bands. Edit via config in the Python platform; mirrored here for operators."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Decision thresholds">
          <SimpleTable
            columns={[
              { key: "rule", label: "Rule" },
              { key: "value", label: "Value", align: "right" },
            ]}
            rows={[
              { rule: "Auto-approve max PD", value: pct(POLICY.approve_pd) },
              { rule: "Decline / refer PD floor", value: pct(POLICY.refer_pd) },
              { rule: "Auto-approve min FICO", value: String(POLICY.min_fico_approve) },
              { rule: "Auto-approve max DTI", value: String(POLICY.max_dti_approve) },
              { rule: "Hard-cut FICO", value: String(POLICY.hard_cut_fico) },
              { rule: "Hard-cut DTI", value: String(POLICY.hard_cut_dti) },
              { rule: "Assumed LGD", value: pct(POLICY.lgd, 0) },
            ]}
          />
        </Panel>
        <Panel title="Risk-based pricing spreads (bps)">
          <SimpleTable
            columns={[
              { key: "grade", label: "Grade" },
              { key: "bps", label: "Spread (bps)", align: "right" },
            ]}
            rows={Object.entries(POLICY.spreads).map(([grade, bps]) => ({ grade, bps }))}
          />
        </Panel>
      </div>
    </div>
  );
}
