import { loadArtifactServer } from "@/lib/artifacts";
import { PageHeader, Panel } from "@/components/ui/primitives";

export default async function GovernanceDocsPage() {
  const gov = await loadArtifactServer<any>("governance_pack.json");
  return (
    <div>
      <PageHeader
        eyebrow="Governance · Documentation"
        title="Governance pack"
        description="Purpose, ownership, validation window, limitations, and retrain triggers for auditability."
      />
      <Panel title="Pack">
        <pre className="overflow-auto rounded-lg bg-mist-50 p-4 text-xs leading-5 text-ink-800">
          {JSON.stringify(gov, null, 2)}
        </pre>
      </Panel>
    </div>
  );
}
