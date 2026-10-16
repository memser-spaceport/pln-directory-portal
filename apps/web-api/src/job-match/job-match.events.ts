/** Emitted by `JobMatchRunner` right after a full run is marked COMPLETED, and only then (LAB-2850). */
export const JOB_MATCH_RUN_COMPLETED = 'job-match.run-completed';

export interface JobMatchRunCompletedPayload {
  runUid: string;
  /** UTC run date, `yyyy-mm-dd`. */
  runDate: string;
  /** ISO timestamp. */
  completedAt: string;
}
