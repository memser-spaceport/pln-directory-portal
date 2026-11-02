import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { ArticlesService } from '../articles/articles.service';
import { DealsService } from '../deals/deals.service';
import { DemoDaysService } from '../demo-days/demo-days.service';
import { MemberFollowUpsService } from '../member-follow-ups/member-follow-ups.service';
import { OfficeHoursService } from '../office-hours/office-hours.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { InteractionFailureReasons } from '../utils/constants';
import { McpActorContext, McpToolDef } from './mcp-tools';
import { refuseUnknown, requiredUid } from './mcp-write-tools';

const TEXT_MAX = 2000;
const LIST_MAX = 50;

function viewerEmail(ctx: McpActorContext): string {
  if (!ctx.email) throw new UnauthorizedException('Your LabOS account has no email');
  return ctx.email;
}

function limitArg(value: unknown, fallback = 20): number {
  const n = typeof value === 'number' ? Math.trunc(value) : fallback;
  return Math.min(Math.max(n, 1), LIST_MAX);
}

/** Optional trimmed text with a cap; the routes behind several of these tools validate nothing at runtime. */
function optionalText(field: string, value: unknown, max = TEXT_MAX): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be text`);
  if (value.length > max) throw new BadRequestException(`${field} is too long (max ${max})`);
  return value.trim() || null;
}

function pick<T extends Record<string, unknown>>(row: T, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => key in row).map((key) => [key, row[key]]));
}

/**
 * `list_my_notifications` (read), `mark_notification_read` and `mark_all_notifications_read` in the `profile` scope
 * (LAB-3063): the notifications bell, through `PushNotificationsService` like `/v1/push-notifications`. Only the
 * member's own read state changes.
 */
export function notificationTools(notifications: PushNotificationsService): McpToolDef[] {
  return [
    {
      name: 'list_my_notifications',
      description: 'List your LabOS notifications (the bell), newest first, with whether each is read.',
      visibility: 'always',
      inputSchema: {
        unreadOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(LIST_MAX).optional(),
      },
      execute: async (ctx, args = {}) => {
        const result = (await notifications.getForUser(ctx.memberUid, {
          limit: limitArg(args.limit),
          unreadOnly: args.unreadOnly === true,
        })) as unknown as { notifications?: Array<Record<string, unknown>>; total?: number; unreadCount?: number };
        return {
          notifications: (result.notifications ?? []).map((n) =>
            pick(n, ['uid', 'category', 'title', 'description', 'link', 'isRead', 'createdAt'])
          ),
          total: result.total ?? 0,
          unreadCount: result.unreadCount ?? 0,
        };
      },
    },
    {
      name: 'mark_notification_read',
      description: 'Mark one of your LabOS notifications as read. Get the uid from list_my_notifications.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { notificationUid: z.string().describe('Notification uid from list_my_notifications') },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['notificationUid']);
        const uid = requiredUid(args, 'notificationUid');
        const notification = await notifications.markAsRead(uid, ctx.memberUid);
        if (!notification) throw new NotFoundException(`Notification not found: ${uid}`);
        return { read: true, notificationUid: uid };
      },
    },
    {
      name: 'mark_all_notifications_read',
      description: 'Mark all your LabOS notifications as read.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {},
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, []);
        await notifications.markAllAsRead(ctx.memberUid);
        return { read: true };
      },
    },
  ];
}

/**
 * `list_deals` (read), `mark_deal_used`, `unmark_deal_used` and `report_deal_issue` in the `profile` scope (LAB-3063),
 * through `DealsService` like `/v1/deals`: it applies the deals access gate (whitelist or deals.read) itself. Redeem is
 * not a tool. An issue report is stored for LabOS admins; nobody is emailed.
 */
export function dealTools(deals: DealsService): McpToolDef[] {
  const dealUidOnly = (args: Record<string, unknown>) => {
    refuseUnknown(args, ['dealUid']);
    return requiredUid(args, 'dealUid');
  };
  return [
    {
      name: 'list_deals',
      description: 'List the LabOS member deals you can see (vendor, category, short description, whether you use it).',
      visibility: 'always',
      inputSchema: {
        search: z.string().optional(),
        category: z.string().optional(),
        limit: z.number().int().min(1).max(LIST_MAX).optional(),
      },
      execute: async (ctx, args = {}) => {
        const rows = (await deals.listForUser(viewerEmail(ctx), {
          search: optionalText('search', args.search, 200) ?? undefined,
          category: optionalText('category', args.category, 200) ?? undefined,
          limit: limitArg(args.limit),
        })) as Array<Record<string, unknown>>;
        return {
          deals: (rows ?? []).map((deal) =>
            pick(deal, ['uid', 'vendorName', 'category', 'audience', 'shortDescription', 'isUsing', 'isRedeemed'])
          ),
        };
      },
    },
    {
      name: 'mark_deal_used',
      description: 'Mark a LabOS deal as one you use (the deal card\'s "I use this").',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { dealUid: z.string().describe('Deal uid from list_deals') },
      execute: async (ctx, args = {}) => {
        const uid = dealUidOnly(args);
        await deals.markUsing(viewerEmail(ctx), uid);
        return { using: true, dealUid: uid };
      },
    },
    {
      name: 'unmark_deal_used',
      description: 'Stop marking a LabOS deal as one you use.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { dealUid: z.string().describe('Deal uid from list_deals') },
      execute: async (ctx, args = {}) => {
        const uid = dealUidOnly(args);
        await deals.unmarkUsing(viewerEmail(ctx), uid);
        return { using: false, dealUid: uid };
      },
    },
    {
      name: 'report_deal_issue',
      description: `Report a problem with a LabOS deal to LabOS admins (up to ${TEXT_MAX} characters).`,
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        dealUid: z.string().describe('Deal uid from list_deals'),
        description: z.string().describe('What went wrong'),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['dealUid', 'description']);
        const uid = requiredUid(args, 'dealUid');
        const description = optionalText('description', args.description);
        if (!description) throw new BadRequestException('description is required');
        const issue = (await deals.reportIssue(viewerEmail(ctx), uid, { description })) as { uid?: string };
        return { reported: true, dealUid: uid, issueUid: issue?.uid ?? null };
      },
    },
  ];
}

/**
 * `like_guide` and `unlike_guide` in the `profile` scope (LAB-3063): the Founder Guides like, through
 * `ArticlesService` like `/v1/articles/:uid/like`, with the route's permission (founder_guides.view or admin) and the
 * service's own per-article check. Guide comments are not a tool: they notify and email other people.
 */
export function guideLikeTools(articles: ArticlesService): McpToolDef[] {
  const resolve = async (ctx: McpActorContext, args: Record<string, unknown>) => {
    refuseUnknown(args, ['guide']);
    if (
      !ctx.permissions.has(RBAC_PERMISSION_CODES.FOUNDER_GUIDES_VIEW) &&
      !ctx.permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL)
    ) {
      throw new ForbiddenException("Your LabOS account can't open Founder Guides.");
    }
    const ref = requiredUid(args, 'guide');
    const email = viewerEmail(ctx);
    const guide = (await articles.getByUidOrSlug(ref, email)) as { uid?: string; title?: string } | null;
    if (!guide?.uid) throw new NotFoundException(`Guide not found: ${ref}`);
    return { email, guide: { uid: guide.uid, title: guide.title ?? null } };
  };
  const inputSchema = { guide: z.string().describe('Guide uid or slug, as in its LabOS link') };
  return [
    {
      name: 'like_guide',
      description: 'Like a LabOS Founder Guide.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema,
      execute: async (ctx, args = {}) => {
        const { email, guide } = await resolve(ctx, args);
        await articles.likeArticle(email, guide.uid);
        return { liked: true, guide };
      },
    },
    {
      name: 'unlike_guide',
      description: 'Remove your like from a LabOS Founder Guide.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema,
      execute: async (ctx, args = {}) => {
        const { email, guide } = await resolve(ctx, args);
        await articles.unlikeArticle(email, guide.uid);
        return { liked: false, guide };
      },
    },
  ];
}

const DEMO_DAY_ISSUES = ['TECHNICAL_ISSUES', 'ACCESS_ISSUES', 'NETWORKING_ISSUES'] as const;

/**
 * `submit_demo_day_feedback` in the `profile` scope (LAB-3063): the Demo Day page's feedback dialog, through
 * `DemoDaysService.createFeedback`. It goes to the Demo Day organisers' data only.
 */
export function demoDayFeedbackTools(demoDays: DemoDaysService): McpToolDef[] {
  return [
    {
      name: 'submit_demo_day_feedback',
      description:
        'Send feedback about a LabOS Demo Day to its organisers: a rating from 1 to 10, optional comments, and ' +
        `any issues (${DEMO_DAY_ISSUES.join(', ')}).`,
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        demoDay: z.string().describe('Demo Day slug or uid, as in its LabOS link'),
        rating: z.number().int().min(1).max(10),
        qualityComments: z.string().optional().describe('What was good'),
        improvementComments: z.string().optional().describe('What to improve'),
        comment: z.string().optional(),
        issues: z.array(z.enum(DEMO_DAY_ISSUES)).optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['demoDay', 'rating', 'qualityComments', 'improvementComments', 'comment', 'issues']);
        const demoDay = requiredUid(args, 'demoDay');
        const rating = args.rating;
        if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 10) {
          throw new BadRequestException('rating must be a whole number from 1 to 10');
        }
        const issues = args.issues ?? [];
        if (!Array.isArray(issues) || issues.some((i) => !(DEMO_DAY_ISSUES as readonly unknown[]).includes(i))) {
          throw new BadRequestException(`issues must be a list of ${DEMO_DAY_ISSUES.join(', ')}`);
        }
        const feedback = (await demoDays.createFeedback(
          viewerEmail(ctx),
          {
            rating,
            qualityComments: optionalText('qualityComments', args.qualityComments),
            improvementComments: optionalText('improvementComments', args.improvementComments),
            comment: optionalText('comment', args.comment),
            issues: issues as string[],
          },
          demoDay
        )) as { uid?: string };
        return { submitted: true, feedbackUid: feedback?.uid ?? null };
      },
    },
  ];
}

/** Reason labels the office-hours feedback forms offer; the service turns them into codes. */
const OH_REASONS = Object.keys(InteractionFailureReasons);
const OH_RESCHEDULED = 'Got rescheduled';

/**
 * `list_my_office_hours_followups` (read) and `submit_office_hours_feedback` in the `profile` scope (LAB-3063): the
 * "How did your office hours go?" prompts, through the same follow-up lookup as the route (own, PENDING or CLOSED) and
 * `OfficeHoursService.createInteractionFeedback`. The feedback is stored; nobody is emailed. Broken-link reports, which
 * email the other member, are not a tool.
 */
export function officeHoursFeedbackTools(
  followUps: MemberFollowUpsService,
  officeHours: OfficeHoursService
): McpToolDef[] {
  return [
    {
      name: 'list_my_office_hours_followups',
      description:
        'List your open office-hours follow-ups (LabOS asking how a meeting you booked went), with the other member.',
      visibility: 'always',
      execute: async (ctx) => {
        const rows = (await followUps.getFollowUps({
          where: {
            AND: [{ createdBy: ctx.memberUid, status: { in: ['PENDING'] } }, followUps.buildDelayedFollowUpQuery()],
          },
          orderBy: { createdAt: 'desc' },
          take: LIST_MAX,
        } as Parameters<MemberFollowUpsService['getFollowUps']>[0])) as Array<Record<string, any>>;
        return {
          followUps: (rows ?? []).map((row) => ({
            uid: row.uid,
            type: row.type,
            status: row.status,
            createdAt: row.createdAt,
            withMember: row.interaction?.targetMember?.name ?? null,
          })),
        };
      },
    },
    {
      name: 'submit_office_hours_feedback',
      description:
        'Answer an office-hours follow-up. If the meeting happened, send happened: true and a rating from 1 to 5 ' +
        '(plus any of "Call quality issues", "Meeting link didn\'t work"). If not, send happened: false and reasons ' +
        `from: ${OH_REASONS.join('; ')}. "${OH_RESCHEDULED}" needs rescheduledAt. otherReasons takes your own words.`,
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        followUpUid: z.string().describe('Follow-up uid from list_my_office_hours_followups'),
        happened: z.boolean(),
        rating: z.number().int().min(1).max(5).optional(),
        reasons: z.array(z.string()).optional(),
        otherReasons: z.array(z.string()).optional(),
        rescheduledAt: z.string().optional().describe('ISO date-time of the new meeting'),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['followUpUid', 'happened', 'rating', 'reasons', 'otherReasons', 'rescheduledAt']);
        const followUpUid = requiredUid(args, 'followUpUid');
        if (typeof args.happened !== 'boolean') throw new BadRequestException('happened must be true or false');
        const reasons = Array.isArray(args.reasons) ? args.reasons.map(String) : [];
        const unknownReasons = reasons.filter((r) => !OH_REASONS.includes(r));
        if (unknownReasons.length) {
          throw new BadRequestException(`Unknown reasons: ${unknownReasons.join(', ')}. Use: ${OH_REASONS.join('; ')}`);
        }
        const otherReasons = (Array.isArray(args.otherReasons) ? args.otherReasons : [])
          .map((r, i) => optionalText(`otherReasons[${i}]`, r, 500))
          .filter((r): r is string => !!r);
        if (otherReasons.length > 5) throw new BadRequestException('otherReasons takes at most 5 items');

        let rating = 0;
        if (args.happened) {
          if (typeof args.rating !== 'number' || !Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
            throw new BadRequestException('A meeting that happened needs a rating from 1 to 5');
          }
          rating = args.rating;
        } else if (reasons.length + otherReasons.length === 0) {
          throw new BadRequestException("Say why the meeting didn't happen (reasons or otherReasons)");
        }
        const data: Record<string, unknown> = {};
        if (reasons.includes(OH_RESCHEDULED)) {
          const at = typeof args.rescheduledAt === 'string' ? new Date(args.rescheduledAt) : null;
          if (!at || Number.isNaN(at.getTime())) {
            throw new BadRequestException(`"${OH_RESCHEDULED}" needs rescheduledAt (an ISO date-time)`);
          }
          data.scheduledAt = at.toISOString();
        }

        // The route's lookup: the member's own follow-up, still PENDING or CLOSED.
        const found = (await followUps.getFollowUps({
          where: { uid: followUpUid, createdBy: ctx.memberUid, status: { in: ['PENDING', 'CLOSED'] } },
        } as Parameters<MemberFollowUpsService['getFollowUps']>[0])) as Array<Record<string, any>>;
        const followUp = found?.[0];
        if (!followUp)
          throw new NotFoundException(`There is no follow-up associated with the given ID: ${followUpUid}`);

        const feedback = (await officeHours.createInteractionFeedback(
          {
            type: `${followUp.type}_FEED_BACK`,
            data,
            rating,
            comments: [...reasons, ...otherReasons],
            response: args.happened ? 'POSITIVE' : 'NEGATIVE',
            followUpUid,
          },
          { uid: ctx.memberUid },
          followUp
        )) as { uid?: string };
        return { submitted: true, feedbackUid: feedback?.uid ?? null };
      },
    },
  ];
}
