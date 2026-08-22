import { scoreApplicant, type Applicant, type DecisionResult } from "@/lib/decision-engine";

export const PORTFOLIO_LIMIT = 500;

export type PortfolioRecord = Applicant & {
  portfolio_id: string;
  source_batch: string;
  added_at: string;
  pd: number;
  score: number;
  grade: string;
  decision: DecisionResult["decision"];
  expected_loss: number;
  unexpected_loss: number;
  recommended_limit: number;
};

export type PortfolioSnapshot = {
  date: string;
  loans: number;
  ead: number;
  mean_pd: number;
  expected_loss: number;
  approval_rate: number;
};

export type BatchSummary = {
  batch: string;
  uploaded_at: string;
  scored: number;
  approved: number;
  declined: number;
  duplicates: number;
  added: number;
};

export type PortfolioMetrics = {
  loans: number;
  ead: number;
  average_loan: number;
  mean_pd: number;
  weighted_pd: number;
  lgd: number;
  expected_loss: number;
  el_rate: number;
  unexpected_loss: number;
  capital_proxy: number;
  average_score: number;
  average_fico: number;
  average_dti: number;
  high_risk_exposure: number;
  high_risk_share: number;
  by_grade: Array<{ grade: string; loans: number; ead: number; mean_pd: number; expected_loss: number }>;
  by_fico: Array<{ band: string; loans: number; ead: number }>;
  by_dti: Array<{ band: string; loans: number; ead: number }>;
  by_term: Array<{ term: string; loans: number; ead: number }>;
  by_ownership: Array<{ ownership: string; loans: number; ead: number }>;
};

export function rowToApplicant(row: Record<string, string | number>): Applicant {
  const home = String(row.home_ownership || (Number(row.home_ownership_MORTGAGE) === 1 ? "MORTGAGE" : "RENT"));
  return {
    loan_amnt: Number(row.loan_amnt) || 12000,
    term: Number(row.term) || 36,
    annual_inc: Number(row.annual_inc) || 65000,
    dti: Number(row.dti) || 18,
    fico_range_low: Number(row.fico_range_low) || 690,
    emp_length: Number(row.emp_length) || 5,
    home_ownership: (home as Applicant["home_ownership"]) || "RENT",
    mort_acc: Number(row.mort_acc) || 0,
    acc_open_past_24mths: Number(row.acc_open_past_24mths) || 0,
    num_actv_rev_tl: Number(row.num_actv_rev_tl) || 0,
    mths_since_recent_inq: Number(row.mths_since_recent_inq) || 0,
    mths_since_recent_bc: Number(row.mths_since_recent_bc) || 0,
    mo_sin_old_rev_tl_op: Number(row.mo_sin_old_rev_tl_op) || 120,
    mo_sin_rcnt_tl: Number(row.mo_sin_rcnt_tl) || 6,
    avg_cur_bal: Number(row.avg_cur_bal) || 0,
    tot_cur_bal: Number(row.tot_cur_bal) || 0,
    total_bc_limit: Number(row.total_bc_limit) || 0,
  };
}

function fingerprint(applicant: Applicant) {
  return [applicant.loan_amnt, applicant.annual_inc, applicant.fico_range_low, applicant.dti, applicant.term].join("|");
}

export function scorePortfolioRows(
  rows: Array<Record<string, string | number>>,
  scorecard: any,
  woeBins: any,
  sourceBatch: string,
): { records: PortfolioRecord[]; scored: number; approved: number; duplicates: number } {
  const seen = new Set<string>();
  const records: PortfolioRecord[] = [];
  const now = new Date().toISOString();
  for (const row of rows) {
    const applicant = rowToApplicant(row);
    const key = fingerprint(applicant);
    if (seen.has(key)) continue;
    seen.add(key);
    const result = scoreApplicant(applicant, scorecard, woeBins);
    if (result.decision !== "APPROVE") continue;
    records.push({
      ...applicant,
      portfolio_id: `${sourceBatch}-${records.length + 1}`,
      source_batch: sourceBatch,
      added_at: now,
      pd: result.pd,
      score: result.score,
      grade: result.grade,
      decision: result.decision,
      expected_loss: result.expected_loss,
      unexpected_loss: result.unexpected_loss,
      recommended_limit: result.recommended_limit,
    });
  }
  return { records, scored: rows.length, approved: records.length, duplicates: rows.length - seen.size };
}

