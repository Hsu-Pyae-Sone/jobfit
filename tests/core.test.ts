import { describe, expect, it } from "vitest";
import { checkClaims, genericPhrases, newTerms, unsupportedNumbers } from "@/lib/claims";
import { contentHash, userFactsCorpus } from "@/lib/facts";
import { composeResume, currentResumeText } from "@/lib/resume/compose";
import { parseResume, structureResume } from "@/lib/resume/parse";
import { atsChecks, automaticReview, contactChecks } from "@/lib/review";
import { makeWorkspace, RESUME, sug } from "./fixtures";

describe("parseResume", () => {
  const lines = parseResume(RESUME);

  it("detects headings, bullets and the header section", () => {
    expect(lines[0]).toMatchObject({ id: "L1", kind: "text", section: "Header", text: "Maya Thein" });
    const headings = lines.filter((l) => l.kind === "heading").map((l) => l.text);
    expect(headings).toEqual(["EXPERIENCE", "EDUCATION", "SKILLS"]);
    expect(lines.find((l) => l.text.startsWith("Built dashboards"))).toMatchObject({ kind: "bullet", section: "Experience" });
  });

  it("joins wrapped bullet continuation lines from PDF extraction", () => {
    const cleaned = lines.find((l) => l.text.startsWith("Cleaned customer data"));
    expect(cleaned?.text).toBe("Cleaned customer data using Python and SQL, reducing duplicate records by 1,200 across three regional databases");
  });

  it("assigns stable sequential ids", () => {
    expect(parseResume(RESUME).map((l) => l.id)).toEqual(lines.map((l) => l.id));
    expect(lines.map((l) => l.id)).toEqual(lines.map((_, i) => `L${i + 1}`));
  });

  it("structures resume for export", () => {
    const s = structureResume(RESUME);
    expect(s.name).toBe("Maya Thein");
    expect(s.contactLines[0]).toContain("maya.thein@example.com");
    expect(s.sections.map((x) => x.title)).toEqual(["EXPERIENCE", "EDUCATION", "SKILLS"]);
  });
});

describe("claim guards", () => {
  const corpus = RESUME;

  it("flags invented metrics but accepts numbers the user provided", () => {
    expect(unsupportedNumbers("Designed interfaces, improving completion rates by 18%", corpus)).toEqual(["18"]);
    expect(unsupportedNumbers("Removed 1200 duplicate records", corpus)).toEqual([]); // 1,200 normalised
    expect(unsupportedNumbers("Supported three regional databases", corpus)).toEqual([]);
    expect(unsupportedNumbers("Led a team of five analysts", corpus)).toEqual(["five"]);
  });

  it("flags tools and job keywords the user never mentioned", () => {
    expect(newTerms("Built dashboards in Power BI and Tableau", corpus)).toEqual(["Power", "BI"]);
    expect(newTerms("Ran A/B testing on campaigns", corpus, ["A/B testing", "dbt"])).toContain("A/B testing");
    expect(newTerms("Built Tableau dashboards with SQL", corpus)).toEqual([]);
    expect(newTerms("Built dashboards in Power BI", corpus, ["Power BI"])).toEqual(["Power BI"]);
    expect(newTerms("PROFESSIONAL SUMMARY\nData analyst with SQL and Tableau experience.", corpus)).toEqual([]);
  });

  it("detects generic phrases", () => {
    expect(genericPhrases("A hardworking team player and results-driven professional")).toEqual(["hardworking", "team player", "results-driven"]);
  });

  it("checkClaims combines all three", () => {
    const f = checkClaims("Results-driven analyst who cut costs by 30% with Snowflake", corpus);
    expect(f.unsupportedNumbers).toEqual(["30"]);
    expect(f.newTerms).toContain("Snowflake");
    expect(f.genericPhrases).toEqual(["results-driven"]);
  });
});

