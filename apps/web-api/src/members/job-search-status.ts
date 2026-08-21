import { BadRequestException } from '@nestjs/common';
import { JobSearchStatus } from '@prisma/client';

export const JOB_SEARCH_STATUS_WIRE = ['actively-looking', 'open-to-right-role', 'not-looking'] as const;
export type JobSearchStatusWire = (typeof JOB_SEARCH_STATUS_WIRE)[number];

const WIRE_TO_PRISMA: Record<JobSearchStatusWire, JobSearchStatus> = {
  'actively-looking': JobSearchStatus.ACTIVELY_LOOKING,
  'open-to-right-role': JobSearchStatus.OPEN_TO_RIGHT_ROLE,
  'not-looking': JobSearchStatus.NOT_LOOKING,
};

const PRISMA_TO_WIRE: Record<JobSearchStatus, JobSearchStatusWire> = {
  [JobSearchStatus.ACTIVELY_LOOKING]: 'actively-looking',
  [JobSearchStatus.OPEN_TO_RIGHT_ROLE]: 'open-to-right-role',
  [JobSearchStatus.NOT_LOOKING]: 'not-looking',
};

export function isJobSearchStatusWire(value: unknown): value is JobSearchStatusWire {
  return typeof value === 'string' && (JOB_SEARCH_STATUS_WIRE as readonly string[]).includes(value);
}

export function toPrismaJobSearchStatus(value: unknown): JobSearchStatus | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (!isJobSearchStatusWire(value)) {
    throw new BadRequestException('Invalid jobSearchStatus');
  }
  return WIRE_TO_PRISMA[value];
}

export function toWireJobSearchStatus(value: JobSearchStatus | JobSearchStatusWire | null | undefined): JobSearchStatusWire | null {
  if (!value) {
    return null;
  }
  if (isJobSearchStatusWire(value)) {
    return value;
  }
  return PRISMA_TO_WIRE[value] ?? null;
}

export function assignJobSearchStatusFromInput(source: Record<string, unknown>, dest: Record<string, unknown>): void {
  if (!Object.prototype.hasOwnProperty.call(source, 'jobSearchStatus')) {
    return;
  }
  dest.jobSearchStatus = toPrismaJobSearchStatus(source.jobSearchStatus);
}

export function omitJobSearchStatus<T extends Record<string, unknown>>(member: T): T {
  if (!member || !Object.prototype.hasOwnProperty.call(member, 'jobSearchStatus')) {
    return member;
  }
  const { jobSearchStatus: _ignored, ...rest } = member;
  return rest as T;
}

export function presentJobSearchStatusForViewer<T extends Record<string, unknown>>(
  member: T,
  canSee: boolean
): T {
  if (!member) {
    return member;
  }
  if (!canSee) {
    return omitJobSearchStatus(member);
  }
  return {
    ...member,
    jobSearchStatus: toWireJobSearchStatus(member.jobSearchStatus as JobSearchStatus | null | undefined),
  };
}
