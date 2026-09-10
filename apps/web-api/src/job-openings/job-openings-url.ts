/** Query param the job board reads to open a role's in-app description drawer. */
export const JOB_BOARD_DETAIL_PARAM = 'job';

/**
 * Canonical URL for a role on the Directory job board — the page plus the
 * query param that opens that role's drawer.
 *
 * Refer and apply emails used to send `JobOpening.sourceLink` (the company's
 * own posting). Recipients now land on our board instead, so they read and
 * apply in-app rather than bouncing out to Greenhouse.
 */
export function jobBoardDetailUrl(jobUid: string): string {
  return `${webUiBase()}/jobs?${JOB_BOARD_DETAIL_PARAM}=${encodeURIComponent(jobUid)}`;
}

/** `utm_source` values the profile page reads back to attribute an email click. */
export const JOB_REFERRAL_EMAIL_UTM_SOURCE = 'job_referral_email';
export const JOB_REFERRAL_NOTICE_EMAIL_UTM_SOURCE = 'job_referral_notice_email';
export const JOB_APPLICATION_EMAIL_UTM_SOURCE = 'job_application_email';

/**
 * A Directory profile link as it appears in a refer/apply email, tagged so the
 * click can be attributed.
 *
 * Untagged, these links landed on `/members/<uid>` and the arrival was
 * indistinguishable from any other profile view — the referral funnel ended at
 * the send. `content` says whose card the link was on, since the referral
 * email carries both the referrer's and the referred person's.
 */
export function memberProfileEmailUrl(
  memberUid: string,
  utm: { source: string; content: string; jobUid: string }
): string {
  const query = new URLSearchParams({
    utm_source: utm.source,
    utm_medium: 'email',
    utm_content: utm.content,
    job_uid: utm.jobUid,
  });
  return `${webUiBase()}/members/${encodeURIComponent(memberUid)}?${query.toString()}`;
}

function webUiBase(): string {
  return (process.env.WEB_UI_BASE_URL || process.env.APPLICATION_BASE_URL || 'https://www.plnetwork.io').replace(
    /\/+$/,
    ''
  );
}
