import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JobCandidateKind, JobOpeningStatus } from '@prisma/client';
import type {
  ApplicantCount,
  ApplicantCountsResponse,
  ApplicantReviewedResponse,
  ApplicantSeenResponse,
  HiringCandidateKind,
  RoleApplicantsResponse,
} from 'libs/contracts/src/schema/team-hiring';
import { HIDDEN_JOB_OPENING_STATUSES } from '../job-openings/job-openings-query.service';
import { MemberCvImportsService } from '../member-cv-imports/member-cv-imports.service';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../shared/prisma.service';
import { TeamsService } from '../teams/teams.service';
import { isDirectoryAdmin } from '../utils/constants';
import {
  applicantApplicationSelect,
  applicantInterestSelect,
  applicantTallySelect,
  toApplicationRow,
  toInterestRow,
} from './hiring-rows';

/**
 * The team applicants page: what a team lead reads about the people who answered
 * their postings, and the two things they write back.
 *
 * The two writes are different kinds of fact. `reviewed` is the team's — one tick
 * per row, shared — and lives on the application or interest. `seen` is the
 * reader's, and lives in `JobCandidateView` keyed by (member, kind, row), because
 * a shared column would blank a co-lead's new badge for a row they never opened.
 *
 * Neither is a pipeline stage. There is no shortlist and no rejection: this
 * product replies by email, so the list is a record of who applied rather than a
 * board to move people across.
 */

const VISIBLE_JOB_WHERE = { status: { notIn: HIDDEN_JOB_OPENING_STATUSES as JobOpeningStatus[] } };

/** Newest first, the order both lists are drawn in. */
const NEWEST_FIRST = [{ createdAt: 'desc' as const }, { uid: 'desc' as const }];

const MAX_FACEPILE = 3;

/** The URL segment a write addresses, mapped to the enum the view table stores. */
const VIEW_KIND: Record<HiringCandidateKind, JobCandidateKind> = {
  applications: JobCandidateKind.APPLICATION,
  interests: JobCandidateKind.JOB_INTEREST,
};

interface Tally {
  applicantCount: number;
  interestCount: number;
  newCount: number;
  rows: { createdAt: Date; avatarUrl: string | null }[];
}

