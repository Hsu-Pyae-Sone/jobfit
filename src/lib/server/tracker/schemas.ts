import "server-only";
import { z } from "zod";

const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")]);
const datetime = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, "Use a valid date and time")]);
const url = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => !v || /^https?:\/\//i.test(v), "Links must start with http:// or https://");
const doc = z.object({ ref: z.string().max(100), label: z.string().trim().max(200) }).nullable();

export const EntryFields = z
  .object({
    company: z.string().trim().max(200),
    title: z.string().trim().max(200),
    location: z.string().trim().max(200),
    employmentType: z.enum(["", "full_time", "part_time", "contract", "internship", "temporary"]),
    workArrangement: z.enum(["", "remote", "hybrid", "onsite"]),
    salary: z.string().trim().max(120),
    url,
    applicationDate: date,
    deadline: date,
    status: z.string().max(40),
    resumeVersion: doc,
    coverLetterVersion: doc,
    recruiterContact: z.string().trim().max(500),
    interviewDate: datetime,
    interviewStage: z.string().trim().max(100),
    followUpDate: date,
    notes: z.string().max(10000),
  })
  .partial();

export const StatusList = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
      label: z.string().trim().min(1).max(40),
      group: z.enum(["not_applied", "applied", "in_process", "interview", "offer", "rejected", "withdrawn"]),
      color: z.enum(["slate", "blue", "teal", "violet", "amber", "green", "red", "gray"]),
    }),
  )
  .min(1)
  .max(30);
