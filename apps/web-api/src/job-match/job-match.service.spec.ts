jest.mock('../members/members.service', () => ({ MembersService: class MembersService {} }));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobOpeningStatus } from '@prisma/client';
import { JobMatchService } from './job-match.service';

describe('JobMatchService', () => {
  const findMemberByEmail = jest.fn();
  const jobOpeningFindUnique = jest.fn();
  const teamMemberRoleFindFirst = jest.fn();
  const jobMatchRowFindFirst = jest.fn();
  const jobMatchRowFindMany = jest.fn();
  const memberFindMany = jest.fn();

  const prisma = {
    jobOpening: { findUnique: jobOpeningFindUnique },
    teamMemberRole: { findFirst: teamMemberRoleFindFirst },
    jobMatchRow: { findFirst: jobMatchRowFindFirst, findMany: jobMatchRowFindMany },
    member: { findMany: memberFindMany },
  };

  const service = new JobMatchService(prisma as never, { findMemberByEmail } as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refuses a caller who is not a current member of the hiring team', async () => {
    findMemberByEmail.mockResolvedValue({ uid: 'member-1', isDirectoryAdmin: false });
    jobOpeningFindUnique.mockResolvedValue({
      uid: 'role-1',
      teamUid: 'team-1',
      status: JobOpeningStatus.CONFIRMED,
      publishedAt: new Date(),
    });
    teamMemberRoleFindFirst.mockResolvedValue(null);
    await expect(service.listForRole('role-1', 'person@example.com')).rejects.toBeInstanceOf(ForbiddenException);
    expect(jobMatchRowFindFirst).not.toHaveBeenCalled();
  });

  it('returns an empty list for a role that is not live', async () => {
    findMemberByEmail.mockResolvedValue({ uid: 'admin-1', isDirectoryAdmin: true });
    jobOpeningFindUnique.mockResolvedValue({
      uid: 'role-1',
      teamUid: 'team-1',
      status: JobOpeningStatus.STALE,
      publishedAt: new Date(),
    });
    await expect(service.listForRole('role-1', 'admin@example.com')).resolves.toEqual({ suggestions: [] });
    expect(jobMatchRowFindFirst).not.toHaveBeenCalled();
  });

  it('returns the stored top 5 for a live role without calling a model', async () => {
    findMemberByEmail.mockResolvedValue({ uid: 'member-1', isDirectoryAdmin: false });
    jobOpeningFindUnique.mockResolvedValue({
      uid: 'role-1',
      teamUid: 'team-1',
      status: JobOpeningStatus.CONFIRMED,
      publishedAt: new Date(),
    });
    teamMemberRoleFindFirst.mockResolvedValue({ id: 1 });
    jobMatchRowFindFirst.mockResolvedValue({ runUid: 'run-1' });
    jobMatchRowFindMany.mockResolvedValue([
      {
        memberUid: 'cand-1',
        rank: 1,
        fit: 91,
        label: 'STRONG',
        blurb: 'Knows Go.',
        payload: [{ text: 'Go', matched: true }],
        interested: true,
      },
    ]);
    memberFindMany.mockResolvedValue([
      { uid: 'cand-1', name: 'Ada Lovelace', role: 'Engineer', image: { url: 'https://img' } },
    ]);

    await expect(service.listForRole('role-1', 'lead@example.com')).resolves.toEqual({
      suggestions: [
        {
          memberUid: 'cand-1',
          name: 'Ada Lovelace',
          role: 'Engineer',
          imageUrl: 'https://img',
          fit: 91,
          label: 'Strong match',
          rank: 1,
          blurb: 'Knows Go.',
          criteria: [{ text: 'Go', matched: true }],
          interested: true,
        },
      ],
    });
    expect(jobMatchRowFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kind: 'SUGGESTION', runUid: 'run-1', roleUid: 'role-1' },
        take: 5,
        orderBy: { rank: 'asc' },
      })
    );
  });

  it('404s when the role does not exist', async () => {
    findMemberByEmail.mockResolvedValue({ uid: 'admin-1', isDirectoryAdmin: true });
    jobOpeningFindUnique.mockResolvedValue(null);
    await expect(service.listForRole('missing', 'admin@example.com')).rejects.toBeInstanceOf(NotFoundException);
  });
});
