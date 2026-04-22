import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import ogs from 'open-graph-scraper';
import { Readable } from 'stream';
import sizeOf from 'image-size';
import { AITeamEnrichmentResponse } from './team-enrichment.types';
import { AiProviderService } from '../shared/ai-provider.service';

const TEAM_ENRICHMENT_SYSTEM_PROMPT = `
You are a professional research assistant specializing in company/fund data enrichment.

TASK: Research and enrich the profile of the company or investment fund described below.

CRITICAL REQUIREMENTS:
1. All URLs must be valid and directly related to the company
2. Never fabricate URLs - only return URLs you found in search results
3. LinkedIn handlers should be in format "company/name" (without full URL)
4. Pay close attention to the EXACT entity name provided. If multiple entities with similar names exist, choose the one that EXACTLY matches the provided name.

WEBSITE DISCOVERY:
- The company may have its own standalone domain OR a dedicated page on a parent organization's website
- Web3/blockchain entities often exist as pages on ecosystem hubs, foundation sites, DAO portals, or governance forums
- Both standalone domains AND subpages on parent organization sites are acceptable as "website"
- Return ALL relevant candidate URLs in "websiteCandidates" (forum pages, hub pages, foundation pages, third-party profiles)
- Pick the best one as "website" — prefer official ecosystem hubs and dedicated pages over third-party aggregators
- For "websiteOwnerName": return the name as displayed on the found website/page

FIELDS TO POPULATE:

1. website: The company's best official website URL or dedicated page
1b. websiteOwnerName: The name as displayed on the found website/page. This is used to verify the website belongs to the correct entity.
1c. websiteCandidates: Array of ALL relevant URLs found for this entity (official pages, forum posts, hub pages, third-party profiles)

2. blog: Blog URL if available

3. contactMethod: Preferred method of contact. Could be an email address, Slack workspace/channel link, Discord server link/handle, or other contact method. Prefer email when found. Return exactly the value (e.g., "team@example.com", "https://slack.com/...", "discord.gg/...").

4. linkedinHandler: LinkedIn company handle (e.g., "company/puma-ai").
   CRITICAL: Before returning a handle, verify the page actually exists on LinkedIn.
   - Visit https://www.linkedin.com/company/<slug>/ and confirm it resolves to a real company page.
   - If LinkedIn redirects to /company/unavailable/ or the page 404s, the handle is invalid — return null.
   - Do NOT guess the slug from the company name; only return a handle you actually found in search results and confirmed resolves to a live page.
   - If you cannot confirm the page exists, return null rather than a speculative handle.

5. twitterHandler: Twitter/X handle without @ (e.g., "companyname")

6. telegramHandler: Telegram handle without @ (e.g., "companyname")

7. shortDescription: 1-2 sentence summary (max 200 chars)

8. longDescription: Detailed description of mission, products, and value proposition (max 1000 chars)

9. moreDetails: IMPORTANT - This should contain additional context such as:
   - Team information (founders, key people)
   - Company history or founding date
   - Notable achievements or milestones
   - Key features or differentiators
   - Portfolio companies (if investment fund)
   - Partnerships or integrations
   NEVER leave this empty if any additional information was found.

10. industryTags: Array of 2-6 SHORT industry/sector tags (1-3 words each) describing the industry or sector the company operates in.
   Examples: ["Blockchain", "DeFi", "AI", "Cloud Infrastructure", "Developer Tools", "Data Analytics", "Gaming", "NFT", "Privacy", "Fintech", "SaaS", "IoT", "Cybersecurity"]
   ALWAYS populate this field based on the company's domain.

11. investmentFocus: Array of 3-8 SHORT TAGS (1-2 words each) describing what the company/fund focuses on or invests in.
   DERIVE these tags from:
   - The company's products/services
   - Technologies they use or build
   - Their target market
   Examples: ["AI", "Crypto", "Web3", "Infrastructure", "Privacy", "Browser", "Fintech", "Mobile", "Security", "Data", "Payments"]
   ALWAYS populate this field.

NOTE: Logo discovery is handled separately — do NOT search for logos.

SEARCH STRATEGY:
1. Search for "[Company Name]" (exact, in quotes) to find general information
2. Search "[Company Name] official website"
3. Search "[Company Name] initiative" or "[Company Name] program" or "[Company Name] working group" (many Web3/crypto entities are initiatives within larger ecosystems)
4. Search for "[Company Name] Twitter" or "[Company Name] X" to find their Twitter/X handle
5. Search for "[Company Name] Telegram" to find their Telegram channel/group
6. Search for "[Company Name] contact" or "[Company Name] email" to find contact info
7. Search for "[Company Name]" + about or team
8. If the entity is part of a larger ecosystem (e.g., a DAO working group), search for it within that ecosystem's website

OUTPUT FORMAT — STRICT REQUIREMENTS:
- Your ENTIRE response MUST be a single JSON object that passes JSON.parse() as-is.
- Start the response with "{" and end with "}". No leading/trailing whitespace.
- NO prose, NO commentary, NO explanation, NO preamble, NO epilogue.
- NO markdown code fences (do not wrap the JSON in \`\`\`json or \`\`\`).
- All strings MUST be valid JSON strings (escape quotes and backslashes).
- Nullable fields: use null (not the string "null", not "N/A", not missing).
- All listed keys MUST be present — use null or [] when you have no value.

SCHEMA (all keys required, types must match exactly):
{
  "website": string | null,
  "websiteOwnerName": string | null,
  "websiteCandidates": string[],
  "blog": string | null,
  "contactMethod": string | null,
  "linkedinHandler": string | null,
  "twitterHandler": string | null,
  "telegramHandler": string | null,
  "shortDescription": string | null,
  "longDescription": string | null,
  "moreDetails": string | null,
  "industryTags": string[],
  "investmentFocus": string[],
  "confidence": { [field: string]: "high" | "medium" | "low" },
  "sources": string[]
}
`;