describe("composeResume", () => {
  const lines = parseResume(RESUME);
  const weekly = lines.find((l) => l.text.startsWith("Worked on weekly"))!;
  const built = lines.find((l) => l.text.startsWith("Built dashboards"))!;
  const helped = lines.find((l) => l.text.startsWith("Helped with"))!;
  const suggestions = [
    sug({ id: "m1", type: "modify", lineId: weekly.id, original: weekly.text, proposed: "Produced weekly Excel sales reports for regional managers" }),
    sug({ id: "a1", type: "add", lineId: "L2", kind: "text", proposed: "PROFESSIONAL SUMMARY\nData analyst with SQL, Python and Tableau experience." }),
    sug({ id: "r1", type: "remove", lineId: helped.id, original: helped.text }),
    sug({ id: "mv", type: "move", lineId: built.id, afterLineId: weekly.id }),
  ];

  it("applies nothing while suggestions are pending", () => {
    const r = composeResume(lines, suggestions, {});
    expect(parseResume(r.text).map((l) => l.text)).toEqual(lines.map((l) => l.text));
    expect(r.rows.filter((x) => x.status !== "unchanged" && x.left)).toHaveLength(0);
  });

  it("applies only accepted suggestions, with user edits", () => {
    const r = composeResume(lines, suggestions, { m1: "accepted", a1: "accepted", r1: "rejected" }, { m1: "Produced weekly sales reports in Excel" });
    expect(r.text).toContain("- Produced weekly sales reports in Excel");
    expect(r.text).not.toContain("Worked on weekly");
    expect(r.text).toContain("PROFESSIONAL SUMMARY");
    expect(r.text).toContain("Helped with patient survey analysis"); // rejected removal kept
    const statuses = r.rows.map((x) => x.status);
    expect(statuses).toContain("modified");
    expect(statuses).toContain("added");
  });

  it("handles remove and move", () => {
    const r = composeResume(lines, suggestions, { r1: "accepted", mv: "accepted" });
    expect(r.text).not.toContain("Helped with patient");
    const out = parseResume(r.text).map((l) => l.text);
    expect(out.indexOf(built.text)).toBe(out.indexOf(weekly.text) + 1);
    expect(r.rows.find((x) => x.status === "moved-from")).toBeTruthy();
    expect(r.rows.find((x) => x.status === "moved-to")).toBeTruthy();
  });

  it("currentResumeText prefers a manual final resume", () => {
    const ws = makeWorkspace({ finalResume: "Manual text" });
    expect(currentResumeText(ws)).toBe("Manual text");
    expect(currentResumeText(makeWorkspace())).toBe(RESUME);
  });
});

describe("facts corpus", () => {
  it("includes answers but not 'no number' answers, and confirmed accepted suggestions", () => {
    const ws = makeWorkspace({
      answers: { q1: { answer: "About 40 users", noNumber: false }, q2: { answer: "ignored 99", noNumber: true } },
      optimization: { suggestions: [sug({ id: "s1", type: "modify", lineId: "L4", proposed: "Used Power BI" })], notes: "", inputHash: "", createdAt: "" },
      decisions: { s1: "accepted" },
      confirmations: { s1: true },
    });
    const c = userFactsCorpus(ws);
    expect(c).toContain("About 40 users");
    expect(c).not.toContain("ignored 99");
    expect(c).toContain("Used Power BI");
    expect(userFactsCorpus(ws, false)).not.toContain("Used Power BI");
  });

  it("contentHash changes with the documents", () => {
    const a = makeWorkspace();
    const b = makeWorkspace({ finalResume: RESUME + "\nextra" });
    expect(contentHash(a)).not.toBe(contentHash(b));
  });
});

describe("review checks", () => {
  it("finds contact info and flags missing email as an error", () => {
    expect(contactChecks(RESUME).filter((i) => i.severity === "error")).toHaveLength(0);
    const noEmail = contactChecks(RESUME.replace("maya.thein@example.com | ", ""));
    expect(noEmail.find((i) => i.message.includes("email"))?.severity).toBe("error");
  });

  it("flags tables, mixed date formats and mixed tenses", () => {
    const bad = `Jane Doe\njane@x.com\nEXPERIENCE\nAnalyst | Acme | 01/2020 | Remote\nJan 2021 - Present\n- Built reports\n- Manages data\nEDUCATION\nBA\nSKILLS\nSQL`;
    const msgs = atsChecks(bad).map((i) => i.message);
    expect(msgs).toContain("Possible table or column layout detected.");
    expect(msgs).toContain("Mixed date formats.");
    expect(msgs).toContain("Mixed verb tenses within one role.");
    // A pipe-separated contact line in the header is not a table.
    expect(atsChecks(RESUME).map((i) => i.message)).not.toContain("Possible table or column layout detected.");
  });

  it("automaticReview reports unsupported claims as errors", () => {
    const items = automaticReview({
      resumeText: RESUME + "\n- Increased conversion by 25% using dbt",
      coverLetterText: "Dear Hiring Manager,\n\nI am writing to express my interest in [Company].\n\nSincerely,\nMaya",
      resumeCorpus: RESUME,
      coverCorpus: RESUME,
      jobKeywords: ["SQL", "Python", "dbt"],
      missingKeywords: ["dbt"],
    });
    const claims = items.filter((i) => i.category === "claims");
    expect(claims.find((i) => i.target === "resume" && i.severity === "error")?.detail).toContain("25");
    expect(claims.find((i) => i.target === "resume" && i.severity === "warning")?.detail).toContain("dbt");
    expect(items.find((i) => i.target === "cover_letter" && i.message.includes("placeholder"))?.severity).toBe("error");
    expect(items.find((i) => i.target === "cover_letter" && i.message === "Generic phrases.")).toBeTruthy();
  });
});
