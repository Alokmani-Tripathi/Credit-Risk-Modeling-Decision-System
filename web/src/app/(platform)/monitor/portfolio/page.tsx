"use client";

import { useState } from "react";
import { BarChartCard, LineChartCard } from "@/components/charts/Charts";
import { Badge, MetricCard, PageHeader, Panel, SimpleTable } from "@/components/ui/primitives";
import { usePortfolio } from "@/components/portfolio/PortfolioProvider";
import { portfolioMetrics, PORTFOLIO_LIMIT } from "@/lib/portfolio";
import { int, money, pct } from "@/lib/format";

export default function PortfolioPage() {
  const { records, snapshots, batches, loading, addBatch, resetPortfolio } = usePortfolio();
  const [message, setMessage] = useState("");
  const metrics = portfolioMetrics(records);

  async function handleUpload(file: File) {
    setMessage("");
    const text = await file.text();
    const rows = text.trim().split(/\r?\n/).length - 1;
    if (rows > PORTFOLIO_LIMIT) {
      setMessage(`Upload rejected: maximum batch size is ${PORTFOLIO_LIMIT} applications.`);
      return;
    }
    try {
      const result = await addBatch(file);
      setMessage(`${result.approved} approved applications added from ${result.scored} scored. ${result.duplicates} duplicate rows skipped.`);
    } catch {
      setMessage("Upload failed. Confirm the CSV has the expected application fields.");
    }
  }

  const trend = snapshots.map((s) => ({ date: s.date, mean_pd: Number((s.mean_pd * 100).toFixed(2)), expected_loss: Math.round(s.expected_loss) }));

  return (
    <div>
      <PageHeader
        eyebrow="Monitor · Portfolio"
        title="Credit portfolio monitoring"
        description="Cumulative portfolio view for approved applications, exposure, credit risk, loss and concentration monitoring."
      />
      <Panel title="Add approved applications" action={<button type="button" onClick={resetPortfolio} className="text-xs font-medium text-mist-500 hover:text-decline">Reset demo portfolio</button>}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-mist-700">Upload up to {PORTFOLIO_LIMIT} applications. Only applications approved by the scorecard policy are added.</p>
            <p className="mt-1 text-xs text-mist-500">Portfolio additions are cumulative and retained in this browser for the current environment.</p>
          </div>
          <label className="btn-primary inline-flex cursor-pointer items-center justify-center whitespace-nowrap">
            Upload batch
            <input type="file" accept=".csv" className="sr-only" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          </label>
        </div>
        {message ? <p className="mt-3 text-sm text-signal">{message}</p> : null}
      </Panel>

      {loading ? <p className="mt-6 text-sm text-mist-500">Loading baseline portfolio...</p> : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Portfolio loans" value={int(metrics.loans)} />
            <MetricCard label="Total EAD" value={money(metrics.ead)} tone="signal" />
            <MetricCard label="Weighted PD" value={pct(metrics.weighted_pd)} />
            <MetricCard label="Expected loss" value={money(metrics.expected_loss)} tone="refer" />
            <MetricCard label="EL rate" value={pct(metrics.el_rate)} tone="refer" />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <MetricCard label="Average loan" value={money(metrics.average_loan)} />
            <MetricCard label="Unexpected loss" value={money(metrics.unexpected_loss)} />
            <MetricCard label="Capital proxy" value={money(metrics.capital_proxy)} tone="decline" />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <MetricCard label="Average score" value={int(metrics.average_score)} />
            <MetricCard label="Average FICO" value={int(metrics.average_fico)} />
            <MetricCard label="High-risk exposure" value={money(metrics.high_risk_exposure)} hint={`${pct(metrics.high_risk_share)} of EAD in grades E–G`} tone="refer" />
          </div>
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <Panel title="Portfolio trend">
              <LineChartCard data={trend} xKey="date" series={[{ key: "mean_pd", color: "#016FD0", name: "Weighted PD %" }, { key: "expected_loss", color: "#B42318", name: "Expected loss" }]} />
            </Panel>
            <Panel title="Exposure by risk grade">
              <BarChartCard data={metrics.by_grade.map((g) => ({ grade: g.grade, ead: Math.round(g.ead) }))} xKey="grade" yKey="ead" color="#016FD0" />
            </Panel>
          </div>
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <Panel title="Grade composition">
              <SimpleTable columns={[{ key: "grade", label: "Grade" }, { key: "loans", label: "Loans", align: "right" }, { key: "ead", label: "EAD", align: "right" }, { key: "pd", label: "Mean PD", align: "right" }]} rows={metrics.by_grade.map((g) => ({ grade: <Badge tone={g.grade <= "C" ? "approve" : g.grade <= "E" ? "warn" : "decline"}>{g.grade}</Badge>, loans: int(g.loans), ead: money(g.ead), pd: pct(g.mean_pd) }))} />
            </Panel>
            <Panel title="Portfolio concentration">
              <SimpleTable columns={[{ key: "band", label: "Segment" }, { key: "fico", label: "FICO loans", align: "right" }, { key: "dti", label: "DTI loans", align: "right" }]} rows={metrics.by_fico.map((band, i) => ({ band: band.band, fico: int(band.loans), dti: int(metrics.by_dti[i]?.loans || 0) }))} />
            </Panel>
          </div>
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <Panel title="Term and ownership mix">
              <SimpleTable columns={[{ key: "segment", label: "Segment" }, { key: "loans", label: "Loans", align: "right" }, { key: "ead", label: "EAD", align: "right" }]} rows={[...metrics.by_term.map((r) => ({ segment: r.term, loans: int(r.loans), ead: money(r.ead) })), ...metrics.by_ownership.map((r) => ({ segment: r.ownership, loans: int(r.loans), ead: money(r.ead) }))]} />
            </Panel>
            <Panel title="Batch audit trail">
              {batches.length === 0 ? <p className="text-sm text-mist-500">Baseline portfolio loaded. New batch activity will appear here.</p> : <SimpleTable columns={[{ key: "batch", label: "Batch" }, { key: "scored", label: "Scored", align: "right" }, { key: "added", label: "Added", align: "right" }, { key: "declined", label: "Rejected", align: "right" }]} rows={batches.slice(-8).reverse().map((b) => ({ batch: b.batch, scored: int(b.scored), added: int(b.added), declined: int(b.declined) }))} />}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}