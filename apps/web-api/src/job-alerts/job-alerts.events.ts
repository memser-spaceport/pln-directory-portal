export const JOB_INGEST_COMPLETED = 'job-ingest.completed';

export interface JobIngestCompletedPayload {
  runId: string;
  source: string | null;
  received: number;
  created: number;
  updated: number;
  failed: number;
  completedAt: string;
}
