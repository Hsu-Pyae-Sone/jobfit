import { describe, expect, it } from "vitest";
import { toStrictJsonSchema } from "@/lib/server/ai";
import { extractFile, sniff } from "@/lib/server/extract";
import { letterDocx, letterPdf, resumeDocx, resumePdf } from "@/lib/server/export";
import { htmlToText, isPublicAddress } from "@/lib/server/fetch-url";
import { z } from "zod";
import { RESUME } from "./fixtures";

describe("export round-trip (ATS readability)", () => {
  it("resume PDF contains real, extractable text in reading order", async () => {
    const pdf = await resumePdf(RESUME);
    expect(sniff(pdf)).toBe("pdf");
    const r = await extractFile(pdf, "r.pdf", false);
    expect(r.method).toBe("pdf-text");
    for (const s of ["Maya Thein", "maya.thein@example.com", "EXPERIENCE", "Built dashboards in Tableau for the marketing team", "EDUCATION", "SKILLS"]) {
      expect(r.text).toContain(s);
    }
    expect(r.text.indexOf("EXPERIENCE")).toBeLessThan(r.text.indexOf("EDUCATION"));
  });

  it("resume DOCX round-trips through a DOCX parser", async () => {
    const docx = await resumeDocx(RESUME);
    expect(sniff(docx)).toBe("docx");
    const r = await extractFile(docx, "r.docx", false);
    expect(r.text).toContain("Maya Thein");
    expect(r.text).toContain("- Cleaned customer data using Python and SQL");
    expect(r.text).toContain("SKILLS");
    // Re-parsing the extracted DOCX keeps every bullet as a bullet.
    const { parseResume } = await import("@/lib/resume/parse");
    expect(parseResume(r.text).filter((l) => l.kind === "bullet")).toHaveLength(parseResume(RESUME).filter((l) => l.kind === "bullet").length);
  });

  it("cover letter exports", async () => {
    const l = { name: "Maya Thein", contactLines: ["maya@example.com"], date: "June 1, 2026", greeting: "Dear Hiring Manager,", paragraphs: ["First paragraph.", "Second — with “quotes”."], closing: "Sincerely,", signatureName: "Maya Thein" };
    const pdfText = (await extractFile(await letterPdf(l), "c.pdf", false)).text;
    expect(pdfText).toContain("Dear Hiring Manager,");
    expect(pdfText).toContain('Second - with "quotes".');
    const docxText = (await extractFile(await letterDocx(l), "c.docx", false)).text;
    expect(docxText).toContain("Second — with “quotes”.");
  });
});

describe("file sniffing", () => {
  it("identifies by magic bytes, not name", () => {
    expect(sniff(Buffer.from("plain resume text"))).toBe("text");
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(sniff(Buffer.from([0x00, 0x01, 0x02, 0x00]))).toBeNull();
  });

  it("rejects empty and unknown files", async () => {
    await expect(extractFile(Buffer.alloc(0), "x.pdf", false)).rejects.toThrow("empty");
    await expect(extractFile(Buffer.from([0, 1, 2, 0, 5]), "x.bin", false)).rejects.toThrow("Unsupported");
  });
});

describe("URL fetch safety", () => {
  it("blocks private, loopback and link-local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "100.64.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ["8.8.8.8", "151.101.1.69", "2606:4700::1111"]) expect(isPublicAddress(ip), ip).toBe(true);
  });

  it("rejects literal private IPs and non-http schemes before connecting", async () => {
    const { fetchUrlText } = await import("@/lib/server/fetch-url");
    for (const u of ["http://169.254.169.254/latest/meta-data", "http://127.0.0.1:3000/", "http://[::1]/", "http://10.0.0.5/x"]) {
      await expect(fetchUrlText(u), u).rejects.toThrow("not allowed");
    }
    await expect(fetchUrlText("file:///etc/passwd")).rejects.toThrow("Only http");
  });

  it("converts HTML to readable text", () => {
    const t = htmlToText("<html><head><title>x</title><script>evil()</script></head><body><h1>Data Analyst</h1><ul><li>SQL &amp; Python</li><li>Tableau</li></ul></body></html>");
    expect(t).toContain("Data Analyst");
    expect(t).toContain("- SQL & Python");
    expect(t).not.toContain("evil");
  });
});

describe("structured output schema", () => {
  it("closes every object and requires every property", () => {
    const s = toStrictJsonSchema(z.object({ a: z.string(), b: z.array(z.object({ c: z.enum(["x", "y"]) })) }));
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(["a", "b"]);
    const inner = (s.properties as Record<string, { items: Record<string, unknown> }>).b.items;
    expect(inner.additionalProperties).toBe(false);
    expect(inner.required).toEqual(["c"]);
    expect(s.$schema).toBeUndefined();
  });
});
