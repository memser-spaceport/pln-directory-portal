import { Injectable } from '@nestjs/common';
import { CoreTool, generateText, tool } from 'ai';
import { z } from 'zod';
import { LogService } from '../../shared/log.service';
import { AiProviderService, AiProviderType } from '../../shared/ai-provider.service';
import {
  HUSKY_SEARCH_FALLBACK_PROVIDER,
  HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR,
  HUSKY_SEARCH_PROVIDER_ENV_VAR,
} from '../husky-search.constants';

/** The web call ends before the 30 s stall limit of the answer stream. */
export const WEB_SEARCH_TIMEOUT_MS = 20_000;
/** At most this many web pages go back to the answer model. */
export const MAX_WEB_PAGES = 6;
/** Time limit to turn one Gemini grounding redirect into the page URL. */
export const REDIRECT_RESOLVE_TIMEOUT_MS = 3_000;

/** Gemini grounding gives a temporary redirect link to each page, not the page URL. */
const GEMINI_REDIRECT_RE = /^https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//;

/** Returned when the web search fails, times out or finds nothing. The answer then uses directory data only. */
export const WEB_SEARCH_NOT_AVAILABLE =
  'Web search not available: no web results could be retrieved. Answer from the directory data only, and do not mention web search.';

/** First line of a successful result. The answer model reads it as the labeling rule. */
export const WEB_RESULTS_HEADER =
  'Web search results (public web, not directory data). In the answer, label facts from here as web information, ' +
  'put directory facts first, and cite each fact with the [WebLink] URL of its page.';

const WEB_SEARCH_SYSTEM_PROMPT = `You search the public web for a directory assistant.
- Search the web for the query and write a short factual summary (at most 8 sentences) of what the pages say.
- Use only facts from the pages that you found. Do not add facts from your own knowledge.
- After the summary, write a line "Sources:" and then the URL of each page that you used, one per line.`;

const WebSearchParams = z.object({
  query: z
    .string()
    .min(1)
    .max(300)
    .describe(
      'Short web search terms for the topic of the question only (for example "Saturn Grid storage startup"). ' +
        "Never put the user's email, name or other personal data, or data from investor or warm-intro tools, in the query."
    ),
});

interface WebPage {
  url: string;
  title: string;
}

interface GroundingChunk {
  web?: { uri?: string; title?: string } | null;
}

const URL_RE = /https?:\/\/[^\s)\]>"'<]+/g;

function cleanUrl(url: string): string {
  return url.replace(/[.,;:]+$/, '');
}

function pagesFromGrounding(providerMetadata: unknown): WebPage[] {
  const chunks = (
    providerMetadata as { google?: { groundingMetadata?: { groundingChunks?: GroundingChunk[] | null } } }
  )?.google?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  return chunks
    .filter((chunk) => typeof chunk?.web?.uri === 'string' && chunk.web.uri)
    .map((chunk) => ({ url: chunk.web?.uri as string, title: chunk.web?.title || (chunk.web?.uri as string) }));
}

function pagesFromText(text: string): WebPage[] {
  return (text.match(URL_RE) ?? []).map((url) => {
    const cleaned = cleanUrl(url);
    return { url: cleaned, title: cleaned };
  });
}

function uniquePages(pages: WebPage[]): WebPage[] {
  const seen = new Set<string>();
  const unique: WebPage[] = [];
  for (const page of pages) {
    if (seen.has(page.url)) continue;
    seen.add(page.url);
    unique.push(page);
  }
  return unique.slice(0, MAX_WEB_PAGES);
}

/** The summary without the "Sources:" list, which the page lines replace. */
function summaryOf(text: string): string {
  const index = text.search(/(^|\s)\**sources\**\s*:/i);
  return (index === -1 ? text : text.slice(0, index)).trim();
}

/** Aborts when the parent signal aborts or when the time limit ends. */
function linkedSignal(timeoutMs: number, parent?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  if (parent?.aborted) abort();
  parent?.addEventListener('abort', abort);
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', abort);
    },
  };
}

