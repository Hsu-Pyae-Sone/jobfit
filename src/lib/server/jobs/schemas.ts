import "server-only";
import { z } from "zod";

export const LocationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("city"), city: z.string().min(1).max(100), countryCode: z.string().length(2).toUpperCase() }),
  z.object({ type: z.literal("country"), countryCode: z.string().length(2).toUpperCase() }),
  z.object({ type: z.literal("region"), regionId: z.string().min(1).max(40) }),
]);

const s = (max: number) => z.string().max(max).optional();

export const FiltersSchema = z
  .object({
    title: s(120),
    industry: s(80),
    experience: z.array(z.enum(["internship", "entry", "mid", "senior", "lead"])).max(5).optional(),
    arrangement: z.array(z.enum(["remote", "hybrid", "onsite"])).max(3).optional(),
    employment: z.array(z.enum(["full_time", "part_time", "contract", "internship", "temporary"])).max(5).optional(),
    salaryMin: z.number().nonnegative().max(10_000_000).optional(),
    salaryMax: z.number().nonnegative().max(10_000_000).optional(),
    salaryCurrency: z.string().length(3).toUpperCase().optional(),
    postedWithinDays: z.number().int().min(1).max(365).optional(),
    company: s(120),
    language: s(40),
    visaSponsorship: z.boolean().optional(),
    strict: z.boolean().optional(),
  })
  .default({});
