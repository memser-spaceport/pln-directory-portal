import { Prisma } from '@prisma/client';
import { ScrapingDogPersonProfile } from '../husky/member-scrapingdog.service';
import { namesShareSubstantiveToken } from '../team-enrichment/shared/text.util';

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

function companiesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim();
  const right = b?.trim();
  if (!left || !right) return false;
  if (left.toLowerCase() === right.toLowerCase()) return true;
  return namesShareSubstantiveToken(left, right);
}

/**
 * Filters LinkedIn experiences down to the ones the member does NOT already have a
 * `MemberExperience` row for, matched by company name — same conservative two-tier
 * doctrine as `member-enrichment-team-match.util.ts`'s team matching (exact
 * case-insensitive equality, falling back to a shared substantive token). This is
 * what makes work-history enrichment a true per-position gap-fill: a member with 1
 * self-reported role and 4 more on LinkedIn gets exactly those 4 added.
 *
 * Deliberately conservative: two separate stints at the same company collapse to
 * "already covered" rather than risk misreading a title/date edit as a genuine gap.
 * Existing rows are never read for anything but this company-name check — never
 * updated, replaced, or deleted here.
 */
export function selectMissingExperiences(
  candidates: ScrapingDogPersonProfile['experiences'],
  existingCompanies: Array<string | null | undefined>
): ScrapingDogPersonProfile['experiences'] {
  return candidates.filter(
    (candidate) => !existingCompanies.some((company) => companiesMatch(company, candidate.company))
  );
}

/**
 * Converts ScrapingDog LinkedIn experiences into `MemberExperience` create inputs.
 * Callers pass only the already-filtered "missing" subset (see
 * `selectMissingExperiences`) — this function itself has no dedup logic.
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