function oneLine(text: string): string {
  return text
    .replace(/[[\]\n\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The `searchWeb` tool of AI Search. The answer model calls it only when the directory
 * tools return too little. It makes its own grounded call, because Gemini rejects search
 * grounding together with function tools in one request. It gets only the query that the
 * model writes; no member or session data is passed to it.
 */
@Injectable()
export class WebSearchTool {
  constructor(private logger: LogService, private aiProvider: AiProviderService) {}

  getTool(): CoreTool {
    return tool({
      description:
        'Search the public web. Call this only when the directory tools returned nothing relevant or too little ' +
        'to answer the question well. Do not call it when the directory data answers the question.',
      parameters: WebSearchParams,
      execute: (args, options) => this.execute(args, options?.abortSignal),
    });
  }

  /**
   * Gemini runs the search through model-level grounding and OpenAI through its web search
   * tool. Anthropic web search is not translated by the installed SDK, so an Anthropic or
   * Opus setup searches with Gemini.
   */
  resolveSearchProvider(): AiProviderType {
    const configured = process.env[HUSKY_SEARCH_PROVIDER_ENV_VAR] as AiProviderType | undefined;
    const opus = process.env[HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR]?.trim().toLowerCase() === 'true';
    if (opus || configured === 'anthropic') return 'gemini';
    if (configured === 'openai' || configured === 'gemini') return configured;
    return HUSKY_SEARCH_FALLBACK_PROVIDER;
  }

  /**
   * Turns a Gemini grounding redirect into the page URL (the Location header), so the
   * answer cites a short, lasting URL. On failure the redirect link stays.
   */
  async resolvePageUrl(url: string, parent: AbortSignal): Promise<string> {
    if (!GEMINI_REDIRECT_RE.test(url)) return url;
    const { signal, done } = linkedSignal(REDIRECT_RESOLVE_TIMEOUT_MS, parent);
    try {
      const response = await fetch(url, { method: 'GET', redirect: 'manual', signal });
      const location = response.headers.get('location');
      return location && /^https?:\/\//.test(location) ? location : url;
    } catch (error) {
      this.logger.info(`Husky web search could not resolve a grounding redirect: ${error?.message ?? error}`);
      return url;
    } finally {
      done();
    }
  }

  private async execute(args: z.infer<typeof WebSearchParams>, parentSignal?: AbortSignal): Promise<string> {
    const query = args.query.trim();
    const provider = this.resolveSearchProvider();
    this.logger.info(`Husky web search (${provider}) for query: ${JSON.stringify(query)}`);
    const { signal, done } = linkedSignal(WEB_SEARCH_TIMEOUT_MS, parentSignal);
    try {
      const { text, experimental_providerMetadata: providerMetadata } = await generateText({
        model: this.aiProvider.getResponsesModel(undefined, { providerOverride: provider, useSearchGrounding: true }),
        ...(provider === 'openai'
          ? { tools: this.aiProvider.getWebSearchTool(undefined, { fallbackProvider: 'openai' }) }
          : {}),
        system: WEB_SEARCH_SYSTEM_PROMPT,
        prompt: query,
        maxSteps: 2,
        abortSignal: signal,
      });

      const grounded = pagesFromGrounding(providerMetadata).slice(0, MAX_WEB_PAGES * 2);
      const found = grounded.length ? grounded : pagesFromText(text ?? '');
      const resolved = await Promise.all(
        found.map(async (page) => ({ ...page, url: await this.resolvePageUrl(page.url, signal) }))
      );
      const pages = uniquePages(resolved);
      const summary = summaryOf(text ?? '');
      if (!pages.length || !summary) {
        this.logger.error(`Husky web search (${provider}) returned no pages for query: ${JSON.stringify(query)}`);
        return WEB_SEARCH_NOT_AVAILABLE;
      }

      const pageLines = pages.map((page) => `Web page: ${oneLine(page.title)} [WebLink](${page.url})`);
      return [WEB_RESULTS_HEADER, `Summary: ${summary}`, pageLines.join('\n')].join('\n\n');
    } catch (error) {
      this.logger.error(
        `Husky web search (${provider}) failed for query ${JSON.stringify(query)}: ${error?.message ?? error}`
      );
      return WEB_SEARCH_NOT_AVAILABLE;
    } finally {
      done();
    }
  }
}
