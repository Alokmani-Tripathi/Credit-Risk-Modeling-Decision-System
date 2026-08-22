import { loadArtifactServer } from "@/lib/artifacts";
import { PageHeader, Panel, SimpleTable, Badge } from "@/components/ui/primitives";
import { BarChartCard } from "@/components/charts/Charts";
import { num, pct } from "@/lib/format";

export default async function FeaturesPage() {
  const [iv, corr, vif, metrics] = await Promise.all([
    loadArtifactServer<Array<{ feature: string; iv: number; n_bins: number; missing_share: number; strength: string }>>("iv_table.json"),
    loadArtifactServer<Array<{ dropped: string; kept: string; abs_corr: number | null }>>("correlation_drops.json"),
    loadArtifactServer<Array<{ feature: string; vif: number }>>("vif.json"),
    loadArtifactServer<{ features: string[]; min_iv?: number; corr_threshold?: number }>("metrics.json"),
  ]);
  const selected = new Set(metrics.features || []);

  return (
    <div>
      <PageHeader
        eyebrow="Build · Phase 5–6"
        title="Feature engineering & selection"
        description="IV ranking with monotone/custom bins, correlation filter (|corr| ≥ 0.8), and VIF multicollinearity checks. Same screened set feeds LR (WoE) and tree models (raw)."
      />
      <Panel title="Information Value">
        <BarChartCard
          data={[...iv]
            .sort((a, b) => a.iv - b.iv)
            .map((r) => ({ feature: r.feature, iv: Number(r.iv.toFixed(4)) }))}
          xKey="feature"
          yKey="iv"
          color="#123049"
        />
        <div className="mt-4">
          <SimpleTable
            columns={[
              { key: "feature", label: "Feature" },
              { key: "iv", label: "IV", align: "right" },
              { key: "bins", label: "Bins", align: "right" },
              { key: "missing", label: "Missing", align: "right" },
              { key: "strength", label: "Strength" },
              { key: "in", label: "In model" },
            ]}
            rows={iv.map((r) => ({
              feature: r.feature,
              iv: num(r.iv, 4),
              bins: r.n_bins,
              missing: pct(r.missing_share),
              strength: r.strength,
              in: selected.has(r.feature) ? <Badge tone="approve">Yes</Badge> : <Badge>No</Badge>,
            }))}
          />
        </div>
      </Panel>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Panel title="Correlation drops">
          <SimpleTable
            columns={[
              { key: "dropped", label: "Dropped" },
              { key: "kept", label: "Kept" },
              { key: "corr", label: "|corr|", align: "right" },
            ]}
            rows={corr.map((r) => ({
              dropped: r.dropped,
              kept: r.kept,
              corr: r.abs_corr == null ? "—" : num(r.abs_corr, 3),
            }))}
          />
        </Panel>
        <Panel title="VIF">
          <SimpleTable
            columns={[
              { key: "feature", label: "Feature" },
              { key: "vif", label: "VIF", align: "right" },
            ]}
            rows={vif.map((r) => ({ feature: r.feature, vif: num(r.vif, 2) }))}
          />
        </Panel>
      </div>
    </div>
  );
}
