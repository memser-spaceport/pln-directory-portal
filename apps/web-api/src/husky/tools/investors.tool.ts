import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { INVESTOR_DB_VIEW_PERMISSIONS } from '../../rbac/rbac.constants';
import { memberHasAnyPermission } from '../../rbac/rbac-permission-check';
import { AccessControlV2Service } from '../../access-control-v2/services/access-control-v2.service';
import { HuskyAuthContext } from './husky-auth-context';
import {
  fuzzyMatches,
  fuzzySqlContainsCondition,
  fuzzySqlTermCondition,
  searchTerms,
  tokenize,
} from './fuzzy-match.util';

const MAX_RESULTS = 15;
// Only used when there is no free-text search: a small buffer above MAX_RESULTS to absorb the
// in-memory soft-deleted/orphaned-profile drop below. With a search, the fetch is scoped to
// exactly the matched uids instead, so relevance ordering sees every match.
const RESULT_FETCH_LIMIT = 50;

// Relevance weights for the free-text search (see `findMatches`).
const PHRASE_MATCH_SCORE = 100;
const ALL_TOKENS_BONUS = 20;
const TOKEN_MATCH_SCORE = 10;

const InvestorsToolParams = z.object({
  search: z.string().describe('Free-text match against investment focus areas, or the investor/fund name').optional(),
  investInStartupStage: z
    .string()
    .describe('Filter by a startup stage the investor invests in, e.g. Pre-Seed, Seed, Series A')
    .optional(),
  investInFundType: z.string().describe('Filter by a fund type the investor invests through').optional(),
  minCheckSize: z.number().describe('Minimum typical check size in USD').optional(),
  type: z.enum(['ANGEL', 'FUND', 'ANGEL_AND_FUND']).describe('Filter by investor profile type').optional(),
});

type InvestorProfileRow = Prisma.InvestorProfileGetPayload<{
  include: {
    team: { select: { uid: true; name: true } };
    member: { select: { uid: true; name: true; deletedAt: true } };
  };
}>;

@Injectable()
export class InvestorsTool {
  constructor(
    private logger: LogService,
    private prisma: PrismaService,
    private rbacService: RbacService,
    private accessControlV2Service: AccessControlV2Service
  ) {}

  getTool(auth: HuskyAuthContext): CoreTool {
    return tool({
      description:
        'Search the Investor DB for angels and funds by investment focus, startup stage they invest in, fund type, or typical check size. Only returns data when the signed-in user has Investor DB access; unavailable to everyone else.',
      parameters: InvestorsToolParams,
      execute: (args) => this.execute(args, auth),
    });
  }

  private async execute(args: z.infer<typeof InvestorsToolParams>, auth: HuskyAuthContext) {
    if (!auth.memberUid) {
      return 'User is not logged in, so Investor DB data is unavailable.';
    }

    const allowed = await memberHasAnyPermission(
      this.rbacService,
      this.accessControlV2Service,
      auth.memberUid,
      INVESTOR_DB_VIEW_PERMISSIONS
    );
    if (!allowed) {
      return 'The signed-in user does not have Investor DB access, so investor data is unavailable.';
    }

    this.logger.info(`Getting investors for args: ${JSON.stringify(args)}`);

    const where: Prisma.InvestorProfileWhereInput = {};
    if (args.type) where.type = args.type;
    if (args.minCheckSize !== undefined) where.typicalCheckSize = { gte: args.minCheckSize };
    if (args.investInStartupStage) where.investInStartupStages = { has: args.investInStartupStage };
    if (args.investInFundType) where.investInFundTypes = { has: args.investInFundType };

    const search = args.search?.trim();
    let scores: Map<string, number> | undefined;
    if (search) {
      scores = await this.findMatches(search);
      if (scores.size === 0) {
        return 'No investors found matching the search criteria.';
      }
      where.uid = { in: Array.from(scores.keys()) };
    }

    const profiles = await this.fetchProfiles(where, Boolean(scores));

    const visible = profiles
      .filter((profile) => {
        if (profile.member?.deletedAt) return false;
        if (!profile.team && !profile.member) return false;
        return true;
      })
      .sort((a, b) => this.compareProfiles(a, b, scores));

    if (visible.length === 0) {
      return 'No investors found matching the search criteria.';
    }

    const shown = visible.slice(0, MAX_RESULTS);
    const header =
      visible.length > MAX_RESULTS
        ? `Showing the ${MAX_RESULTS} most relevant of ${visible.length} matching investors.\n\n`
        : '';

    return (
      header +
      shown
        .map((profile) => {
          const name = profile.team?.name ?? profile.member?.name ?? 'Unknown';
          const link = profile.team
            ? `[TeamLink](/teams/${profile.team.uid})`
            : profile.member
            ? `[MemberLink](/members/${profile.member.uid})`
            : '';
          const relevance = search
            ? `\n                Matched search terms: ${this.matchedTerms(profile, search)}`
            : '';

          return `Investor: ${name} ${link}
                Type: ${profile.type ?? 'Not specified'}
                Investment Focus: ${profile.investmentFocus.join(', ') || 'Not provided'}
                Invests in Startup Stages: ${profile.investInStartupStages.join(', ') || 'Not provided'}
                Invests via Fund Types: ${profile.investInFundTypes.join(', ') || 'Not provided'}
                Typical Check Size: ${
                  profile.typicalCheckSize != null ? `$${profile.typicalCheckSize.toLocaleString()}` : 'Not provided'
                }
                Invests via Fund: ${
                  profile.isInvestViaFund === null || profile.isInvestViaFund === undefined
                    ? 'Not specified'
                    : profile.isInvestViaFund
                    ? 'Yes'
                    : 'No'
                }${relevance}`;
        })
        .join('\n\n')
    );
  }

