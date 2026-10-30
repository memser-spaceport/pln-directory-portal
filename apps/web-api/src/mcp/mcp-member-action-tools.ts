import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { JobsListQueryParams } from 'libs/contracts/src/schema/job-opening';
import { FollowsService } from '../follows/follows.service';
import { JobAlertsService } from '../job-alerts/job-alerts.service';
import { JobOpeningsQueryService } from '../job-openings/job-openings-query.service';
import { JobOpeningsSavedService } from '../job-openings/job-openings-saved.service';
import { MemberExperiencesService } from '../member-experiences/member-experiences.service';
import { PrismaService } from '../shared/prisma.service';
import { McpActorContext, McpToolDef } from './mcp-tools';
import { refuseUnknown, requiredUid } from './mcp-write-tools';

const EXPERIENCE_TEXT_MAX = 200;
const ALERT_LIST_FIELDS = ['roleCategory', 'seniority', 'focus', 'location', 'workMode'] as const;
const ALERT_FIELDS = ['name', 'q', ...ALERT_LIST_FIELDS] as const;
type AlertListField = typeof ALERT_LIST_FIELDS[number];

function text(field: string, value: unknown, { required = false } = {}): string | null {
  if (value === undefined || value === null) {
    if (required) throw new BadRequestException(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be text`);
  if (value.length > EXPERIENCE_TEXT_MAX) throw new BadRequestException(`${field} is too long`);
  const trimmed = value.trim();
  if (!trimmed && required) throw new BadRequestException(`${field} can't be empty`);
  return trimmed || null;
}

function date(field: string, value: unknown): Date {
  const parsed = typeof value === 'string' ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} must be a date like 2024-03-01`);
  }
  return parsed;
}

function experienceRow(experience: {
  uid: string;
  title: string;
  company: string;
  location: string | null;
  startDate: Date;
  endDate: Date | null;
  isCurrent: boolean;
}) {
  return {
    uid: experience.uid,
    title: experience.title,
    company: experience.company,
    location: experience.location,
    startDate: experience.startDate,
    endDate: experience.endDate,
    isCurrent: experience.isCurrent,
  };
}

/** The member's own experiences, newest first, as the profile page lists them. */
export async function myExperiences(experiences: MemberExperiencesService, memberUid: string) {
  return ((await experiences.getAllMemberExperience(memberUid)) ?? []).map(experienceRow);
}

/**
 * `list_my_experiences` (read), `add_experience`, `update_experience` and `delete_experience` (write) in the `profile`
 * scope (LAB-3058): the member's own
 * work experience, through the profile page's service. The page's routes don't check whose experience a uid is, so
 * these tools do: an experience of another member is "not found".
 */
export function experienceTools(experiences: MemberExperiencesService, prisma: PrismaService): McpToolDef[] {
  const own = async (ctx: McpActorContext, uid: string) => {
    const experience = await prisma.memberExperience.findFirst({ where: { uid, memberUid: ctx.memberUid } });
    if (!experience) throw new NotFoundException(`Experience not found: ${uid}`);
    return experience;
  };
  const datesInOrder = (start: Date, end: Date | null) => {
    if (end && end.getTime() < start.getTime()) throw new BadRequestException('endDate must be after startDate');
  };

  return [
    {
      name: 'list_my_experiences',
      description: 'List the work experience entries on your LabOS profile, current roles first, with their uids.',
      visibility: 'always',
      execute: async (ctx) => ({ experiences: await myExperiences(experiences, ctx.memberUid) }),
    },
    {
      name: 'add_experience',
      description:
        'Add a work experience entry (a job) to your LabOS profile, as on your profile page. Leave endDate out for ' +
        'your current role. Your experiences and their uids are in list_my_experiences.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        title: z.string().describe('Job title'),
        company: z.string(),
        location: z.string().optional(),
        startDate: z.string().describe('ISO date, e.g. 2024-03-01'),
        endDate: z.string().optional().describe('ISO date; leave out for a current role'),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['title', 'company', 'location', 'startDate', 'endDate']);
        const startDate = date('startDate', args.startDate);
        const endDate = args.endDate === undefined ? null : date('endDate', args.endDate);
        datesInOrder(startDate, endDate);
        const created = await experiences.create({
          memberUid: ctx.memberUid,
          title: text('title', args.title, { required: true }) as string,
          company: text('company', args.company, { required: true }) as string,
          location: text('location', args.location),
          startDate,
          endDate,
          isCurrent: endDate === null,
        } as Parameters<MemberExperiencesService['create']>[0]);
        if (!created) throw new BadRequestException("The experience couldn't be saved");
        return { added: experienceRow(created), experiences: await myExperiences(experiences, ctx.memberUid) };
      },
    },
    {
      name: 'update_experience',
      description:
        'Change one of your work experience entries. Send only the fields to change. Set isCurrent true for a role ' +
        'you still hold (clears endDate), or send endDate to close it. Get the uid from list_my_experiences.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        experienceUid: z.string().describe('Experience uid from list_my_experiences'),
        title: z.string().optional(),
        company: z.string().optional(),
        location: z.string().optional().describe('Empty string clears it'),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        isCurrent: z.boolean().optional(),
      },
      execute: async (ctx, args = {}) => {
        const fields = ['title', 'company', 'location', 'startDate', 'endDate', 'isCurrent'];
        refuseUnknown(args, ['experienceUid', ...fields]);
        const uid = requiredUid(args, 'experienceUid');
        if (!fields.some((field) => field in args)) throw new BadRequestException('Nothing to update');
        if (args.isCurrent !== undefined && typeof args.isCurrent !== 'boolean') {
          throw new BadRequestException('isCurrent must be true or false');
        }
        if (args.isCurrent === true && args.endDate !== undefined) {
          throw new BadRequestException("A current role can't have an endDate");
        }
        const existing = await own(ctx, uid);

        const data: Record<string, unknown> = {};
        if ('title' in args) data.title = text('title', args.title, { required: true });
        if ('company' in args) data.company = text('company', args.company, { required: true });
        if ('location' in args) data.location = text('location', args.location);
        if ('startDate' in args) data.startDate = date('startDate', args.startDate);
        if ('endDate' in args) {
          data.endDate = date('endDate', args.endDate);
          data.isCurrent = false;
        }
        if (args.isCurrent === true) {
          data.isCurrent = true;
          data.endDate = null;
        }
        if (args.isCurrent === false && !('endDate' in args)) {
          // Same rule as the page's routes: a past role needs its end date.
          if (!existing.endDate) throw new BadRequestException('End date is required');
          data.isCurrent = false;
        }
        datesInOrder(
          (data.startDate as Date | undefined) ?? existing.startDate,
          'endDate' in data ? (data.endDate as Date | null) : existing.endDate
        );

        const updated = await experiences.update(
          uid,
          { memberUid: ctx.memberUid, ...data } as Parameters<MemberExperiencesService['update']>[1],
          ctx.email ?? ''
        );
        if (!updated) throw new BadRequestException("The experience couldn't be saved");
        return { updated: experienceRow(updated), experiences: await myExperiences(experiences, ctx.memberUid) };
      },
    },
    {
      name: 'delete_experience',
      description:
        'Remove one of your work experience entries from your profile. Get the uid from list_my_experiences.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { experienceUid: z.string().describe('Experience uid from list_my_experiences') },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['experienceUid']);
        const uid = requiredUid(args, 'experienceUid');
        const existing = await own(ctx, uid);
        await experiences.remove(uid);
        return { deleted: experienceRow(existing), experiences: await myExperiences(experiences, ctx.memberUid) };
      },
    },
  ];
}

/** `follow_team` and `unfollow_team` in the `profile` scope (LAB-3058). Teams are the only thing LabOS follows. */
export function followTools(follows: FollowsService): McpToolDef[] {
  const teamUidOnly = (args: Record<string, unknown>) => {
    refuseUnknown(args, ['teamUid']);
    return requiredUid(args, 'teamUid');
  };
  return [
    {
      name: 'follow_team',
      description:
        "Follow a LabOS team, as with the team page's Follow button: its news shows in your For You feed. Following " +
        'a team you already follow changes nothing. Get the team uid from search_teams.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { teamUid: z.string().describe('Team uid from search_teams') },
      execute: async (ctx, args = {}) => ({ ...(await follows.followTeam(ctx.memberUid, teamUidOnly(args))) }),
    },
    {
      name: 'unfollow_team',
      description: 'Stop following a LabOS team. Unfollowing a team you do not follow changes nothing.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { teamUid: z.string().describe('Team uid') },
      execute: async (ctx, args = {}) => ({ ...(await follows.unfollowTeam(ctx.memberUid, teamUidOnly(args))) }),
    },
  ];
}

function viewerEmail(ctx: McpActorContext): string {
  if (!ctx.email) throw new UnauthorizedException('Your LabOS account has no email, so it has no saved jobs');
  return ctx.email;
}

/** `save_job` and `unsave_job` in the `profile` scope (LAB-3058): the job board's private bookmarks. */
export function savedJobTools(saved: JobOpeningsSavedService): McpToolDef[] {
  const jobUidOnly = (args: Record<string, unknown>) => {
    refuseUnknown(args, ['jobUid']);
    return requiredUid(args, 'jobUid');
  };
  return [
    {
      name: 'save_job',
      description:
        'Save a role on the LabOS job board to your Saved tab. Only you see your saved jobs; nobody is told. Saving ' +
        'a job you already saved changes nothing. The job uid is the one in a LabOS job link.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { jobUid: z.string().describe('Job uid from a LabOS job board link') },
      execute: async (ctx, args = {}) => ({ ...(await saved.save(jobUidOnly(args), viewerEmail(ctx))) }),
    },
    {
      name: 'unsave_job',
      description: 'Remove a role from your saved jobs. Works for roles that have since closed.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { jobUid: z.string().describe('Job uid') },
      execute: async (ctx, args = {}) => ({ ...(await saved.unsave(jobUidOnly(args), viewerEmail(ctx))) }),
    },
  ];
}

/** Filter values the board offers right now, per field (focus: top-level areas and their children). */
async function alertFilterOptions(query: JobOpeningsQueryService, email: string) {
  const filters = await query.getFilters(JobsListQueryParams.parse({}), email);
  const values = (rows: Array<{ value: string }> | undefined) => (rows ?? []).map((row) => row.value);
  return {
    roleCategory: values(filters.roleCategory),
    seniority: values(filters.seniority),
    location: values(filters.location),
    workMode: values(filters.workMode),
    focus: (filters.focus ?? []).flatMap((area: { value: string; children?: Array<{ value: string }> }) => [
      area.value,
      ...values(area.children),
    ]),
  } as Record<AlertListField, string[]>;
}

/**
 * `get_my_job_alert` (read), `set_job_alert` and `delete_job_alert` (write) in the `profile` scope (LAB-3058). A member
 * has at most one job alert, so no uid is needed. Filter values are checked against what the board offers: the alert
 * service stores any string, and a misspelt one would make an alert that never matches.
 */
export function jobAlertTools(alerts: JobAlertsService, query: JobOpeningsQueryService): McpToolDef[] {
  const current = async (ctx: McpActorContext) => {
    const { items } = await alerts.list(ctx.memberUid);
    return items[0] ?? null;
  };

  return [
    {
      name: 'get_my_job_alert',
      description:
        'Read your LabOS job alert (the job board filters you get emailed new roles for), and the filter values ' +
        'set_job_alert accepts.',
      visibility: 'always',
      execute: async (ctx) => ({
        alert: await current(ctx),
        filterOptions: await alertFilterOptions(query, viewerEmail(ctx)),
      }),
    },
    {
      name: 'set_job_alert',
      description:
        'Create your LabOS job alert, or replace its filters if you have one. LabOS emails you new roles that match. ' +
        `Filters: q (keywords) and lists ${ALERT_LIST_FIELDS.join(', ')}, using values from get_my_job_alert ` +
        'filterOptions. At least one filter is needed. The filters you send replace the old ones.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        name: z.string().optional().describe('Alert name; default made from the filters'),
        q: z.string().optional().describe('Keywords'),
        ...Object.fromEntries(ALERT_LIST_FIELDS.map((field) => [field, z.array(z.string()).optional()])),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ALERT_FIELDS);
        const email = viewerEmail(ctx);
        const name = args.name === undefined ? undefined : text('name', args.name, { required: true }) ?? undefined;
        const q = args.q === undefined ? undefined : text('q', args.q) ?? undefined;

        const options = await alertFilterOptions(query, email);
        const filterState: Record<string, unknown> = { q };
        for (const field of ALERT_LIST_FIELDS) {
          const raw = args[field] ?? [];
          if (!Array.isArray(raw)) throw new BadRequestException(`${field} must be a list`);
          const picked: string[] = [];
          for (const value of raw) {
            const match = options[field].find((option) => option.toLowerCase() === String(value).trim().toLowerCase());
            if (!match) {
              throw new BadRequestException(
                `Unknown ${field}: ${String(value)}. Use one of: ${options[field].slice(0, 40).join(', ') || 'none'}`
              );
            }
            picked.push(match);
          }
          filterState[field] = picked;
        }
        if (!q && ALERT_LIST_FIELDS.every((field) => (filterState[field] as string[]).length === 0)) {
          throw new BadRequestException('Set at least one filter');
        }

        const existing = await current(ctx);
        const input = { ...(name ? { name } : {}), filterState } as Parameters<JobAlertsService['create']>[1];
        const alert = existing
          ? await alerts.update(ctx.memberUid, existing.uid, input)
          : await alerts.create(ctx.memberUid, input);
        return { created: !existing, alert };
      },
    },
    {
      name: 'delete_job_alert',
      description: 'Delete your LabOS job alert; the emails stop. Calling it when you have none changes nothing.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {},
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, []);
        const existing = await current(ctx);
        if (!existing) return { deleted: false };
        await alerts.delete(ctx.memberUid, existing.uid);
        return { deleted: true, alert: existing };
      },
    },
  ];
}
