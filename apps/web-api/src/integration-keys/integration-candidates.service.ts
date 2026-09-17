import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { MemberCvImportsService } from '../member-cv-imports/member-cv-imports.service';
import {
  applicationSelect,
  jobInterestSelect,
  teamInterestSelect,
  toApplicationRow,
  toJobInterestRow,
  toTeamInterestRow,
  type CandidateApplicationRow,
  type CandidateInterestRow,
} from './candidate-rows';

/**
 * The candidates feed an integrated ATS polls.
 *
 * Applications, job interests and team interests are paged as ONE stream
 * ordered by (updatedAt, uid): with three tables behind a single cursor, the
 * cursor can only honestly mean "everything up to this point has been handed
 * over" if all three are advanced together. Rows are read one page past the
 * limit, then the page is cut at the limit and the cursor set to the last row
 * that made it — so nothing is skipped when several rows share a timestamp.
 */

export const CANDIDATE_PAGE_DEFAULT = 100;
export const CANDIDATE_PAGE_MAX = 500;

export interface CandidatesFeedPage {
  applications: CandidateApplicationRow[];
  interests: CandidateInterestRow[];
  nextCursor: string | null;
}

interface Cursor {
  t: string;
  u: string;
}

type Kind = 'application' | 'jobInterest' | 'teamInterest';

interface Entry {
  kind: Kind;
  uid: string;
  updatedAt: Date;
  row: unknown;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed?.t !== 'string' || typeof parsed?.u !== 'string' || Number.isNaN(Date.parse(parsed.t))) {
      throw new Error('bad shape');
    }
    return { t: parsed.t, u: parsed.u };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

/** Keyset: strictly after the cursor's timestamp, or equal to it with a greater uid. */
function after(cursor: Cursor | null, since: Date | null) {
  const clauses: object[] = [];
  if (cursor) {
    const at = new Date(cursor.t);
    clauses.push({ OR: [{ updatedAt: { gt: at } }, { AND: [{ updatedAt: at }, { uid: { gt: cursor.u } }] }] });
  }
  if (since) {
    clauses.push({ updatedAt: { gte: since } });
  }
  return clauses;
}

function byKeyset(a: Entry, b: Entry): number {
  const diff = a.updatedAt.getTime() - b.updatedAt.getTime();
  return diff !== 0 ? diff : a.uid.localeCompare(b.uid);
}

@Injectable()
export class IntegrationCandidatesService {
  constructor(private readonly prisma: PrismaService, private readonly cvImports: MemberCvImportsService) {}

  async feed(teamUid: string, query: { cursor?: string; since?: string; limit?: number }): Promise<CandidatesFeedPage> {
    const limit = Math.min(Math.max(query.limit ?? CANDIDATE_PAGE_DEFAULT, 1), CANDIDATE_PAGE_MAX);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    let since: Date | null = null;
    if (query.since) {
      const parsed = new Date(query.since);
      if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Invalid since');
      since = parsed;
    }

    const keyset = after(cursor, since);
    const take = limit + 1;
    const order = [{ updatedAt: 'asc' as const }, { uid: 'asc' as const }];

    const [applications, jobInterests, teamInterests] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where: { AND: [{ jobOpening: { teamUid } }, ...keyset] },
        select: applicationSelect,
        orderBy: order,
        take,
      }),
      this.prisma.jobOpeningInterest.findMany({
        where: { AND: [{ jobOpening: { teamUid } }, ...keyset] },
        select: jobInterestSelect,
        orderBy: order,
        take,
      }),
      this.prisma.teamInterest.findMany({
        where: { AND: [{ teamUid }, ...keyset] },
        select: teamInterestSelect,
        orderBy: order,
        take,
      }),
    ]);

    const merged: Entry[] = [
      ...applications.map((row) => ({ kind: 'application' as const, uid: row.uid, updatedAt: row.updatedAt, row })),
      ...jobInterests.map((row) => ({ kind: 'jobInterest' as const, uid: row.uid, updatedAt: row.updatedAt, row })),
      ...teamInterests.map((row) => ({ kind: 'teamInterest' as const, uid: row.uid, updatedAt: row.updatedAt, row })),
    ].sort(byKeyset);

    const page = merged.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor = merged.length > page.length && last ? encodeCursor({ t: last.updatedAt.toISOString(), u: last.uid }) : null;

    const applicationRows = page.filter((e) => e.kind === 'application');
    const cvUrls = await this.cvImports.getSignedPreviewUrls(
      applicationRows.map((e) => (e.row as (typeof applications)[number]).member.uid)
    );

    return {
      applications: applicationRows.map((e) => {
        const row = e.row as (typeof applications)[number];
        return toApplicationRow(row, cvUrls.get(row.member.uid) ?? null);
      }),
      interests: page
        .filter((e) => e.kind !== 'application')
        .map((e) =>
          e.kind === 'jobInterest'
            ? toJobInterestRow(e.row as (typeof jobInterests)[number])
            : toTeamInterestRow(e.row as (typeof teamInterests)[number])
        ),
      nextCursor,
    };
  }

  /** A fresh signed CV link. The one in the feed expires; the ATS asks again when it downloads. */
  async applicationCvUrl(teamUid: string, applicationUid: string): Promise<{ url: string | null }> {
    const application = await this.prisma.jobApplication.findFirst({
      where: { uid: applicationUid, jobOpening: { teamUid } },
      select: { memberUid: true },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    return { url: await this.cvImports.getSignedPreviewUrl(application.memberUid) };
  }
}
