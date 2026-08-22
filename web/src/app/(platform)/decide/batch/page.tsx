"use client";

import { useMemo, useState } from "react";
import Papa from "./csv";
import { PageHeader, Panel, MetricCard, Badge, SimpleTable } from "@/components/ui/primitives";
import { BarChartCard } from "@/components/charts/Charts";
import { scoreApplicant, toFeatureMap, type Applicant } from "@/lib/decision-engine";
import { featurePsi } from "@/lib/psi";
import { money, pct } from "@/lib/format";

type Row = Record<string, string | number>;

export default function BatchPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [psi, setPsi] = useState<Array<{ feature: string; psi: number; status: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  async function handleFile(file: File) {
    setBusy(true);
    setFileName(file.name);
    const text = await file.text();
    const parsed = Papa.parse(text);
    const [scorecard, woeBins, refCsv] = await Promise.all([
      fetch("/artifacts/scorecard.json").then((r) => r.json()),
      fetch("/artifacts/woe_bins.json").then((r) => r.json()),
      fetch("/artifacts/batch_reference_features.csv").then((r) => r.text()),
    ]);
    const refParsed = Papa.parse(refCsv);
    const scored = parsed.map((r) => {
      const app = rowToApplicant(r);
      const decision = scoreApplicant(app, scorecard, woeBins);
      return { ...r, ...decision };
    });
    const featCols = Object.keys(toFeatureMap(rowToApplicant(parsed[0] || {})));
    const current = parsed.map((r) => toFeatureMap(rowToApplicant(r)));
    const reference = refParsed.map((r) => {
      const obj: Record<string, number> = {};
      for (const c of featCols) obj[c] = Number(r[c]);
      return obj;
    });
    setRows(scored);
    setPsi(featurePsi(reference, current, featCols));
    setBusy(false);
  }

  const mix = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.decision] = (m[r.decision] || 0) + 1;
    return Object.entries(m).map(([decision, count]) => ({ decision, count }));
  }, [rows]);

  const maxPsi = psi[0]?.psi ?? 0;
  const nSig = psi.filter((p) => p.psi >= 0.25).length;
  const status = maxPsi >= 0.25 ? "significant" : maxPsi >= 0.1 ? "shift" : "stable";

  return (
    <div>
      <PageHeader
        eyebrow="Decide · Batch"
        title="Batch scoring & drift"
        description="Upload application CSVs, score with the WoE scorecard + policy engine, and compare feature PSI against the training reference."
        actions={
          <>
            <a className="rounded-md border border-mist-300 bg-white px-3 py-2 text-sm" href="/batch-examples/batch_no_significant_drift.csv">
              Download stable demo
            </a>
            <a className="rounded-md border border-mist-300 bg-white px-3 py-2 text-sm" href="/batch-examples/batch_significant_drift.csv">
              Download drifted demo
            </a>
          </>
        }
      />

      <Panel title="Upload">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="block w-full text-sm"
        />
        <p className="mt-2 text-xs text-mist-500">
          {busy ? "Scoring…" : fileName ? `Loaded ${fileName} · ${rows.length} rows` : "Awaiting CSV"}
        </p>
      </Panel>

      {rows.length > 0 ? (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <MetricCard label="Rows scored" value={String(rows.length)} />
            <MetricCard label="Max feature PSI" value={maxPsi.toFixed(3)} tone={status === "stable" ? "approve" : status === "shift" ? "refer" : "decline"} />
            <MetricCard label="Features PSI ≥ 0.25" value={String(nSig)} />
            <MetricCard label="Drift status" value={status} tone={status === "stable" ? "approve" : status === "shift" ? "refer" : "decline"} />
          </div>
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <Panel title="Decision mix">
              <BarChartCard data={mix} xKey="decision" yKey="count" />
            </Panel>
            <Panel title="Feature PSI vs training reference">
              <BarChartCard
                data={psi.slice(0, 12).map((p) => ({ feature: p.feature, psi: Number(p.psi.toFixed(3)) }))}
                xKey="feature"
                yKey="psi"
                color="#B42318"
              />
            </Panel>
          </div>
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <Panel title="PSI detail">
              <SimpleTable
                columns={[
                  { key: "feature", label: "Feature" },
                  { key: "psi", label: "PSI", align: "right" },
                  { key: "status", label: "Status" },
                ]}
                rows={psi.map((p) => ({
                  feature: p.feature,
                  psi: p.psi.toFixed(3),
                  status: (
                    <Badge tone={p.status === "stable" ? "approve" : p.status === "shift" ? "warn" : "decline"}>
                      {p.status}
                    </Badge>
                  ),
                }))}
              />
            </Panel>
            <Panel title="Scored sample">
              <SimpleTable
                columns={[
                  { key: "loan", label: "Loan" },
                  { key: "fico", label: "FICO" },
                  { key: "pd", label: "PD", align: "right" },
                  { key: "grade", label: "Grade" },
                  { key: "decision", label: "Decision" },
                  { key: "el", label: "EL", align: "right" },
                ]}
                rows={rows.slice(0, 20).map((r) => ({
                  loan: money(Number(r.loan_amnt)),
                  fico: r.fico_range_low,
                  pd: pct(r.pd),
                  grade: r.grade,
                  decision: r.decision,
                  el: money(r.expected_loss),
                }))}
              />
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}

function rowToApplicant(r: Row): Applicant {
  const home = String(r.home_ownership || (Number(r.home_ownership_MORTGAGE) === 1 ? "MORTGAGE" : "RENT"));
  return {
    loan_amnt: Number(r.loan_amnt) || 12000,
    term: Number(r.term) || 36,
    annual_inc: Number(r.annual_inc) || 65000,
    dti: Number(r.dti) || 18,
    fico_range_low: Number(r.fico_range_low) || 690,
    emp_length: Number(r.emp_length) || 5,
    home_ownership: (home as Applicant["home_ownership"]) || "RENT",
    mort_acc: Number(r.mort_acc) || 0,
    acc_open_past_24mths: Number(r.acc_open_past_24mths) || 0,
    num_actv_rev_tl: Number(r.num_actv_rev_tl) || 0,
    mths_since_recent_inq: Number(r.mths_since_recent_inq) || 0,
    mths_since_recent_bc: Number(r.mths_since_recent_bc) || 0,
    mo_sin_old_rev_tl_op: Number(r.mo_sin_old_rev_tl_op) || 120,
    mo_sin_rcnt_tl: Number(r.mo_sin_rcnt_tl) || 6,
    avg_cur_bal: Number(r.avg_cur_bal) || 0,
    tot_cur_bal: Number(r.tot_cur_bal) || 0,
    total_bc_limit: Number(r.total_bc_limit) || 0,
  };
}
