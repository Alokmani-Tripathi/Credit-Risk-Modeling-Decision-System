export type Applicant = {
  loan_amnt: number;
  term: number;
  annual_inc: number;
  dti: number;
  fico_range_low: number;
  emp_length: number;
  home_ownership: "MORTGAGE" | "RENT" | "OWN";
  mort_acc: number;
  acc_open_past_24mths: number;
  num_actv_rev_tl: number;
  mths_since_recent_inq: number;
  mths_since_recent_bc: number;
  mo_sin_old_rev_tl_op: number;
  mo_sin_rcnt_tl: number;
  avg_cur_bal: number;
  tot_cur_bal: number;
  total_bc_limit: number;
};

export type Decision = "APPROVE" | "REFER" | "DECLINE";

export type DecisionResult = {
  pd: number;
  score: number;
  grade: string;
  decision: Decision;
  reasons: string[];
  lgd: number;
  ead: number;
  expected_loss: number;
  unexpected_loss: number;
  recommended_limit: number;
  suggested_spread_bps: number;
  breakdown: Array<{ feature: string; woe: number; points: number }>;
};

type WoESpec = {
  type?: string;
  edges?: number[];
  uniques?: number[];
  fine_to_woe?: Record<string, number>;
  value_to_woe?: Record<string, number>;
  missing?: { woe: number };
  bins?: Array<{ bin: number; woe: number; fine_ids: number[] }>;
};

type Scorecard = {
  base_points: number;
  factor: number;
  offset: number;
  variables: Array<{
    feature: string;
    coefficient: number;
    bins: Array<{ bin: number; woe: number; points: number; fine_ids: number[] }>;
    missing_points: number;
  }>;
};

const POLICY = {
  lgd: 0.55,
  approve_pd: 0.1,
  refer_pd: 0.22,
  min_fico_approve: 660,
  max_dti_approve: 36,
  hard_cut_fico: 580,
  hard_cut_dti: 50,
  spreads: { A: 150, B: 250, C: 400, D: 600, E: 900, F: 1200, G: 1600 } as Record<string, number>,
};

const GRADE_BANDS: Array<[number, string]> = [
  [0.04, "A"],
  [0.08, "B"],
  [0.12, "C"],
  [0.18, "D"],
  [0.25, "E"],
  [0.35, "F"],
  [1.01, "G"],
];

export function defaultApplicant(): Applicant {
  return {
    loan_amnt: 12000,
    term: 36,
    annual_inc: 72000,
    dti: 18,
    fico_range_low: 700,
    emp_length: 5,
    home_ownership: "MORTGAGE",
    mort_acc: 1,
    acc_open_past_24mths: 4,
    num_actv_rev_tl: 5,
    mths_since_recent_inq: 7,
    mths_since_recent_bc: 14,
    mo_sin_old_rev_tl_op: 180,
    mo_sin_rcnt_tl: 8,
    avg_cur_bal: 13000,
    tot_cur_bal: 140000,
    total_bc_limit: 20000,
  };
}

export function toFeatureMap(a: Applicant): Record<string, number> {
  const annual = Math.max(a.annual_inc, 1);
  return {
    term: a.term,
    fico_range_low: a.fico_range_low,
    loan_to_income: a.loan_amnt / annual,
    acc_open_past_24mths: a.acc_open_past_24mths,
    dti: a.dti,
    avg_cur_bal: a.avg_cur_bal,
    total_bc_limit: a.total_bc_limit,
    mo_sin_rcnt_tl: a.mo_sin_rcnt_tl,
    mths_since_recent_inq: a.mths_since_recent_inq,
    mort_acc: a.mort_acc,
    num_actv_rev_tl: a.num_actv_rev_tl,
    loan_amnt: a.loan_amnt,
    annual_inc: a.annual_inc,
    mths_since_recent_bc: a.mths_since_recent_bc,
    mo_sin_old_rev_tl_op: a.mo_sin_old_rev_tl_op,
    home_ownership_MORTGAGE: a.home_ownership === "MORTGAGE" ? 1 : 0,
  };
}

function digitize(value: number, edges: number[]): number {
  if (!edges || edges.length < 3) return 0;
  const cuts = edges.slice(1, -1);
  for (let i = 0; i < cuts.length; i++) {
    if (value <= cuts[i]) return i;
  }
  return cuts.length;
}