  /**
   * With a search, `where.uid` is already the exact matched set, so everything is fetched and
   * relevance ordering sees every match. Without one, the fetch is capped — and because Postgres
   * sorts NULLs first on a DESC order, a single check-size-ordered query would fill the cap with
   * profiles that have no check size at all. Profiles with a check size are fetched first, and
   * the cap is topped up with the rest only if there is room.
   */
  private async fetchProfiles(where: Prisma.InvestorProfileWhereInput, all: boolean): Promise<InvestorProfileRow[]> {
    const include = {
      team: { select: { uid: true, name: true } },
      member: { select: { uid: true, name: true, deletedAt: true } },
    } as const;
    if (all) {
      return this.prisma.investorProfile.findMany({ where, include, orderBy: [{ id: 'asc' }] });
    }
    const withCheckSize = await this.prisma.investorProfile.findMany({
      where: { ...where, typicalCheckSize: { not: null, ...(where.typicalCheckSize as Prisma.FloatNullableFilter) } },
      include,
      orderBy: [{ typicalCheckSize: 'desc' }, { id: 'asc' }],
      take: RESULT_FETCH_LIMIT,
    });
    const room = RESULT_FETCH_LIMIT - withCheckSize.length;
    if (room <= 0 || where.typicalCheckSize) {
      return withCheckSize;
    }
    const withoutCheckSize = await this.prisma.investorProfile.findMany({
      where: { ...where, typicalCheckSize: null },
      include,
      orderBy: [{ id: 'asc' }],
      take: room,
    });
    const seen = new Set(withCheckSize.map((profile) => profile.uid));
    return [...withCheckSize, ...withoutCheckSize.filter((profile) => !seen.has(profile.uid))];
  }

