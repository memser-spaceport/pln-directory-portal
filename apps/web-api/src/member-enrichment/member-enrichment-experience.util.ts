import { Prisma } from '@prisma/client';
import { ScrapingDogPersonProfile } from '../husky/member-scrapingdog.service';

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const ONGOING_RE = /^present$|^current$/i;

/**
 * Parses ScrapingDog's free-text `starts_at`/`ends_at` LinkedIn date strings
 * ("Oct 2024", "2013") into a Date. Returns null for "Present"/"Current",
 * empty/missing values, or anything else unrecognized — callers treat null
 * as "no date available", not an error.
 */
export function parseLinkedinDateString(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || ONGOING_RE.test(trimmed)) return null;

  const monthYear = trimmed.match(/^([A-Za-z]{3,})\.?\s+(\d{4})$/);
  if (monthYear) {
    const month = MONTH_INDEX[monthYear[1].slice(0, 3).toLowerCase()];
    const year = Number.parseInt(monthYear[2], 10);
    if (month !== undefined && Number.isInteger(year)) return new Date(Date.UTC(year, month, 1));
  }

  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly) return new Date(Date.UTC(Number.parseInt(yearOnly[1], 10), 0, 1));

  return null;
}

/**
 * Converts ScrapingDog LinkedIn experiences into `MemberExperience` rows.
 * Fill-gaps-only semantics apply at the whole-list level (see doEnrichMember):
 * this only ever runs against a member with zero existing rows, so there is
 * no merge/dedup logic here — every parseable entry becomes a new row.
 *
 * Entries with no parseable `startsAt` are skipped — `MemberExperience.startDate`
 * is a required column and a guessed date would misrepresent the member's history.
 * A missing/unparseable `endsAt` (including "Present") means `isCurrent: true`,
 * mirroring the legacy `member_experience_ingestion.js` ingestion script's rule.
 */
export function buildMemberExperienceInputs(
  experiences: ScrapingDogPersonProfile['experiences'],
  memberUid: string
): Prisma.MemberExperienceCreateManyInput[] {
  const inputs: Prisma.MemberExperienceCreateManyInput[] = [];

  for (const exp of experiences) {
    const startDate = parseLinkedinDateString(exp.startsAt);
    if (!startDate) continue;

    const endDate = parseLinkedinDateString(exp.endsAt);
    inputs.push({
      title: exp.title ?? '',
      company: exp.company ?? '',
      location: exp.location ?? null,
      description: exp.summary ?? null,
      startDate,
      endDate,
      isCurrent: endDate === null,
      memberUid,
    });
  }

  return inputs;
}
