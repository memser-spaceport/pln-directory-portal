import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { AI_APPS_DEPLOY_JOB_CONCURRENCY, AI_APPS_DEPLOY_QUEUE } from './ai-apps.constants';
import { AiAppDeployJobData, AiAppsService } from './ai-apps.service';

/**
 * Runs queued AI App deploy attempts. A job re-processed after a web-api
 * restart (Bull stalled-job pickup) resumes from the row's deploy phase — see
 * `AiAppsService.executeDeployJob`.
 */
@Processor(AI_APPS_DEPLOY_QUEUE)
export class AiAppsDeployProcessor {
  constructor(private readonly aiAppsService: AiAppsService) {}

  @Process({ name: 'deploy', concurrency: AI_APPS_DEPLOY_JOB_CONCURRENCY })
  async handle(job: Job<AiAppDeployJobData>): Promise<void> {
    await this.aiAppsService.runDeployJob(job);
  }
}
