jest.mock('./demo-day-fundraising-profiles.service', () => ({
  DemoDayFundraisingProfilesService: jest.fn(),
}));
jest.mock('../team-pitches/team-pitch-profiles.service', () => ({ TeamPitchProfilesService: jest.fn() }));
jest.mock('../push-notifications/push-notifications.service', () => ({ PushNotificationsService: jest.fn() }));
jest.mock('../deals/deals.service', () => ({ DealsService: jest.fn() }));
jest.mock('../articles/articles.service', () => ({ ArticlesService: jest.fn() }));
jest.mock('../member-follow-ups/member-follow-ups.service', () => ({ MemberFollowUpsService: jest.fn() }));
jest.mock('../office-hours/office-hours.service', () => ({ OfficeHoursService: jest.fn() }));
jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('../notifications/notification-service.client', () => ({ NotificationServiceClient: class {} }));

import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DemoDayStatus } from '@prisma/client';
import { DemoDaysController } from './demo-days.controller';
import { DemoDaysService } from './demo-days.service';
import { OptionalUserTokenCheckGuard } from '../guards/user-token-check.guard';
import { actionCoverageTools } from '../mcp/mcp-action-coverage-tools';

const WRITE_OPS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const EMAIL = 'ada@example.com';
const dto = { email: EMAIL, name: 'Ada', isTeamNew: false } as never;

function makePrisma(existing: unknown) {
  const writes: string[] = [];
  const model = (name: string, extra: Record<string, unknown> = {}) =>
    new Proxy(extra, {
      get: (t, op: string) =>
        op in t
          ? t[op]
          : WRITE_OPS.has(op)
          ? async () => {
              writes.push(`${name}.${op}`);
              return { uid: 'u1', email: EMAIL, demoDayParticipants: [] };
            }
          : async () => null,
    });
  const prisma = new Proxy({} as Record<string, unknown>, {
    get: (t, name: string) =>
      name in t
        ? t[name]
        : name === 'demoDay'
        ? model(name, {
            findFirst: async () => ({ uid: 'd1', slugURL: 'dd', status: DemoDayStatus.REGISTRATION_OPEN }),
          })
        : name === 'member'
        ? model(name, { findFirst: async () => existing })
        : model(name),
  });
  return { prisma, writes };
}

const existing = { uid: 'm1', email: EMAIL, investorProfile: null, linkedinHandler: null, demoDayParticipants: [] };
const existingApplied = { ...existing, demoDayParticipants: [{ uid: 'p1', type: 'INVESTOR' }] };
const svc = (prisma: unknown) =>
  new DemoDaysService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);

describe('submitInvestorApplication authz', () => {
  it('403 and no writes: anonymous + existing member', async () => {
    const { prisma, writes } = makePrisma(existing);
    await expect(svc(prisma).submitInvestorApplication(dto, 'dd')).rejects.toBeInstanceOf(ForbiddenException);
    expect(writes).toEqual([]);
  });

  it('403 and no writes: token for a different email', async () => {
    const { prisma, writes } = makePrisma(existing);
    await expect(svc(prisma).submitInvestorApplication(dto, 'dd', 'eve@example.com')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(writes).toEqual([]);
  });

  it('403 and no writes: anonymous + existing member already applied', async () => {
    const { prisma, writes } = makePrisma(existingApplied);
    await expect(svc(prisma).submitInvestorApplication(dto, 'dd')).rejects.toBeInstanceOf(ForbiddenException);
    expect(writes).toEqual([]);
  });

  it('matching token (case/space differences) still writes', async () => {
    const { prisma, writes } = makePrisma(existing);
    await svc(prisma)
      .submitInvestorApplication(dto, 'dd', '  ADA@Example.com ')
      .catch((e) => expect(e).not.toBeInstanceOf(ForbiddenException));
    expect(writes).toContain('member.update');
  });

  it('anonymous new email still creates the member', async () => {
    const { prisma, writes } = makePrisma(null);
    await svc(prisma)
      .submitInvestorApplication(dto, 'dd')
      .catch((e) => expect(e).not.toBeInstanceOf(ForbiddenException));
    expect(writes).toContain('member.create');
  });
});

describe('investor-application wiring', () => {
  it('route is behind OptionalUserTokenCheckGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, DemoDaysController.prototype.submitInvestorApplication);
    expect(guards).toContain(OptionalUserTokenCheckGuard);
  });

  it('controller passes req.userEmail', async () => {
    const submit = jest.fn();
    const ctrl = new DemoDaysController(
      { submitInvestorApplication: submit } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
    await ctrl.submitInvestorApplication('dd', { userEmail: EMAIL }, dto);
    expect(submit).toHaveBeenCalledWith(dto, 'dd', EMAIL);
  });

  it('MCP apply_to_demo_day passes the caller email', async () => {
    const submit = jest.fn();
    const tool = actionCoverageTools({ demoDays: { submitInvestorApplication: submit } } as never).find(
      (t) => t.name === 'apply_to_demo_day'
    );
    await tool?.execute({ email: EMAIL, name: 'Ada', permissions: new Set() } as never, { demoDay: 'dd' });
    expect(submit.mock.calls[0][2]).toBe(EMAIL);
  });
});
