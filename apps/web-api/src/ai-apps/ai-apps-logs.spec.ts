// axios ships ESM (not in the jest transform allowlist); the log proxy under
// test calls axios.get, so mock the calls themselves.
jest.mock('axios', () => ({
  get: jest.fn(),
  isAxiosError: jest.fn((error: any) => !!error?.isAxiosError),
}));

import 'reflect-metadata';
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import axios from 'axios';
import { AiAppsController } from './ai-apps.controller';
import { AiAppsService } from './ai-apps.service';
import { AiAppTokenGuard } from './guards/ai-app-token.guard';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const APP = {
  uid: 'app-1',
  memberUid: 'creator-1',
  appId: 'demo',
  name: 'Demo',
  status: 'READY',
};

function buildService(app: Record<string, any> | null = APP) {
  const prisma = {
    aiApp: { findUnique: jest.fn().mockResolvedValue(app) },
    aiAppEvent: { create: jest.fn().mockResolvedValue({}) },
    member: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
  };
  return new AiAppsService(prisma as any, {} as any);
}

describe('AiAppsService.getAgentLogs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('404s when the app does not exist or is deleted', async () => {
    await expect(buildService(null).getAgentLogs('creator-1', 'app-1', 'build', {})).rejects.toThrow(NotFoundException);
    await expect(
      buildService({ ...APP, status: 'DELETED' }).getAgentLogs('creator-1', 'app-1', 'build', {})
    ).rejects.toThrow(NotFoundException);
  });

  it("403s when the connected member doesn't own the app", async () => {
    await expect(buildService().getAgentLogs('someone-else', 'app-1', 'runtime', {})).rejects.toThrow(
      ForbiddenException
    );
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('proxies to the runner log endpoint and returns its body verbatim', async () => {
    const runnerBody = {
      appId: 'demo',
      phase: 'build',
      source: 'cloudwatch',
      events: [{ timestamp: 1, message: 'Step 1/5' }],
      nextToken: 'tok',
    };
    mockedAxios.get.mockResolvedValue({ status: 200, data: runnerBody });

    const result = await buildService().getAgentLogs('creator-1', 'app-1', 'build', {
      limit: 100,
      sinceMinutes: 60,
      nextToken: 'prev-tok',
    });

    expect(result).toBe(runnerBody);
    const [url, config] = mockedAxios.get.mock.calls[0];
    expect(url).toContain('/v1/apps/demo/build/logs');
    expect(config?.params).toEqual({ limit: 100, sinceMinutes: 60, nextToken: 'prev-tok' });
    expect(config?.headers).toHaveProperty('x-runner-token');
  });

  it('omits unset query params and hits the runtime path for runtime logs', async () => {
    mockedAxios.get.mockResolvedValue({ status: 200, data: { events: [] } });

    await buildService().getAgentLogs('creator-1', 'app-1', 'runtime', {});

    const [url, config] = mockedAxios.get.mock.calls[0];
    expect(url).toContain('/v1/apps/demo/runtime/logs');
    expect(config?.params).toEqual({});
  });

  it('maps runner failures to 502 without leaking the raw error', async () => {
    mockedAxios.get.mockRejectedValue(
      Object.assign(new Error('boom'), { isAxiosError: true, response: { status: 500, data: 'x' } })
    );
    await expect(buildService().getAgentLogs('creator-1', 'app-1', 'build', {})).rejects.toThrow(BadGatewayException);
  });
});

describe('AiAppsController log routes wiring', () => {
  const cases: Array<[string, typeof AiAppsController.prototype['getBuildLogs'], string]> = [
    ['getBuildLogs', AiAppsController.prototype.getBuildLogs, ':uid/logs/build'],
    ['getRuntimeLogs', AiAppsController.prototype.getRuntimeLogs, ':uid/logs/runtime'],
  ];

  it.each(cases)('%s registers as GET with the deploy-token guard', (_name, handler, path) => {
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([AiAppTokenGuard]);
  });

  it('parses numeric query params and passes the member from the deploy token', async () => {
    const service = { getAgentLogs: jest.fn().mockResolvedValue({ events: [] }) };
    const controller = new AiAppsController(service as any, {} as any, {} as any, {} as any);
    const req = { aiAppMemberUid: 'creator-1' };

    await controller.getBuildLogs('app-1', req, '100', '60', 'tok');
    expect(service.getAgentLogs).toHaveBeenCalledWith('creator-1', 'app-1', 'build', {
      limit: 100,
      sinceMinutes: 60,
      nextToken: 'tok',
    });

    await controller.getRuntimeLogs('app-1', req, undefined, undefined, undefined);
    expect(service.getAgentLogs).toHaveBeenLastCalledWith('creator-1', 'app-1', 'runtime', {
      limit: undefined,
      sinceMinutes: undefined,
      nextToken: undefined,
    });
  });

  it('400s on non-numeric or non-positive limit/sinceMinutes', async () => {
    const service = { getAgentLogs: jest.fn() };
    const controller = new AiAppsController(service as any, {} as any, {} as any, {} as any);
    const req = { aiAppMemberUid: 'creator-1' };

    await expect(controller.getBuildLogs('app-1', req, 'abc', undefined, undefined)).rejects.toThrow(
      BadRequestException
    );
    await expect(controller.getRuntimeLogs('app-1', req, undefined, '-5', undefined)).rejects.toThrow(
      BadRequestException
    );
    expect(service.getAgentLogs).not.toHaveBeenCalled();
  });
});

