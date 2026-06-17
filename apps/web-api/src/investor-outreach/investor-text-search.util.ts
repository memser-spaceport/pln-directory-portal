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
