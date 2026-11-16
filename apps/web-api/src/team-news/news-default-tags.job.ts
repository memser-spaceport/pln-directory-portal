import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { isNewsDefaultTagsJobEnabled, NewsDefaultTagsService } from './news-default-tags.service';

/** Hourly AI news tags generation (LAB-3249). Off unless NEWS_DEFAULT_TAGS_JOB_ENABLED is "true". */
@Injectable()
export class NewsDefaultTagsJob {
  private readonly logger = new Logger(NewsDefaultTagsJob.name);

  constructor(private readonly defaultTags: NewsDefaultTagsService) {}

  @Cron('20 * * * *', { name: 'news-default-tags-generation', timeZone: 'UTC' })
  async run(): Promise<void> {
    if (!isNewsDefaultTagsJobEnabled()) return;
    try {
      await this.defaultTags.runGeneration();
    } catch (error) {
      this.logger.error(`AI news tags generation failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}
