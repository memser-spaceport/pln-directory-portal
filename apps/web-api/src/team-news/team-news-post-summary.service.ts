import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { AiProviderService } from '../shared/ai-provider.service';
import { stripHtmlToPlainText } from './team-news-body-html.util';

const PROVIDER_ENV_VAR = 'TEAM_NEWS_POST_AI_PROVIDER';
const SUMMARY_MAX_CHARS = 480;

@Injectable()
export class TeamNewsPostSummaryService {
  private readonly logger = new Logger(TeamNewsPostSummaryService.name);

  constructor(private readonly aiProvider: AiProviderService) {}

  async summarizeBody(contentHtml: string, title: string): Promise<string> {
    const plain = stripHtmlToPlainText(contentHtml);
    if (!plain) return '';

    try {
      const { text } = await generateText({
        model: this.aiProvider.getResponsesModel(PROVIDER_ENV_VAR, { useSearchGrounding: false }),
        system: `You write feed-card summaries for team news. State the main point of the post in one or two complete sentences. Use only facts present in the body. No hype, no bullet points, no invented details, no quotes. Respond only with the summary.`,
        prompt: `Headline: ${title}\n\nBody:\n${contentHtml}\n\nSummarize the main point in one or two sentences (at most ${SUMMARY_MAX_CHARS} characters).`,
        temperature: 0.1,
        maxTokens: 300,
      });

      const summary = text.trim().slice(0, SUMMARY_MAX_CHARS);
      if (summary) return summary;
    } catch (error) {
      this.logger.warn(`Team news post summary generation failed: ${(error as Error).message}`);
    }

    return plain.slice(0, SUMMARY_MAX_CHARS);
  }
}
