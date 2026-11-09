import { describe, expect, it } from "vitest";
import { computeScore, gapCandidates, improvementImpact, normalizeWeights, potentialScore, priorityFor } from "@/lib/match/score";
import { DEFAULT_WEIGHTS, type ReqCategory, type ReqStatus, type Requirement } from "@/lib/match/types";
import { looselySupported, quotedIn } from "@/lib/server/match/analyze";

let n = 0;
function req(category: ReqCategory, status: ReqStatus): Requirement {
  n++;
  return { id: `R${n}`, category, text: `req ${n}`, quote: "", quoteVerified: true, status, evidence: "", evidenceSource: "", evidenceVerified: status === "verified", explanation: "" };
}

describe("match score", () => {
  it("uses the default weighting when all categories are present", () => {
    const reqs = [
      req("required_skill", "verified"), // 100
      req("experience", "partial"), // 50
      req("education", "verified"), // 100
      req("preferred_skill", "not_demonstrated"), // 0
      req("other", "verified"), // 100
    ];
    const r = computeScore(reqs, DEFAULT_WEIGHTS);
    // 0.35*100 + 0.25*50 + 0.15*100 + 0.15*0 + 0.10*100 = 72.5
    expect(r.score).toBe(73);
    expect(r.categories.map((c) => c.normalizedWeight)).toEqual([0.35, 0.25, 0.15, 0.15, 0.1]);
  });

  it("normalizes weights when categories are missing", () => {
    const reqs = [req("required_skill", "verified"), req("experience", "not_demonstrated")];
    const r = computeScore(reqs, DEFAULT_WEIGHTS);
    // only 35 + 25 = 60 present → 35/60*100 + 25/60*0 = 58.3
    expect(r.score).toBe(58);
    const included = r.categories.filter((c) => c.included);
    expect(included.map((c) => c.category)).toEqual(["required_skill", "experience"]);
    expect(included.reduce((s, c) => s + c.normalizedWeight, 0)).toBeCloseTo(1);
  });

  it("leaves unknown requirements out instead of counting them as failures", () => {
    const reqs = [req("required_skill", "verified"), req("required_skill", "unknown"), req("other", "unknown")];
    const r = computeScore(reqs, DEFAULT_WEIGHTS);
    expect(r.score).toBe(100);
    expect(r.unknown).toBe(2);
    expect(r.categories.find((c) => c.category === "other")?.included).toBe(false);
  });

  it("returns no score when nothing can be assessed", () => {
    expect(computeScore([req("required_skill", "unknown")], DEFAULT_WEIGHTS).score).toBeNull();
    expect(computeScore([], DEFAULT_WEIGHTS).score).toBeNull();
  });

  it("supports custom weights", () => {
    const reqs = [req("required_skill", "verified"), req("experience", "not_demonstrated")];
    expect(computeScore(reqs, { ...DEFAULT_WEIGHTS, required_skill: 50, experience: 50 }).score).toBe(50);
    expect(normalizeWeights({ required_skill: 140, experience: -5, education: 12.6 })).toMatchObject({ required_skill: 100, experience: 0, education: 13, preferred_skill: 0 });
  });

  it("potential score is hypothetical and does not change the verified score", () => {
    const reqs = [req("required_skill", "verified"), req("required_skill", "not_demonstrated"), req("preferred_skill", "partial")];
    const before = computeScore(reqs, DEFAULT_WEIGHTS).score;
    const gaps = gapCandidates(reqs, DEFAULT_WEIGHTS);
    expect(gaps.map((g) => g.requirement.status)).toEqual(["not_demonstrated", "partial"]); // highest impact first
    const pot = potentialScore(reqs, DEFAULT_WEIGHTS, gaps.map((g) => g.requirement.id));
    expect(pot).toBe(100);
    expect(computeScore(reqs, DEFAULT_WEIGHTS).score).toBe(before); // inputs untouched
    expect(improvementImpact(reqs, DEFAULT_WEIGHTS, gaps[0].requirement.id)).toBeGreaterThan(improvementImpact(reqs, DEFAULT_WEIGHTS, gaps[1].requirement.id));
  });

  it("missing required skills are always at least high priority", () => {
    const r = req("required_skill", "not_demonstrated");
    expect(priorityFor(1, r)).toBe("high");
    expect(priorityFor(1, req("preferred_skill", "partial"))).toBe("low");
    expect(priorityFor(4, req("preferred_skill", "partial"))).toBe("medium");
  });
});

describe("evidence quote check", () => {
  it("matches quotes ignoring case and punctuation, rejects invented ones", () => {
    expect(quotedIn("built dashboards in Tableau", "- Built dashboards in Tableau, for the team")).toBe(true);
    expect(quotedIn("Kubernetes expert", "Python, SQL")).toBe(false);
    expect(quotedIn("", "anything")).toBe(false);
  });

  it("treats close paraphrases as loosely supported but not invented text", () => {
    const resume = "- Built dashboards in Tableau for the marketing team";
    expect(looselySupported("Built Tableau dashboards for marketing", resume)).toBe(true);
    expect(looselySupported("Presented weekly results to executives", resume)).toBe(false);
    expect(looselySupported("Kubernetes expert", resume)).toBe(false);
  });
});
