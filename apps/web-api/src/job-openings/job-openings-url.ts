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
  const base = (process.env.WEB_UI_BASE_URL || process.env.APPLICATION_BASE_URL || 'https://www.plnetwork.io').replace(
    /\/+$/,
    ''
  );
  return `${base}/jobs?${JOB_BOARD_DETAIL_PARAM}=${encodeURIComponent(jobUid)}`;
}
