import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { SavedJobStatus } from 'libs/contracts/src/schema/job-opening';
import { PrismaService } from '../shared/prisma.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { trackJobSaveRecorded } from './job-openings-analytics';
import { HIDDEN_JOB_OPENING_STATUSES } from './job-openings-query.service';
import { resolveVisibleJobOpening } from './job-openings-resolve';

/**
 * Saved jobs: a member's private bookmarks on the board.
 *
 * Shaped like `JobOpeningsInterestService` because the lifecycle is the same
 * (mark / unmark / list mine), but it is deliberately NOT that feature. Interest
 * is a signal to the hiring team, pushed to their ATS and counted in public;
 * a save is seen by nobody else, carries no count, and exists to be undone.
 */
@Injectable()
export class JobOpeningsSavedService {
  constructor(private readonly prisma: PrismaService, private readonly analytics: AnalyticsService) {}

  /**
   * Save a job opening. Idempotent, and the empty `update` is load-bearing:
   * `createdAt` is what the Saved tab reads back as "Saved 3d ago", so pressing
   * the bookmark twice must not restart that clock.
   */
  async save(jobUid: string, memberEmail: string | undefined): Promise<SavedJobStatus> {
    const memberUid = await this.resolveMemberUid(memberEmail);
    const jobOpening = await resolveVisibleJobOpening(this.prisma, jobUid);

    const existing = await this.prisma.savedJobOpening.findUnique({
      where: { jobOpeningUid_memberUid: { jobOpeningUid: jobUid, memberUid } },
      select: { uid: true },
    });

    const saved = await this.prisma.savedJobOpening.upsert({
      where: { jobOpeningUid_memberUid: { jobOpeningUid: jobUid, memberUid } },
      create: { jobOpeningUid: jobUid, memberUid },
      update: {},
      select: { uid: true },
    });

    if (!existing) {
      trackJobSaveRecorded(this.analytics, {
        saveUid: saved.uid,
        jobUid,
        teamUid: jobOpening.teamUid!,
      });
    }

    return { jobUid, viewerHasSaved: true };
  }

  /**
   * Unsave. Idempotent, and unlike `removeInterest` it does NOT check that the
   * job is still visible on the board: a bookmark on a role that has since
   * closed is exactly the one a member wants to drop, and refusing it would
   * strand the row. Deleting by the member's own pair leaks nothing.
   */
  async unsave(jobUid: string, memberEmail: string | undefined): Promise<SavedJobStatus> {
    const memberUid = await this.resolveMemberUid(memberEmail);

    await this.prisma.savedJobOpening.deleteMany({
      where: { jobOpeningUid: jobUid, memberUid },
    });

    return { jobUid, viewerHasSaved: false };
  }

  /**
   * Every save of the caller's that still points at a role the board shows.
   * Unpaged on purpose: the frontend holds this as one map and reads "absent
   * means not saved" off it, which only holds while the list is complete.
   *
   * A save of a role that has closed is filtered here, not deleted — if the
   * role comes back, so does the bookmark, with its original `savedAt`.
   */
  async listMine(memberEmail: string | undefined) {
    const memberUid = await this.resolveMemberUid(memberEmail);
    const saves = await this.prisma.savedJobOpening.findMany({
      where: {
        memberUid,
        jobOpening: {
          status: { notIn: HIDDEN_JOB_OPENING_STATUSES },
          teamUid: { not: null },
        },
      },
      select: { uid: true, jobOpeningUid: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      savedJobs: saves.map((save) => ({
        uid: save.uid,
        jobUid: save.jobOpeningUid,
        savedAt: save.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Strict on purpose, unlike `resolveLiveMemberUidByEmail`: for a private
   * list, "no viewer" is a refusal, not an empty answer. Approval state is not
   * part of the gate — a bookmark sends nothing to anyone, so a member waiting
   * on approval can still keep roles.
   */
  private async resolveMemberUid(email: string | undefined): Promise<string> {
    if (!email) {
      throw new UnauthorizedException('Authenticated email required');
    }
    const member = await this.prisma.member.findUnique({
      where: { email },
      select: { uid: true, deletedAt: true },
    });
    if (!member || member.deletedAt) {
      throw new UnauthorizedException('Member not found');
    }
    return member.uid;
  }
}
