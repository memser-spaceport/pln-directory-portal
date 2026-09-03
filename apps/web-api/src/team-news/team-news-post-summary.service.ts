import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { AiProviderService } from '../shared/ai-provider.service';
import { stripHtmlToPlainText } from './team-news-body-html.util';

const PROVIDER_ENV_VAR = 'TEAM_NEWS_POST_AI_PROVIDER';
const SUMMARY_MAX_CHARS = 280;

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
        system: `You write short teasers for a team news feed card. Use only facts present in the body. One or two sentences, no bullet points, no invented details, no quotes.`,
        prompt: `Headline: ${title}\n\nBody:\n${plain}\n\nWrite a teaser of at most ${SUMMARY_MAX_CHARS} characters.`,
        temperature: 0.3,
        maxTokens: 120,
      });

      const summary = text.trim().slice(0, SUMMARY_MAX_CHARS);
      if (summary) return summary;
    } catch (error) {
      this.logger.warn(`Team news post summary generation failed: ${(error as Error).message}`);
    }

    return plain.slice(0, SUMMARY_MAX_CHARS);
  }
}
