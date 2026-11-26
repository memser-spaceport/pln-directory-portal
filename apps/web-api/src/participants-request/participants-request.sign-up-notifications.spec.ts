jest.mock('../members/members.service', () => ({ MembersService: class MembersService {} }));
jest.mock('../teams/teams.service', () => ({ TeamsService: class TeamsService {} }));
jest.mock('../team-enrichment/team-enrichment.service', () => ({
  TeamEnrichmentService: class TeamEnrichmentService {},
}));
jest.mock('../utils/location-transfer/location-transfer.service', () => ({
  LocationTransferService: class LocationTransferService {},
}));

import { ParticipantsRequestService } from './participants-request.service';

describe('ParticipantsRequestService sign-up notifications', () => {
  let membersService: { createMemberAndAttach: jest.Mock; createMemberFromSignUpData: jest.Mock };
  let notifications: { notifySignUp: jest.Mock };
  let service: ParticipantsRequestService;

  beforeEach(() => {
    membersService = {
      createMemberAndAttach: jest.fn().mockResolvedValue({ uid: 'member-1' }),
      createMemberFromSignUpData: jest.fn().mockResolvedValue({ uid: 'member-2' }),
    };
    notifications = { notifySignUp: jest.fn().mockResolvedValue(undefined) };
    service = new ParticipantsRequestService(
      membersService as never,
      {} as never,
      {} as never,
      { info: jest.fn() } as never,
      {} as never,
      notifications as never
    );
  });

  it('posts a member sign-up', async () => {
    await service.handleMemberRequest({ newData: { name: 'Ada', email: 'ada@example.com' } });

    expect(notifications.notifySignUp).toHaveBeenCalledWith('member-1');
  });

  it('posts a member created by the legacy request', async () => {
    await service.processImmediateRequest({ participantType: 'MEMBER', newData: { email: 'ada@example.com' } });

    expect(notifications.notifySignUp).toHaveBeenCalledWith('member-2');
  });

  it('does not post when the sign-up fails', async () => {
    membersService.createMemberAndAttach.mockRejectedValue(new Error('duplicate'));

    await expect(service.handleMemberRequest({ newData: { name: 'Ada', email: 'ada@example.com' } })).rejects.toThrow(
      'duplicate'
    );

    expect(notifications.notifySignUp).not.toHaveBeenCalled();
  });
});