function woeFor(spec: WoESpec | undefined, value: number | null): number {
  if (!spec) return 0;
  if (value == null || Number.isNaN(value)) return spec.missing?.woe ?? 0;
  if (spec.type === "discrete" && spec.value_to_woe) {
    const key = String(value);
    if (key in spec.value_to_woe) return spec.value_to_woe[key];
    // try float key match
    const hit = Object.entries(spec.value_to_woe).find(([k]) => Number(k) === value);
    return hit ? hit[1] : spec.bins?.[spec.bins.length - 1]?.woe ?? 0;
  }
  const edges = spec.edges || [];
  const fine = digitize(value, edges);
  if (spec.fine_to_woe && String(fine) in spec.fine_to_woe) {
    return spec.fine_to_woe[String(fine)];
  }
  return spec.bins?.[Math.min(fine, (spec.bins?.length || 1) - 1)]?.woe ?? 0;
}

function gradeFromPd(pd: number) {
  for (const [cut, g] of GRADE_BANDS) if (pd < cut) return g;
  return "G";
}

function unexpectedLoss(pd: number, lgd: number, ead: number) {
  const p = Math.min(Math.max(pd, 1e-6), 1 - 1e-6);
  return 1.65 * Math.sqrt(p * (1 - p)) * lgd * ead;
}

export function scoreApplicant(
  applicant: Applicant,
  scorecard: Scorecard,
  woeBins: Record<string, WoESpec>,
): DecisionResult {
  const feats = toFeatureMap(applicant);
  let total = scorecard.base_points;
  const breakdown: DecisionResult["breakdown"] = [];
  for (const v of scorecard.variables) {
    const raw = feats[v.feature];
    const woe = woeFor(woeBins[v.feature], raw);
    const points = -woe * v.coefficient * scorecard.factor;
    total += points;
    breakdown.push({ feature: v.feature, woe, points });
  }
  const score = Math.round(total);
  const odds = Math.exp((total - scorecard.offset) / scorecard.factor);
  const pd = 1 / (1 + odds);

  const fico = applicant.fico_range_low;
  const dti = applicant.dti;
  const reasons: string[] = [];
  let decision: Decision = "REFER";

  if (fico < POLICY.hard_cut_fico) {
    decision = "DECLINE";
    reasons.push(`FICO ${fico} below hard cut ${POLICY.hard_cut_fico}`);
  } else if (dti > POLICY.hard_cut_dti) {
    decision = "DECLINE";
    reasons.push(`DTI ${dti.toFixed(1)} above hard cut ${POLICY.hard_cut_dti}`);
  } else if (pd >= POLICY.refer_pd) {
    decision = "DECLINE";
    reasons.push(`PD ${(pd * 100).toFixed(1)}% exceeds decline threshold ${POLICY.refer_pd * 100}%`);
  } else if (pd <= POLICY.approve_pd && fico >= POLICY.min_fico_approve && dti <= POLICY.max_dti_approve) {
    decision = "APPROVE";
    reasons.push("PD, FICO, and DTI within auto-approve policy");
  } else {
    decision = "REFER";
    if (pd > POLICY.approve_pd) reasons.push(`PD above auto-approve ${POLICY.approve_pd * 100}%`);
    if (fico < POLICY.min_fico_approve) reasons.push(`FICO below auto-approve floor ${POLICY.min_fico_approve}`);
    if (dti > POLICY.max_dti_approve) reasons.push(`DTI above auto-approve cap ${POLICY.max_dti_approve}`);
  }

  const grade = gradeFromPd(pd);
  const ead = applicant.loan_amnt;
  const el = pd * POLICY.lgd * ead;
  const ul = unexpectedLoss(pd, POLICY.lgd, ead);
  const haircut = Math.max(0.25, 1 - pd * 2.5);
  const gradeMult: Record<string, number> = { A: 1, B: 0.95, C: 0.85, D: 0.7, E: 0.55, F: 0.4, G: 0.25 };
  const limit =
    decision === "APPROVE"
      ? Math.max(0, Math.round((Math.min(ead, 40000) * haircut * (gradeMult[grade] || 0.5)) / 100) * 100)
      : 0;

  return {
    pd,
    score,
    grade,
    decision,
    reasons,
    lgd: POLICY.lgd,
    ead,
    expected_loss: el,
    unexpected_loss: ul,
    recommended_limit: limit,
    suggested_spread_bps: decision === "DECLINE" ? 0 : POLICY.spreads[grade] || 800,
    breakdown: breakdown.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
  };
}

export { POLICY };