@Injectable()
export class TeamHiringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly membersService: MembersService,
    private readonly cvImports: MemberCvImportsService
  ) {}

  /**
   * A team lead of this team, or a directory admin. Membership alone is not
   * enough: applicants' contact details are in every row.
   */
  async assertCanRead(teamUid: string, userEmail: string): Promise<string> {
    const member = await this.membersService.findMemberByEmail(userEmail);
    if (!member) {
      throw new ForbiddenException('Only team leads can read their team applicants');
    }
    if (isDirectoryAdmin(member)) {
      return member.uid;
    }
    if (!(await this.teamsService.isMemberTeamLead(teamUid, member.uid))) {
      throw new ForbiddenException('Only team leads can read their team applicants');
    }
    return member.uid;
  }

  async counts(teamUid: string, viewerUid: string): Promise<ApplicantCountsResponse> {
    const jobs = await this.prisma.jobOpening.findMany({
      where: { teamUid, ...VISIBLE_JOB_WHERE },
      select: { uid: true },
      orderBy: [{ publishedAt: 'desc' }, { uid: 'desc' }],
    });
    const jobUids = jobs.map((job) => job.uid);
    if (jobUids.length === 0) {
      return { counts: [] };
    }

    // Row-level rather than grouped: the facepile needs the newest rows and their
    // avatars, and the new count needs which rows THIS viewer has opened, so a
    // groupBy would leave both of those to a second strategy.
    const [applications, interests] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where: { jobOpeningUid: { in: jobUids } },
        select: applicantTallySelect,
      }),
      this.prisma.jobOpeningInterest.findMany({
        where: { jobOpeningUid: { in: jobUids } },
        select: applicantTallySelect,
      }),
    ]);
    const seen = await this.seenUids(viewerUid, [
      { kind: 'applications', uids: applications.map((row) => row.uid) },
      { kind: 'interests', uids: interests.map((row) => row.uid) },
    ]);

    const byRole = new Map<string, Tally>();
    const add = (
      row: { uid: string; jobOpeningUid: string; createdAt: Date; member: { image: { url: string } | null } },
      kind: HiringCandidateKind
    ) => {
      const tally = byRole.get(row.jobOpeningUid) ?? {
        applicantCount: 0,
        interestCount: 0,
        newCount: 0,
        rows: [],
      };
      if (kind === 'applications') {
        tally.applicantCount += 1;
      } else {
        tally.interestCount += 1;
      }
      if (!seen.get(kind)?.has(row.uid)) {
        tally.newCount += 1;
      }
      tally.rows.push({ createdAt: row.createdAt, avatarUrl: row.member.image?.url ?? null });
      byRole.set(row.jobOpeningUid, tally);
    };
    applications.forEach((row) => add(row, 'applications'));
    interests.forEach((row) => add(row, 'interests'));

    // A role nobody answered is absent, not a zero row: the array is complete, so
    // the page reads absence as "nobody" and draws no line at all.
    const counts: ApplicantCount[] = jobUids
      .filter((uid) => byRole.has(uid))
      .map((uid) => {
        const tally = byRole.get(uid) as Tally;
        return {
          roleUid: uid,
          applicantCount: tally.applicantCount,
          interestCount: tally.interestCount,
          newCount: tally.newCount,
          newestAvatars: tally.rows
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((row) => row.avatarUrl)
            .filter((url): url is string => !!url)
            .slice(0, MAX_FACEPILE),
        };
      });

    return { counts };
  }

  async roleApplicants(teamUid: string, roleUid: string, viewerUid: string): Promise<RoleApplicantsResponse> {
    const job = await this.prisma.jobOpening.findFirst({ where: { uid: roleUid, teamUid }, select: { uid: true } });
    if (!job) {
      throw new NotFoundException('Job opening not found');
    }

    const [applications, interests] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where: { jobOpeningUid: job.uid },
        select: applicantApplicationSelect,
        orderBy: NEWEST_FIRST,
      }),
      this.prisma.jobOpeningInterest.findMany({
        where: { jobOpeningUid: job.uid },
        select: applicantInterestSelect,
        orderBy: NEWEST_FIRST,
      }),
    ]);

    const [seen, cvs] = await Promise.all([
      this.seenUids(viewerUid, [
        { kind: 'applications', uids: applications.map((row) => row.uid) },
        { kind: 'interests', uids: interests.map((row) => row.uid) },
      ]),
      this.cvImports.getStoredCvFiles(applications.map((row) => row.member.uid)),
    ]);
    const seenApplications = seen.get('applications');
    const seenInterests = seen.get('interests');

    return {
      applications: applications.map((row) =>
        toApplicationRow(row, cvs.get(row.member.uid) ?? null, !seenApplications?.has(row.uid))
      ),
      interests: interests.map((row) => toInterestRow(row, !seenInterests?.has(row.uid))),
    };
  }

  /**
   * Answers with the state as stored, so the page corrects itself from the server
   * rather than from what it assumed the press meant. Idempotent: a second press
   * in the same direction reports the same state, and the first tick's time and
   * author stand.
   */
  async setReviewed(
    kind: HiringCandidateKind,
    uid: string,
    reviewed: boolean,
    userEmail: string
  ): Promise<ApplicantReviewedResponse> {
    const row = await this.assertCanWrite(kind, uid, userEmail);
    if (reviewed === (row.reviewedAt !== null)) {
      return { uid, reviewed };
    }
    const data = reviewed
      ? { reviewedAt: new Date(), reviewedByUid: row.viewerUid }
      : { reviewedAt: null, reviewedByUid: null };
    const updated =
      kind === 'applications'
        ? await this.prisma.jobApplication.update({ where: { uid }, data, select: { reviewedAt: true } })
        : await this.prisma.jobOpeningInterest.update({ where: { uid }, data, select: { reviewedAt: true } });
    return { uid, reviewed: updated.reviewedAt !== null };
  }

  /**
   * Records that this lead has opened this row, for them alone. Idempotent by the
   * (member, kind, row) unique index, and the first `seenAt` stands — a reader
   * returning to somebody they already read has not re-discovered them.
   */
  async markSeen(kind: HiringCandidateKind, uid: string, userEmail: string): Promise<ApplicantSeenResponse> {
    const row = await this.assertCanWrite(kind, uid, userEmail);
    const view = await this.prisma.jobCandidateView.upsert({
      where: { memberUid_kind_rowUid: { memberUid: row.viewerUid, kind: VIEW_KIND[kind], rowUid: uid } },
      create: { memberUid: row.viewerUid, kind: VIEW_KIND[kind], rowUid: uid },
      update: {},
      select: { seenAt: true },
    });
    return { uid, seenAt: view.seenAt.toISOString() };
  }

  /**
   * The write routes carry no team, so the team comes from the row and the read
   * rule is applied to that. A uid belonging to a team the caller does not lead
   * is a 403 rather than a 404: the caller named a row that exists.
   */
  private async assertCanWrite(
    kind: HiringCandidateKind,
    uid: string,
    userEmail: string
  ): Promise<{ reviewedAt: Date | null; viewerUid: string }> {
    const select = { reviewedAt: true, jobOpening: { select: { teamUid: true } } } as const;
    const row =
      kind === 'applications'
        ? await this.prisma.jobApplication.findUnique({ where: { uid }, select })
        : await this.prisma.jobOpeningInterest.findUnique({ where: { uid }, select });
    if (!row || !row.jobOpening.teamUid) {
      throw new NotFoundException('Candidate not found');
    }
    const viewerUid = await this.assertCanRead(row.jobOpening.teamUid, userEmail);
    return { reviewedAt: row.reviewedAt, viewerUid };
  }

  /** Which of these rows this viewer has already opened, one query for both kinds. */
  private async seenUids(
    viewerUid: string,
    groups: { kind: HiringCandidateKind; uids: string[] }[]
  ): Promise<Map<HiringCandidateKind, Set<string>>> {
    const result = new Map<HiringCandidateKind, Set<string>>(groups.map((group) => [group.kind, new Set<string>()]));
    const rowUids = groups.flatMap((group) => group.uids);
    if (rowUids.length === 0) {
      return result;
    }
    const views = await this.prisma.jobCandidateView.findMany({
      where: { memberUid: viewerUid, rowUid: { in: rowUids } },
      select: { kind: true, rowUid: true },
    });
    for (const view of views) {
      const kind: HiringCandidateKind = view.kind === JobCandidateKind.APPLICATION ? 'applications' : 'interests';
      result.get(kind)?.add(view.rowUid);
    }
    return result;
  }
}