  /**
   * Most relevant first, then the largest check size (profiles without one last), then a stable
   * fallback. Without a search every profile scores the same, so this reduces to check size.
   */
  private compareProfiles(a: InvestorProfileRow, b: InvestorProfileRow, scores?: Map<string, number>): number {
    const scoreDiff = (scores?.get(b.uid) ?? 0) - (scores?.get(a.uid) ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const checkA = a.typicalCheckSize ?? -Infinity;
    const checkB = b.typicalCheckSize ?? -Infinity;
    if (checkA !== checkB) return checkB - checkA;
    return a.id - b.id;
  }

  private matchedTerms(profile: InvestorProfileRow, search: string): string {
    const values = [...profile.investmentFocus, profile.team?.name ?? profile.member?.name ?? ''];
    const matched = searchTerms(search).filter((term) => values.some((value) => fuzzyMatches(value, term)));
    return matched.length ? matched.map((term) => `"${term}"`).join(', ') : 'none';
  }

  /**
   * `investmentFocus` is a `String[]` — Prisma's array filters are `has`/`hasSome`/`hasEvery`/
   * exact equality only, with no case-insensitive substring operator over individual elements —
   * so free-text matching against it (and against team/member name) has to be raw SQL rather
   * than a Prisma `where`. Each term is matched bidirectionally (search-in-tag AND tag-in-search,
   * see `fuzzySqlTermCondition`) so a model-normalized single word ("neurotechnology") still
   * matches terser stored tags ("neuro"/"tech"/"neuro tech"), and a compound tag ("DeepTech")
   * still matches a spaced-out search ("deep tech") via one of its words.
   *
   * Matching alone isn't enough: a generic token like "tech" hits hundreds of profiles
   * (Fintech, Deep tech, Climate tech…), so each match also gets a relevance score —
   * the whole phrase appearing in a tag or name outranks everything, matching every token earns a bonus, and
   * each matched token counts inversely to how many matched profiles share it, so the rare,
   * distinctive word ("neuro") outweighs the common one ("tech"). The caller orders by this
   * score, so an investor whose focus is literally "neuro tech" lists ahead of every fund that
   * merely mentions fintech. Doing the match in SQL means the filter *is* the fetch — nothing
   * is silently excluded by a fetch limit ahead of the filter.
   */
  private async findMatches(search: string): Promise<Map<string, number>> {
    const phrase = search.toLowerCase();
    const tokens = tokenize(search).filter((token) => token !== phrase);
    const hit = (condition: (column: Prisma.Sql) => Prisma.Sql) =>
      Prisma.sql`(EXISTS (SELECT 1 FROM unnest(ip."investmentFocus") AS focus_item WHERE ${condition(
        Prisma.sql`focus_item`
      )}) OR ${condition(Prisma.sql`COALESCE(t.name, m.name)`)})`;
    // The phrase only counts when it appears whole inside the stored value; a stored tag that is
    // merely part of the phrase ("Tech" inside "neuro tech") is a token-level match, scored below.
    const phraseCondition = (column: Prisma.Sql) => fuzzySqlContainsCondition(column, phrase);
    const tokenColumn = (index: number) => Prisma.raw(`tok_${index}`);

    const hitColumns = [
      Prisma.sql`${hit(phraseCondition)} AS phrase_hit`,
      ...tokens.map(
        (token, index) => Prisma.sql`${hit((column) => fuzzySqlTermCondition(column, token))} AS ${tokenColumn(index)}`
      ),
    ];
    const anyHit = Prisma.join([Prisma.raw('phrase_hit'), ...tokens.map((_, index) => tokenColumn(index))], ' OR ');
    const tokenScores = tokens.map(
      (_, index) =>
        Prisma.sql`CASE WHEN ${tokenColumn(
          index
        )} THEN ${TOKEN_MATCH_SCORE}::float / LN(1 + SUM(CASE WHEN ${tokenColumn(
          index
        )} THEN 1 ELSE 0 END) OVER ()) ELSE 0 END`
    );
    const allTokensBonus =
      tokens.length > 1
        ? Prisma.sql`CASE WHEN ${Prisma.join(
            tokens.map((_, index) => tokenColumn(index)),
            ' AND '
          )} THEN ${ALL_TOKENS_BONUS} ELSE 0 END`
        : Prisma.sql`0`;
    const score = Prisma.join(
      [Prisma.sql`CASE WHEN phrase_hit THEN ${PHRASE_MATCH_SCORE} ELSE 0 END`, allTokensBonus, ...tokenScores],
      ' + '
    );

    const rows = await this.prisma.$queryRaw<{ uid: string; score: number }[]>(Prisma.sql`
      WITH hits AS (
        SELECT ip.uid, ${Prisma.join(hitColumns, ', ')}
        FROM "InvestorProfile" ip
        LEFT JOIN "Team" t ON t."investorProfileId" = ip.uid
        LEFT JOIN "Member" m ON m."investorProfileId" = ip.uid
      )
      SELECT uid, (${score})::float AS score
      FROM hits
      WHERE ${anyHit}
    `);

    return new Map(rows.map((row) => [row.uid, Number(row.score)]));
  }
}
