import { loadArtifactServer } from "@/lib/artifacts";
import { PageHeader, Panel, SimpleTable, Badge } from "@/components/ui/primitives";

export default async function ChecklistPage() {
  const [checks, gov] = await Promise.all([
    loadArtifactServer<Array<{ check: string; pass: boolean; value: unknown }>>("validation_checklist.json"),
    loadArtifactServer<any>("governance_pack.json"),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Validate · Independent review"
        title="Validation checklist & limitations"
        description="Pass/fail gates used before promoting a champion, plus documented model limitations."
      />
      <Panel title="Checklist">
        <SimpleTable
          columns={[
            { key: "check", label: "Check" },
            { key: "pass", label: "Result" },
            { key: "value", label: "Evidence" },
          ]}
          rows={checks.map((c) => ({
            check: c.check,
            pass: c.pass ? <Badge tone="approve">Pass</Badge> : <Badge tone="decline">Fail</Badge>,
            value: typeof c.value === "object" ? JSON.stringify(c.value) : String(c.value),
          }))}
        />
      </Panel>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Limitations">
          <ul className="space-y-2 text-sm text-mist-700">
            {(gov.limitations || []).map((l: string) => (
              <li key={l} className="border-b border-mist-100 pb-2">
                {l}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Retraining triggers">
          <ul className="space-y-2 text-sm text-mist-700">
            {(gov.retraining_triggers || []).map((l: string) => (
              <li key={l} className="border-b border-mist-100 pb-2">
                {l}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
