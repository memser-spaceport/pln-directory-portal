import { InvestorBulkProvisionService } from './investor-bulk-provision.service';
import { ExistingMemberForBulk, InvestorBulkParticipantInput } from './investor-bulk.types';

const existingAngel = (): ExistingMemberForBulk => ({
  uid: 'member-1',
  email: 'investor@example.com',
  investorProfile: {
    type: 'ANGEL',
    secRulesAccepted: true,
    typicalCheckSize: 10000,
    investInStartupStages: ['Seed'],
  },
  teamMemberRoles: [],
});

const fundUpload = (): InvestorBulkParticipantInput => ({
  email: 'investor@example.com',
  name: 'Investor',
  organization: 'Example Fund',
  investmentType: 'FUND',
  typicalCheckSize: 5000000,
  investInStartupStages: ['Series A'],
  secRulesAccepted: false,
});

describe('InvestorBulkProvisionService existing profiles', () => {
  const service = new InvestorBulkProvisionService();

  const provision = (
    participantData: InvestorBulkParticipantInput,
    existingMember: ExistingMemberForBulk | undefined,
    tx: Record<string, unknown>
  ) =>
    service.provisionInvestorFromBulkRow(
      tx as never,
      participantData,
      existingMember,
      { teamCache: new Map(), telegramOwnerCache: new Map() }
    );

  it('does not replace an angel profile when the CSV row is a fund with a blank SEC cell', async () => {
    const memberUpdate = jest.fn().mockResolvedValue({});
    const profileUpdate = jest.fn();
    const tx = {
      member: { findFirst: jest.fn(), update: memberUpdate },
      team: {
        findFirst: jest.fn().mockResolvedValue({ uid: 'team-1', name: 'Example Fund', contactMethod: 'a@b.c' }),
        update: jest.fn(),
      },
      investorProfile: {
        findUnique: jest.fn().mockResolvedValue({
          uid: 'team-profile',
          typicalCheckSize: 250000,
          investInStartupStages: ['Seed'],
        }),
        update: profileUpdate,
      },
      teamMemberRole: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    };

    await provision(fundUpload(), existingAngel(), tx);

    expect(memberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ investorProfile: expect.anything() }),
      })
    );
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it('fills empty profile fields and does not write a false SEC flag', async () => {
    const memberUpdate = jest.fn().mockResolvedValue({});
    const tx = { member: { update: memberUpdate } };
    const member: ExistingMemberForBulk = {
      uid: 'member-2',
      email: 'new-fields@example.com',
      investorProfile: {
        type: null,
        secRulesAccepted: false,
        typicalCheckSize: null,
        investInStartupStages: [],
      },
    };

    await provision(
      {
        email: member.email!,
        name: 'New Fields',
        investmentType: 'ANGEL',
        typicalCheckSize: 1000,
        investInStartupStages: ['Pre-seed'],
        secRulesAccepted: false,
      },
      member,
      tx
    );

    expect(memberUpdate.mock.calls[0][0].data.investorProfile).toEqual({
      update: {
        type: 'ANGEL',
        typicalCheckSize: 1000,
        investInStartupStages: ['Pre-seed'],
      },
    });
  });

  it('sets SEC acceptance on an existing profile only when the CSV says true', async () => {
    const memberUpdate = jest.fn().mockResolvedValue({});
    const tx = { member: { update: memberUpdate } };
    const member: ExistingMemberForBulk = {
      uid: 'member-3',
      email: 'accept@example.com',
      investorProfile: {
        type: 'ANGEL',
        secRulesAccepted: false,
        typicalCheckSize: 1000,
        investInStartupStages: ['Seed'],
      },
    };

    await provision(
      {
        email: member.email!,
        name: 'Accept',
        secRulesAccepted: true,
      },
      member,
      tx
    );

    expect(memberUpdate.mock.calls[0][0].data.investorProfile).toEqual({
      update: { secRulesAccepted: true },
    });
  });
});
