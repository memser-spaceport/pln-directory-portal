import { BadRequestException, NotFoundException } from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist) and the feedback paths
// under test never call it.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import { AiAppsService } from '../ai-apps/ai-apps.service';
import { aiAppFeedbackTools, feedbackScreenshotUrls } from './mcp-ai-app-feedback-tools';
import { mcpToolOperation } from './mcp-analytics';
import { McpActorContext, McpToolDef, toolsForPermissions } from './mcp-tools';

const APP = { uid: 'app-1', memberUid: 'owner-1', appId: 'demo', name: 'Demo', access: 'OPEN', status: 'READY' };
const HTML = '<p>Broken chart</p><img src="https://pl-directory-images-prod.s3.us-west-1.amazonaws.com/x.png">';
const PIN = { uid: 'pin-1', feedbackUid: 'fb-2', n: 1, selector: '#chart', cropUrl: 'https://img/crop-1.png' };
const ROWS = [
  {
    uid: 'fb-2',
    appUid: 'app-1',
    memberUid: 'member-1',
    text: HTML,
    status: 'NEW',
    createdAt: new Date(2),
    pins: [PIN],
  },
  {
    uid: 'fb-1',
    appUid: 'app-1',
    memberUid: 'member-2',
    text: 'ok',
    status: 'VIEWED',
    createdAt: new Date(1),
    pins: [],
  },
];

function ctx(memberUid: string): McpActorContext {
  return {
    memberUid,
    name: 'Member',
    email: `${memberUid}@example.com`,
    permissions: new Set(),
    authorizationUid: 'auth-1',
    clientName: 'Claude',
  };
}

