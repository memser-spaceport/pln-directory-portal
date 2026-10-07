import { Prisma } from '@prisma/client';

function tokenMatchesField(token: string): Prisma.InvestorOutreachRecordWhereInput {
  return {
    OR: [
      { firstName: { contains: token, mode: 'insensitive' } },
      { lastName: { contains: token, mode: 'insensitive' } },
      { email: { contains: token, mode: 'insensitive' } },
      { firm: { contains: token, mode: 'insensitive' } },
    ],
  };
}

/** Token-AND text search: each whitespace-separated token must match at least one name/email/firm field. */
export function buildInvestorTextSearch(q: string): Prisma.InvestorOutreachRecordWhereInput {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return {};
  if (tokens.length === 1) return tokenMatchesField(tokens[0]);
  return { AND: tokens.map((token) => tokenMatchesField(token)) };
}

/**
 * sectorTags is stored as a comma-separated string. Match each requested tag as a discrete token
 * (delimited by commas or string edges) to avoid substring collisions inside the CSV value.
 * Any one of the tags matching is enough.
 */
export function buildSectorTagsCondition(tags: string[]): Prisma.InvestorOutreachRecordWhereInput {
  return {
    OR: tags.flatMap((tag) => [
      { sectorTags: tag },
      { sectorTags: { startsWith: `${tag},` } },
      { sectorTags: { endsWith: `,${tag}` } },
      { sectorTags: { contains: `,${tag},` } },
    ]),
  };
}
