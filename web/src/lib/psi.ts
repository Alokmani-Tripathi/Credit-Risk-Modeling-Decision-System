/** Population Stability Index helpers for batch drift demos. */

function psiContinuous(expected: number[], actual: number[], nBins = 10): number {
  const exp = expected.filter((v) => Number.isFinite(v));
  const act = actual.filter((v) => Number.isFinite(v));
  if (exp.length < 5 || act.length < 5) return 0;
  const qs = quantileEdges(exp, nBins);
  if (qs.length < 3) return 0;
  const e = binCounts(exp, qs);
  const a = binCounts(act, qs);
  return psiFromShares(e, a);
}

function quantileEdges(values: number[], nBins: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const edges: number[] = [];
  for (let i = 0; i <= nBins; i++) {
    const p = i / nBins;
    const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
    edges.push(sorted[idx]);
  }
  return Array.from(new Set(edges));
}

function binCounts(values: number[], edges: number[]): number[] {
  const n = Math.max(edges.length - 1, 1);
  const counts = Array(n).fill(0);
  for (const v of values) {
    let b = 0;
    for (let i = 1; i < edges.length - 1; i++) {
      if (v <= edges[i]) {
        b = i - 1;
        break;
      }
      b = i;
    }
    if (edges.length === 2) b = 0;
    counts[Math.min(Math.max(b, 0), n - 1)] += 1;
  }
  const sum = counts.reduce((s, x) => s + x, 0) || 1;
  return counts.map((c) => c / sum);
}

function psiFromShares(e: number[], a: number[], eps = 1e-6): number {
  let psi = 0;
  for (let i = 0; i < e.length; i++) {
    const ee = Math.max(e[i], eps);
    const aa = Math.max(a[i] ?? 0, eps);
    const en = ee / e.reduce((s, x) => s + Math.max(x, eps), 0);
    const an = aa / a.reduce((s, x) => s + Math.max(x, eps), 0);
    psi += (an - en) * Math.log(an / en);
  }
  return psi;
}

function psiDiscrete(expected: number[], actual: number[]): number {
  const cats = Array.from(new Set([...expected, ...actual])).sort((a, b) => a - b);
  const eShare = cats.map((c) => expected.filter((x) => x === c).length / Math.max(expected.length, 1));
  const aShare = cats.map((c) => actual.filter((x) => x === c).length / Math.max(actual.length, 1));
  return psiFromShares(eShare, aShare);
}

export function featurePsi(
  reference: Record<string, number>[],
  current: Record<string, number>[],
  features: string[],
): Array<{ feature: string; psi: number; status: string }> {
  return features
    .map((feature) => {
      const exp = reference.map((r) => Number(r[feature])).filter((v) => Number.isFinite(v));
      const act = current.map((r) => Number(r[feature])).filter((v) => Number.isFinite(v));
      const unique = new Set(exp).size;
      const psi = unique <= 8 ? psiDiscrete(exp, act) : psiContinuous(exp, act);
      const status = psi < 0.1 ? "stable" : psi < 0.25 ? "shift" : "significant";
      return { feature, psi, status };
    })
    .sort((a, b) => b.psi - a.psi);
}
