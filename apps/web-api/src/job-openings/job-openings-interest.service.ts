import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { JobOpeningInterestStatus } from 'libs/contracts/src/schema/job-opening';
import { PrismaService } from '../shared/prisma.service';
import { resolveVisibleJobOpening } from './job-openings-resolve';

@Injectable()
export class JobOpeningsInterestService {
  constructor(private readonly prisma: PrismaService) {}

  /** Mark interest in a job opening. Idempotent: re-marking succeeds without double-counting. */
  async markInterest(jobUid: string, memberEmail: string | undefined): Promise<JobOpeningInterestStatus> {
    const memberUid = await this.resolveMemberUid(memberEmail);
    await resolveVisibleJobOpening(this.prisma, jobUid);

    await this.prisma.jobOpeningInterest.upsert({
      where: { jobOpeningUid_memberUid: { jobOpeningUid: jobUid, memberUid } },
      create: { jobOpeningUid: jobUid, memberUid },
      update: {},
    });

    return this.buildStatus(jobUid, true);
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
