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
    member: { findMany: jest.fn().mockResolvedValue([]) },
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
