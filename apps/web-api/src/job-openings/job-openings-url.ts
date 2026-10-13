/**
 * Canonical URL for a role on the Directory job board.
 *
 * Refer and apply emails used to send `JobOpening.sourceLink` (the company's
 * own posting). Recipients now land on the crawlable job page instead.
 */
export function jobBoardDetailUrl(jobUid: string): string {
  return `${webUiBase()}/jobs/openings/${encodeURIComponent(jobUid)}`;
}

/** `utm_source` values the profile page reads back to attribute an email click. */
export const JOB_REFERRAL_EMAIL_UTM_SOURCE = 'job_referral_email';
export const JOB_REFERRAL_NOTICE_EMAIL_UTM_SOURCE = 'job_referral_notice_email';
export const JOB_APPLICATION_EMAIL_UTM_SOURCE = 'job_application_email';
export const JOB_SUGGESTED_CANDIDATES_EMAIL_UTM_SOURCE = 'job_suggested_candidates_email';
export const JOB_SUGGESTED_CANDIDATE_INTRO_EMAIL_UTM_SOURCE = 'job_suggested_candidate_intro_email';

/**
 * A Directory profile link as it appears in a refer/apply email, tagged so the
 * click can be attributed.
 *
 * Untagged, these links landed on `/members/<uid>` and the arrival was
 * indistinguishable from any other profile view — the referral funnel ended at
 * the send. `content` says whose card the link was on, since the referral
 * email carries both the referrer's and the referred person's.
 */
/** A member's profile page, untagged — for API responses rather than emails. */
export function memberProfileUrl(memberUid: string): string {
  return `${webUiBase()}/members/${encodeURIComponent(memberUid)}`;
}

export function memberProfileEmailUrl(memberUid: string, utm: EmailUtm): string {
  return `${webUiBase()}/members/${encodeURIComponent(memberUid)}?${emailUtmQuery(utm)}`;
}

/** An applicant as a team lead opens them from the application email: selected on the team's Candidates page. */
export function teamCandidateEmailUrl(teamUid: string, memberUid: string, utm: EmailUtm): string {
  const query = new URLSearchParams({ role: utm.jobUid, candidate: memberUid }).toString();
  return `${webUiBase()}/teams/${encodeURIComponent(teamUid)}/applicants?${query}&${emailUtmQuery(utm)}`;
}

/**
 * A role's Candidates page as a team lead opens it from the suggested-candidates email: the Suggested tab,
 * selected on one suggested member when `memberUid` is given, else the whole list.
 */
export function teamSuggestedCandidateEmailUrl(teamUid: string, utm: EmailUtm, memberUid?: string): string {
  const params: Record<string, string> = { role: utm.jobUid };
  if (memberUid) params.suggested = memberUid;
  const query = new URLSearchParams(params).toString();
  return `${webUiBase()}/teams/${encodeURIComponent(teamUid)}/applicants?${query}&${emailUtmQuery(utm)}`;
}

/**
 * An outside-the-network referred person's LinkedIn URL as it appears in a
 * refer email, tagged the same way as a Directory profile link.
 */
export function externalProfileEmailUrl(url: string, utm: EmailUtm): string {
  return withEmailUtm(url, utm);
}

/** Any absolute URL with the email UTM tags appended, keeping its own query. */
export function withEmailUtm(url: string, utm: EmailUtm): string {
  return `${url}${url.includes('?') ? '&' : '?'}${emailUtmQuery(utm)}`;
}

export type EmailUtm = { source: string; content: string; jobUid: string };

function emailUtmQuery(utm: EmailUtm): string {
  return new URLSearchParams({
    utm_source: utm.source,
    utm_medium: 'email',
    utm_content: utm.content,
    job_uid: utm.jobUid,
  }).toString();
}

/** The Directory's public base URL, for links handed to people and to integrations. */
export function webUiBase(): string {
  const base = process.env.WEB_UI_BASE_URL || process.env.APPLICATION_BASE_URL;
  if (!base) {
    throw new Error('WEB_UI_BASE_URL or APPLICATION_BASE_URL must be set');
  }
  return base.replace(/\/+$/, '');
}
