// The session guard imports axios, which ships ESM; it is only compared by identity here.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));

import { BadRequestException, RequestMethod, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { MemberSignalsController } from './member-signals.controller';
import { MemberSignalsService } from './member-signals.service';

describe('MemberSignalsController (LAB-3123)', () => {
  const memberFindUnique = jest.fn();
  const prisma = { member: { findUnique: memberFindUnique } };
  const service = new MemberSignalsService(prisma as never, { trackEvent: jest.fn() } as never);
  const record = jest.spyOn(service, 'record').mockResolvedValue(true);
  const controller = new MemberSignalsController(service);
  const handler = MemberSignalsController.prototype.recordMemberSignal;

  beforeEach(() => {
    jest.clearAllMocks();
    memberFindUnique.mockResolvedValue({ uid: 'm1', deletedAt: null });
  });

  it('is POST /v1/member-signals behind the member session guard, answering 204', () => {
    expect(Reflect.getMetadata(PATH_METADATA, MemberSignalsController)).toBe('v1/member-signals');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([UserTokenValidation]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(204);
  });

  it('records the signal for the session member, with an upper-case entity type', async () => {
    await expect(
      controller.recordMemberSignal({ action: 'view', entityType: 'team', entityId: 't1' }, {
        userEmail: 'ada@protocol.ai',
      } as never)
    ).resolves.toBeUndefined();

    expect(memberFindUnique).toHaveBeenCalledWith({
      where: { email: 'ada@protocol.ai' },
      select: { uid: true, deletedAt: true },
    });
    expect(record).toHaveBeenCalledWith({ memberUid: 'm1', action: 'view', entityType: 'TEAM', entityUid: 't1' });
  });

  it('answers 400 (not 500) for a pair that is not allowed, and records nothing', async () => {
    await expect(
      controller.recordMemberSignal({ action: 'contact-copy', entityType: 'team', entityId: 't1' }, {
        userEmail: 'ada@protocol.ai',
      } as never)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(record).not.toHaveBeenCalled();
  });

  it('answers 400 for a malformed body', async () => {
    await expect(controller.recordMemberSignal(null, { userEmail: 'ada@protocol.ai' } as never)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('answers 401 without a session email', async () => {
    await expect(
      controller.recordMemberSignal({ action: 'view', entityType: 'member', entityId: 'm9' }, {} as never)
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(record).not.toHaveBeenCalled();
  });

  it.each([
    ['no member for the email', null],
    ['a deleted member', { uid: 'm2', deletedAt: new Date() }],
  ])('answers 204 and records nothing for %s, so the frontend never signs a valid user out', async (_label, member) => {
    memberFindUnique.mockResolvedValue(member);

    await expect(
      controller.recordMemberSignal({ action: 'view', entityType: 'member', entityId: 'm9' }, {
        userEmail: 'pending@x.io',
      } as never)
    ).resolves.toBeUndefined();
    expect(record).not.toHaveBeenCalled();
  });
});
