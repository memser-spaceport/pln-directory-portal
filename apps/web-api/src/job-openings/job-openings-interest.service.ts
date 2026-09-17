import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { JobOpeningInterestStatus, TeamInterestStatus } from 'libs/contracts/src/schema/job-opening';
import { PrismaService } from '../shared/prisma.service';
import { AtsPushService } from '../integration-keys/ats-push.service';
import { resolveVisibleJobOpening } from './job-openings-resolve';

@Injectable()
export class JobOpeningsInterestService {
  constructor(private readonly prisma: PrismaService, private readonly atsPush: AtsPushService) {}

  /** Mark interest in a job opening. Idempotent: re-marking succeeds without double-counting. */
  async markInterest(jobUid: string, memberEmail: string | undefined): Promise<JobOpeningInterestStatus> {
    const memberUid = await this.resolveMemberUid(memberEmail);
    await resolveVisibleJobOpening(this.prisma, jobUid);

    const interest = await this.prisma.jobOpeningInterest.upsert({
      where: { jobOpeningUid_memberUid: { jobOpeningUid: jobUid, memberUid } },
      create: { jobOpeningUid: jobUid, memberUid },
      update: {},
      select: { uid: true },
    });
    this.atsPush.pushJobInterest(interest.uid);

    return this.buildStatus(jobUid, true);
  }

  /**
   * Mark interest in a team rather than in one of its roles. Idempotent, and
   * one-way: there is no un-marking, so an integrated ATS never has to reason
   * about someone withdrawing.
   */
  async markTeamInterest(teamUid: string, memberEmail: string | undefined): Promise<TeamInterestStatus> {
    const memberUid = await this.resolveMemberUid(memberEmail);
    const team = await this.prisma.team.findUnique({ where: { uid: teamUid }, select: { uid: true } });
    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const interest = await this.prisma.teamInterest.upsert({
      where: { teamUid_memberUid: { teamUid, memberUid } },
      create: { teamUid, memberUid },
      update: {},
      select: { uid: true },
    });
    this.atsPush.pushTeamInterest(interest.uid);

    const interestedCount = await this.prisma.teamInterest.count({ where: { teamUid } });
    return { teamUid, interestedCount, viewerIsInterested: true };
  }

  /** Remove interest. Idempotent: removing when not interested succeeds. */
  async removeInterest(jobUid: string, memberEmail: string | undefined): Promise<JobOpeningInterestStatus> {
    const memberUid = await this.resolveMemberUid(memberEmail);
    await resolveVisibleJobOpening(this.prisma, jobUid);

    await this.prisma.jobOpeningInterest.deleteMany({
      where: { jobOpeningUid: jobUid, memberUid },
    });

    return this.buildStatus(jobUid, false);
  }

  async listMine(memberEmail: string | undefined) {
    const memberUid = await this.resolveMemberUid(memberEmail);
    const interests = await this.prisma.jobOpeningInterest.findMany({
      where: { memberUid },
      select: { uid: true, jobOpeningUid: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      interests: interests.map((interest) => ({
        uid: interest.uid,
        jobUid: interest.jobOpeningUid,
        interestedAt: interest.createdAt.toISOString(),
      })),
    };
  }

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

  private async buildStatus(jobUid: string, viewerIsInterested: boolean): Promise<JobOpeningInterestStatus> {
    const interestedCount = await this.prisma.jobOpeningInterest.count({ where: { jobOpeningUid: jobUid } });
    return { jobUid, interestedCount, viewerIsInterested };
  }
}
