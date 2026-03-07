import { Injectable, Logger } from '@nestjs/common';
import { generateText, LanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { Readable } from 'stream';
import { AITeamEnrichmentResponse } from './team-enrichment.types';

const TEAM_ENRICHMENT_SYSTEM_PROMPT = `
You are a professional research assistant specializing in company/fund data enrichment.

TASK: Research and enrich the profile of the company or investment fund described below.

CRITICAL REQUIREMENTS:
1. Use web_search_preview tool to find information about the company/fund
2. All URLs must be valid and directly related to the company
3. Never fabricate URLs - only return URLs you found in search results
4. LinkedIn handlers should be in format "company/name" (without full URL)

FIELDS TO POPULATE:

1. blog: Blog URL if available

2. contactMethod: Preferred method of contact. Could be an email address, Slack workspace/channel link, Discord server link/handle, or other contact method. Prefer email when found. Return exactly the value (e.g., "team@example.com", "https://slack.com/...", "discord.gg/...").

3. linkedinHandler: LinkedIn company handle (e.g., "company/puma-ai")

4. twitterHandler: Twitter/X handle without @ (e.g., "companyname")

5. telegramHandler: Telegram handle without @ (e.g., "companyname")

6. shortDescription: 1-2 sentence summary (max 200 chars)

7. longDescription: Detailed description of mission, products, and value proposition (max 1000 chars)

8. moreDetails: IMPORTANT - This should contain additional context such as:
   - Team information (founders, key people)
   - Company history or founding date
   - Notable achievements or milestones
   - Key features or differentiators
   - Portfolio companies (if investment fund)
   - Partnerships or integrations
   NEVER leave this empty if any additional information was found.

9. industryTags: Array of 2-6 SHORT industry/sector tags (1-3 words each) describing the industry or sector the company operates in.
   Examples: ["Blockchain", "DeFi", "AI", "Cloud Infrastructure", "Developer Tools", "Data Analytics", "Gaming", "NFT", "Privacy", "Fintech", "SaaS", "IoT", "Cybersecurity"]
   ALWAYS populate this field based on the company's domain.

10. investmentFocus: Array of 3-8 SHORT TAGS (1-2 words each) describing what the company/fund focuses on or invests in.
   DERIVE these tags from:
   - The company's products/services
   - Technologies they use or build
   - Their target market
   Examples: ["AI", "Crypto", "Web3", "Infrastructure", "Privacy", "Browser", "Fintech", "Mobile", "Security", "Data", "Payments"]
   ALWAYS populate this field.

NOTE: Logo discovery is handled separately — do NOT search for logos.

SEARCH STRATEGY:
1. Search for "[Company Name]" to find general information
2. Search for "[Company Name] Twitter" or "[Company Name] X" to find their Twitter/X handle
3. Search for "[Company Name] Telegram" to find their Telegram channel/group
4. Search for "[Company Name] contact" or "[Company Name] email" to find contact info
5. Search for "[Company Name]" + about or team

CRITICAL: You MUST ALWAYS respond with valid JSON.

OUTPUT FORMAT - Respond with ONLY this JSON (no markdown, no explanation):
{
  "blog": "https://..." or null,
  "contactMethod": "email@example.com" or "https://slack.com/..." or "discord.gg/..." or null,
  "linkedinHandler": "company/..." or null,
  "twitterHandler": "handle" or null,
  "telegramHandler": "handle" or null,
  "shortDescription": "...",
  "longDescription": "...",
  "moreDetails": "Additional context about team, history, achievements...",
  "industryTags": ["Tag1", "Tag2", ...],
  "investmentFocus": ["Tag1", "Tag2", "Tag3", ...],
  "confidence": {
    "blog": "high" | "medium" | "low",
    "contactMethod": "high" | "medium" | "low",
    "twitterHandler": "high" | "medium" | "low",
    "telegramHandler": "high" | "medium" | "low",
    "shortDescription": "high" | "medium" | "low",
    "longDescription": "high" | "medium" | "low",
    "moreDetails": "high" | "medium" | "low",
    "industryTags": "high" | "medium" | "low",
    "investmentFocus": "high" | "medium" | "low"
  },
  "sources": ["url1", "url2", ...]
}
`;

@Injectable()
export class TeamEnrichmentAiService {
  private readonly logger = new Logger(TeamEnrichmentAiService.name);
  private readonly MODEL_NAME: string;

  constructor() {
    this.MODEL_NAME = process.env.OPENAI_TEAM_ENRICHMENT_MODEL || 'gpt-4o';
  }

  async enrichTeamViaAI(
    teamName: string,
    existingData: {
      website?: string | null;
      contactMethod?: string | null;
      linkedinHandler?: string | null;
      twitterHandler?: string | null;
      telegramHandler?: string | null;
      shortDescription?: string | null;
      longDescription?: string | null;
    }
  ): Promise<AITeamEnrichmentResponse> {
    try {
      const userPrompt = this.buildUserPrompt(teamName, existingData);

      const { text } = await generateText({
        model: openai.responses(this.MODEL_NAME) as LanguageModel,
        system: TEAM_ENRICHMENT_SYSTEM_PROMPT,
        tools: {
          web_search_preview: openai.tools.webSearchPreview({
            searchContextSize: 'high',
          }),
        },
        prompt: userPrompt,
        temperature: 0.3,
        maxSteps: 3,
      });

      if (process.env.DEBUG_ENRICHMENT === 'true') {
        this.logger.debug(`AI response: ${text?.substring(0, 100)}...`);
      }

      return this.parseAIResponse(text);
    } catch (error) {
      this.logger.error(`AI enrichment failed for "${teamName}": ${error.message}`, error.stack);
      return this.getEmptyResponse();
    }
  }

  private buildUserPrompt(
    teamName: string,
    existingData: {
      website?: string | null;
      contactMethod?: string | null;
      linkedinHandler?: string | null;
      twitterHandler?: string | null;
      telegramHandler?: string | null;
      shortDescription?: string | null;
      longDescription?: string | null;
    }
  ): string {
    const existingDescription = existingData.shortDescription || existingData.longDescription || '';

    return `
Research and enrich the profile for this company/fund:

Company Name: ${teamName}
${existingData.website ? `Existing Website: ${existingData.website}` : 'Website: Unknown'}
${existingData.contactMethod ? `Existing Contact: ${existingData.contactMethod}` : 'Contact Method: Unknown'}
${existingData.linkedinHandler ? `Existing LinkedIn: ${existingData.linkedinHandler}` : 'LinkedIn: Unknown'}
${existingData.twitterHandler ? `Existing Twitter/X: ${existingData.twitterHandler}` : 'Twitter/X: Unknown'}
${existingData.telegramHandler ? `Existing Telegram: ${existingData.telegramHandler}` : 'Telegram: Unknown'}
${existingDescription ? `Existing Description: ${existingDescription}` : 'Description: Not available'}

TASK:
1. Search for "${teamName}" to find additional information
2. Gather information about their team, history, and achievements for moreDetails
3. Find a contact method (email preferred, otherwise Slack, Discord, etc.)

Respond with ONLY a valid JSON object as specified in system prompt.

Current Date: ${new Date().toISOString().split('T')[0]}
`;
  }

  private parseAIResponse(text: string): AITeamEnrichmentResponse {
    if (!text || text.trim().length === 0) {
      this.logger.warn('AI returned empty response');
      return this.getEmptyResponse();
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.warn(`No JSON found in AI response: ${text.substring(0, 100)}...`);
      return this.getEmptyResponse();
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        blog: this.validateUrl(parsed.blog),
        contactMethod: this.sanitizeContactMethod(parsed.contactMethod),
        linkedinHandler: this.sanitizeLinkedInHandler(parsed.linkedinHandler),
        twitterHandler: this.sanitizeHandle(parsed.twitterHandler),
        telegramHandler: this.sanitizeHandle(parsed.telegramHandler),
        shortDescription: this.truncateString(parsed.shortDescription, 200),
        longDescription: this.truncateString(parsed.longDescription, 1000),
        moreDetails: parsed.moreDetails || null,
        industryTags: Array.isArray(parsed.industryTags)
          ? parsed.industryTags.filter((t: any) => typeof t === 'string')
          : [],
        investmentFocus: Array.isArray(parsed.investmentFocus)
          ? parsed.investmentFocus.filter((t: any) => typeof t === 'string')
          : [],
        confidence: parsed.confidence || {},
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      };
    } catch (e) {
      this.logger.warn(`Failed to parse AI response JSON: ${e.message}`);
      return this.getEmptyResponse();
    }
  }

  private getEmptyResponse(): AITeamEnrichmentResponse {
    return {
      blog: null,
      contactMethod: null,
      linkedinHandler: null,
      twitterHandler: null,
      telegramHandler: null,
      shortDescription: null,
      longDescription: null,
      moreDetails: null,
      industryTags: [],
      investmentFocus: [],
      confidence: {},
      sources: [],
    };
  }

  async fetchLogoFromWebsite(
    companyName: string,
    websiteUrl?: string | null
  ): Promise<{ logoUrl: string; domain: string } | null> {
    if (!websiteUrl) {
      this.logger.debug(`No website URL for "${companyName}", skipping website logo fetch`);
      return null;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(websiteUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PLNEnrichment/1.0)',
          Accept: 'text/html',
        },
        redirect: 'follow',
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.logger.debug(`Website returned HTTP ${response.status} for "${companyName}" at ${websiteUrl}`);
        return null;
      }

      const html = await response.text();
      const domain = new URL(websiteUrl).hostname.replace(/^www\./, '');

      this.logger.log(`Fetched HTML for "${companyName}" (${websiteUrl}): ${html.length} chars`);

      const candidates: string[] = [];

      const ogImage = this.extractMetaContent(html, 'og:image');
      if (ogImage) {
        this.logger.log(`Found og:image for "${companyName}": ${ogImage}`);
        candidates.push(ogImage);
      } else {
        this.logger.log(`No og:image meta tag found for "${companyName}"`);
      }

      const twitterImage = this.extractMetaContent(html, 'twitter:image');
      if (twitterImage) {
        this.logger.log(`Found twitter:image for "${companyName}": ${twitterImage}`);
        candidates.push(twitterImage);
      }

      const linkIcons = this.extractLinkIcons(html);
      if (linkIcons.length > 0) {
        this.logger.log(`Found ${linkIcons.length} link icon(s) for "${companyName}": ${linkIcons.join(', ')}`);
      }
      candidates.push(...linkIcons);

      if (candidates.length === 0) {
        this.logger.warn(`No logo candidates found for "${companyName}" at ${websiteUrl}`);
        return null;
      }

      this.logger.log(`Total ${candidates.length} logo candidate(s) for "${companyName}", validating...`);

      for (const candidate of candidates) {
        let resolvedUrl: string;
        try {
          resolvedUrl = new URL(candidate, websiteUrl).href;
        } catch {
          this.logger.warn(`Invalid logo URL candidate for "${companyName}": ${candidate}`);
          continue;
        }

        const validated = await this.validateLogoUrl(resolvedUrl);
        if (validated) {
          this.logger.log(`Logo validated for "${companyName}" via ${websiteUrl}: ${validated}`);
          return { logoUrl: validated, domain };
        } else {
          this.logger.warn(`Logo candidate failed validation for "${companyName}": ${resolvedUrl}`);
        }
      }

      this.logger.warn(`All ${candidates.length} logo candidates failed validation for "${companyName}"`);
      return null;
    } catch (error) {
      this.logger.warn(`Website logo fetch failed for "${companyName}" at ${websiteUrl}: ${error.message}`);
      return null;
    }
  }

  async downloadImageAsMulterFile(imageUrl: string, filename: string): Promise<Express.Multer.File> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PLNEnrichment/1.0)',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to download image: HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      fieldname: 'file',
      originalname: filename,
      encoding: '7bit',
      mimetype: contentType,
      size: buffer.length,
      buffer,
      stream: Readable.from(buffer),
      destination: '',
      filename,
      path: '',
    };
  }

  async validateLogoUrl(url: string | null | undefined): Promise<string | null> {
    if (!url) return null;

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LogoValidator/1.0)',
        },
      });

      clearTimeout(timeout);

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.startsWith('image/')) {
          return url;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  sanitizeContactMethod(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Accept as-is: email addresses, URLs (Slack/Discord links), or plain handles
    return trimmed;
  }

  sanitizeLinkedInHandler(handler: string | null | undefined): string | null {
    if (!handler) return null;
    const match = handler.match(/(?:linkedin\.com\/)?(?:in\/|company\/)?([a-zA-Z0-9_-]+)/);
    if (match) {
      if (handler.includes('company/')) {
        return `company/${match[1]}`;
      }
      return match[1];
    }
    return handler;
  }

  sanitizeHandle(handle: string | null | undefined): string | null {
    if (!handle) return null;
    let cleaned = handle.replace(/^@/, '');
    const urlMatch = cleaned.match(/(?:twitter\.com|x\.com|t\.me)\/([a-zA-Z0-9_]+)/);
    if (urlMatch) {
      cleaned = urlMatch[1];
    }
    return cleaned || null;
  }

  truncateString(str: string | null | undefined, maxLength: number): string | null {
    if (!str) return null;
    return str.length > maxLength ? str.substring(0, maxLength - 3) + '...' : str;
  }

  private validateUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return url;
    } catch {
      return null;
    }
  }

  private extractMetaContent(html: string, tag: string): string | null {
    const pattern = new RegExp(
      `<meta\\s+(?:[^>]*?(?:property|name)\\s*=\\s*["']${tag}["'][^>]*?content\\s*=\\s*["']([^"']+)["']|[^>]*?content\\s*=\\s*["']([^"']+)["'][^>]*?(?:property|name)\\s*=\\s*["']${tag}["'])`,
      'i'
    );
    const match = html.match(pattern);
    return match?.[1] || match?.[2] || null;
  }

  private extractLinkIcons(html: string): string[] {
    const candidates: Array<{ href: string; size: number }> = [];
    const linkPattern = /<link\s+[^>]*?rel\s*=\s*["']([^"']+)["'][^>]*?href\s*=\s*["']([^"']+)["'][^>]*?\/?>/gi;
    const linkPatternAlt = /<link\s+[^>]*?href\s*=\s*["']([^"']+)["'][^>]*?rel\s*=\s*["']([^"']+)["'][^>]*?\/?>/gi;

    const iconRels = ['icon', 'shortcut icon', 'apple-touch-icon', 'apple-touch-icon-precomposed'];

    for (const pattern of [linkPattern, linkPatternAlt]) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(html)) !== null) {
        const isAlt = pattern === linkPatternAlt;
        const rel = (isAlt ? match[2] : match[1]).toLowerCase();
        const href = isAlt ? match[1] : match[2];

        if (!iconRels.some((r) => rel.includes(r))) continue;

        const sizesMatch = match[0].match(/sizes\s*=\s*["'](\d+)x(\d+)["']/i);
        const size = sizesMatch ? parseInt(sizesMatch[1], 10) : 0;

        candidates.push({ href, size });
      }
    }

    candidates.sort((a, b) => b.size - a.size);

    return candidates
      .map((c) => c.href)
      .filter((href) => {
        const ext = href.split('?')[0].split('.').pop()?.toLowerCase() || '';
        return ['png', 'jpg', 'jpeg', 'svg', 'ico', 'webp', 'gif'].includes(ext) || !ext.match(/^[a-z]{2,5}$/);
      });
  }
}
