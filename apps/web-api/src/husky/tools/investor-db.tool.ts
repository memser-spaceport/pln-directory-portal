import { Injectable } from '@nestjs/common';
import { InvestorOutreachRecord, Prisma } from '@prisma/client';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import {
  INVESTOR_OUTREACH_ENGAGEMENT_TIER,
  INVESTOR_OUTREACH_INVESTOR_TYPES,
  INVESTOR_OUTREACH_SECTOR_TAGS,
  INVESTOR_OUTREACH_STAGE_FOCUS,
  isAllowedEngagementTier,
  isAllowedInvestorType,
  isAllowedStageFocus,
} from '../../investor-outreach/investor-outreach.vocab';
import { buildSectorTagsCondition } from '../../investor-outreach/investor-text-search.util';
import { HuskyAuthContext } from './husky-auth-context';
import { InvestorDbAccess } from './investor-db-access';
import { tokenize } from './fuzzy-match.util';

export const INVESTOR_DB_TOOL_NAME = 'getInvestorDb';

const MAX_RESULTS = 15;
const MAX_THESIS_LENGTH = 300;
/** Below this length a search token only matches a whole sector tag or a whole name/firm, never a substring. */
const MIN_SUBSTRING_TOKEN_LENGTH = 3;

const SECTOR_TAG_SET = new Set<string>(INVESTOR_OUTREACH_SECTOR_TAGS);

const ENGAGEMENT_TIER_LABELS: Record<string, string> = {
  T1_registered: 'T1, registered for Demo Day',
  T2_clicked: 'T2, clicked recent outreach',
  T3_opened: 'T3, opened recent outreach',
  T4_cold: 'T4, cold',
};

/** Investor DB drawer on the `/investors` page (All Investors list with this investor selected). */
export function investorDbPath(investorId: string): string {
  return `/investors?mode=list&investorId=${encodeURIComponent(investorId)}`;
}

const InvestorDbToolParams = z.object({
  search: z
    .string()
    .describe(
      'Short free text matched against investor name, firm, title, fund thesis and sector tags (every word must match). Use a firm name or a distinctive topic word, not a full sentence.'
    )
    .optional(),
  stageFocus: z
    .string()
    .describe(`Stage the investor focuses on. One of: ${INVESTOR_OUTREACH_STAGE_FOCUS.join(', ')}`)
    .optional(),
  sectorTags: z
    .array(z.string())
    .describe(`Sector tags; any one matching is enough. Values: ${INVESTOR_OUTREACH_SECTOR_TAGS.join(', ')}`)
    .optional(),
  geoFocus: z.string().describe('Geography the investor focuses on, e.g. "US", "Europe"').optional(),
  investorType: z
    .string()
    .describe(`Investor type. One of: ${INVESTOR_OUTREACH_INVESTOR_TYPES.join(', ')}`)
    .optional(),
  engagementTier: z
    .string()
    .describe(
      `Outreach engagement tier. One of: ${INVESTOR_OUTREACH_ENGAGEMENT_TIER.join(
        ', '
      )} (T1 = registered for Demo Day, T4 = cold)`
    )
    .optional(),
  hasWarmPath: z.boolean().describe('Only investors with at least one computed warm-intro path').optional(),
});

type InvestorDbToolArgs = z.infer<typeof InvestorDbToolParams>;

/** "Seed" → "seed", "Series A" → "series-a", "Series C" → "series-b+"; undefined when not in the vocab. */
export function normalizeStageFocus(input?: string): string | undefined {
  if (!input) return undefined;
  const value = input.trim().toLowerCase().replace(/\s+/g, '-');
  if (isAllowedStageFocus(value)) return value;
  if (/^series-[b-z]\+?$/.test(value)) return 'series-b+';
  return undefined;
}

/** "Family office" → "family_office"; undefined when not in the vocab. */
export function normalizeInvestorType(input?: string): string | undefined {
  if (!input) return undefined;
  const value = input
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return isAllowedInvestorType(value) ? value : undefined;
}

/** Accepts the stored value ("T1_registered") or just its tier ("T1"); undefined when unknown. */
export function normalizeEngagementTier(input?: string): string | undefined {
  if (!input) return undefined;
  const value = input.trim();
  if (isAllowedEngagementTier(value)) return value;
  const tier = value.slice(0, 2).toUpperCase();
  return INVESTOR_OUTREACH_ENGAGEMENT_TIER.find((allowed) => allowed.startsWith(`${tier}_`));
}

/** "DeSci" → "desci", "Frontier tech" → "frontier-tech"; unknown tags are dropped. */
export function normalizeSectorTags(input?: string[]): string[] {
  if (!input) return [];
  const tags = input
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter((tag) => SECTOR_TAG_SET.has(tag));
  return Array.from(new Set(tags));
}

