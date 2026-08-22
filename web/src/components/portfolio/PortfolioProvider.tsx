"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Papa from "@/app/(platform)/decide/batch/csv";
import { apiConfig, apiFetch } from "@/lib/api";
import { portfolioMetrics, rowToApplicant, scorePortfolioRows, type BatchSummary, type PortfolioRecord, type PortfolioSnapshot } from "@/lib/portfolio";

type PortfolioContextValue = {
  records: PortfolioRecord[];
  snapshots: PortfolioSnapshot[];
  batches: BatchSummary[];
  loading: boolean;
  addBatch: (file: File) => Promise<{ scored: number; approved: number; duplicates: number }>;
  resetPortfolio: () => void;
};

const Context = createContext<PortfolioContextValue | null>(null);
const STORAGE = "credit-risk-portfolio-v1";

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<PortfolioRecord[]>([]);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (apiConfig()) {
      Promise.all([
        apiFetch<{ positions: PortfolioRecord[] }>("/api/v1/portfolio/positions"),
        apiFetch<{ snapshots: PortfolioSnapshot[] }>("/api/v1/portfolio/snapshots"),
        apiFetch<{ events: Array<{ action: string; source_batch?: string; scored?: number; added?: number; created_at: string }> }>("/api/v1/audit/events"),
      ]).then(([positions, snapshotData, audit]) => {
        setRecords(positions.positions || []);
        setSnapshots(snapshotData.snapshots || []);
        setBatches((audit.events || []).filter((event) => event.action === "portfolio_batch_added").map((event) => ({
          batch: event.source_batch || "API batch",
          uploaded_at: event.created_at,
          scored: event.scored || 0,
          approved: event.added || 0,
          declined: (event.scored || 0) - (event.added || 0),
          duplicates: 0,
          added: event.added || 0,
        })));
        setLoading(false);
      }).catch(() => setLoading(false));
      return;
    }
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        const data = JSON.parse(saved);
        setRecords(Array.isArray(data.records) ? data.records : []);
        setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
        setBatches(Array.isArray(data.batches) ? data.batches : []);
        setLoading(false);
        return;
      }
    } catch {
      localStorage.removeItem(STORAGE);
    }
    Promise.all([
      fetch("/artifacts/scorecard.json").then((r) => r.json()),
      fetch("/artifacts/woe_bins.json").then((r) => r.json()),
      fetch("/batch-examples/training_reference_sample.csv").then((r) => r.text()),
    ]).then(([scorecard, woeBins, csv]) => {
      const seeded = scorePortfolioRows(Papa.parse(csv), scorecard, woeBins, "default-portfolio").records;
      setRecords(seeded);
      setSnapshots([{ date: new Date().toISOString().slice(0, 10), ...snapshotFor(seeded) }]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) localStorage.setItem(STORAGE, JSON.stringify({ records, snapshots, batches }));
  }, [loading, records, snapshots, batches]);

  async function addBatch(file: File) {
    if (apiConfig()) {
      const rows = Papa.parse(await file.text());
      const response = await apiFetch<{ approved: number; added: PortfolioRecord[]; portfolio: PortfolioRecord }>("/api/v1/portfolio/batches", {
        method: "POST",
        body: JSON.stringify({ applications: rows.map(rowToApplicant), source_batch: file.name }),
      });
      setRecords(response.added ? [...records, ...response.added] : records);
      return { scored: rows.length, approved: response.approved, duplicates: 0 };
    }
    const [scorecard, woeBins] = await Promise.all([
      fetch("/artifacts/scorecard.json").then((r) => r.json()),
      fetch("/artifacts/woe_bins.json").then((r) => r.json()),
    ]);
    const result = scorePortfolioRows(Papa.parse(await file.text()), scorecard, woeBins, file.name);
    const existing = new Set(records.map((r) => `${r.loan_amnt}|${r.annual_inc}|${r.fico_range_low}|${r.dti}|${r.term}`));
    const additions = result.records.filter((r) => !existing.has(`${r.loan_amnt}|${r.annual_inc}|${r.fico_range_low}|${r.dti}|${r.term}`));
    const next = [...records, ...additions];
    setRecords(next);
    setSnapshots((current) => [...current, { date: new Date().toISOString().slice(0, 10), ...snapshotFor(next) }]);
    setBatches((current) => [...current, { batch: file.name, uploaded_at: new Date().toISOString(), scored: result.scored, approved: result.approved, declined: result.scored - result.approved - result.duplicates, duplicates: result.duplicates, added: additions.length }]);
    return { ...result, approved: additions.length };
  }

  function resetPortfolio() {
    localStorage.removeItem(STORAGE);
    window.location.reload();
  }

  return <Context.Provider value={{ records, snapshots, batches, loading, addBatch, resetPortfolio }}>{children}</Context.Provider>;
}

function snapshotFor(records: PortfolioRecord[]) {
  const metrics = portfolioMetrics(records);
  return { loans: metrics.loans, ead: metrics.ead, mean_pd: metrics.weighted_pd, expected_loss: metrics.expected_loss, approval_rate: 1 };
}

export function usePortfolio() {
  const value = useContext(Context);
  if (!value) throw new Error("usePortfolio must be used within PortfolioProvider");
  return value;
}