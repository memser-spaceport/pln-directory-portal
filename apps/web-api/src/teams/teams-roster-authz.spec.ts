import { ForbiddenException } from '@nestjs/common';

import { TeamsService } from './teams.service';

/** `updateTeamFromParticipantsRequest` authorizes the path team, so body roles must stay on that team. */
describe('TeamsService — teamMemberRoles must belong to the path team', () => {
  function setup() {
    const prisma = { $transaction: jest.fn() };
    const service = Object.create(TeamsService.prototype);
    Object.assign(service, {
      prisma,
      logger: { info: jest.fn(), error: jest.fn() },
      membersService: { findMemberByEmail: jest.fn().mockResolvedValue({}) },
    });
    return { service: service as TeamsService, prisma };
  }

  const request = (teamUid: string) =>
    ({ newData: { name: 'Acme', teamMemberRoles: [{ status: 'Add', memberUid: 'm1', teamUid }] } } as any);

  it.each(['team-y', undefined])('refuses a role for teamUid=%s when updating team-x', async (teamUid) => {
    const { service, prisma } = setup();

    await expect(
      service.updateTeamFromParticipantsRequest('team-x', request(teamUid as string), 'lead@example.com')
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
