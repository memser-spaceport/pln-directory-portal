import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AskStatus } from '@prisma/client';
import { z } from 'zod';
import { ADMIN_PERMISSIONS, IRL_GATHERINGS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { ArticleCommentsService } from '../articles/article-comments.service';
import { ArticleRequestsService } from '../article-requests/article-requests.service';
import { AskService } from '../asks/asks.service';
import { ContactSupportService } from '../contact-support/contact-support.service';
import { DealRequestsService } from '../deal-requests/deal-requests.service';
import { DealsService } from '../deals/deals.service';
import { DemoDayEngagementService } from '../demo-days/demo-day-engagement.service';
import { DemoDaysService } from '../demo-days/demo-days.service';
import { EventsService } from '../events/events.service';
import { JobOpeningsApplicationService } from '../job-openings/job-openings-application.service';
import { JobOpeningsInterestService } from '../job-openings/job-openings-interest.service';
import { JobOpeningsReferralService } from '../job-openings/job-openings-referral.service';
import { JobMatchService } from '../job-match/job-match.service';
import { OfficeHoursService } from '../office-hours/office-hours.service';
import { PLEventGuestsService } from '../pl-events/pl-event-guests.service';
import { PrismaService } from '../shared/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { SpvSpotlightsService } from '../spv-spotlights/spv-spotlights.service';
import { TeamHiringService } from '../team-hiring/team-hiring.service';
import { TeamNewsUpvotesService } from '../team-news/team-news-upvotes.service';
import { TeamPitchEngagementService } from '../team-pitches/team-pitch-engagement.service';
import { TeamPitchesService } from '../team-pitches/team-pitches.service';
import { McpActorContext, McpToolDef } from './mcp-tools';
import { assertOwnEmail } from './mcp-profile-coverage-tools';
import { refuseUnknown, requiredUid } from './mcp-write-tools';

function canGo(ctx: McpActorContext) {
  if (
    !ctx.permissions.has(IRL_GATHERINGS_PERMISSIONS.GOING_WRITE) &&
    !ctx.permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL)
  ) {
    throw new ForbiddenException("Your LabOS account can't mark itself as going to events.");
  }
}

function emailOf(ctx: McpActorContext): string {
  return assertOwnEmail(ctx);
}