@Injectable()
export class TeamEnrichmentAiService {
  private readonly logger = new Logger(TeamEnrichmentAiService.name);

  private static readonly PROVIDER_ENV_VAR = 'TEAM_ENRICHMENT_AI_PROVIDER';

  constructor(private readonly aiProvider: AiProviderService) {}

  /**
   * Returns the AI model name used for team enrichment
   * (e.g., "gpt-4o", "gemini-2.5-flash", "claude-sonnet-4-6").
   */
  getModelName(): string {
    return this.aiProvider.getModelName(TeamEnrichmentAiService.PROVIDER_ENV_VAR);
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

      const providerEnvVar = TeamEnrichmentAiService.PROVIDER_ENV_VAR;
      const tools = this.aiProvider.getWebSearchTool(providerEnvVar, { searchContextSize: 'high' });

      const { text } = await generateText({
        model: this.aiProvider.getResponsesModel(providerEnvVar, {
          useSearchGrounding: true,
        }),
        system: TEAM_ENRICHMENT_SYSTEM_PROMPT,
        ...(Object.keys(tools).length > 0 && { tools }),
        prompt: userPrompt,
        temperature: 0.3,
        maxSteps: 3,
      });

      if (process.env.DEBUG_ENRICHMENT === 'true') {
        this.logger.debug(`AI response (len=${text?.length ?? 0}): ${text?.substring(0, 500)}`);
      }

      return this.parseAIResponse(text, teamName);
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

IMPORTANT: The entity name is EXACTLY "${teamName}". If there are similarly-named entities, make sure you find information about this exact one.

CONTEXT:
- This entity may operate in the Web3/blockchain/crypto ecosystem
- It could be a DAO initiative, working group, or venture fund within a larger protocol ecosystem
- Look for dedicated pages within ecosystem hubs and foundation sites, not just standalone domains

TASK:
1. Search for "${teamName}" to find additional information ${!existingData.website ? `
2. The website is unknown — prioritize finding the official website or dedicated page first
3. Return ALL candidate URLs found in "websiteCandidates"
4. Gather information about their team, history, and achievements for moreDetails
5. Find a contact method (email preferred, otherwise Slack, Discord, etc.)` : `
2. Gather information about their team, history, and achievements for moreDetails
3. Find a contact method (email preferred, otherwise Slack, Discord, etc.)`}

Respond with ONLY a valid JSON object as specified in system prompt.

Current Date: ${new Date().toISOString().split('T')[0]}
`;
  }

  private parseAIResponse(text: string, teamName?: string): AITeamEnrichmentResponse {
    if (!text || text.trim().length === 0) {
      this.logger.warn('AI returned empty response');
      return this.getEmptyResponse();
    }

    // The system prompt demands a raw JSON object. We only strip an optional
    // ```json ... ``` fence as a pragmatic fallback — if the model still emits
    // prose, the JSON.parse below will throw and we log the raw text.
    const trimmed = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      this.logger.warn(
        `Failed to parse AI response JSON for "${teamName}": ${e.message}. Raw response (len=${
          text.length
        }): ${text.substring(0, 500)}`
      );
      return this.getEmptyResponse();
    }

    try {
      const websiteCandidates: string[] = Array.isArray(parsed.websiteCandidates)
        ? parsed.websiteCandidates.map((u: string) => this.validateUrl(u)).filter(Boolean)
        : [];

      // Filter out low-confidence website results
      const websiteConfidence = parsed.confidence?.website?.toLowerCase();
      if (parsed.website && websiteConfidence !== 'high') {
        this.logger.warn(
          `Website confidence is "${websiteConfidence || 'unknown'}" (not "high"), discarding website: ${
            parsed.website
          }`
        );
        parsed.website = null;
      }

      // Verify websiteOwnerName matches the team name
      if (parsed.website && teamName && parsed.websiteOwnerName) {
        const nameMatch = this.isCompanyNameMatch(teamName, parsed.websiteOwnerName);
        if (!nameMatch) {
          this.logger.warn(
            `Website owner name mismatch: expected "${teamName}", found "${parsed.websiteOwnerName}" on ${parsed.website} — discarding website`
          );
          parsed.website = null;
        }
      }

      return {
        website: this.validateUrl(parsed.website),
        websiteOwnerName: parsed.websiteOwnerName || null,
        websiteCandidates,
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
      this.logger.warn(
        `Failed to normalize AI response for "${teamName}": ${e.message}. Raw response (len=${
          text.length
        }): ${text.substring(0, 500)}`
      );
      return this.getEmptyResponse();
    }
  }

  private getEmptyResponse(): AITeamEnrichmentResponse {
    return {
      website: null,
      websiteOwnerName: null,
      websiteCandidates: [],
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
      const domain = new URL(websiteUrl).hostname.replace(/^www\./, '');

      const candidates: string[] = [];

      // 1. Try open-graph-scraper — prioritize favicon (most reliable logo source)
      // Skip og:image and twitter:image as they are often banners/hero images, not logos
      try {
        const { result } = await ogs({
          url: websiteUrl,
          timeout: 10,
          fetchOptions: {
            headers: {
              'user-agent':
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            },
            redirect: 'follow' as RequestRedirect,
          },
        });

        // Favicon first — if it passes validation, use it immediately (it's almost always the actual logo)
        if (result.favicon) {
          const faviconUrl = result.favicon.startsWith('http')
            ? result.favicon
            : new URL(result.favicon, websiteUrl).href;
          candidates.push(faviconUrl);
          this.logger.log(`Found favicon for "${companyName}": ${faviconUrl}`);
        }
      } catch (ogsError) {
        this.logger.warn(`OG scraping failed for "${companyName}" at ${websiteUrl}: ${ogsError.message}`);
      }

      // 2. Fallback: logo APIs by domain (no JS rendering needed)
      if (candidates.length === 0) {
        this.logger.log(`No favicon found for "${companyName}", trying logo APIs for domain: ${domain}`);
      }
      candidates.push(
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        `https://icons.duckduckgo.com/ip3/${domain}.ico`
      );

