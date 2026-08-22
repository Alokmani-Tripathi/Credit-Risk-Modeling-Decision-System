import { loadArtifactServer } from "@/lib/artifacts";
import { PageHeader, Panel, Badge } from "@/components/ui/primitives";

export default async function RegistryPage() {
  const registry = await loadArtifactServer<any>("model_registry.json");
  const models = registry.models || [];
  const latest = models[models.length - 1] || {};

  return (
    <div>
      <PageHeader
        eyebrow="Governance · Registry"
        title="Model registry"
        description="Versioned champion artifacts, calibration method, and promoted feature set."
      />
      <Panel title="Active release">
        <div className="flex flex-wrap gap-2">
          <Badge tone="signal">Version {latest.version || registry.active_version}</Badge>
          <Badge tone="approve">Champion {registry.champion || latest.champion_model}</Badge>
          <Badge tone="neutral">Calibration {latest.calibration}</Badge>
          <Badge tone="neutral">{latest.n_features} features</Badge>
        </div>
        <pre className="mt-4 overflow-auto rounded-lg bg-mist-50 p-4 text-xs text-ink-800">
          {JSON.stringify(latest, null, 2)}
        </pre>
      </Panel>
    </div>
  );
}