function buildTools(app: any = APP) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(app),
      findMany: jest.fn().mockResolvedValue([{ uid: 'app-1', appId: 'demo', name: 'Demo', status: 'READY' }]),
    },
    aiAppFeedback: {
      findMany: jest.fn().mockResolvedValue(ROWS),
      findUnique: jest.fn().mockResolvedValue(ROWS[0]),
      count: jest.fn().mockResolvedValue(5),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...ROWS[0], ...data })),
    },
    aiAppFeedbackComment: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    member: {
      findMany: jest.fn().mockResolvedValue([{ uid: 'member-1', name: 'Ada', image: null }]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const analytics = { trackEvent: jest.fn() };
  const service = new AiAppsService(prisma as any, {} as any, { create: jest.fn() } as any, analytics as any);
  const tools = new Map(aiAppFeedbackTools(service).map((tool) => [tool.name, tool]));
  const tool = (name: string) => tools.get(name) as McpToolDef;
  return { tool, tools, prisma };
}

describe('MCP AI App feedback tools', () => {
  it('registers the three tools for every signed-in member, with update counted as a write', () => {
    const { tools } = buildTools();
    expect([...tools.keys()]).toEqual(['list_my_ai_apps', 'list_ai_app_feedback', 'update_ai_app_feedback_status']);
    expect(toolsForPermissions(new Set(), [...tools.values()])).toHaveLength(3);
    expect(mcpToolOperation('update_ai_app_feedback_status')).toBe('write');
    expect(mcpToolOperation('list_ai_app_feedback')).toBe('read');
  });

  describe('list_my_ai_apps', () => {
    it('queries only apps the caller created', async () => {
      const { tool, prisma } = buildTools();
      const result = await tool('list_my_ai_apps').execute(ctx('owner-1'), {});

      expect(prisma.aiApp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { memberUid: 'owner-1', status: { not: 'DELETED' } } })
      );
      expect(result.apps).toHaveLength(1);
    });
  });

  describe('list_ai_app_feedback', () => {
    it('returns the owner one page with full text, screenshot URLs and pins', async () => {
      const { tool, prisma } = buildTools();
      const result = await tool('list_ai_app_feedback').execute(ctx('owner-1'), { appUid: 'app-1', limit: 2 });

      const items = result.items as Array<Record<string, unknown>>;
      expect(items.map((item) => item.uid)).toEqual(['fb-2', 'fb-1']);
      expect(items[0].text).toBe(HTML);
      expect(items[0].pins).toEqual([PIN]);
      expect(items[0].screenshotUrls).toEqual([
        'https://pl-directory-images-prod.s3.us-west-1.amazonaws.com/x.png',
        'https://img/crop-1.png',
      ]);
      expect(result).toMatchObject({ total: 5, limit: 2, offset: 0, nextOffset: 2 });
      expect(prisma.aiAppFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { appUid: 'app-1' }, skip: 0, take: 2 })
      );
    });

    it('applies the status and date range filters to the page and the total', async () => {
      const { tool, prisma } = buildTools();
      await tool('list_ai_app_feedback').execute(ctx('owner-1'), {
        appUid: 'app-1',
        status: 'NEW',
        from: '2026-10-01',
        to: '2026-10-07T23:59:59Z',
        offset: 20,
      });

      const where = {
        appUid: 'app-1',
        status: 'NEW',
        createdAt: { gte: new Date('2026-10-01'), lte: new Date('2026-10-07T23:59:59Z') },
      };
      expect(prisma.aiAppFeedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, skip: 20, take: 20 })
      );
      expect(prisma.aiAppFeedback.count).toHaveBeenCalledWith({ where });
    });

    it('caps the page size at 50 and ends paging on the last page', async () => {
      const { tool, prisma } = buildTools();
      const result = await tool('list_ai_app_feedback').execute(ctx('owner-1'), {
        appUid: 'app-1',
        limit: 500,
        offset: 3,
      });

      expect(prisma.aiAppFeedback.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
      expect(result.nextOffset).toBeNull();
    });

    it('rejects a bad date', async () => {
      const { tool } = buildTools();
      await expect(
        tool('list_ai_app_feedback').execute(ctx('owner-1'), { appUid: 'app-1', from: 'yesterday' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a member who did not create the app and reads no feedback', async () => {
      const { tool, prisma } = buildTools();
      await expect(
        tool('list_ai_app_feedback').execute(ctx('someone-else'), { appUid: 'app-1' })
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.aiAppFeedback.findMany).not.toHaveBeenCalled();
      expect(prisma.aiAppFeedback.count).not.toHaveBeenCalled();
    });

    it('gives a deleted app the same error as a missing one', async () => {
      const { tool } = buildTools({ ...APP, status: 'DELETED' });
      await expect(tool('list_ai_app_feedback').execute(ctx('owner-1'), { appUid: 'app-1' })).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('update_ai_app_feedback_status', () => {
    it('lets the owner mark an item VIEWED', async () => {
      const { tool, prisma } = buildTools();
      const result = await tool('update_ai_app_feedback_status').execute(ctx('owner-1'), {
        appUid: 'app-1',
        feedbackUid: 'fb-2',
        status: 'VIEWED',
      });

      expect(prisma.aiAppFeedback.update).toHaveBeenCalledWith({ where: { uid: 'fb-2' }, data: { status: 'VIEWED' } });
      expect(result).toEqual({ uid: 'fb-2', appUid: 'app-1', status: 'VIEWED', hasNote: false });
      expect(prisma.aiAppFeedbackComment.create).not.toHaveBeenCalled();
    });

    it('stores a closing note with IMPLEMENTED', async () => {
      const { tool, prisma } = buildTools();
      prisma.aiAppFeedback.findUnique.mockResolvedValue({ ...ROWS[0], kind: 'FEEDBACK', _count: { pins: 1 } });
      await tool('update_ai_app_feedback_status').execute(ctx('owner-1'), {
        appUid: 'app-1',
        feedbackUid: 'fb-2',
        status: 'IMPLEMENTED',
        note: 'Fixed the chart axis',
      });

      expect(prisma.aiAppFeedback.update).toHaveBeenCalledWith({
        where: { uid: 'fb-2' },
        data: { status: 'IMPLEMENTED' },
      });
      expect(prisma.aiAppFeedbackComment.create).toHaveBeenCalledWith({
        data: { feedbackUid: 'fb-2', memberUid: 'owner-1', text: 'Fixed the chart axis', kind: 'CLOSING_NOTE' },
      });
    });

    it('refuses a note with VIEWED and NEW as a status', async () => {
      const { tool, prisma } = buildTools();
      await expect(
        tool('update_ai_app_feedback_status').execute(ctx('owner-1'), {
          appUid: 'app-1',
          feedbackUid: 'fb-2',
          status: 'VIEWED',
          note: 'done',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        tool('update_ai_app_feedback_status').execute(ctx('owner-1'), {
          appUid: 'app-1',
          feedbackUid: 'fb-2',
          status: 'NEW',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.aiAppFeedback.update).not.toHaveBeenCalled();
    });

    it('rejects a member who did not create the app and changes nothing', async () => {
      const { tool, prisma } = buildTools();
      await expect(
        tool('update_ai_app_feedback_status').execute(ctx('someone-else'), {
          appUid: 'app-1',
          feedbackUid: 'fb-2',
          status: 'IMPLEMENTED',
        })
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.aiAppFeedback.update).not.toHaveBeenCalled();
      expect(prisma.aiAppFeedbackComment.create).not.toHaveBeenCalled();
    });
  });

  it('feedbackScreenshotUrls skips data URIs and duplicates', () => {
    expect(
      feedbackScreenshotUrls({
        text: '<img src="data:image/png;base64,AAA"><img src="https://a/1.png"><img src=\'https://a/1.png\'>',
        pins: [{ cropUrl: null }, { cropUrl: 'https://a/2.png' }],
      })
    ).toEqual(['https://a/1.png', 'https://a/2.png']);
  });
});
