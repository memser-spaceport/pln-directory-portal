import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { generateText, LanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import * as fs from 'fs';

import {
  AIEnrichmentResponse,
  ApplyResult,
  EnrichedFundData,
  EnrichmentOutput,
  FundToEnrich,
  SkippedFund,
} from './enrich-funds.types';

// System prompt for fund enrichment
const FUND_ENRICHMENT_SYSTEM_PROMPT = `
You are a professional research assistant specializing in company/fund data enrichment.

TASK: Research and enrich the profile of the company or investment fund described below.

CRITICAL REQUIREMENTS:
1. Use web_search_preview tool to find information about the company/fund
2. All URLs must be valid and directly related to the company
3. Never fabricate URLs - only return URLs you found in search results
4. LinkedIn handlers should be in format "company/name" (without full URL)

FIELDS TO POPULATE:

1. website: Official website URL (https://...)

2. blog: Blog URL if available

3. linkedinHandler: LinkedIn company handle (e.g., "company/puma-ai")

4. shortDescription: 1-2 sentence summary (max 200 chars)

5. longDescription: Detailed description of mission, products, and value proposition (max 1000 chars)

6. moreDetails: IMPORTANT - This should contain additional context such as:
   - Team information (founders, key people)
   - Company history or founding date
   - Notable achievements or milestones
   - Key features or differentiators
   - Portfolio companies (if investment fund)
   - Partnerships or integrations
   NEVER leave this empty if any additional information was found.

7. investmentFocus: IMPORTANT - Array of 3-8 SHORT TAGS (1-2 words each) that describe what the company focuses on.
   DERIVE these tags from:
   - The company's products/services
   - The industry they operate in
   - Technologies they use or build
   - Their target market

   Example tags: ["AI", "Crypto", "Web3", "Blockchain", "DeFi", "Infrastructure", "Gaming", "NFT", "Privacy", "Browser", "Fintech", "SaaS", "Enterprise", "Mobile", "Security", "Data", "Cloud", "IoT", "AR/VR", "Payments"]

   For example, a "Browser with built-in LLMs & Wallets, Private by design" should have tags like:
   ["AI", "Privacy", "Web3", "Crypto", "Browser"]

   ALWAYS populate this field based on what the company does.

8. logoUrl: Direct, publicly accessible URL to the company's logo image.
   IMPORTANT: Only return URLs that are directly accessible (no authentication required).

   Best sources for logos (in order of preference):
   - Twitter/X profile image: https://pbs.twimg.com/profile_images/... (search for company Twitter)
   - Company website Open Graph image: Look for og:image meta tag
   - Crunchbase or PitchBook company profile images
   - GitHub organization avatar (if tech company)
   - Company press kit or media page

   DO NOT use:
   - LinkedIn logos (require authentication)
   - Made-up URLs like "/logo.png" without verification
   - URLs that return 404 or require login

SEARCH STRATEGY:
1. Search for "[Company Name]" + website or official site
2. Search for "[Company Name] Twitter" or "[Company Name] X" to find their Twitter profile
3. Search for "[Company Name] Crunchbase" for company profile with logo
4. Search for "[Company Name]" + about or team

CRITICAL: You MUST ALWAYS respond with valid JSON. Never leave investmentFocus empty - derive tags from what you know about the company.

OUTPUT FORMAT - Respond with ONLY this JSON (no markdown, no explanation):
{
  "website": "https://...",
  "blog": "https://..." or null,
  "linkedinHandler": "company/..." or null,
  "shortDescription": "...",
  "longDescription": "...",
  "moreDetails": "Additional context about team, history, achievements...",
  "investmentFocus": ["Tag1", "Tag2", "Tag3", ...],
  "logoUrl": "https://..." or null,
  "confidence": {
    "website": "high" | "medium" | "low",
    "shortDescription": "high" | "medium" | "low",
    "longDescription": "high" | "medium" | "low",
    "moreDetails": "high" | "medium" | "low",
    "investmentFocus": "high" | "medium" | "low",
    "logoUrl": "high" | "medium" | "low"
  },
  "sources": ["url1", "url2", ...]
}
`;

@Injectable()
export class EnrichFundsService implements OnModuleInit, OnModuleDestroy {
  private readonly MODEL_NAME: string;
  private prisma: PrismaClient;

  constructor() {
    this.MODEL_NAME = process.env.OPENAI_FUND_ENRICHMENT_MODEL || 'gpt-4o';
    this.prisma = new PrismaClient();
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  private log(message: string) {
    console.log(`[EnrichFundsService] ${message}`);
  }

  private logError(message: string, error?: any) {
    console.error(`[EnrichFundsService] ERROR: ${message}`, error?.stack || error || '');
  }

  /**
   * Find funds with incomplete data
   */
  async findFundsWithIncompleteData(limit?: number, fundUid?: string, teamNames?: string[]): Promise<FundToEnrich[]> {
    const funds = await this.prisma.team.findMany({
      where: {
        isFund: true,
        ...(fundUid ? { uid: fundUid } : {}),
        ...(teamNames && teamNames.length > 0 ? { name: { in: teamNames } } : {}),
        OR: [
          { website: null },
          { website: '' },
          { blog: null },
          { linkedinHandler: null },
          { linkedinHandler: '' },
          { shortDescription: null },
          { shortDescription: '' },
          { longDescription: null },
          { longDescription: '' },
          { moreDetails: null },
          {
            investorProfile: {
              investmentFocus: { isEmpty: true },
            },
          },
          { investorProfile: null },
        ],
      },
      select: {
        uid: true,
        name: true,
        website: true,
        blog: true,
        linkedinHandler: true,
        shortDescription: true,
        longDescription: true,
        moreDetails: true,
        investorProfile: {
          select: {
            uid: true,
            investmentFocus: true,
          },
        },
        logo: {
          select: {
            uid: true,
            url: true,
          },
        },
      },
      ...(limit ? { take: limit } : {}),
      orderBy: { name: 'asc' },
    });

    return funds as FundToEnrich[];
  }

  /**
   * Enrich a single fund using AI web search
   */
  async enrichFund(fund: FundToEnrich): Promise<EnrichedFundData> {
    const originalData = {
      website: fund.website,
      blog: fund.blog,
      linkedinHandler: fund.linkedinHandler,
      shortDescription: fund.shortDescription,
      longDescription: fund.longDescription,
      moreDetails: fund.moreDetails,
      investorProfile: fund.investorProfile
        ? {
            uid: fund.investorProfile.uid,
            investmentFocus: fund.investorProfile.investmentFocus || [],
          }
        : null,
      logoUrl: fund.logo?.url || null,
    };

    try {
      const userPrompt = this.buildUserPrompt(fund);

      const { text } = await generateText({
        model: openai.responses(this.MODEL_NAME) as LanguageModel,
        system: FUND_ENRICHMENT_SYSTEM_PROMPT,
        tools: {
          web_search_preview: openai.tools.webSearchPreview({
            searchContextSize: 'high',
          }),
        },
        prompt: userPrompt,
        temperature: 0.3,
        maxSteps: 3, // Allow multiple tool calls if needed
      });

      // Log truncated response for debugging (only first 100 chars)
      if (process.env.DEBUG_ENRICHMENT === 'true') {
        this.log(`AI response: ${text?.substring(0, 100)}...`);
      }

      const aiResponse = this.parseAIResponse(text);

      // Validate logo URL exists (returns null if 404 or invalid)
      const validatedLogoUrl = await this.validateLogoUrl(aiResponse.logoUrl);
      aiResponse.logoUrl = validatedLogoUrl;

      const fieldsUpdated = this.getUpdatedFields(originalData, aiResponse);

      // Only include AI data for fields that are actually being updated;
      // keep original values for fields that already have data
      const originalFocus = originalData.investorProfile?.investmentFocus || [];

      return {
        uid: fund.uid,
        name: fund.name,
        originalData,
        enrichedData: {
          website: fieldsUpdated.includes('website') ? aiResponse.website : originalData.website,
          blog: fieldsUpdated.includes('blog') ? aiResponse.blog : originalData.blog,
          linkedinHandler: fieldsUpdated.includes('linkedinHandler') ? aiResponse.linkedinHandler : originalData.linkedinHandler,
          shortDescription: fieldsUpdated.includes('shortDescription') ? aiResponse.shortDescription : originalData.shortDescription,
          longDescription: fieldsUpdated.includes('longDescription') ? aiResponse.longDescription : originalData.longDescription,
          moreDetails: fieldsUpdated.includes('moreDetails') ? aiResponse.moreDetails : originalData.moreDetails,
          investmentFocus: fieldsUpdated.includes('investmentFocus') ? (aiResponse.investmentFocus || []) : originalFocus,
          logoUrl: fieldsUpdated.includes('logoUrl') ? validatedLogoUrl : originalData.logoUrl,
        },
        confidence: aiResponse.confidence,
        sources: aiResponse.sources,
        status: fieldsUpdated.length > 0 ? 'enriched' : 'skipped',
        fieldsUpdated,
      };
    } catch (error) {
      this.logError(`Failed to enrich fund ${fund.name} (${fund.uid}): ${error.message}`, error);

      return {
        uid: fund.uid,
        name: fund.name,
        originalData,
        enrichedData: {
          website: null,
          blog: null,
          linkedinHandler: null,
          shortDescription: null,
          longDescription: null,
          moreDetails: null,
          investmentFocus: [],
          logoUrl: null,
        },
        confidence: {},
        sources: [],
        status: 'error',
        fieldsUpdated: [],
        error: error.message,
      };
    }
  }

  /**
   * Build user prompt for AI enrichment
   */
  private buildUserPrompt(fund: FundToEnrich): string {
    const existingDescription = fund.shortDescription || fund.longDescription || '';

    return `
Research and enrich the profile for this company/fund:

Company Name: ${fund.name}
${fund.website ? `Existing Website: ${fund.website}` : 'Website: Unknown'}
${fund.linkedinHandler ? `Existing LinkedIn: ${fund.linkedinHandler}` : 'LinkedIn: Unknown'}
${existingDescription ? `Existing Description: ${existingDescription}` : 'Description: Not available'}

TASK:
1. Search for "${fund.name}" to find additional information
2. Search for "${fund.name} Twitter" or "${fund.name} Crunchbase" to find their logo
3. Gather information about their team, history, and achievements for moreDetails
4. DERIVE investmentFocus tags based on:
   - What the company does (from description: "${existingDescription}")
   - Information found in search results
   - Their products, services, and target market

REQUIRED OUTPUT:
- moreDetails: MUST contain additional context (team, history, features, etc.)
- investmentFocus: MUST contain 3-8 tags derived from what the company does
  Example: If description mentions "Browser with LLMs & Wallets, Private by design"
  Tags should be: ["AI", "Privacy", "Web3", "Crypto", "Browser"]
- logoUrl: MUST be a publicly accessible URL (Twitter profile image, Crunchbase, or verified website image)
  DO NOT guess URLs - only use URLs found in search results

Respond with ONLY a valid JSON object as specified in system prompt.

Current Date: ${new Date().toISOString().split('T')[0]}
`;
  }

  /**
   * Parse AI response text to structured data
   */
  private parseAIResponse(text: string): AIEnrichmentResponse {
    // Handle null/empty responses
    if (!text || text.trim().length === 0) {
      this.log('AI returned empty response');
      return this.getEmptyResponse();
    }

    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // If no JSON found, return empty response instead of throwing
      this.log(`No JSON found in AI response: ${text.substring(0, 100)}...`);
      return this.getEmptyResponse();
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        website: this.validateUrl(parsed.website),
        blog: this.validateUrl(parsed.blog),
        linkedinHandler: this.sanitizeLinkedInHandler(parsed.linkedinHandler),
        shortDescription: this.truncateString(parsed.shortDescription, 200),
        longDescription: this.truncateString(parsed.longDescription, 1000),
        moreDetails: parsed.moreDetails || null,
        investmentFocus: Array.isArray(parsed.investmentFocus)
          ? parsed.investmentFocus.filter((f: any) => typeof f === 'string')
          : null,
        logoUrl: this.validateUrl(parsed.logoUrl),
        confidence: parsed.confidence || {},
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      };
    } catch (e) {
      this.log(`Failed to parse AI response JSON: ${e.message}`);
      return this.getEmptyResponse();
    }
  }

  /**
   * Return empty AI response for no-data cases
   */
  private getEmptyResponse(): AIEnrichmentResponse {
    return {
      website: null,
      blog: null,
      linkedinHandler: null,
      shortDescription: null,
      longDescription: null,
      moreDetails: null,
      investmentFocus: null,
      logoUrl: null,
      confidence: {},
      sources: [],
    };
  }

  /**
   * Validate that a logo URL actually exists (returns 200 and is an image)
   */
  private async validateLogoUrl(url: string | null | undefined): Promise<string | null> {
    if (!url) return null;

    try {
      // Validate URL format first
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;

      // Make a HEAD request to check if URL exists
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LogoValidator/1.0)',
        },
      });

      clearTimeout(timeout);

      // Check if response is OK and content type is an image
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.startsWith('image/')) {
          this.log(`Logo URL validated: ${url}`);
          return url;
        }
      }

      this.log(`Logo URL invalid (status: ${response.status}): ${url}`);
      return null;
    } catch (error) {
      this.log(`Logo URL validation failed: ${url} - ${error.message}`);
      return null;
    }
  }

  /**
   * Validate and sanitize URL
   */
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

  /**
   * Sanitize LinkedIn handler (remove full URL if provided)
   */
  private sanitizeLinkedInHandler(handler: string | null | undefined): string | null {
    if (!handler) return null;
    // Remove full LinkedIn URL if provided
    const match = handler.match(/(?:linkedin\.com\/)?(?:in\/|company\/)?([a-zA-Z0-9_-]+)/);
    if (match) {
      // Determine if it's a company or personal profile
      if (handler.includes('company/')) {
        return `company/${match[1]}`;
      }
      return match[1];
    }
    return handler;
  }

  /**
   * Truncate string to max length
   */
  private truncateString(str: string | null | undefined, maxLength: number): string | null {
    if (!str) return null;
    return str.length > maxLength ? str.substring(0, maxLength - 3) + '...' : str;
  }

  /**
   * Determine which fields were updated
   */
  private getUpdatedFields(original: EnrichedFundData['originalData'], enriched: AIEnrichmentResponse): string[] {
    const fields: string[] = [];

    // Check text fields
    if (!original.website && enriched.website) fields.push('website');
    if (!original.blog && enriched.blog) fields.push('blog');
    if (!original.linkedinHandler && enriched.linkedinHandler) fields.push('linkedinHandler');
    if (!original.shortDescription && enriched.shortDescription) fields.push('shortDescription');
    if (!original.longDescription && enriched.longDescription) fields.push('longDescription');
    if (!original.moreDetails && enriched.moreDetails) fields.push('moreDetails');

    // Check investment focus
    const originalFocus = original.investorProfile?.investmentFocus || [];
    if (originalFocus.length === 0 && enriched.investmentFocus && enriched.investmentFocus.length > 0) {
      fields.push('investmentFocus');
    }

    // Check logo
    if (!original.logoUrl && enriched.logoUrl) fields.push('logoUrl');

    return fields;
  }

  /**
   * Generate complete enrichment output for dry-run
   */
  generateDryRunOutput(enrichedFunds: EnrichedFundData[], skipped: SkippedFund[]): EnrichmentOutput {
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalFunds: enrichedFunds.length + skipped.length,
        enrichedFunds: enrichedFunds.filter((f) => f.status === 'enriched').length,
        skippedFunds: skipped.length + enrichedFunds.filter((f) => f.status !== 'enriched').length,
        modelUsed: this.MODEL_NAME,
        version: '1.0.0',
      },
      funds: enrichedFunds,
      skipped,
    };
  }

  /**
   * Generate a markdown report for dry-run output review
   */
  generateMarkdownReport(output: EnrichmentOutput): string {
    const lines: string[] = [];

    lines.push('# Fund Data Enrichment Report');
    lines.push('');
    lines.push(`Generated: ${output.metadata.generatedAt}`);
    lines.push(`Model: ${output.metadata.modelUsed}`);
    lines.push(
      `Total: ${output.metadata.totalFunds} | Enriched: ${output.metadata.enrichedFunds} | Skipped: ${output.metadata.skippedFunds}`
    );
    lines.push('');
    lines.push('---');

    // Enriched funds
    const enrichedFunds = output.funds.filter((f) => f.status === 'enriched');
    for (let i = 0; i < enrichedFunds.length; i++) {
      const fund = enrichedFunds[i];
      lines.push('');
      lines.push(`## ${i + 1}. ${fund.name} (\`${fund.uid}\`)`);
      lines.push('');
      lines.push(`**Status:** ${fund.status} | **Fields updated:** ${fund.fieldsUpdated.join(', ')}`);
      lines.push('');
      lines.push('| Field | Old Value | New Value |');
      lines.push('|-------|-----------|-----------|');

      const fields: Array<{ field: string; oldVal: string | null; newVal: string | null }> = [
        { field: 'website', oldVal: fund.originalData.website, newVal: fund.enrichedData.website },
        { field: 'blog', oldVal: fund.originalData.blog, newVal: fund.enrichedData.blog },
        { field: 'linkedinHandler', oldVal: fund.originalData.linkedinHandler, newVal: fund.enrichedData.linkedinHandler },
        { field: 'shortDescription', oldVal: fund.originalData.shortDescription, newVal: fund.enrichedData.shortDescription },
        { field: 'longDescription', oldVal: fund.originalData.longDescription, newVal: fund.enrichedData.longDescription },
        { field: 'moreDetails', oldVal: fund.originalData.moreDetails, newVal: fund.enrichedData.moreDetails },
        {
          field: 'investmentFocus',
          oldVal: (fund.originalData.investorProfile?.investmentFocus || []).join(', ') || null,
          newVal: (fund.enrichedData.investmentFocus || []).join(', ') || null,
        },
        { field: 'logoUrl', oldVal: fund.originalData.logoUrl, newVal: fund.enrichedData.logoUrl },
      ];

      for (const row of fields) {
        const isUpdated = fund.fieldsUpdated.includes(row.field);
        const newCell = isUpdated ? this.formatMdCell(row.newVal) : '_(no change)_';
        lines.push(`| ${row.field} | ${this.formatMdCell(row.oldVal)} | ${newCell} |`);
      }

      lines.push('');
      lines.push('---');
    }

    // Error funds
    const errorFunds = output.funds.filter((f) => f.status === 'error');
    if (errorFunds.length > 0) {
      lines.push('');
      lines.push('## Errors');
      lines.push('');
      lines.push('| # | Name | UID | Error |');
      lines.push('|---|------|-----|-------|');
      errorFunds.forEach((fund, idx) => {
        lines.push(`| ${idx + 1} | ${fund.name} | ${fund.uid} | ${fund.error || 'Unknown error'} |`);
      });
      lines.push('');
      lines.push('---');
    }

    // Skipped funds
    if (output.skipped.length > 0) {
      lines.push('');
      lines.push('## Skipped Funds');
      lines.push('');
      lines.push('| # | Name | UID | Reason |');
      lines.push('|---|------|-----|--------|');
      output.skipped.forEach((fund, idx) => {
        lines.push(`| ${idx + 1} | ${fund.name} | ${fund.uid} | ${fund.reason} |`);
      });
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Format a value for a markdown table cell
   */
  private formatMdCell(value: string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '\u2014';
    // Escape pipe characters that would break the table
    return value.replace(/\|/g, '\\|');
  }

  /**
   * Apply enrichment from JSON file to database
   */
  async applyEnrichment(input: EnrichmentOutput, rollbackPath: string): Promise<ApplyResult> {
    const errors: Array<{ uid: string; error: string }> = [];
    let teamsUpdated = 0;
    let investorProfilesUpdated = 0;

    // Generate rollback SQL before making changes
    const rollbackStatements: string[] = [];
    rollbackStatements.push('-- Enrichment Rollback Script');
    rollbackStatements.push(`-- Generated: ${new Date().toISOString()}`);
    rollbackStatements.push(`-- Applied From: ${input.metadata.generatedAt} enrichment`);
    rollbackStatements.push('');
    rollbackStatements.push('BEGIN;');
    rollbackStatements.push('');

    for (const fund of input.funds) {
      if (fund.status !== 'enriched' || fund.fieldsUpdated.length === 0) {
        continue;
      }

      try {
        // Get current data for rollback
        const currentTeam = await this.prisma.team.findUnique({
          where: { uid: fund.uid },
          select: {
            website: true,
            blog: true,
            linkedinHandler: true,
            shortDescription: true,
            longDescription: true,
            moreDetails: true,
            updatedAt: true,
            investorProfile: {
              select: {
                uid: true,
                investmentFocus: true,
                updatedAt: true,
              },
            },
          },
        });

        if (!currentTeam) {
          errors.push({ uid: fund.uid, error: 'Team not found' });
          continue;
        }

        // Build rollback SQL for Team
        const teamRollbackFields: string[] = [];
        if (fund.fieldsUpdated.includes('website')) {
          teamRollbackFields.push(`"website" = ${this.sqlValue(currentTeam.website)}`);
        }
        if (fund.fieldsUpdated.includes('blog')) {
          teamRollbackFields.push(`"blog" = ${this.sqlValue(currentTeam.blog)}`);
        }
        if (fund.fieldsUpdated.includes('linkedinHandler')) {
          teamRollbackFields.push(`"linkedinHandler" = ${this.sqlValue(currentTeam.linkedinHandler)}`);
        }
        if (fund.fieldsUpdated.includes('shortDescription')) {
          teamRollbackFields.push(`"shortDescription" = ${this.sqlValue(currentTeam.shortDescription)}`);
        }
        if (fund.fieldsUpdated.includes('longDescription')) {
          teamRollbackFields.push(`"longDescription" = ${this.sqlValue(currentTeam.longDescription)}`);
        }
        if (fund.fieldsUpdated.includes('moreDetails')) {
          teamRollbackFields.push(`"moreDetails" = ${this.sqlValue(currentTeam.moreDetails)}`);
        }

        if (teamRollbackFields.length > 0) {
          teamRollbackFields.push(`"updatedAt" = ${this.sqlValue(currentTeam.updatedAt?.toISOString())}`);
          rollbackStatements.push(`-- Team: ${fund.name} (${fund.uid})`);
          rollbackStatements.push(`UPDATE "Team" SET`);
          rollbackStatements.push(`  ${teamRollbackFields.join(',\n  ')}`);
          rollbackStatements.push(`WHERE "uid" = '${fund.uid}';`);
          rollbackStatements.push('');
        }

        // Build rollback SQL for InvestorProfile
        if (fund.fieldsUpdated.includes('investmentFocus') && currentTeam.investorProfile) {
          rollbackStatements.push(`-- InvestorProfile for Team: ${fund.name} (${currentTeam.investorProfile.uid})`);
          rollbackStatements.push(`UPDATE "InvestorProfile" SET`);
          rollbackStatements.push(
            `  "investmentFocus" = ${this.sqlArrayValue(currentTeam.investorProfile.investmentFocus)},`
          );
          rollbackStatements.push(
            `  "updatedAt" = ${this.sqlValue(currentTeam.investorProfile.updatedAt?.toISOString())}`
          );
          rollbackStatements.push(`WHERE "uid" = '${currentTeam.investorProfile.uid}';`);
          rollbackStatements.push('');
        }

        // Apply updates to Team
        const teamUpdateData: any = {};
        if (fund.fieldsUpdated.includes('website') && fund.enrichedData.website) {
          teamUpdateData.website = fund.enrichedData.website;
        }
        if (fund.fieldsUpdated.includes('blog') && fund.enrichedData.blog) {
          teamUpdateData.blog = fund.enrichedData.blog;
        }
        if (fund.fieldsUpdated.includes('linkedinHandler') && fund.enrichedData.linkedinHandler) {
          teamUpdateData.linkedinHandler = fund.enrichedData.linkedinHandler;
        }
        if (fund.fieldsUpdated.includes('shortDescription') && fund.enrichedData.shortDescription) {
          teamUpdateData.shortDescription = fund.enrichedData.shortDescription;
        }
        if (fund.fieldsUpdated.includes('longDescription') && fund.enrichedData.longDescription) {
          teamUpdateData.longDescription = fund.enrichedData.longDescription;
        }
        if (fund.fieldsUpdated.includes('moreDetails') && fund.enrichedData.moreDetails) {
          teamUpdateData.moreDetails = fund.enrichedData.moreDetails;
        }

        if (Object.keys(teamUpdateData).length > 0) {
          await this.prisma.team.update({
            where: { uid: fund.uid },
            data: teamUpdateData,
          });
          teamsUpdated++;
        }

        // Apply updates to InvestorProfile
        if (fund.fieldsUpdated.includes('investmentFocus') && fund.enrichedData.investmentFocus.length > 0) {
          if (currentTeam.investorProfile) {
            await this.prisma.investorProfile.update({
              where: { uid: currentTeam.investorProfile.uid },
              data: {
                investmentFocus: fund.enrichedData.investmentFocus,
              },
            });
            investorProfilesUpdated++;
          } else {
            // Create investor profile if it doesn't exist
            await this.prisma.investorProfile.create({
              data: {
                investmentFocus: fund.enrichedData.investmentFocus,
                team: { connect: { uid: fund.uid } },
              },
            });
            investorProfilesUpdated++;
          }
        }
      } catch (error) {
        errors.push({ uid: fund.uid, error: error.message });
      }
    }

    rollbackStatements.push('COMMIT;');
    rollbackStatements.push('');
    rollbackStatements.push('-- Verification Query:');
    rollbackStatements.push('-- SELECT uid, name, website, blog, "linkedinHandler" FROM "Team"');
    rollbackStatements.push(
      `-- WHERE uid IN (${input.funds
        .filter((f) => f.status === 'enriched')
        .map((f) => `'${f.uid}'`)
        .slice(0, 10)
        .join(', ')});`
    );

    // Write rollback file
    fs.writeFileSync(rollbackPath, rollbackStatements.join('\n'));

    return {
      success: errors.length === 0,
      teamsUpdated,
      investorProfilesUpdated,
      rollbackFilePath: rollbackPath,
      errors,
    };
  }

  /**
   * Execute rollback SQL file
   */
  async executeRollback(sqlPath: string): Promise<{ success: boolean; message: string }> {
    try {
      const sql = fs.readFileSync(sqlPath, 'utf-8');

      // Remove all comment lines first
      const sqlWithoutComments = sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');

      // Parse SQL into individual statements
      const statements = sqlWithoutComments
        .split(';')
        .map((s) => s.trim())
        .filter((s) => {
          // Filter out empty statements and transaction control
          // (we'll use Prisma's $transaction instead)
          if (!s) return false;
          if (s.toUpperCase() === 'BEGIN') return false;
          if (s.toUpperCase() === 'COMMIT') return false;
          return true;
        });

      if (statements.length === 0) {
        return { success: false, message: 'No valid SQL statements found in rollback file' };
      }

      // Execute all statements in a transaction
      await this.prisma.$transaction(async (tx) => {
        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement);
        }
      });

      return {
        success: true,
        message: `Rollback executed successfully. ${statements.length} statement(s) applied.`,
      };
    } catch (error) {
      return { success: false, message: `Rollback failed: ${error.message}` };
    }
  }

  /**
   * Helper: Convert value to SQL-safe string
   */
  private sqlValue(value: string | null | undefined): string {
    if (value === null || value === undefined) return 'NULL';
    // Escape single quotes
    return `'${value.replace(/'/g, "''")}'`;
  }

  /**
   * Helper: Convert array to PostgreSQL array literal
   */
  private sqlArrayValue(arr: string[] | null | undefined): string {
    if (!arr || arr.length === 0) return "'{}'";
    return `'{${arr.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')}}'`;
  }

  /**
   * Enrich fund with retry logic
   */
  async enrichFundWithRetry(fund: FundToEnrich, maxRetries = 3): Promise<EnrichedFundData> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.enrichFund(fund);
      } catch (error) {
        if (attempt === maxRetries || !this.isRetryableError(error)) {
          this.logError(`Failed to enrich fund ${fund.uid} after ${attempt} attempts: ${error.message}`, error);
          return {
            uid: fund.uid,
            name: fund.name,
            originalData: {
              website: fund.website,
              blog: fund.blog,
              linkedinHandler: fund.linkedinHandler,
              shortDescription: fund.shortDescription,
              longDescription: fund.longDescription,
              moreDetails: fund.moreDetails,
              investorProfile: fund.investorProfile
                ? {
                    uid: fund.investorProfile.uid,
                    investmentFocus: fund.investorProfile.investmentFocus || [],
                  }
                : null,
              logoUrl: fund.logo?.url || null,
            },
            enrichedData: {
              website: null,
              blog: null,
              linkedinHandler: null,
              shortDescription: null,
              longDescription: null,
              moreDetails: null,
              investmentFocus: [],
              logoUrl: null,
            },
            confidence: {},
            sources: [],
            status: 'error',
            fieldsUpdated: [],
            error: error.message,
          };
        }
        // Exponential backoff
        await this.delay(Math.pow(2, attempt) * 1000);
      }
    }
    // This should never be reached but TypeScript requires it
    throw new Error('Unexpected state in enrichFundWithRetry');
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return (
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('429') ||
      message.includes('503')
    );
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
