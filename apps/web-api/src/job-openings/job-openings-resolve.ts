import { NotFoundException } from '@nestjs/common';
import { JobOpeningStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { HIDDEN_JOB_OPENING_STATUSES } from './job-openings-query.service';

export type ResolvedJobOpening = {
  uid: string;
  roleTitle: string;
  sourceLink: string | null;
  status: JobOpeningStatus;
  teamUid: string | null;
  team: { uid: string; name: string; jobReferEmail: string | null };
};

export async function resolveVisibleJobOpening(prisma: PrismaService, jobUid: string): Promise<ResolvedJobOpening> {
  const jobOpening = await prisma.jobOpening.findUnique({
    where: { uid: jobUid },
    select: {
      uid: true,
      roleTitle: true,
      sourceLink: true,
      status: true,
      teamUid: true,
      team: { select: { uid: true, name: true, jobReferEmail: true } },
    },
  });
  if (!jobOpening || !jobOpening.team || HIDDEN_JOB_OPENING_STATUSES.includes(jobOpening.status)) {
    throw new NotFoundException('Job opening not found');
  }
  return { ...jobOpening, team: jobOpening.team };
}
