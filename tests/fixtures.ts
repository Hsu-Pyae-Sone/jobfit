import { emptyInputs, type Suggestion, type Workspace } from "@/lib/types";

export const RESUME = `Maya Thein
maya.thein@example.com | +1 415 555 0134 | San Francisco, CA | linkedin.com/in/mayathein

EXPERIENCE
Junior Data Analyst, Brightline Retail — Jan 2024 – Present
- Worked on weekly sales reports in Excel
- Built dashboards in Tableau for the marketing team
• Cleaned customer data using Python and SQL, reducing duplicate records by 1,200
  across three regional databases

Data Intern, City Health Clinic — Jun 2023 – Dec 2023
- Helped with patient survey analysis

EDUCATION
B.S. Statistics, State University — 2023

SKILLS
Excel, SQL, Python, Tableau`;

export const JOB = `Data Analyst
Requirements:
- 1+ years of experience with SQL and Python
- Experience building dashboards (Tableau or Power BI)
- Strong communication with stakeholders
Preferred: experience with A/B testing and dbt.`;

export function makeWorkspace(over: Partial<Workspace> = {}): Workspace {
  const inputs = emptyInputs();
  inputs.resumeText = RESUME;
  inputs.jobText = JOB;
  inputs.resumeConfirmed = true;
  inputs.jobConfirmed = true;
  return {
    id: "w1",
    title: "Test",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    inputs,
    answers: {},
    decisions: {},
    edits: {},
    confirmations: {},
    finalResume: null,
    ...over,
  };
}

export function sug(p: Partial<Suggestion> & Pick<Suggestion, "id" | "type" | "lineId">): Suggestion {
  return {
    afterLineId: "",
    original: "",
    proposed: "",
    kind: "bullet",
    reason: "r",
    significance: "minor",
    category: "clarity",
    flags: { unsupportedNumbers: [], newTerms: [], genericPhrases: [] },
    ...p,
  };
}
