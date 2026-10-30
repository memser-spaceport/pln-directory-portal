jest.mock('../push-notifications/push-notifications.service', () => ({ PushNotificationsService: jest.fn() }));
jest.mock('../deals/deals.service', () => ({ DealsService: jest.fn() }));
jest.mock('../articles/articles.service', () => ({ ArticlesService: jest.fn() }));
jest.mock('../demo-days/demo-days.service', () => ({ DemoDaysService: jest.fn() }));
jest.mock('../member-follow-ups/member-follow-ups.service', () => ({ MemberFollowUpsService: jest.fn() }));
jest.mock('../office-hours/office-hours.service', () => ({ OfficeHoursService: jest.fn() }));
jest.mock('../team-news/team-news.service', () => ({ TeamNewsService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../members/members.service', () => ({ MembersService: jest.fn() }));
jest.mock('../members/members.hooks.service', () => ({ MembersHooksService: jest.fn() }));
jest.mock('../pl-events/pl-event-guests.service', () => ({ PLEventGuestsService: jest.fn() }));
jest.mock('../pl-events/pl-event-locations.service', () => ({ PLEventLocationsService: jest.fn() }));
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
jest.mock('../projects/projects.service', () => ({ ProjectsService: jest.fn() }));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { McpActorContext, McpToolDef, toolInputSchema } from './mcp-tools';
import {
  dealTools,
  demoDayFeedbackTools,
  guideLikeTools,
  notificationTools,
  officeHoursFeedbackTools,
} from './mcp-self-service-tools';

const CTX: McpActorContext = {
  memberUid: 'member-1',
  name: 'Ada',
  email: 'ada@example.com',
  permissions: new Set(),
  authorizationUid: 'auth-1',
  clientName: 'Codex',
  agentAccess: 'write',
};

const byName = (tools: McpToolDef[]) => (name: string) => tools.find((t) => t.name === name) as McpToolDef;
const sdkArgs = (t: McpToolDef, args: Record<string, unknown>) => (toolInputSchema(t) as z.ZodTypeAny).parse(args);

describe('notification tools', () => {
  const build = (marked: unknown = { uid: 'n1' }) => {
    const service = {
      getForUser: jest.fn().mockResolvedValue({
        notifications: [{ uid: 'n1', title: 'Hi', isRead: false, recipientUid: 'member-1', metadata: { secret: 1 } }],
        total: 1,
        unreadCount: 1,
      }),
      markAsRead: jest.fn().mockResolvedValue(marked),
      markAllAsRead: jest.fn().mockResolvedValue({ success: true }),
    };
    return { service, tool: byName(notificationTools(service as any)) };
  };

  it('lists the caller’s notifications with only the display fields', async () => {
    const { service, tool } = build();
    const result: any = await tool('list_my_notifications').execute(CTX, { unreadOnly: true, limit: 500 });
    expect(service.getForUser).toHaveBeenCalledWith('member-1', { limit: 50, unreadOnly: true });
    expect(result.notifications).toEqual([{ uid: 'n1', title: 'Hi', isRead: false }]);
  });

  it('marks one as read for the caller, and reports a missing one', async () => {
    const { service, tool } = build();
    await tool('mark_notification_read').execute(CTX, { notificationUid: 'n1' });
    expect(service.markAsRead).toHaveBeenCalledWith('n1', 'member-1');
    const missing = build(null);
    await expect(missing.tool('mark_notification_read').execute(CTX, { notificationUid: 'x' })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('marks all as read for the caller only', async () => {
    const { service, tool } = build();
    await tool('mark_all_notifications_read').execute(CTX, {});
    expect(service.markAllAsRead).toHaveBeenCalledWith('member-1');
    const t = tool('mark_all_notifications_read');
    await expect(t.execute(CTX, sdkArgs(t, { memberUid: 'other' }))).rejects.toThrow('memberUid');
  });
});

describe('deal tools', () => {
  const build = () => {
    const service = {
      listForUser: jest
        .fn()
        .mockResolvedValue([
          { uid: 'd1', vendorName: 'Acme', category: 'Infra', redemptionInstructions: 'code X', isUsing: false },
        ]),
      markUsing: jest.fn().mockResolvedValue({}),
      unmarkUsing: jest.fn().mockResolvedValue({ success: true }),
      reportIssue: jest.fn().mockResolvedValue({ uid: 'i1', member: { email: 'ada@example.com' } }),
    };
    return { service, tool: byName(dealTools(service as any)) };
  };

  it('lists deals through the access-gated service, without redemption instructions', async () => {
    const { service, tool } = build();
    const result: any = await tool('list_deals').execute(CTX, { search: ' gpu ' });
    expect(service.listForUser).toHaveBeenCalledWith('ada@example.com', {
      search: 'gpu',
      category: undefined,
      limit: 20,
    });
    expect(result.deals).toEqual([{ uid: 'd1', vendorName: 'Acme', category: 'Infra', isUsing: false }]);
  });

  it('marks, unmarks and reports with the caller’s email', async () => {
    const { service, tool } = build();
    await tool('mark_deal_used').execute(CTX, { dealUid: 'd1' });
    await tool('unmark_deal_used').execute(CTX, { dealUid: 'd1' });
    const report: any = await tool('report_deal_issue').execute(CTX, { dealUid: 'd1', description: ' Code expired ' });
    expect(service.markUsing).toHaveBeenCalledWith('ada@example.com', 'd1');
    expect(service.unmarkUsing).toHaveBeenCalledWith('ada@example.com', 'd1');
    expect(service.reportIssue).toHaveBeenCalledWith('ada@example.com', 'd1', { description: 'Code expired' });
    expect(report).toEqual({ reported: true, dealUid: 'd1', issueUid: 'i1' });
  });

  it.each([
    [{ dealUid: 'd1', description: '   ' }],
    [{ dealUid: 'd1', description: 'x'.repeat(2001) }],
    [{ dealUid: 'd1' }],
  ])('refuses an issue without a usable description %#', async (args) => {
    const { service, tool } = build();
    await expect(tool('report_deal_issue').execute(CTX, args)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.reportIssue).not.toHaveBeenCalled();
  });
});

describe('guide like tools', () => {
  const build = () => {
    const service = {
      getByUidOrSlug: jest.fn().mockResolvedValue({ uid: 'a1', title: 'Fundraising 101' }),
      likeArticle: jest.fn().mockResolvedValue({}),
      unlikeArticle: jest.fn().mockResolvedValue({}),
    };
    return { service, tool: byName(guideLikeTools(service as any)) };
  };
  const viewer = { ...CTX, permissions: new Set(['founder_guides.view']) };

  it('resolves a slug and likes and unlikes as the caller', async () => {
    const { service, tool } = build();
    await tool('like_guide').execute(viewer, { guide: 'fundraising-101' });
    await tool('unlike_guide').execute(viewer, { guide: 'fundraising-101' });
    expect(service.getByUidOrSlug).toHaveBeenCalledWith('fundraising-101', 'ada@example.com');
    expect(service.likeArticle).toHaveBeenCalledWith('ada@example.com', 'a1');
    expect(service.unlikeArticle).toHaveBeenCalledWith('ada@example.com', 'a1');
  });

  it('needs the Founder Guides permission, like the route', async () => {
    const { service, tool } = build();
    await expect(tool('like_guide').execute(CTX, { guide: 'a1' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.likeArticle).not.toHaveBeenCalled();
    await tool('like_guide').execute({ ...CTX, permissions: new Set(['directory.admin.full']) }, { guide: 'a1' });
    expect(service.likeArticle).toHaveBeenCalled();
  });
});

describe('Demo Day feedback tool', () => {
  const build = () => {
    const service = { createFeedback: jest.fn().mockResolvedValue({ uid: 'f1' }) };
    return { service, tool: byName(demoDayFeedbackTools(service as any)) };
  };

  it('submits the rating, comments and issues as the caller', async () => {
    const { service, tool } = build();
    await tool('submit_demo_day_feedback').execute(CTX, {
      demoDay: 'plw262',
      rating: 9,
      qualityComments: ' Great pitches ',
      issues: ['ACCESS_ISSUES'],
    });
    expect(service.createFeedback).toHaveBeenCalledWith(
      'ada@example.com',
      {
        rating: 9,
        qualityComments: 'Great pitches',
        improvementComments: null,
        comment: null,
        issues: ['ACCESS_ISSUES'],
      },
      'plw262'
    );
  });

  it.each([
    [{ demoDay: 'plw262', rating: 11 }],
    [{ demoDay: 'plw262', rating: 4.5 }],
    [{ demoDay: 'plw262', rating: 5, issues: ['SOMETHING_ELSE'] }],
    [{ demoDay: 'plw262', rating: 5, comment: 'x'.repeat(2001) }],
  ])('refuses invalid feedback %#', async (args) => {
    const { service, tool } = build();
    await expect(tool('submit_demo_day_feedback').execute(CTX, args)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.createFeedback).not.toHaveBeenCalled();
  });
});

describe('office-hours feedback tools', () => {
  const FOLLOW_UP = { uid: 'fu1', type: 'MEETING_INITIATED', status: 'PENDING', interaction: { uid: 'i1' } };
  const build = (found: unknown[] = [FOLLOW_UP]) => {
    const followUps = {
      getFollowUps: jest.fn().mockResolvedValue(found),
      buildDelayedFollowUpQuery: jest.fn().mockReturnValue({ OR: [] }),
    };
    const officeHours = { createInteractionFeedback: jest.fn().mockResolvedValue({ uid: 'mf1' }) };
    return { followUps, officeHours, tool: byName(officeHoursFeedbackTools(followUps as any, officeHours as any)) };
  };

  it("looks the follow-up up as the route does: the caller's own, PENDING or CLOSED", async () => {
    const { followUps, officeHours, tool } = build();
    await tool('submit_office_hours_feedback').execute(CTX, { followUpUid: 'fu1', happened: true, rating: 4 });
    expect(followUps.getFollowUps).toHaveBeenCalledWith({
      where: { uid: 'fu1', createdBy: 'member-1', status: { in: ['PENDING', 'CLOSED'] } },
    });
    expect(officeHours.createInteractionFeedback).toHaveBeenCalledWith(
      {
        type: 'MEETING_INITIATED_FEED_BACK',
        data: {},
        rating: 4,
        comments: [],
        response: 'POSITIVE',
        followUpUid: 'fu1',
      },
      { uid: 'member-1' },
      FOLLOW_UP
    );
  });

  it('sends a reschedule with its new date, as the form does', async () => {
    const { officeHours, tool } = build();
    await tool('submit_office_hours_feedback').execute(CTX, {
      followUpUid: 'fu1',
      happened: false,
      reasons: ['Got rescheduled'],
      rescheduledAt: '2026-11-05T15:00:00Z',
    });
    expect(officeHours.createInteractionFeedback.mock.calls[0][0]).toMatchObject({
      response: 'NEGATIVE',
      rating: 0,
      comments: ['Got rescheduled'],
      data: { scheduledAt: '2026-11-05T15:00:00.000Z' },
    });
  });

  it.each([
    ['a meeting that happened without a rating', { followUpUid: 'fu1', happened: true }],
    ['no reason for a missed meeting', { followUpUid: 'fu1', happened: false }],
    ['an unknown reason', { followUpUid: 'fu1', happened: false, reasons: ['Aliens'] }],
    ['a reschedule without a date', { followUpUid: 'fu1', happened: false, reasons: ['Got rescheduled'] }],
  ])('refuses %s', async (_label, args) => {
    const { officeHours, tool } = build();
    await expect(tool('submit_office_hours_feedback').execute(CTX, args)).rejects.toBeInstanceOf(BadRequestException);
    expect(officeHours.createInteractionFeedback).not.toHaveBeenCalled();
  });

  it("refuses someone else's or a finished follow-up as not found", async () => {
    const { officeHours, tool } = build([]);
    await expect(
      tool('submit_office_hours_feedback').execute(CTX, { followUpUid: 'fu9', happened: true, rating: 5 })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(officeHours.createInteractionFeedback).not.toHaveBeenCalled();
  });

  it('lists only the caller’s pending follow-ups', async () => {
    const { followUps, tool } = build([{ ...FOLLOW_UP, interaction: { targetMember: { name: 'Bo' } } }]);
    const result: any = await tool('list_my_office_hours_followups').execute(CTX, {});
    expect(followUps.getFollowUps.mock.calls[0][0].where.AND[0]).toEqual({
      createdBy: 'member-1',
      status: { in: ['PENDING'] },
    });
    expect(result.followUps[0]).toMatchObject({ uid: 'fu1', withMember: 'Bo' });
  });
});