/** Events, jobs, asks, guides, office hours, demo day, deals, and other member actions. */
export function actionCoverageTools(deps: {
  events: EventsService;
  guests: PLEventGuestsService;
  prisma: PrismaService;
  applications: JobOpeningsApplicationService;
  interests: JobOpeningsInterestService;
  referrals: JobOpeningsReferralService;
  jobMatch: JobMatchService;
  hiring: TeamHiringService;
  asks: AskService;
  projects: ProjectsService;
  upvotes: TeamNewsUpvotesService;
  comments: ArticleCommentsService;
  articleRequests: ArticleRequestsService;
  officeHours: OfficeHoursService;
  demoDays: DemoDaysService;
  demoDayEngagement: DemoDayEngagementService;
  pitches: TeamPitchesService;
  pitchEngagement: TeamPitchEngagementService;
  deals: DealsService;
  dealRequests: DealRequestsService;
  spotlights: SpvSpotlightsService;
  support: ContactSupportService;
  notifications: PushNotificationsService;
}): McpToolDef[] {
  const d = deps;
  return [
    {
      name: 'submit_event',
      description: 'Submit a new event for review, the same as the event submit form.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        event_name: z.string(),
        description: z.string().optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        website: z.string().optional(),
        timezone: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, [
          'event_name',
          'description',
          'start_date',
          'end_date',
          'website',
          'timezone',
          'city',
          'country',
        ]);
        const event_name = requiredUid(args, 'event_name');
        const event = {
          event_name,
          description: args.description,
          start_date: args.start_date,
          end_date: args.end_date,
          website: args.website,
          timezone: args.timezone,
          address_info: { city: args.city, country: args.country },
        };
        const result = await d.events.submitPLEvent(event, emailOf(ctx));
        return { submitted: true, event: result ?? { event_name } };
      },
    },
    {
      name: 'update_my_event_rsvp',
      description:
        'Update your own guest row for an event you are already going to: topics, reason, telegram, team, or extra info. ' +
        'It does not add or remove the RSVP.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        eventUid: z.string(),
        topics: z.array(z.string()).optional(),
        reason: z.string().optional(),
        telegramId: z.string().optional(),
        teamUid: z.string().optional(),
        additionalInfo: z.string().nullable().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['eventUid', 'topics', 'reason', 'telegramId', 'teamUid', 'additionalInfo']);
        canGo(ctx);
        const eventUid = requiredUid(args, 'eventUid');
        const guest = await d.prisma.pLEventGuest.findFirst({
          where: { memberUid: ctx.memberUid, eventUid },
          select: { uid: true },
        });
        if (!guest) throw new BadRequestException('You are not going to that event. Use rsvp_event first.');
        const data: Record<string, unknown> = {};
        if ('topics' in args) data.topics = args.topics;
        if ('reason' in args) data.reason = args.reason === '' ? null : args.reason;
        if ('telegramId' in args) data.telegramId = args.telegramId === '' ? null : args.telegramId;
        if ('teamUid' in args) data.teamUid = args.teamUid;
        if ('additionalInfo' in args) data.additionalInfo = args.additionalInfo;
        if (Object.keys(data).length === 0) throw new BadRequestException('Nothing to update');
        await d.prisma.pLEventGuest.update({ where: { uid: guest.uid }, data });
        return { eventUid, updated: Object.keys(data) };
      },
    },
    {
      name: 'request_event_presence',
      description: 'Ask LabOS admins to add you to a gathering, the same as the presence request on the event page.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        locationName: z.string(),
        teamUid: z.string().optional(),
        events: z.array(z.string()).optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['locationName', 'teamUid', 'events']);
        canGo(ctx);
        const locationName = requiredUid(args, 'locationName');
        await d.guests.sendEventGuestPresenceRequest(emailOf(ctx), {
          locationName,
          memberName: ctx.name,
          teamUid: args.teamUid,
          events: args.events ?? [],
        });
        return { requested: true, locationName };
      },
    },
    {
      name: 'list_my_job_applications',
      description: 'List job applications you have sent.',
      visibility: 'always',
      execute: async (ctx) => ({ applications: await d.applications.listMine(emailOf(ctx)) }),
    },
    {
      name: 'list_my_job_interests',
      description: 'List jobs and teams you have marked interest in.',
      visibility: 'always',
      execute: async (ctx) => ({ interests: await d.interests.listMine(emailOf(ctx)) }),
    },
    {
      name: 'apply_to_job',
      description: 'Apply to a job opening as yourself. A cover letter is required.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { jobUid: z.string(), coverLetter: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['jobUid', 'coverLetter']);
        const jobUid = requiredUid(args, 'jobUid');
        const coverLetter = requiredUid(args, 'coverLetter');
        const result = await d.applications.apply(jobUid, emailOf(ctx), { coverLetter });
        return { jobUid, application: result };
      },
    },
    {
      name: 'mark_job_interest',
      description: 'Mark that you are interested in a job. Calling it again updates the note.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { jobUid: z.string(), note: z.string().optional() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['jobUid', 'note']);
        return d.interests.markInterest(requiredUid(args, 'jobUid'), emailOf(ctx), {
          note: typeof args.note === 'string' ? args.note : undefined,
        });
      },
    },
    {
      name: 'remove_job_interest',
      description: 'Remove your interest in a job.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { jobUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['jobUid']);
        return d.interests.removeInterest(requiredUid(args, 'jobUid'), emailOf(ctx));
      },
    },
    {
      name: 'mark_team_hiring_interest',
      description: 'Mark interest in a team that is hiring, with no single job attached.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { teamUid: z.string(), message: z.string().optional() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['teamUid', 'message']);
        return d.interests.markTeamInterest(requiredUid(args, 'teamUid'), emailOf(ctx), {
          message: typeof args.message === 'string' ? args.message : undefined,
        });
      },
    },
    {
      name: 'refer_job',
      description:
        'Refer a member, or a person outside the network, for a job. Provide referredMemberUid or referredPerson, not both. ' +
        'The note is sent to the hiring team.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        jobUid: z.string(),
        note: z.string(),
        referredMemberUid: z.string().optional(),
        referredName: z.string().optional(),
        referredEmail: z.string().optional(),
        referredLinkedin: z.string().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, [
          'jobUid',
          'note',
          'referredMemberUid',
          'referredName',
          'referredEmail',
          'referredLinkedin',
        ]);
        const jobUid = requiredUid(args, 'jobUid');
        const note = requiredUid(args, 'note');
        const referredPerson =
          typeof args.referredName === 'string'
            ? {
                name: args.referredName,
                email: String(args.referredEmail ?? ''),
                linkedinUrl: String(args.referredLinkedin ?? ''),
              }
            : undefined;
        return d.referrals.referJob(jobUid, emailOf(ctx), {
          note,
          referredMemberUid: typeof args.referredMemberUid === 'string' ? args.referredMemberUid : undefined,
          referredPerson,
          recipients: [],
          includeReferredMember: true,
        });
      },
    },
    {
      name: 'set_job_match_criteria',
      description: 'As a hiring lead, set which match criteria are disabled and an optional prompt for a role.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        roleUid: z.string(),
        disabled: z.array(z.string()),
        prompt: z.string().nullable().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['roleUid', 'disabled', 'prompt']);
        if (!Array.isArray(args.disabled)) throw new BadRequestException('disabled must be a list of criterion texts');
        return d.jobMatch.updateCriteria(
          requiredUid(args, 'roleUid'),
          { disabled: args.disabled.map(String), prompt: args.prompt as string | null | undefined },
          emailOf(ctx)
        );
      },
    },
    {
      name: 'contact_suggested_candidate',
      description: 'As a hiring lead, send the intro email to a suggested candidate for a role.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { roleUid: z.string(), memberUid: z.string(), message: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['roleUid', 'memberUid', 'message']);
        return d.jobMatch.contactCandidate(
          requiredUid(args, 'roleUid'),
          requiredUid(args, 'memberUid'),
          requiredUid(args, 'message'),
          emailOf(ctx)
        );
      },
    },
    {
      name: 'mark_applicant_reviewed',
      description: 'As a hiring lead, mark an application or interest reviewed or not reviewed.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        kind: z.enum(['applications', 'interests']),
        uid: z.string(),
        reviewed: z.boolean(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['kind', 'uid', 'reviewed']);
        if (args.kind !== 'applications' && args.kind !== 'interests') {
          throw new BadRequestException('kind must be applications or interests');
        }
        if (typeof args.reviewed !== 'boolean') throw new BadRequestException('reviewed must be true or false');
        return d.hiring.setReviewed(args.kind, requiredUid(args, 'uid'), args.reviewed, emailOf(ctx));
      },
    },
    {
      name: 'mark_applicant_seen',
      description: 'As a hiring lead, mark an application or interest as seen by you.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { kind: z.enum(['applications', 'interests']), uid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['kind', 'uid']);
        if (args.kind !== 'applications' && args.kind !== 'interests') {
          throw new BadRequestException('kind must be applications or interests');
        }
        return d.hiring.markSeen(args.kind, requiredUid(args, 'uid'), emailOf(ctx));
      },
    },
    {
      name: 'create_team_ask',
      description: 'Post an ask for a team you belong to.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        teamUid: z.string(),
        title: z.string(),
        description: z.string(),
        tags: z.array(z.string()).optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['teamUid', 'title', 'description', 'tags']);
        const created = await d.asks.createForTeam(requiredUid(args, 'teamUid'), emailOf(ctx), {
          title: requiredUid(args, 'title'),
          description: requiredUid(args, 'description'),
          tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
        });
        return { askUid: created.uid, teamUid: args.teamUid };
      },
    },
    {
      name: 'update_ask',
      description: 'Edit an open ask you can edit on the team page.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        askUid: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['askUid', 'title', 'description', 'tags']);
        const askUid = requiredUid(args, 'askUid');
        const updated = await d.asks.update(askUid, emailOf(ctx), {
          title: typeof args.title === 'string' ? args.title : undefined,
          description: typeof args.description === 'string' ? args.description : undefined,
          tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
        });
        return { askUid: updated.uid };
      },
    },
    {
      name: 'close_ask',
      description: 'Close an open ask you can edit.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { askUid: z.string(), closedReason: z.string().optional(), closedComment: z.string().optional() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['askUid', 'closedReason', 'closedComment']);
        const askUid = requiredUid(args, 'askUid');
        await d.asks.update(askUid, emailOf(ctx), {
          status: AskStatus.CLOSED,
          closedReason: typeof args.closedReason === 'string' ? args.closedReason : undefined,
          closedComment: typeof args.closedComment === 'string' ? args.closedComment : undefined,
          closedByUid: ctx.memberUid,
        });
        return { askUid, closed: true };
      },
    },
    {
      name: 'delete_ask',
      description: 'Delete an ask you can edit.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { askUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['askUid']);
        const askUid = requiredUid(args, 'askUid');
        await d.asks.delete(askUid, emailOf(ctx));
        return { askUid, deleted: true };
      },
    },
    {
      name: 'update_project_ask',
      description: 'Add or edit the ask on a project you can edit.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        projectUid: z.string(),
        title: z.string(),
        description: z.string(),
        askUid: z.string().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['projectUid', 'title', 'description', 'askUid']);
        await d.projects.addEditProjectAsk(requiredUid(args, 'projectUid'), emailOf(ctx), {
          uid: args.askUid,
          title: requiredUid(args, 'title'),
          description: requiredUid(args, 'description'),
        });
        return { projectUid: args.projectUid };
      },
    },
    {
      name: 'upvote_team_news',
      description: 'Upvote a team news story.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { newsUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['newsUid']);
        return d.upvotes.upvote(ctx.memberUid, requiredUid(args, 'newsUid'));
      },
    },
    {
      name: 'remove_team_news_upvote',
      description: 'Remove your upvote from a team news story.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { newsUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['newsUid']);
        return d.upvotes.removeUpvote(ctx.memberUid, requiredUid(args, 'newsUid'));
      },
    },
    {
      name: 'create_guide_comment',
      description: 'Comment on a founder guide. Set parentUid to reply to a comment.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { guideUid: z.string(), content: z.string(), parentUid: z.string().optional() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['guideUid', 'content', 'parentUid']);
        const created = await d.comments.createComment(emailOf(ctx), requiredUid(args, 'guideUid'), {
          content: requiredUid(args, 'content'),
          parentUid: typeof args.parentUid === 'string' ? args.parentUid : undefined,
        });
        return { commentUid: created?.uid ?? null };
      },
    },
    {
      name: 'reply_guide_comment',
      description: 'Reply to a founder guide comment.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { guideUid: z.string(), parentUid: z.string(), content: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['guideUid', 'parentUid', 'content']);
        const created = await d.comments.createComment(emailOf(ctx), requiredUid(args, 'guideUid'), {
          content: requiredUid(args, 'content'),
          parentUid: requiredUid(args, 'parentUid'),
        });
        return { commentUid: created?.uid ?? null };
      },
    },
    {
      name: 'update_guide_comment',
      description: 'Edit your founder guide comment.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { commentUid: z.string(), content: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['commentUid', 'content']);
        await d.comments.updateComment(emailOf(ctx), requiredUid(args, 'commentUid'), {
          content: requiredUid(args, 'content'),
        });
        return { commentUid: args.commentUid };
      },
    },
    {
      name: 'delete_guide_comment',
      description: 'Delete your founder guide comment.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { commentUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['commentUid']);
        const commentUid = requiredUid(args, 'commentUid');
        await d.comments.deleteComment(emailOf(ctx), commentUid);
        return { commentUid, deleted: true };
      },
    },
    {
      name: 'like_guide_comment',
      description: 'Like a founder guide comment.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { commentUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['commentUid']);
        return d.comments.likeComment(emailOf(ctx), requiredUid(args, 'commentUid'));
      },
    },
    {
      name: 'unlike_guide_comment',
      description: 'Remove your like from a founder guide comment.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { commentUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['commentUid']);
        return d.comments.unlikeComment(emailOf(ctx), requiredUid(args, 'commentUid'));
      },
    },
    {
      name: 'request_guide',
      description: 'Ask for a founder guide, or for a change to one.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { title: z.string(), description: z.string().optional(), guideUid: z.string().optional() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['title', 'description', 'guideUid']);
        const created = await d.articleRequests.create(emailOf(ctx), undefined, {
          title: requiredUid(args, 'title'),
          description: typeof args.description === 'string' ? args.description : undefined,
          articleUid: typeof args.guideUid === 'string' ? args.guideUid : undefined,
        });
        return { requestUid: created?.uid ?? null };
      },
    },
    {
      name: 'request_office_hours',
      description: 'Request office hours with another member. They get a follow-up, the same as the page.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { memberUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['memberUid']);
        const memberUid = requiredUid(args, 'memberUid');
        const created = await d.officeHours.createInteraction(
          {
            type: 'SCHEDULE_MEETING',
            hasFollowUp: true,
            targetMemberUid: memberUid,
          } as never,
          { uid: ctx.memberUid, email: ctx.email }
        );
        return { memberUid, interactionUid: created?.uid ?? null };
      },
    },
    {
      name: 'close_office_hours_followup',
      description: 'Close one of your office-hours follow-ups.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { followUpUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['followUpUid']);
        const followUpUid = requiredUid(args, 'followUpUid');
        const row = await d.prisma.memberFollowUp.findFirst({
          where: {
            uid: followUpUid,
            OR: [
              { createdBy: ctx.memberUid },
              { interaction: { sourceMemberUid: ctx.memberUid } },
              { interaction: { targetMemberUid: ctx.memberUid } },
            ],
          },
          select: { uid: true },
        });
        if (!row) throw new ForbiddenException('That follow-up is not yours');
        await d.officeHours.closeMemberInteractionFollowUpByID(followUpUid);
        return { followUpUid, closed: true };
      },
    },
    {
      name: 'report_broken_office_hours',
      description: 'Report that another member office-hours link is broken.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { memberUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['memberUid']);
        await d.officeHours.reportBrokenOHAttempt(requiredUid(args, 'memberUid'), {
          uid: ctx.memberUid,
          email: ctx.email,
        });
        return { reported: true };
      },
    },
    {
      name: 'accept_demo_day_confidentiality',
      description: 'Accept or decline a Demo Day confidentiality policy.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { demoDay: z.string(), accepted: z.boolean() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['demoDay', 'accepted']);
        if (typeof args.accepted !== 'boolean') throw new BadRequestException('accepted must be true or false');
        return d.demoDays.updateConfidentialityAcceptance(emailOf(ctx), args.accepted, requiredUid(args, 'demoDay'));
      },
    },
    {
      name: 'apply_to_demo_day',
      description: 'Apply to attend a Demo Day as an investor, using your LabOS name and email.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        demoDay: z.string(),
        teamUid: z.string().optional(),
        role: z.string().optional(),
        isAccreditedInvestor: z.boolean().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['demoDay', 'teamUid', 'role', 'isAccreditedInvestor']);
        await d.demoDays.submitInvestorApplication(
          {
            email: emailOf(ctx),
            name: ctx.name,
            teamUid: typeof args.teamUid === 'string' ? args.teamUid : undefined,
            role: typeof args.role === 'string' ? args.role : undefined,
            isAccreditedInvestor: args.isAccreditedInvestor === true,
          } as never,
          requiredUid(args, 'demoDay')
        );
        return { demoDay: args.demoDay, applied: true };
      },
    },
    {
      name: 'express_demo_day_interest',
      description: 'Tell a Demo Day team you like, want to connect, invest, refer, or leave feedback.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        demoDay: z.string(),
        teamFundraisingProfileUid: z.string(),
        interestType: z.enum(['like', 'connect', 'invest', 'referral', 'feedback']),
        message: z.string().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['demoDay', 'teamFundraisingProfileUid', 'interestType', 'message']);
        const interestType = args.interestType;
        if (!['like', 'connect', 'invest', 'referral', 'feedback'].includes(String(interestType))) {
          throw new BadRequestException('interestType must be like, connect, invest, referral, or feedback');
        }
        await d.demoDayEngagement.expressInterest(
          emailOf(ctx),
          requiredUid(args, 'demoDay'),
          requiredUid(args, 'teamFundraisingProfileUid'),
          interestType as 'like',
          false,
          interestType === 'referral' ? { message: typeof args.message === 'string' ? args.message : null } : null,
          interestType === 'feedback' ? { feedback: typeof args.message === 'string' ? args.message : null } : null
        );
        return { demoDay: args.demoDay, interestType };
      },
    },
    {
      name: 'accept_pitch_confidentiality',
      description: 'Accept or decline a team pitch confidentiality policy.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { pitch: z.string(), accepted: z.boolean() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['pitch', 'accepted']);
        if (typeof args.accepted !== 'boolean') throw new BadRequestException('accepted must be true or false');
        return d.pitches.updateConfidentiality(emailOf(ctx), requiredUid(args, 'pitch'), args.accepted);
      },
    },
    {
      name: 'express_pitch_interest',
      description: 'Tell a team pitch you want to connect, invest, refer, or leave feedback.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        pitch: z.string(),
        interestType: z.enum(['connect', 'invest', 'referral', 'feedback']),
        message: z.string().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['pitch', 'interestType', 'message']);
        const interestType = args.interestType;
        if (!['connect', 'invest', 'referral', 'feedback'].includes(String(interestType))) {
          throw new BadRequestException('interestType must be connect, invest, referral, or feedback');
        }
        await d.pitchEngagement.expressInterest(
          emailOf(ctx),
          requiredUid(args, 'pitch'),
          interestType as 'connect',
          false,
          undefined,
          interestType === 'referral' ? { message: typeof args.message === 'string' ? args.message : null } : null,
          interestType === 'feedback' ? { feedback: typeof args.message === 'string' ? args.message : null } : null
        );
        return { pitch: args.pitch, interestType };
      },
    },
    {
      name: 'submit_deal',
      description: 'Suggest a new deal. This does not redeem a deal code.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        shortDescription: z.string(),
        fullDescription: z.string(),
        redemptionInstructions: z.string(),
        vendorName: z.string().optional(),
        category: z.string().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, [
          'shortDescription',
          'fullDescription',
          'redemptionInstructions',
          'vendorName',
          'category',
        ]);
        const created = await d.deals.submitDeal(emailOf(ctx), {
          shortDescription: requiredUid(args, 'shortDescription'),
          fullDescription: requiredUid(args, 'fullDescription'),
          redemptionInstructions: requiredUid(args, 'redemptionInstructions'),
          vendorName: typeof args.vendorName === 'string' ? args.vendorName : undefined,
          category: typeof args.category === 'string' ? args.category : undefined,
        });
        return { submissionUid: (created as { uid?: string })?.uid ?? null };
      },
    },
    {
      name: 'request_deal',
      description: 'Request a deal, or access to an existing deal.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        whatDealAreYouLookingFor: z.string(),
        dealUid: z.string().optional(),
        description: z.string().optional(),
        howToReachOutToYou: z.string().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['whatDealAreYouLookingFor', 'dealUid', 'description', 'howToReachOutToYou']);
        const created = await d.dealRequests.create(
          emailOf(ctx),
          typeof args.dealUid === 'string' ? args.dealUid : undefined,
          {
            whatDealAreYouLookingFor: requiredUid(args, 'whatDealAreYouLookingFor'),
            description: typeof args.description === 'string' ? args.description : undefined,
            howToReachOutToYou: typeof args.howToReachOutToYou === 'string' ? args.howToReachOutToYou : undefined,
            dealUid: typeof args.dealUid === 'string' ? args.dealUid : undefined,
          } as never
        );
        return { requestUid: (created as { uid?: string })?.uid ?? null };
      },
    },
    {
      name: 'request_spv_access',
      description: 'Request access to an SPV spotlight. You must confirm you are an accredited investor.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        slug: z.string(),
        role: z.string(),
        organization: z.string(),
        isAccreditedInvestor: z.literal(true),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['slug', 'role', 'organization', 'isAccreditedInvestor']);
        if (args.isAccreditedInvestor !== true) {
          throw new BadRequestException('isAccreditedInvestor must be true');
        }
        await d.spotlights.requestAccess(
          requiredUid(args, 'slug'),
          {
            email: emailOf(ctx),
            name: ctx.name,
            role: requiredUid(args, 'role'),
            organization: requiredUid(args, 'organization'),
            isAccreditedInvestor: true,
          },
          ctx.email
        );
        return { slug: args.slug, requested: true };
      },
    },
    {
      name: 'contact_support',
      description: 'Send a support message to LabOS.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { topic: z.string(), message: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['topic', 'message']);
        const created = await d.support.createSupportRequest({
          topic: requiredUid(args, 'topic'),
          message: requiredUid(args, 'message'),
          email: emailOf(ctx),
          name: ctx.name,
        } as never);
        return { requestUid: (created as { uid?: string })?.uid ?? null };
      },
    },
    {
      name: 'delete_notification',
      description: 'Dismiss one of your in-app notifications.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { notificationUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['notificationUid']);
        const notificationUid = requiredUid(args, 'notificationUid');
        await d.notifications.delete(notificationUid, ctx.memberUid);
        return { notificationUid, deleted: true };
      },
    },
  ];
}
