/**
 * Event writes in LabOS (submit, my events, edit, delete, form lookups) are on only when `EVENTS_LOCAL_SUBMIT_ENABLED` is `true`.
 * Until the cutover the events service owns submissions and these routes answer 404. Case is ignored, as for the API's
 * other switches: the deploy's config step writes an SSM `true` as `True`.
 */
export function isLocalEventSubmitEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.EVENTS_LOCAL_SUBMIT_ENABLED?.trim().toLowerCase() === 'true';
}