export function portfolioMetrics(records: PortfolioRecord[], lgd = 0.55): PortfolioMetrics {
  const ead = records.reduce((sum, r) => sum + r.loan_amnt, 0);
  const expectedLoss = records.reduce((sum, r) => sum + r.pd * lgd * r.loan_amnt, 0);
  const unexpectedLoss = records.reduce((sum, r) => sum + r.unexpected_loss, 0);
  const groups = (key: (r: PortfolioRecord) => string) => {
    const map = new Map<string, PortfolioRecord[]>();
    records.forEach((r) => map.set(key(r), [...(map.get(key(r)) || []), r]));
    return map;
  };
  const byGrade = Array.from(groups((r) => r.grade), ([grade, rows]) => {
    const groupEad = rows.reduce((sum, r) => sum + r.loan_amnt, 0);
    return { grade, loans: rows.length, ead: groupEad, mean_pd: rows.reduce((sum, r) => sum + r.pd, 0) / rows.length, expected_loss: groupEad * rows.reduce((sum, r) => sum + r.pd, 0) / rows.length * lgd };
  }).sort((a, b) => a.grade.localeCompare(b.grade));
  const banded = (field: "fico_range_low" | "dti", bands: Array<[number, string]>) =>
    Array.from(groups((r) => bands.find(([limit]) => r[field] < limit)?.[1] || bands[bands.length - 1][1]), ([band, rows]) => ({
      band,
      loans: rows.length,
      ead: rows.reduce((sum, r) => sum + r.loan_amnt, 0),
    }));
  return {
    loans: records.length,
    ead,
    average_loan: ead / Math.max(records.length, 1),
    mean_pd: records.reduce((sum, r) => sum + r.pd, 0) / Math.max(records.length, 1),
    weighted_pd: records.reduce((sum, r) => sum + r.pd * r.loan_amnt, 0) / Math.max(ead, 1),
    lgd,
    expected_loss: expectedLoss,
    el_rate: expectedLoss / Math.max(ead, 1),
    unexpected_loss: unexpectedLoss,
    capital_proxy: expectedLoss + unexpectedLoss,
    average_score: records.reduce((sum, r) => sum + r.score, 0) / Math.max(records.length, 1),
    average_fico: records.reduce((sum, r) => sum + r.fico_range_low, 0) / Math.max(records.length, 1),
    average_dti: records.reduce((sum, r) => sum + r.dti, 0) / Math.max(records.length, 1),
    high_risk_exposure: records.filter((r) => ["E", "F", "G"].includes(r.grade)).reduce((sum, r) => sum + r.loan_amnt, 0),
    high_risk_share: records.filter((r) => ["E", "F", "G"].includes(r.grade)).reduce((sum, r) => sum + r.loan_amnt, 0) / Math.max(ead, 1),
    by_grade: byGrade,
    by_fico: banded("fico_range_low", [[660, "<660"], [700, "660–699"], [740, "700–739"], [780, "740–779"], [850, "780+"]]),
    by_dti: banded("dti", [[20, "<20%"], [30, "20–29%"], [40, "30–39%"], [100, "40%+"]]),
    by_term: Array.from(groups((r) => `${r.term} months`), ([term, rows]) => ({ term, loans: rows.length, ead: rows.reduce((sum, r) => sum + r.loan_amnt, 0) })),
    by_ownership: Array.from(groups((r) => r.home_ownership), ([ownership, rows]) => ({ ownership, loans: rows.length, ead: rows.reduce((sum, r) => sum + r.loan_amnt, 0) })),
  };
}

export type StressScenario = {
  name: string;
  pdMultiplier: number;
  lgd: number;
  ficoShift?: number;
  dtiShift?: number;
  gradeFilter?: string[];
};

export function stressPortfolio(records: PortfolioRecord[], pdMultiplier: number, stressedLgd: number, ficoShift = 0, dtiShift = 0, gradeFilter?: string[]) {
  const base = portfolioMetrics(records);
  const stressed = records.reduce(
    (result, record) => {
      if (gradeFilter && !gradeFilter.includes(record.grade)) {
        result.ead += record.loan_amnt;
        return result;
      }
      const riskAdjustment = Math.max(1, 1 + Math.max(0, dtiShift) * 0.02 + Math.max(0, -ficoShift) * 0.005);
      const pd = Math.min(record.pd * pdMultiplier * riskAdjustment, 0.99);
      result.ead += record.loan_amnt;
      result.expected_loss += pd * stressedLgd * record.loan_amnt;
      result.unexpected_loss += 1.65 * Math.sqrt(pd * (1 - pd)) * stressedLgd * record.loan_amnt;
      return result;
    },
    { ead: 0, expected_loss: 0, unexpected_loss: 0 },
  );
  return { base, stressed: { ...stressed, el_rate: stressed.expected_loss / Math.max(stressed.ead, 1), capital_proxy: stressed.expected_loss + stressed.unexpected_loss, mean_pd: Math.min(base.mean_pd * pdMultiplier * Math.max(1, 1 + Math.max(0, dtiShift) * 0.02 + Math.max(0, -ficoShift) * 0.005), 0.99) } };
}

export function reverseStress(records: PortfolioRecord[], targetElRate: number, lgd = 0.55) {
  const base = portfolioMetrics(records);
  if (!records.length || base.el_rate >= targetElRate) return { multiplier: 1, el_rate: base.el_rate, breached: true };
  const multiplier = Math.min(targetElRate / Math.max(base.el_rate, 0.000001), 10);
  const result = stressPortfolio(records, multiplier, lgd);
  return { multiplier, el_rate: result.stressed.el_rate, breached: result.stressed.el_rate >= targetElRate };
}