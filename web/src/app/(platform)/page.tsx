import Link from "next/link";
import { loadArtifactServer } from "@/lib/artifacts";
import { LIFECYCLE } from "@/lib/nav";
import { int, num, shortDate } from "@/lib/format";
import { Badge, MetricCard, PageHeader, Panel, SimpleTable } from "@/components/ui/primitives";

type Summary = {
  champion: string;
  calibration: string;
  n_features: number;
  oot_auc: number;
  monitoring_vintages: number;
  alerts: number;
  source: string;
};

type Metrics = {
  n_rows: number;
  n_train: number;
  n_test: number;
  champion: string;
  train_start?: string;
  train_end?: string;
  test_start?: string;
  test_end?: string;
  features: string[];
};

export default async function OverviewPage() {
  const [summary, metrics, monitoring] = await Promise.all([
    loadArtifactServer<Summary>("platform_summary.json"),
    loadArtifactServer<Metrics>("metrics.json"),
    loadArtifactServer<{ alerts?: unknown[] }>("monitoring.json"),
  ]);

  const alertCount = monitoring.alerts?.length ?? summary.alerts;

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Credit risk lifecycle command center"
        description="Industry flow from business definition through monitoring. Models are trained on Lending Club accepted loans with leakage-safe application-time features."
        actions={
          <>
            <Link href="/decide/single" className="btn-primary">
              Score applicant
            </Link>
            <Link href="/decide/batch" className="btn-secondary">
              Batch & drift
            </Link>
            <Link href="/monitor/alerts" className="btn-secondary">
              View alerts
            </Link>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Portfolio loans" value={int(metrics.n_rows)} hint={summary.source} />
        <MetricCard label="Champion" value={summary.champion} tone="signal" hint={`${summary.n_features} features`} />
        <MetricCard label="OOT ROC-AUC" value={num(summary.oot_auc)} hint="Later vintages holdout" />
        <MetricCard label="Calibration" value={summary.calibration} />
        <MetricCard label="Open alerts" value={String(alertCount)} tone={alertCount ? "refer" : "approve"} hint={`${summary.monitoring_vintages} vintages`} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Lifecycle map">
          <SimpleTable
            columns={[
              { key: "phase", label: "Phase" },
              { key: "name", label: "Step" },
              { key: "workspace", label: "Workspace" },
              { key: "status", label: "Status" },
            ]}
            rows={LIFECYCLE.map((p) => ({
              phase: String(p.phase).padStart(2, "0"),
              name: p.name,
              workspace: p.workspace,
              status: <Badge tone="approve">Live</Badge>,
            }))}
          />
        </Panel>
        <Panel title="Validation window">
          <div className="space-y-4 text-sm">
            <div>
              <div className="label-caps">Train</div>
              <div className="mt-1 font-medium text-ink-900">
                {shortDate(metrics.train_start)} → {shortDate(metrics.train_end)}
              </div>
              <div className="text-mist-500">{int(metrics.n_train)} loans</div>
            </div>
            <div>
              <div className="label-caps">Out-of-time test</div>
              <div className="mt-1 font-medium text-ink-900">
                {shortDate(metrics.test_start)} → {shortDate(metrics.test_end)}
              </div>
              <div className="text-mist-500">{int(metrics.n_test)} loans</div>
            </div>
            <div className="rounded-lg bg-mist-50 p-4 text-mist-700">
              <div className="font-semibold text-ink-900">Fundamental identity</div>
              <div className="mt-1 font-mono text-sm">EL = PD × LGD × EAD</div>
              <p className="mt-2 text-xs leading-5">
                PD from champion model · LGD policy assumption 55% · EAD = loan amount at origination.
              </p>
            </div>
            <div>
              <div className="label-caps mb-2">Selected features</div>
              <div className="flex flex-wrap gap-1.5">
                {metrics.features.map((f) => (
                  <Badge key={f} tone="neutral">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { href: "/build/data-quality", title: "Build", body: "Business definition, DQ/EDA, IV selection, model development." },
          { href: "/validate/evaluation", title: "Validate", body: "Discrimination, calibration, SHAP, scorecard, stress, checklist." },
          { href: "/monitor/dashboard", title: "Monitor", body: "Vintage performance, PSI, prediction drift, alert triage." },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="panel-pad transition hover:border-signal/40">
            <div className="label-caps text-signal">{c.title}</div>
            <div className="mt-2 text-sm leading-6 text-mist-600">{c.body}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
