import { BadRequestException } from '@nestjs/common';
import { JobSearchStatus } from '@prisma/client';
import {
  omitJobSearchStatus,
  presentJobSearchStatusForViewer,
  toPrismaJobSearchStatus,
  toWireJobSearchStatus,
} from './job-search-status';

describe('job-search-status', () => {
  it('maps hyphenated wire values to Prisma enums', () => {
    expect(toPrismaJobSearchStatus('actively-looking')).toBe(JobSearchStatus.ACTIVELY_LOOKING);
    expect(toPrismaJobSearchStatus('open-to-right-role')).toBe(JobSearchStatus.OPEN_TO_RIGHT_ROLE);
    expect(toPrismaJobSearchStatus('not-looking')).toBe(JobSearchStatus.NOT_LOOKING);
  });

  it('rejects unknown wire values', () => {
    expect(() => toPrismaJobSearchStatus('ACTIVELY_LOOKING')).toThrow(BadRequestException);
    expect(() => toPrismaJobSearchStatus('nope')).toThrow(BadRequestException);
  });

  it('maps Prisma enums to hyphenated wire values', () => {
    expect(toWireJobSearchStatus(JobSearchStatus.NOT_LOOKING)).toBe('not-looking');
  });

  it('omits jobSearchStatus for other viewers', () => {
    const member = { uid: 'm1', jobSearchStatus: JobSearchStatus.ACTIVELY_LOOKING };
    const result = presentJobSearchStatusForViewer(member, false);
    expect(result).toEqual({ uid: 'm1' });
    expect('jobSearchStatus' in result).toBe(false);
  });

  it('returns the wire value for self or admin', () => {
    const member = { uid: 'm1', jobSearchStatus: JobSearchStatus.OPEN_TO_RIGHT_ROLE };
    expect(presentJobSearchStatusForViewer(member, true).jobSearchStatus).toBe('open-to-right-role');
  });

  it('omits the field when stripping lists', () => {
    expect(omitJobSearchStatus({ uid: 'm1', jobSearchStatus: 'actively-looking' })).toEqual({ uid: 'm1' });
  });
});