describe('AiAppsService.getMemberLogsDesc', () => {
  beforeEach(() => jest.clearAllMocks());

  it("403s when the requester is neither the creator nor a directory admin", async () => {
    await expect(
      buildService().getMemberLogsDesc('someone-else', 'app-1', 'runtime', {})
    ).rejects.toThrow(ForbiddenException);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('assembles the newest-first tail across forward pages, normalizing string timestamps', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        status: 200,
        data: { events: [{ timestamp: '2026-07-23T07:00:00.000Z', message: 'old' }], nextToken: 'p2' },
      })
      // The runner echoes the sent token at end-of-stream (CloudWatch never nulls it).
      .mockResolvedValueOnce({
        status: 200,
        data: { events: [{ timestamp: '2026-07-23T08:00:00.000Z', message: 'new' }], nextToken: 'p2' },
      });

    const result = await buildService().getMemberLogsDesc('creator-1', 'app-1', 'runtime', {
      limit: 10,
      sinceMinutes: 60,
    });

    expect(result.events.map((e) => e.message)).toEqual(['new', 'old']);
    expect(result.events.map((e) => e.timestamp)).toEqual([
      Date.parse('2026-07-23T08:00:00.000Z'),
      Date.parse('2026-07-23T07:00:00.000Z'),
    ]);
    expect(result.nextToken).toBeUndefined();
  });

  it('pages backward into history via the offset cursor, walking the runner only once (cache)', async () => {
    const service = buildService();
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { events: [1, 2, 3, 4, 5].map((t) => ({ timestamp: t, message: `m${t}` })) },
    });

    const p1 = await service.getMemberLogsDesc('creator-1', 'app-1', 'build', { limit: 2 });
    expect(p1.events.map((e) => e.message)).toEqual(['m5', 'm4']);
    expect(p1.nextToken).toBeTruthy();

    const p2 = await service.getMemberLogsDesc('creator-1', 'app-1', 'build', { limit: 2, nextToken: p1.nextToken });
    expect(p2.events.map((e) => e.message)).toEqual(['m3', 'm2']);

    const p3 = await service.getMemberLogsDesc('creator-1', 'app-1', 'build', { limit: 2, nextToken: p2.nextToken });
    expect(p3.events.map((e) => e.message)).toEqual(['m1']);
    expect(p3.nextToken).toBeUndefined();

    // All three pages served from one cached walk.
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('400s on a malformed desc cursor', async () => {
    await expect(
      buildService().getMemberLogsDesc('creator-1', 'app-1', 'build', { nextToken: 'not-a-cursor' })
    ).rejects.toThrow(BadRequestException);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('narrows the window when a walk exhausts the call budget, then serves the narrowed tail', async () => {
    mockedAxios.get.mockImplementation((_url: string, config: any) => {
      if (config?.params?.sinceMinutes === 15) {
        // 60 / 4 — the first narrowing completes in one page.
        return Promise.resolve({ status: 200, data: { events: [{ timestamp: 99, message: 'tail' }] } });
      }
      // The full window never ends: every call advances the token.
      const call = mockedAxios.get.mock.calls.length;
      return Promise.resolve({
        status: 200,
        data: { events: [{ timestamp: call, message: `x${call}` }], nextToken: `t${call}` },
      });
    });

    const result = await buildService().getMemberLogsDesc('creator-1', 'app-1', 'runtime', {
      limit: 10,
      sinceMinutes: 60,
    });
    expect(result.events.map((e) => e.message)).toEqual(['tail']);
  });

  it('502s when even narrowed walks cannot reach the end of the stream', async () => {
    mockedAxios.get.mockImplementation(() => {
      const call = mockedAxios.get.mock.calls.length;
      return Promise.resolve({ status: 200, data: { events: [], nextToken: `t${call}` } });
    });

    await expect(
      buildService().getMemberLogsDesc('creator-1', 'app-1', 'runtime', { sinceMinutes: 60 })
    ).rejects.toThrow(BadGatewayException);
  });
});

describe('AiAppsController member log routes — order param', () => {
  function buildController() {
    const service = {
      getMemberLogs: jest.fn().mockResolvedValue({ events: [] }),
      getMemberLogsDesc: jest.fn().mockResolvedValue({ events: [] }),
    };
    const controller = new AiAppsController(service as any, {} as any, {} as any, {} as any);
    jest.spyOn(controller as any, 'resolveMemberUid').mockResolvedValue('member-9');
    return { service, controller };
  }

  it('routes order=desc to the desc service and defaults to verbatim passthrough', async () => {
    const { service, controller } = buildController();

    await controller.getMemberBuildLogs('app-1', {}, '100', '60', undefined, 'desc');
    expect(service.getMemberLogsDesc).toHaveBeenCalledWith('member-9', 'app-1', 'build', {
      limit: 100,
      sinceMinutes: 60,
      nextToken: undefined,
    });
    expect(service.getMemberLogs).not.toHaveBeenCalled();

    await controller.getMemberRuntimeLogs('app-1', {}, undefined, undefined, 'tok', undefined);
    expect(service.getMemberLogs).toHaveBeenCalledWith('member-9', 'app-1', 'runtime', {
      limit: undefined,
      sinceMinutes: undefined,
      nextToken: 'tok',
    });
  });

  it('400s on an unknown order value', async () => {
    const { service, controller } = buildController();

    await expect(controller.getMemberRuntimeLogs('app-1', {}, undefined, undefined, undefined, 'sideways')).rejects.toThrow(
      BadRequestException
    );
    expect(service.getMemberLogs).not.toHaveBeenCalled();
    expect(service.getMemberLogsDesc).not.toHaveBeenCalled();
  });
});
