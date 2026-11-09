import { CATEGORY_LABEL, CATEGORY_ORDER, type ReqCategory, type ReqStatus, type Requirement, type Weights } from "./types";

// Deterministic, transparent scoring. The AI only classifies each requirement; the number
// is computed here so every point can be explained and recomputed with other weights.

export const STATUS_POINTS: Record<Exclude<ReqStatus, "unknown">, number> = { verified: 1, partial: 0.5, not_demonstrated: 0 };

export interface CategoryBreakdown {
  category: ReqCategory;
  label: string;
  counts: Record<ReqStatus, number>;
  included: boolean; // has at least one assessable requirement
  weight: number; // configured
  normalizedWeight: number; // after removing missing categories (0..1)
  score: number | null; // 0..100
  contribution: number; // points toward the total
}

export interface ScoreResult {
  score: number | null; // null when nothing could be assessed
  categories: CategoryBreakdown[];
  assessed: number;
  unknown: number;
}

export function computeScore(reqs: Requirement[], weights: Weights, overrides: Record<string, ReqStatus> = {}): ScoreResult {
  const status = (r: Requirement) => overrides[r.id] ?? r.status;
  const rows = CATEGORY_ORDER.map((category) => {
    const items = reqs.filter((r) => r.category === category);
    const counts = { verified: 0, partial: 0, not_demonstrated: 0, unknown: 0 } as Record<ReqStatus, number>;
    for (const r of items) counts[status(r)]++;
    const assessable = items.filter((r) => status(r) !== "unknown");
    const score = assessable.length ? (assessable.reduce((s, r) => s + STATUS_POINTS[status(r) as Exclude<ReqStatus, "unknown">], 0) / assessable.length) * 100 : null;
    const weight = Math.max(0, weights[category] ?? 0);
    return { category, label: CATEGORY_LABEL[category], counts, included: score !== null && weight > 0, weight, score, normalizedWeight: 0, contribution: 0 };
  });
  const total = rows.filter((r) => r.included).reduce((s, r) => s + r.weight, 0);
  for (const r of rows) {
    if (!r.included || total === 0) continue;
    r.normalizedWeight = r.weight / total;
    r.contribution = r.normalizedWeight * (r.score ?? 0);
  }
  const included = rows.filter((r) => r.included);
  return {
    score: included.length ? Math.round(included.reduce((s, r) => s + r.contribution, 0)) : null,
    categories: rows,
    assessed: reqs.filter((r) => status(r) !== "unknown").length,
    unknown: reqs.filter((r) => status(r) === "unknown").length,
  };
}

/** Points the score would gain if this requirement became a verified match (hypothetical). */
export function improvementImpact(reqs: Requirement[], weights: Weights, id: string): number {
  const now = computeScore(reqs, weights).score ?? 0;
  const after = computeScore(reqs, weights, { [id]: "verified" }).score ?? 0;
  return Math.max(0, after - now);
}

export function priorityFor(impact: number, r: Requirement): "high" | "medium" | "low" {
  if (impact >= 6 || (r.category === "required_skill" && r.status === "not_demonstrated")) return "high";
  if (impact >= 3) return "medium";
  return "low";
}

/** Hypothetical score if the given requirements were all verified. */
export function potentialScore(reqs: Requirement[], weights: Weights, ids: string[]): number | null {
  return computeScore(reqs, weights, Object.fromEntries(ids.map((id) => [id, "verified" as const]))).score;
}

/** Requirements worth improving: assessable and not yet verified, highest impact first. */
export function gapCandidates(reqs: Requirement[], weights: Weights): { requirement: Requirement; impact: number }[] {
  return reqs
    .filter((r) => r.status === "partial" || r.status === "not_demonstrated")
    .map((r) => ({ requirement: r, impact: improvementImpact(reqs, weights, r.id) }))
    .sort((a, b) => b.impact - a.impact);
}

export function normalizeWeights(w: Partial<Weights>): Weights {
  const out = {} as Weights;
  for (const c of CATEGORY_ORDER) {
    const v = Number(w[c]);
    out[c] = Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 0;
  }
  return out;
}
