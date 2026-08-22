import { loadArtifactServer } from "@/lib/artifacts";
import { PageHeader, Panel, SimpleTable, MetricCard, Badge } from "@/components/ui/primitives";
import { BarChartCard } from "@/components/charts/Charts";
import { pct, int } from "@/lib/format";

export default async function DataQualityPage() {
  const dq = await loadArtifactServer<{
    train_target: { n: number; default_rate: number; goods: number; bads: number };
    test_target: { n: number; default_rate: number };
    missingness_train: Array<{ feature: string; missing_rate: number }>;
    outliers_train: Array<{ feature: string; outlier_rate_iqr: number }>;
    psi_train_vs_test: Array<{ feature: string; psi_train_vs_test: number; status: string }>;
    leakage_flags: Array<{ column: string; reason: string }>;
  }>("data_quality.json");

  const psi = [...(dq.psi_train_vs_test || [])].sort((a, b) => b.psi_train_vs_test - a.psi_train_vs_test);

  return (
    <div>
      <PageHeader
        eyebrow="Build · Phase 4"
        title="Data quality & exploratory analysis"
        description="Missingness, outliers, leakage screening, and population stability between train and later vintages."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Train n" value={int(dq.train_target.n)} />
        <MetricCard label="Train DR" value={pct(dq.train_target.default_rate)} />
        <MetricCard label="Test n" value={int(dq.test_target.n)} />
        <MetricCard label="Test DR" value={pct(dq.test_target.default_rate)} />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="PSI train → test">
          <BarChartCard
            data={psi.slice(0, 12).map((r) => ({ feature: r.feature, psi: Number(r.psi_train_vs_test.toFixed(3)) }))}
            xKey="feature"
            yKey="psi"
          />
        </Panel>
        <Panel title="PSI detail">
          <SimpleTable
            columns={[
              { key: "feature", label: "Feature" },
              { key: "psi", label: "PSI", align: "right" },
              { key: "status", label: "Status" },
            ]}
            rows={psi.map((r) => ({
              feature: r.feature,
              psi: r.psi_train_vs_test.toFixed(3),
              status: (
                <Badge tone={r.status === "stable" ? "approve" : r.status === "shift" ? "warn" : "decline"}>
                  {r.status}
                </Badge>
              ),
            }))}
          />
        </Panel>
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Missingness (train)">
          <SimpleTable
            columns={[
              { key: "feature", label: "Feature" },
              { key: "missing", label: "Missing", align: "right" },
            ]}
            rows={(dq.missingness_train || []).slice(0, 15).map((r) => ({
              feature: r.feature,
              missing: pct(r.missing_rate),
            }))}
          />
        </Panel>
        <Panel title="Leakage flags">
          {(dq.leakage_flags || []).length === 0 ? (
            <p className="text-sm text-mist-600">No residual leakage columns flagged in the current analytical base table.</p>
          ) : (
            <SimpleTable
              columns={[
                { key: "column", label: "Column" },
                { key: "reason", label: "Reason" },
              ]}
              rows={dq.leakage_flags.map((r) => ({ column: r.column, reason: r.reason }))}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
