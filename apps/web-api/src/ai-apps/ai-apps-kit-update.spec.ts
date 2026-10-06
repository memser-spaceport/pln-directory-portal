/// <reference types="multer" />
// axios ships ESM (not in the jest transform allowlist); nothing here calls it.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import 'reflect-metadata';
import AdmZip from 'adm-zip';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AiAppsController } from './ai-apps.controller';
import { AiAppsService } from './ai-apps.service';
import { AiAppsStarterKitService, KIT_MANIFEST_PATH } from './ai-apps-starter-kit.service';
import { AiAppTokenGuard } from './guards/ai-app-token.guard';
import { AI_APPS_STARTER_KIT_VERSION, AI_APPS_STARTER_KIT_WHATS_NEW } from './ai-apps.constants';

const proto = AiAppsController.prototype;

function buildController(aiAppsService: Record<string, any>) {
  return new AiAppsController(
    aiAppsService as any,
    {} as any,
    new AiAppsStarterKitService(),
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );
}

function fakeResponse() {
  const res: any = { headers: {}, body: undefined };
  res.set = jest.fn((headers: Record<string, string>) => Object.assign(res.headers, headers));
  res.send = jest.fn((body: Buffer) => {
    res.body = body;
  });
  return res;
}

describe('GET /v1/ai-apps/starter-kit/version', () => {
  it('registers as GET "starter-kit/version" with no guard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, proto.getStarterKitVersion)).toBe('starter-kit/version');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.getStarterKitVersion)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(GUARDS_METADATA, proto.getStarterKitVersion)).toBeUndefined();
  });

  it('returns only the live version and what changed', () => {
    const body = buildController({}).getStarterKitVersion();
    expect(body).toEqual({ version: AI_APPS_STARTER_KIT_VERSION, whatsNew: AI_APPS_STARTER_KIT_WHATS_NEW });
    expect(AI_APPS_STARTER_KIT_WHATS_NEW.length).toBeGreaterThan(0);
  });
});

describe('GET /v1/ai-apps/starter-kit/update', () => {
  it('registers as GET "starter-kit/update" behind the agent token guard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, proto.downloadStarterKitUpdate)).toBe('starter-kit/update');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.downloadStarterKitUpdate)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(GUARDS_METADATA, proto.downloadStarterKitUpdate)).toEqual([AiAppTokenGuard]);
  });

  it('no :uid/version or :uid/update GET handler can capture the literal paths', () => {
    const getPaths = Object.getOwnPropertyNames(proto)
      .map((name) => (proto as any)[name])
      .filter((fn) => typeof fn === 'function' && Reflect.getMetadata(METHOD_METADATA, fn) === RequestMethod.GET)
      .map((fn) => Reflect.getMetadata(PATH_METADATA, fn) as string);
    expect(getPaths).toContain('starter-kit/version');
    expect(getPaths).toContain('starter-kit/update');
    expect(getPaths.filter((p) => /^:[^/]+\/(version|update)$/.test(p))).toEqual([]);
  });

  it('streams the update ZIP (no app/) and audits it for the token member', async () => {
    const aiAppsService = { logKitUpdateDownloaded: jest.fn().mockResolvedValue(undefined) };
    const res = fakeResponse();
    await buildController(aiAppsService).downloadStarterKitUpdate({ aiAppMemberUid: 'member-1' }, res);

    expect(aiAppsService.logKitUpdateDownloaded).toHaveBeenCalledWith('member-1');
    expect(res.headers['Content-Type']).toBe('application/zip');
    expect(res.headers['Content-Disposition']).toContain(`update-v${AI_APPS_STARTER_KIT_VERSION}.zip`);
    const paths = new AdmZip(res.body).getEntries().map((e) => e.entryName);
    expect(paths).toContain(KIT_MANIFEST_PATH);
    expect(paths).toContain('pln-app.config.json');
    expect(paths.some((p) => p.startsWith('app/'))).toBe(false);
  });
});

describe('AiAppsService.logKitUpdateDownloaded', () => {
  function buildService(create: jest.Mock) {
    return new AiAppsService(
      { aiAppEvent: { create } } as any,
      {} as any,
      { create: jest.fn() } as any,
      { trackEvent: jest.fn() } as any
    );
  }

  it('records KIT_DOWNLOADED marked as an agent update', async () => {
    const create = jest.fn().mockResolvedValue({});
    await buildService(create).logKitUpdateDownloaded('member-1');
    expect(create).toHaveBeenCalledWith({
      data: {
        type: 'KIT_DOWNLOADED',
        memberUid: 'member-1',
        message: `Starter kit v${AI_APPS_STARTER_KIT_VERSION} (agent update)`,
      },
    });
  });

  it('never fails the download when the event write fails', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db down'));
    await expect(buildService(create).logKitUpdateDownloaded('member-1')).resolves.toBeUndefined();
  });
});