function tokenCondition(token: string): Prisma.InvestorOutreachRecordWhereInput {
  if (token.length < MIN_SUBSTRING_TOKEN_LENGTH) {
    // A two-letter token ("ai") is a substring of far too many words to mean anything as one,
    // so it only matches a whole sector tag or a whole name/firm.
    return {
      OR: [
        buildSectorTagsCondition([token]),
        { firstName: { equals: token, mode: 'insensitive' } },
        { lastName: { equals: token, mode: 'insensitive' } },
        { firm: { equals: token, mode: 'insensitive' } },
      ],
    };
  }
  return {
    OR: [
      { firstName: { contains: token, mode: 'insensitive' } },
      { lastName: { contains: token, mode: 'insensitive' } },
      { firm: { contains: token, mode: 'insensitive' } },
      { title: { contains: token, mode: 'insensitive' } },
      { fundThesis: { contains: token, mode: 'insensitive' } },
      { sectorTags: { contains: token, mode: 'insensitive' } },
    ],
  };
}

/**
 * The curated Investor DB behind the `/investors` page (InvestorOutreachRecord) — firms, theses,
 * stage/sector focus, outreach engagement and warm-path reachability. Distinct from the
 * self-reported investor profiles members fill in (investors.tool.ts).
 */
@Injectable()
export class InvestorDbTool {
  constructor(private logger: LogService, private prisma: PrismaService, private investorDbAccess: InvestorDbAccess) {}

  getTool(auth: HuskyAuthContext): CoreTool {
    return tool({
      description:
        "Search the Investor DB: PL's curated database of investors and funds (firm, title, fund thesis, check size range, stage and sector focus, geography, outreach engagement, warm-intro proximity). Use this when the user mentions the Investor DB or asks about investors, funds or firms by thesis, sector, stage or geography. Only returns data when the signed-in user has Investor DB access.",
      parameters: InvestorDbToolParams,
      execute: (args) => this.execute(args, auth),
    });
  }

  private async execute(args: InvestorDbToolArgs, auth: HuskyAuthContext): Promise<string> {
    const access = await this.investorDbAccess.check(auth, INVESTOR_DB_TOOL_NAME);
    if (!access.allowed) {
      return access.message;
    }

    this.logger.info(`Getting Investor DB records for args: ${JSON.stringify(args)}`);

    const where = this.buildWhere(args);
    const [total, records] = await this.prisma.$transaction([
      this.prisma.investorOutreachRecord.count({ where }),
      this.prisma.investorOutreachRecord.findMany({
        where,
        // lastSentDate is deliberately not a sort key: Postgres puts NULLs first on DESC, so it
        // would lead with never-contacted records.
        orderBy: [{ hasPath: 'desc' }, { engagementTier: 'asc' }, { id: 'asc' }],
        take: MAX_RESULTS,
      }),
    ]);

    if (records.length === 0) {
      return 'No investors found in the Investor DB matching the search criteria.';
    }

    const header =
      total > records.length ? `Showing ${records.length} of ${total} matching Investor DB records.\n\n` : '';
    return header + records.map((record) => this.formatRecord(record)).join('\n\n');
  }

  buildWhere(args: InvestorDbToolArgs): Prisma.InvestorOutreachRecordWhereInput {
    const conditions: Prisma.InvestorOutreachRecordWhereInput[] = [];

    const tokens = Array.from(new Set(tokenize(args.search ?? '')));
    conditions.push(...tokens.map(tokenCondition));

    const stageFocus = normalizeStageFocus(args.stageFocus);
    if (stageFocus) conditions.push({ stageFocus });

    const sectorTags = normalizeSectorTags(args.sectorTags);
    if (sectorTags.length) conditions.push(buildSectorTagsCondition(sectorTags));

    const geoFocus = args.geoFocus?.trim();
    if (geoFocus) conditions.push({ geoFocus: { contains: geoFocus, mode: 'insensitive' } });

    const investorType = normalizeInvestorType(args.investorType);
    if (investorType) conditions.push({ investorType });

    const engagementTier = normalizeEngagementTier(args.engagementTier);
    if (engagementTier) conditions.push({ engagementTier });

    if (args.hasWarmPath !== undefined) conditions.push({ hasPath: args.hasWarmPath });

    return conditions.length ? { AND: conditions } : {};
  }

  private formatRecord(record: InvestorOutreachRecord): string {
    const name = [record.firstName, record.lastName].filter(Boolean).join(' ') || record.firm || 'Unknown';
    const thesis = record.fundThesis
      ? record.fundThesis.length > MAX_THESIS_LENGTH
        ? `${record.fundThesis.slice(0, MAX_THESIS_LENGTH).trimEnd()}…`
        : record.fundThesis
      : null;
    const sectors = (record.sectorTags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .join(', ');
    const proximity = record.bestProximityCode ?? record.proximityCode;
    const shown = (value: string | null | undefined) => (value && value.trim() ? value : 'Not provided');

    return `Investor DB record: ${name} [InvestorLink](${investorDbPath(record.investorId)})
                Firm: ${shown(record.firm)}
                Title: ${shown(record.title)}
                Fund Thesis: ${shown(thesis)}
                Check Size Range: ${shown(record.checkSizeRange)}
                Stage Focus: ${shown(record.stageFocus)}
                Sectors: ${shown(sectors)}
                Geo Focus: ${shown(record.geoFocus)}
                Investor Type: ${shown(record.investorType)}
                Engagement Tier: ${ENGAGEMENT_TIER_LABELS[record.engagementTier] ?? shown(record.engagementTier)}
                Proximity Code: ${shown(proximity)}
                Warm Path: ${record.hasPath ? 'Yes' : 'No computed warm path'}`;
  }
}