      this.logger.log(`Total ${candidates.length} logo candidate(s) for "${companyName}", validating...`);

      // Validate all candidates: reject too small or too wide, prefer square
      const MIN_DIMENSION = 100; // reject images smaller than 100px on either side
      const MAX_ASPECT_RATIO = 1.5; // reject images wider/taller than 3:2
      let bestCandidate: { url: string; score: number } | null = null;

      for (const candidate of candidates) {
        let resolvedUrl: string;
        try {
          resolvedUrl = new URL(candidate, websiteUrl).href;
        } catch {
          this.logger.warn(`Invalid logo URL candidate for "${companyName}": ${candidate}`);
          continue;
        }

        const validated = await this.validateLogoUrl(resolvedUrl);
        if (!validated) {
          this.logger.warn(`Logo candidate failed validation for "${companyName}": ${resolvedUrl}`);
          continue;
        }

        // Check image dimensions and prefer square-ish logos
        const dimensions = await this.getImageDimensions(validated.buffer);
        if (dimensions) {
          const { width, height } = dimensions;
          const aspectRatio = Math.max(width, height) / Math.min(width, height);
          this.logger.log(
            `Logo candidate for "${companyName}": ${resolvedUrl} (${width}x${height}, ratio=${aspectRatio.toFixed(2)})`
          );

          if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
            this.logger.warn(
              `Logo candidate too small for "${companyName}": ${resolvedUrl} (${width}x${height}, min=${MIN_DIMENSION}px)`
            );
            continue;
          }

          if (aspectRatio > MAX_ASPECT_RATIO) {
            this.logger.warn(
              `Logo candidate too wide/tall for "${companyName}": ${resolvedUrl} (ratio=${aspectRatio.toFixed(
                2
              )}, max=${MAX_ASPECT_RATIO})`
            );
            continue;
          }

          // Score: lower aspect ratio = better (1.0 = perfect square)
          const score = 1 / aspectRatio;
          if (!bestCandidate || score > bestCandidate.score) {
            bestCandidate = { url: validated.url, score };
          }
        } else {
          // Can't determine dimensions — skip, we require known dimensions >= 100px
          this.logger.warn(`Logo candidate dimensions unknown for "${companyName}": ${resolvedUrl}, skipping`);
        }
      }

      if (bestCandidate) {
        this.logger.log(
          `Best logo for "${companyName}" via ${websiteUrl}: ${bestCandidate.url} (score=${bestCandidate.score.toFixed(
            2
          )})`
        );
        return { logoUrl: bestCandidate.url, domain };
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

  async validateLogoUrl(url: string | null | undefined): Promise<{ url: string; buffer: Buffer } | null> {
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
          const buffer = Buffer.from(await response.arrayBuffer());
          return { url, buffer };
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private async getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number } | null> {
    try {
      const result = sizeOf(buffer);
      if (result.width && result.height) {
        return { width: result.width, height: result.height };
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

  /**
   * Check if the website owner name matches the expected team name.
   * Uses contiguous substring matching only — NOT individual word presence.
   * e.g., "Arbitrum Ventures Program" matches "Arbitrum Ventures" (contiguous)
   * but  "Arbitrum Gaming Ventures" does NOT match "Arbitrum Ventures" (different entity)
   */
  private isCompanyNameMatch(expectedName: string, foundName: string): boolean {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
    const expected = normalize(expectedName);
    const found = normalize(foundName);

    // Exact match
    if (expected === found) return true;

    // Contiguous substring match: one name fully contains the other as a continuous string
    if (found.includes(expected) || expected.includes(found)) return true;

    this.logger.warn(`Website owner name "${foundName}" does not match expected "${expectedName}"`);
    return false;
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
}
