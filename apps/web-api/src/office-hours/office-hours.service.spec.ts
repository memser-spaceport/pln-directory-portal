jest.mock('dns', () => ({
  promises: { lookup: jest.fn() },
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
// The contracts barrel pulls in nestjs-zod ESM, which Jest 27 cannot parse.
jest.mock('libs/contracts/src/schema', () => {
  const enumOf = (...values: string[]) => ({ Enum: Object.fromEntries(values.map((v) => [v, v])) });
  return {
    MemberFollowUpStatus: enumOf('PENDING', 'COMPLETED', 'CLOSED'),
    MemberFollowUpType: enumOf(
      'MEETING_INITIATED',
      'MEETING_SCHEDULED',
      'MEETING_YET_TO_HAPPEN',
      'MEETING_RESCHEDULED'
    ),
    MemberFeedbackResponseType: enumOf('POSITIVE', 'NEGATIVE', 'NEUTRAL'),
  };
});
jest.mock('../members/members.service', () => ({
  MembersService: class MembersService {},
}));
jest.mock('../member-follow-ups/member-follow-ups.service', () => ({
  MemberFollowUpsService: class MemberFollowUpsService {},
}));
jest.mock('../member-feedbacks/member-feedbacks.service', () => ({
  MemberFeedbacksService: class MemberFeedbacksService {},
}));
jest.mock('../notifications/notification-service.client', () => ({
  NotificationServiceClient: class NotificationServiceClient {},
}));
jest.mock('../member-interaction-adjustments/member-interaction-adjustments.service', () => ({
  MemberInteractionAdjustmentsService: class MemberInteractionAdjustmentsService {},
}));

import { promises as dns } from 'dns';
import axios from 'axios';
import { OfficeHoursService } from './office-hours.service';

const lookupMock = dns.lookup as unknown as jest.Mock;
const getMock = axios.get as unknown as jest.Mock;

const response = (status: number, headers: Record<string, string> = {}) => ({ status, headers });

describe('OfficeHoursService link check', () => {
  const memberUpdate = jest.fn();
  const memberFindMany = jest.fn();
  const prismaMock = { member: { update: memberUpdate, findMany: memberFindMany } };
  const loggerMock = { info: jest.fn(), error: jest.fn() };
  const membersServiceMock = { findOne: jest.fn() };

  const service = new OfficeHoursService(
    prismaMock as any,
    loggerMock as any,
    {} as any,
    {} as any,
    {} as any,
    membersServiceMock as any,
    {} as any
  );

  beforeEach(() => {
    jest.clearAllMocks();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    getMock.mockResolvedValue(response(200));
  });

  it('returns NOT_FOUND for an empty link', async () => {
    expect(await service.checkLink('')).toBe('NOT_FOUND');
    expect(getMock).not.toHaveBeenCalled();
  });

  describe('public links', () => {
    it('returns OK for a public link that answers 200', async () => {
      expect(await service.checkLink('https://calendly.com/someone')).toBe('OK');
      expect(getMock).toHaveBeenCalledTimes(1);
      expect(getMock.mock.calls[0][0]).toBe('https://calendly.com/someone');
    });

    it('adds https:// to a link without a scheme', async () => {
      expect(await service.checkLink('calendly.com/someone/')).toBe('OK');
      expect(getMock.mock.calls[0][0]).toBe('https://calendly.com/someone');
    });

    it('returns BROKEN for a public link that answers 404', async () => {
      getMock.mockResolvedValue(response(404));
      expect(await service.checkLink('https://calendly.com/gone')).toBe('BROKEN');
    });

    it('returns BROKEN when the request times out', async () => {
      getMock.mockRejectedValue(new Error('timeout of 8000ms exceeded'));
      expect(await service.checkLink('https://calendly.com/slow')).toBe('BROKEN');
    });

    it('follows a redirect to another public https link', async () => {
      getMock.mockResolvedValueOnce(response(301, { location: '/next' })).mockResolvedValueOnce(response(200));
      expect(await service.checkLink('https://calendly.com/someone')).toBe('OK');
      expect(getMock).toHaveBeenCalledTimes(2);
      expect(getMock.mock.calls[1][0]).toBe('https://calendly.com/next');
    });

    it('sends the request without automatic redirects and pinned to the checked address', async () => {
      await service.checkLink('https://calendly.com/someone');
      const config = getMock.mock.calls[0][1];
      expect(config).toMatchObject({ maxRedirects: 0, timeout: 8000, proxy: false });
      expect(config.validateStatus(500)).toBe(true);

      const lookup = config.httpsAgent.options.lookup;
      const single = jest.fn();
      lookup('calendly.com', {}, single);
      expect(single).toHaveBeenCalledWith(null, '93.184.216.34', 4);
      const all = jest.fn();
      lookup('calendly.com', { all: true }, all);
      expect(all).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
    });
  });

  describe('links rejected before any request', () => {
    it.each([
      'http://calendly.com/someone',
      'ftp://calendly.com/someone',
      'https://calendly.com:8443/someone',
      'https://localhost/admin',
      'https://api.localhost/admin',
      'https://127.0.0.1/admin',
      'https://2130706433/admin',
      'https://0177.0.0.1/admin',
      'https://0x7f.0.0.1/admin',
      'https://[::1]/admin',
      'https://[::ffff:7f00:1]/admin',
      'https://169.254.169.254/latest/meta-data',
      '10.0.0.5:8080/internal',
    ])('returns BROKEN for %s', async (link) => {
      expect(await service.checkLink(link)).toBe('BROKEN');
      expect(lookupMock).not.toHaveBeenCalled();
      expect(getMock).not.toHaveBeenCalled();
    });

    it.each([
      [[{ address: '127.0.0.1', family: 4 }]],
      [[{ address: '10.1.2.3', family: 4 }]],
      [[{ address: '192.168.1.10', family: 4 }]],
      [[{ address: '169.254.169.254', family: 4 }]],
      [[{ address: '0.0.0.0', family: 4 }]],
      [[{ address: 'fd00::1', family: 6 }]],
      [[{ address: '::ffff:127.0.0.1', family: 6 }]],
      [[{ address: '::ffff:a00:1', family: 6 }]],
      [
        [
          { address: '93.184.216.34', family: 4 },
          { address: '172.16.0.1', family: 4 },
        ],
      ],
      [[]],
    ])('returns BROKEN when the host name resolves to %j', async (addresses) => {
      lookupMock.mockResolvedValue(addresses);
      expect(await service.checkLink('https://internal.example.com/')).toBe('BROKEN');
      expect(getMock).not.toHaveBeenCalled();
    });

    it('returns BROKEN when the host name does not resolve', async () => {
      lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
      expect(await service.checkLink('https://nowhere.example.com/')).toBe('BROKEN');
      expect(getMock).not.toHaveBeenCalled();
    });
  });

  describe('redirects', () => {
    it('stops at a redirect to a private address', async () => {
      getMock.mockResolvedValueOnce(response(302, { location: 'https://169.254.169.254/latest/meta-data' }));
      expect(await service.checkLink('https://calendly.com/someone')).toBe('BROKEN');
      expect(getMock).toHaveBeenCalledTimes(1);
    });

    it('stops at a redirect to a host name that resolves to a private address', async () => {
      lookupMock
        .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
        .mockResolvedValueOnce([{ address: '10.0.0.7', family: 4 }]);
      getMock.mockResolvedValueOnce(response(302, { location: 'https://rebind.example.com/' }));
      expect(await service.checkLink('https://calendly.com/someone')).toBe('BROKEN');
      expect(getMock).toHaveBeenCalledTimes(1);
    });

    it('stops at a redirect to an http link', async () => {
      getMock.mockResolvedValueOnce(response(301, { location: 'http://calendly.com/someone' }));
      expect(await service.checkLink('https://calendly.com/someone')).toBe('BROKEN');
      expect(getMock).toHaveBeenCalledTimes(1);
    });

    it('returns BROKEN after more than 5 redirects', async () => {
      getMock.mockResolvedValue(response(302, { location: '/again' }));
      expect(await service.checkLink('https://calendly.com/someone')).toBe('BROKEN');
      expect(getMock).toHaveBeenCalledTimes(6);
    });

    it('pins each hop to the address checked for that hop', async () => {
      lookupMock
        .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
        .mockResolvedValueOnce([{ address: '2606:4700:4700::1111', family: 6 }]);
      getMock
        .mockResolvedValueOnce(response(302, { location: 'https://cal.example.org/x' }))
        .mockResolvedValueOnce(response(200));
      expect(await service.checkLink('https://calendly.com/someone')).toBe('OK');
      const cb = jest.fn();
      getMock.mock.calls[1][1].httpsAgent.options.lookup('cal.example.org', {}, cb);
      expect(cb).toHaveBeenCalledWith(null, '2606:4700:4700::1111', 6);
    });
  });

  describe('callers', () => {
    it('checkProvidedLink rejects a private link without a request', async () => {
      expect(await service.checkProvidedLink('https://127.0.0.1/')).toEqual({ status: 'BROKEN' });
      expect(getMock).not.toHaveBeenCalled();
    });

    it('checkAndUpdateMemberLink stores BROKEN for a private link without a request', async () => {
      membersServiceMock.findOne.mockResolvedValue({ uid: 'm1', officeHours: 'https://10.0.0.5/' });
      expect(await service.checkAndUpdateMemberLink('m1')).toEqual({ uid: 'm1', ohStatus: 'BROKEN' });
      expect(memberUpdate).toHaveBeenCalledWith({ where: { uid: 'm1' }, data: { ohStatus: 'BROKEN' } });
      expect(getMock).not.toHaveBeenCalled();
    });

    it('the batch check stores BROKEN for a private link without a request', async () => {
      memberFindMany
        .mockResolvedValueOnce([{ uid: 'm1', officeHours: 'https://localhost/' }])
        .mockResolvedValueOnce([]);
      expect(await service.checkAllLinksBatch()).toEqual({ started: true });
      expect(memberUpdate).toHaveBeenCalledWith({ where: { uid: 'm1' }, data: { ohStatus: 'BROKEN' } });
      expect(getMock).not.toHaveBeenCalled();
    });

    it('a link update stores BROKEN for a private link without a request', async () => {
      await service.handleLinkUpdated('m1', 'https://[::1]/');
      expect(memberUpdate).toHaveBeenCalledWith({ where: { uid: 'm1' }, data: { ohStatus: 'BROKEN' } });
      expect(getMock).not.toHaveBeenCalled();
    });
  });
});
