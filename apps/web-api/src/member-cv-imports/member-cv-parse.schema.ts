import { z } from 'zod';

export const CvParseLlmExperienceSchema = z.object({
  title: z.string().default(''),
  company: z.string().default(''),
  description: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().nullable().default(null),
  isCurrent: z.boolean().default(false),
  location: z.string().default(''),
});

export const CvParseLlmProfileSchema = z.object({
  role: z.string().default(''),
  location: z.string().default(''),
  skills: z.array(z.string()).default([]),
  experiences: z.array(CvParseLlmExperienceSchema).default([]),
});

export const CV_PARSE_SYSTEM_PROMPT = `You extract structured profile data from a CV / résumé.

CRITICAL:
- Use only information present in the document. Never invent roles, companies, dates, skills, or locations.
- If a field is missing, return an empty string (or null for endDate, or [] for lists).
- Dates must be YYYY-MM. If the month is unknown, return an empty startDate (do not guess a month). Year-only dates are empty.
- If the role is current / "present", set isCurrent to true and endDate to null.
- Skills are short professional skill titles, not soft-skill slogans.
- description is HTML for a rich-text field: wrap each paragraph in <p>. Do not add commentary.

Return a single JSON object matching the schema.`;
