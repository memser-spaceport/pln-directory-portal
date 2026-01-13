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
You are a professional research assistant specializing in investment fund data enrichment.

TASK: Research and gather publicly available information about the investment fund described below using web search.

CRITICAL REQUIREMENTS:
1. ALWAYS use the web_search_preview tool to search for information about the fund
2. Only return information you can verify through web search
3. All URLs must be valid and directly related to the fund
4. If information cannot be verified, return null for that field
5. Never fabricate or hallucinate information
6. LinkedIn handlers should be in format "company/fundname" (without full URL)

FIELDS TO RESEARCH:
- website: The fund's official website URL (full URL including https://)
- blog: The fund's blog URL (if available)
- linkedinHandler: LinkedIn company page handle only (e.g., "company/fundname")
- shortDescription: A 1-2 sentence description of the fund (max 200 characters)
- longDescription: A detailed description of the fund's mission, focus, and investment thesis (max 1000 characters)
- moreDetails: Additional relevant information about the fund, portfolio, team, or notable investments
- investmentFocus: Array of SHORT TAGS (1-2 words each) describing the fund's investment focus areas.
  Examples: ["AI", "Crypto", "Web3", "Blockchain", "DeFi", "Infrastructure", "Gaming", "NFT", "DAO", "Layer2", "ZK", "Privacy", "DePIN", "RWA", "SocialFi"]
  Return 3-8 relevant tags that best describe the fund's focus.
- logoUrl: URL to the fund's logo image (for reference only)

SEARCH STRATEGY:
1. Search for "[Fund Name] venture capital" or "[Fund Name] investment fund"
2. Search for "[Fund Name] portfolio companies"
3. Search for "[Fund Name] LinkedIn"
4. Search for "[Fund Name] Crunchbase" or "[Fund Name] PitchBook"

CRITICAL: You MUST ALWAYS respond with valid JSON, even if no information is found.

OUTPUT FORMAT - Respond with ONLY this JSON structure (no markdown, no explanation):
{
  "website": "https://..." or null,
  "blog": "https://..." or null,
  "linkedinHandler": "company/..." or null,
  "shortDescription": "..." or null,
  "longDescription": "..." or null,
  "moreDetails": "..." or null,
  "investmentFocus": ["...", "..."] or [],
  "logoUrl": "https://..." or null,
  "confidence": {
    "website": "high" | "medium" | "low" | null,
    "blog": "high" | "medium" | "low" | null,
    "linkedinHandler": "high" | "medium" | "low" | null,
    "shortDescription": "high" | "medium" | "low" | null,
    "longDescription": "high" | "medium" | "low" | null,
    "moreDetails": "high" | "medium" | "low" | null,
    "investmentFocus": "high" | "medium" | "low" | null,
    "logoUrl": "high" | "medium" | "low" | null
  },
  "sources": ["url1", "url2", ...]
}

If NO information can be found for the fund, return:
{
  "website": null,
  "blog": null,
  "linkedinHandler": null,
  "shortDescription": null,
  "longDescription": null,
  "moreDetails": null,
  "investmentFocus": [],
  "logoUrl": null,
  "confidence": {},
  "sources": []
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
  async findFundsWithIncompleteData(limit?: number, fundUid?: string): Promise<FundToEnrich[]> {
    const funds = await this.prisma.team.findMany({
      where: {
        isFund: true,
        ...(fundUid ? { uid: fundUid } : {}),
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
      const fieldsUpdated = this.getUpdatedFields(originalData, aiResponse);

      return {
        uid: fund.uid,
        name: fund.name,
        originalData,
        enrichedData: {
          website: aiResponse.website,
          blog: aiResponse.blog,
          linkedinHandler: aiResponse.linkedinHandler,
          shortDescription: aiResponse.shortDescription,
          longDescription: aiResponse.longDescription,
          moreDetails: aiResponse.moreDetails,
          investmentFocus: aiResponse.investmentFocus || [],
          logoUrl: aiResponse.logoUrl,
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
    return `
Research the following investment fund and return the results as JSON:

Fund Name: ${fund.name}
${fund.website ? `Existing Website: ${fund.website}` : 'Website: Unknown'}
${fund.linkedinHandler ? `Existing LinkedIn: ${fund.linkedinHandler}` : 'LinkedIn: Unknown'}
${fund.shortDescription ? `Existing Description: ${fund.shortDescription}` : 'Description: Not available'}
${
  fund.investorProfile?.investmentFocus?.length
    ? `Current Investment Focus: ${fund.investorProfile.investmentFocus.join(', ')}`
    : 'Investment Focus: Not specified'
}

Instructions:
1. Use web search to find information about "${fund.name}"
2. Search for their official website, LinkedIn, portfolio companies, and news
3. Extract relevant information from search results
4. Return your findings as a JSON object (as specified in the system prompt)

IMPORTANT: After searching, you MUST respond with a valid JSON object. If no information is found, return a JSON object with null values.

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
    if ((!original.shortDescription || original.shortDescription.length < 20) && enriched.shortDescription)
      fields.push('shortDescription');
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
      await this.prisma.$executeRawUnsafe(sql);
      return { success: true, message: 'Rollback executed successfully' };
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
