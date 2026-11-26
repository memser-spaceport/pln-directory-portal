// C4 mention picker search (LAB-3318, contract 10.2). The real service and search code run against an in-memory fake
// Prisma. The fake applies the `where`, `select`, `orderBy` and `take` arguments as Prisma does, and it throws on an
// operator it does not know, so each visibility test checks the code, not the fake. Light mocks as labos-agent.spec.ts.
jest.mock('../guards/user-token-validation.guard', () => ({ UserTokenValidation: class UserTokenValidation {} }));
jest.mock('../husky/husky-ai.service', () => ({ HuskyAiService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../team-news/team-news-suggestions.service', () => ({ TeamNewsSuggestionsService: jest.fn() }));
jest.mock('../mcp/mcp-tool-catalog', () => ({ McpToolCatalog: jest.fn() }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: jest.fn() }));
jest.mock('../intro-requests/intro-requests.service', () => ({ IntroRequestsService: jest.fn() }));
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
// S6-C41: the notification, push and Telegram code. The search must never build or call them.
jest.mock('../utils/notification/notification.service', () => ({ NotificationService: jest.fn() }));
jest.mock('../push-notifications/push-notifications.service', () => ({ PushNotificationsService: jest.fn() }));
jest.mock('../intro-requests/intro-request-telegram', () => ({ IntroRequestTelegram: jest.fn() }));
jest.mock('ai', () => ({ tool: (def: unknown) => def }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { LabosAgentMentionsQuerySchema } from 'libs/contracts/src/schema/labos-agent';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { IntroRequestTelegram } from '../intro-requests/intro-request-telegram';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { APP_ENV } from '../utils/constants';
import { NotificationService } from '../utils/notification/notification.service';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { LabosAgentController } from './labos-agent.controller';
import { LabosAgentService } from './labos-agent.service';
import { MENTION_SEARCH_MAX_ROWS } from './labos-agent-mentions';

// ── A small in-memory Prisma ────────────────────────────────────────────────────────────────────────────────────

const OPERATORS = ['equals', 'not', 'in', 'notIn', 'contains', 'mode', 'gte', 'lte', 'some'];

const isPlain = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value);

function cmp(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b));
}

function same(a: unknown, b: unknown, insensitive: boolean): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (insensitive && typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/** One scalar filter. SQL rules: `not` and `notIn` do not match a NULL value. */
function matchField(value: any, filter: any): boolean {
  if (!isPlain(filter)) return same(value, filter, false);
  const keys = Object.keys(filter);
  if (!keys.every((key) => OPERATORS.includes(key)))
    return value !== null && value !== undefined && match(value, filter);
  const insensitive = filter.mode === 'insensitive';
  for (const key of keys) {
    const arg = filter[key];
    if (key === 'mode') continue;
    if (key === 'some') {
      if (!(value as any[]).some((item) => match(item, arg))) return false;
    } else if (key === 'equals') {
      if (!same(value, arg, insensitive)) return false;
    } else if (key === 'not') {
      if (arg === null) {
        if (value === null || value === undefined) return false;
      } else if (isPlain(arg)) {
        if (matchField(value, arg)) return false;
      } else if (value === null || value === undefined || same(value, arg, insensitive)) return false;
    } else if (key === 'in') {
      if (!arg.some((item: unknown) => same(value, item, insensitive))) return false;
    } else if (key === 'notIn') {
      if (value === null || arg.some((item: unknown) => same(value, item, insensitive))) return false;
    } else if (key === 'contains') {
      if (typeof value !== 'string') return false;
      const hay = insensitive ? value.toLowerCase() : value;
      if (!hay.includes(insensitive ? String(arg).toLowerCase() : arg)) return false;
    } else if (key === 'gte') {
      if (value === null || value === undefined || cmp(value, arg) < 0) return false;
    } else if (key === 'lte') {
      if (value === null || value === undefined || cmp(value, arg) > 0) return false;
    }
  }
  return true;
}

function match(row: any, where: any): boolean {
  if (!where) return true;
  for (const [key, filter] of Object.entries(where)) {
    if (key === 'AND') {
      if (!(filter as any[]).every((item) => match(row, item))) return false;
    } else if (key === 'OR') {
      if (!(filter as any[]).some((item) => match(row, item))) return false;
    } else if (key === 'NOT') {
      const items = Array.isArray(filter) ? filter : [filter];
      if (items.some((item) => match(row, item))) return false;
    } else {
      if (!(key in row)) throw new Error(`fake Prisma: unknown field ${key}`);
      if (!matchField(row[key], filter)) return false;
    }
  }
  return true;
}

function project(row: any, select: any): any {
  if (!select) return row;
  const out: Record<string, unknown> = {};
  for (const [key, arg] of Object.entries(select)) {
    if (!(key in row)) throw new Error(`fake Prisma: unknown select ${key}`);
    const value = row[key];
    if (arg === true) out[key] = value;
    else if (Array.isArray(value)) {
      const where = (arg as any).where;
      out[key] = value.filter((item) => match(item, where)).map((item) => project(item, (arg as any).select));
    } else out[key] = value === null ? null : project(value, (arg as any).select);
  }
  return out;
}

function findMany(rows: any[], args: any): any[] {
  let result = rows.filter((row) => match(row, args.where));
  const orders = args.orderBy ? (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) : [];
  result = [...result].sort((a, b) => {
    for (const order of orders) {
      const [key, dir] = Object.entries(order)[0] as [string, string];
      const diff = cmp(a[key], b[key]);
      if (diff) return dir === 'desc' ? -diff : diff;
    }
    return 0;
  });
  if (args.take !== undefined) result = result.slice(0, args.take);
  return result.map((row) => project(row, args.select));
}

// ── Fixtures (mock data only) ───────────────────────────────────────────────────────────────────────────────────

const PAST = new Date('2000-01-01T00:00:00.000Z');
const FUTURE = new Date('2999-01-01T00:00:00.000Z');
const SESSION = 'm-me';
const ALL = ['member.search.read', 'team.search.read'];

type TeamFx = { uid: string; name: string; status?: string; accessLevel?: string | null; shortDescription?: string };
const team = (uid: string, name: string, extra: Partial<TeamFx> = {}) => ({
  uid,
  name,
  status: 'ACTIVE',
  accessLevel: 'L1',
  shortDescription: null as string | null,
  logo: { url: `https://img.example.com/${uid}.png` },
  ...extra,
});

type RoleFx = { team: ReturnType<typeof team>; role?: string; mainTeam?: boolean; endDate?: Date | null };
const member = (
  uid: string,
  name: string,
  extra: { state?: string; deletedAt?: Date | null; roles?: RoleFx[]; image?: string | null } = {}
) => ({
  uid,
  name,
  email: `${uid}@example.com`,
  telegramHandler: `${uid}_tg`,
  twitterHandler: `${uid}_x`,
  bio: 'A private bio.',
  officeHours: 'https://calendly.example.com/x',
  deletedAt: extra.deletedAt ?? null,
  memberApproval: { state: extra.state ?? 'APPROVED' },
  image: extra.image === null ? null : { url: `https://img.example.com/${uid}.jpg` },
  teamMemberRoles: (extra.roles ?? []).map((role) => ({
    memberUid: uid,
    role: role.role ?? null,
    mainTeam: role.mainTeam ?? false,
    endDate: role.endDate ?? null,
    team: role.team,
  })),
});

const news = (
  uid: string,
  title: string,
  owner: ReturnType<typeof team>,
  eventDate: string,
  createdAt = eventDate
) => ({
  uid,
  title,
  summary: 'Summary.',
  eventDate: new Date(eventDate),
  createdAt: new Date(createdAt),
  team: owner,
});

function setup(
  data: { members?: any[]; teams?: any[]; news?: any[]; permissions?: string[] } = {},
  env: string = APP_ENV.DEV
) {
  process.env.ENVIRONMENT = env;
  const members = data.members ?? [];
  const teams = data.teams ?? [];
  const items = data.news ?? [];
  const self = member(SESSION, 'Me Myself');
  const allMembers = [self, ...members];
  const prisma = {
    member: {
      findUnique: jest.fn(async ({ where }: any) => {
        const row = allMembers.find((item) => item.email === where.email);
        return row ? { uid: row.uid, deletedAt: row.deletedAt } : null;
      }),
      findMany: jest.fn(async (args: any) => findMany(members.concat([self]), args)),
    },
    team: { findMany: jest.fn(async (args: any) => findMany(teams, args)) },
    teamMemberRole: {
      findMany: jest.fn(async (args: any) =>
        findMany(
          allMembers.flatMap((item) => item.teamMemberRoles),
          args
        )
      ),
    },
    teamNewsItem: { findMany: jest.fn(async (args: any) => findMany(items, args)) },
  };
  const husky = { createContextualToolsResponse: jest.fn() };
  const accessControl = {
    getMemberAccess: jest.fn().mockResolvedValue({ effectivePermissions: data.permissions ?? ALL }),
  };
  const service = new LabosAgentService(
    prisma as any,
    new LabosAgentAccessService({ hasPermission: jest.fn().mockResolvedValue({ allowed: false }) } as any),
    husky as any,
    { getTeamNewsItemDto: jest.fn() } as any,
    { forApp: jest.fn(() => []) } as any,
    accessControl as any,
    {} as any,
    { adminCaps: jest.fn() } as any,
    { findAgentTargetName: jest.fn(), findEligibleRequester: jest.fn() } as any,
    {} as any,
    {} as any,
    // LAB-3457: every thread id here is new (no saved thread).
    { find: jest.fn().mockResolvedValue(null) } as any
  );
  const controller = new LabosAgentController(service);
  const req = { userEmail: `${SESSION}@example.com` };
  const search = (query: Record<string, string> = {}) => controller.mentions(query, req);
  const searchError = (query: Record<string, unknown>) =>
    controller.mentions(query, req).then(
      () => null,
      (error) => error
    );
  return { prisma, husky, accessControl, search, searchError };
}

const uids = (rows: Array<{ uid: string }>) => rows.map((row) => row.uid);

describe('LabOS agent mention search C4 (LAB-3318)', () => {
  const originalEnv = process.env.ENVIRONMENT;
  afterEach(() => jest.clearAllMocks());
  afterAll(() => {
    process.env.ENVIRONMENT = originalEnv;
  });

  describe('route and checks', () => {
    it('S6-C1: GET mentions uses the UserTokenValidation guard and is never cached', () => {
      const handler = LabosAgentController.prototype.mentions;
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([UserTokenValidation]);
      expect(Reflect.getMetadata('ignoreCaching', handler)).toBe(true);
      expect(Reflect.getMetadata('path', handler)).toBe('mentions');
    });

    it('S6-C2: a member outside the gate gets 403 AGENT_NOT_ENABLED and no search runs', async () => {
      const h = setup({ teams: [team('t-1', 'Ada Team')] }, APP_ENV.PRODUCTION);
      const error = await h.searchError({ q: 'ada' });
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toEqual(expect.objectContaining({ statusCode: 403, code: 'AGENT_NOT_ENABLED' }));
      expect(h.prisma.member.findMany).not.toHaveBeenCalled();
      expect(h.prisma.team.findMany).not.toHaveBeenCalled();
      expect(h.prisma.teamNewsItem.findMany).not.toHaveBeenCalled();
      expect(h.prisma.teamMemberRole.findMany).not.toHaveBeenCalled();
      expect(h.accessControl.getMemberAccess).not.toHaveBeenCalled();
    });

    it('S6-C3: q of 65 characters gives 400 VALIDATION_ERROR, 64 passes', async () => {
      const h = setup();
      const error = await h.searchError({ q: 'x'.repeat(65) });
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          errors: [expect.objectContaining({ path: 'q' })],
        })
      );
      expect((await h.search({ q: 'x'.repeat(64) })).q).toBe('x'.repeat(64));
      // The limit is after trim.
      expect((await h.search({ q: `  ${'x'.repeat(64)}  ` })).q).toBe('x'.repeat(64));
    });

    it.each([['job'], ['member,job'], ['page'], ['']])('S6-C4: types=%s gives 400 VALIDATION_ERROR', async (types) => {
      const h = setup();
      const error = await h.searchError({ types });
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({ code: 'VALIDATION_ERROR', errors: [expect.objectContaining({ path: 'types' })] })
      );
    });

    it.each([['0'], ['11'], ['-1'], ['2.5'], ['abc']])('S6-C5: limit=%s gives 400', async (limit) => {
      const h = setup();
      const error = await h.searchError({ limit });
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({ code: 'VALIDATION_ERROR', errors: [expect.objectContaining({ path: 'limit' })] })
      );
    });

    it.each([['1'], ['10']])('S6-C5: limit=%s passes', async (limit) => {
      const h = setup();
      await expect(h.search({ limit })).resolves.toEqual(expect.objectContaining({ q: '' }));
    });

    it('S6-C5: the query schema gives the defaults: all types and limit 5', () => {
      expect(LabosAgentMentionsQuerySchema.parse({})).toEqual({ q: '', types: ['member', 'team', 'news'], limit: 5 });
      expect(LabosAgentMentionsQuerySchema.parse({ types: 'news, team,news', limit: '3' })).toEqual({
        q: '',
        types: ['news', 'team'],
        limit: 3,
      });
    });

    it('S6-C5: a repeated query key gives 400', async () => {
      const h = setup();
      expect(await h.searchError({ q: ['a', 'b'] })).toBeInstanceOf(BadRequestException);
    });
  });

  describe('response shape', () => {
    it('S6-C6: the response always has q, members, teams and news', async () => {
      const acme = team('t-ada', 'Ada Team');
      const h = setup({
        members: [member('m-ada', 'Ada')],
        teams: [acme],
        news: [news('n-1', 'Ada news', acme, '2026-11-01')],
      });
      const result = await h.search({ q: 'ada', types: 'news' });
      expect(Object.keys(result)).toEqual(['q', 'members', 'teams', 'news']);
      expect(result.members).toEqual([]);
      expect(result.teams).toEqual([]);
      expect(uids(result.news)).toEqual(['n-1']);
      expect(h.prisma.member.findMany).not.toHaveBeenCalled();
      expect(h.prisma.team.findMany).not.toHaveBeenCalled();
    });

    it('S6-C7: each array has at most limit items', async () => {
      const acme = team('t-acme', 'Acme');
      const eight = [1, 2, 3, 4, 5, 6, 7, 8];
      const h = setup({
        members: eight.map((n) => member(`m-${n}`, `Ada ${n}`)),
        teams: eight.map((n) => team(`t-${n}`, `Ada ${n}`)),
        news: eight.map((n) => news(`n-${n}`, `Ada ${n}`, acme, `2026-11-0${n}`)),
      });
      const result = await h.search({ q: 'ada', limit: '3' });
      expect(result.members).toHaveLength(3);
      expect(result.teams).toHaveLength(3);
      expect(result.news).toHaveLength(3);
    });

    it('S6-C7: the backend reads at most 200 rows for each type', async () => {
      const h = setup();
      await h.search({ q: 'ada' });
      for (const fn of [h.prisma.member.findMany, h.prisma.team.findMany, h.prisma.teamNewsItem.findMany]) {
        expect(fn.mock.calls[0][0].take).toBe(MENTION_SEARCH_MAX_ROWS);
      }
    });

    it('S6-C15: a member item has only type, uid, name, imageUrl, teamName and role', async () => {
      const acme = team('t-acme', 'Acme');
      const h = setup({ members: [member('m-ada', 'Ada', { roles: [{ team: acme, role: 'CEO', mainTeam: true }] })] });
      const { members } = await h.search({ q: 'ada' });
      expect(members).toEqual([
        {
          type: 'member',
          uid: 'm-ada',
          name: 'Ada',
          imageUrl: 'https://img.example.com/m-ada.jpg',
          teamName: 'Acme',
          role: 'CEO',
        },
      ]);
      const text = JSON.stringify(members);
      for (const secret of ['m-ada@example.com', 'm-ada_tg', 'm-ada_x', 'private bio', 'calendly']) {
        expect(text).not.toContain(secret);
      }
    });

    it('S6-C15: the member team is the main team, else the first current role on a listed team', async () => {
      const acme = team('t-acme', 'Acme');
      const beta = team('t-beta', 'Beta');
      const hidden = team('t-l0', 'Hidden', { accessLevel: 'L0' });
      const gone = team('t-gone', 'Gone', { status: 'INACTIVE' });
      const h = setup({
        members: [
          member('m-a', 'Ada A', {
            roles: [
              { team: acme, role: 'Engineer' },
              { team: beta, role: 'Founder', mainTeam: true },
            ],
          }),
          member('m-b', 'Ada B', {
            roles: [
              { team: hidden, role: 'Lead', mainTeam: true },
              { team: acme, role: 'Dev' },
            ],
          }),
          member('m-c', 'Ada C', {
            roles: [
              { team: gone, role: 'Lead', mainTeam: true },
              { team: beta, role: 'Old', endDate: PAST },
            ],
            image: null,
          }),
          member('m-d', 'Ada D', { roles: [{ team: acme, role: 'Advisor', endDate: FUTURE }] }),
        ],
      });
      const { members } = await h.search({ q: 'ada', limit: '10' });
      expect(members.map(({ uid, teamName, role, imageUrl }) => ({ uid, teamName, role, imageUrl }))).toEqual([
        { uid: 'm-a', teamName: 'Beta', role: 'Founder', imageUrl: 'https://img.example.com/m-a.jpg' },
        { uid: 'm-b', teamName: 'Acme', role: 'Dev', imageUrl: 'https://img.example.com/m-b.jpg' },
        { uid: 'm-c', teamName: null, role: null, imageUrl: null },
        { uid: 'm-d', teamName: 'Acme', role: 'Advisor', imageUrl: 'https://img.example.com/m-d.jpg' },
      ]);
    });

    it('S6-C15: a team item has uid, name, logoUrl and shortDescription cut to 140 characters', async () => {
      const h = setup({
        teams: [team('t-1', 'Ada Long', { shortDescription: 'y'.repeat(300) }), team('t-2', 'Ada Short')],
      });
      const { teams } = await h.search({ q: 'ada' });
      expect(teams).toEqual([
        {
          type: 'team',
          uid: 't-1',
          name: 'Ada Long',
          logoUrl: 'https://img.example.com/t-1.png',
          shortDescription: 'y'.repeat(140),
        },
        {
          type: 'team',
          uid: 't-2',
          name: 'Ada Short',
          logoUrl: 'https://img.example.com/t-2.png',
          shortDescription: null,
        },
      ]);
    });

    it('S6-C15: a news item has uid, title, teamUid, teamName and an ISO eventDate', async () => {
      const acme = team('t-acme', 'Acme');
      const h = setup({ news: [news('n-1', 'Ada raises', acme, '2026-11-12T00:00:00.000Z')] });
      const result = await h.search({ q: 'ada' });
      expect(result.news).toEqual([
        {
          type: 'news',
          uid: 'n-1',
          title: 'Ada raises',
          teamUid: 't-acme',
          teamName: 'Acme',
          eventDate: '2026-11-12T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('list rules', () => {
    it('S6-C8: members has only approved members with no deletedAt', async () => {
      const h = setup({
        members: [
          member('m-approved', 'Ada Approved'),
          member('m-pending', 'Ada Pending', { state: 'PENDING' }),
          member('m-rejected', 'Ada Rejected', { state: 'REJECTED' }),
          member('m-deleted', 'Ada Deleted', { deletedAt: PAST }),
        ],
      });
      expect(uids((await h.search({ q: 'ada', limit: '10' })).members)).toEqual(['m-approved']);
    });

    it('S6-C9: members never has the session member', async () => {
      const h = setup({ members: [member('m-other', 'Me Other')] });
      const { members } = await h.search({ q: 'me' });
      expect(uids(members)).toEqual(['m-other']);
    });

    it('S6-C10: teams has no INACTIVE team and no L0 team, also for a directory admin', async () => {
      const h = setup({
        teams: [
          team('t-ok', 'Ada Ok'),
          team('t-null', 'Ada Null', { accessLevel: null }),
          team('t-inactive', 'Ada Inactive', { status: 'INACTIVE' }),
          team('t-l0', 'Ada L0', { accessLevel: 'L0' }),
        ],
        permissions: [...ALL, 'directory.admin.full'],
      });
      expect(uids((await h.search({ q: 'ada', limit: '10' })).teams)).toEqual(['t-null', 't-ok']);
    });

    it('S6-C10: a member does not match on the name of an L0 or INACTIVE team', async () => {
      const hidden = team('t-l0', 'Secret Lab', { accessLevel: 'L0' });
      const gone = team('t-gone', 'Secret Gone', { status: 'INACTIVE' });
      const h = setup({
        members: [
          member('m-1', 'Bob', { roles: [{ team: hidden }] }),
          member('m-2', 'Carl', { roles: [{ team: gone }] }),
        ],
      });
      expect((await h.search({ q: 'secret' })).members).toEqual([]);
    });

    it('S6-C11: news has no item of a team in TEAM_NEWS_EXCLUDED_TEAM_NAMES', async () => {
      const ok = team('t-ok', 'Acme');
      const excluded = team('t-x', 'anthropic');
      const h = setup({
        news: [news('n-ok', 'Ada news', ok, '2026-11-01'), news('n-x', 'Ada news too', excluded, '2026-11-02')],
      });
      expect(uids((await h.search({ q: 'ada' })).news)).toEqual(['n-ok']);
      expect(uids((await h.search({})).news)).toEqual(['n-ok']);
    });

    it('S6-C12: members is empty for a member without member.search.read', async () => {
      const h = setup({
        members: [member('m-ada', 'Ada')],
        teams: [team('t-ada', 'Ada Team')],
        permissions: ['team.search.read'],
      });
      const result = await h.search({ q: 'ada' });
      expect(result.members).toEqual([]);
      expect(uids(result.teams)).toEqual(['t-ada']);
      expect(h.prisma.member.findMany).not.toHaveBeenCalled();
      expect(h.accessControl.getMemberAccess).toHaveBeenCalledWith(SESSION);
    });

    it('S6-C13: teams is empty for a member without team.search.read', async () => {
      const h = setup({
        members: [member('m-ada', 'Ada')],
        teams: [team('t-ada', 'Ada Team')],
        permissions: ['member.search.read'],
      });
      const result = await h.search({ q: 'ada' });
      expect(result.teams).toEqual([]);
      expect(uids(result.members)).toEqual(['m-ada']);
      expect(h.prisma.team.findMany).not.toHaveBeenCalled();
      // The default list also needs the permission.
      expect((await h.search({})).teams).toEqual([]);
      expect(h.prisma.teamMemberRole.findMany).not.toHaveBeenCalled();
    });

    it('S6-C14: news returns for a member with no search permission', async () => {
      const acme = team('t-acme', 'Acme');
      const h = setup({ news: [news('n-1', 'Ada news', acme, '2026-11-01')], permissions: [] });
      const result = await h.search({ q: 'ada' });
      expect(uids(result.news)).toEqual(['n-1']);
      expect(result.members).toEqual([]);
      expect(result.teams).toEqual([]);
    });
  });

  describe('rank', () => {
    it('S6-C16: members rank in the LAB-1277 tiers: exact, prefix, word prefix, contains, team name', async () => {
      const adaTeam = team('t-ada', 'Adalab');
      const h = setup({
        members: [
          member('m-team', 'Zed Zulu', { roles: [{ team: adaTeam }] }),
          member('m-contains', 'Nadal'),
          member('m-word', 'Grace Ada Hopper'),
          member('m-prefix', 'Adams'),
          member('m-exact', 'Ada'),
        ],
      });
      expect(uids((await h.search({ q: 'ada', limit: '10' })).members)).toEqual([
        'm-exact',
        'm-prefix',
        'm-word',
        'm-contains',
        'm-team',
      ]);
    });

    it('S6-C16: a member tie sorts name A to Z', async () => {
      const h = setup({ members: [member('m-2', 'Adam Zeta'), member('m-1', 'Adam Alpha')] });
      expect(uids((await h.search({ q: 'adam' })).members)).toEqual(['m-1', 'm-2']);
    });

    it('S6-C16: the query is escaped for the word-prefix rule', async () => {
      const h = setup({ members: [member('m-1', 'Ann (C++) Lee'), member('m-2', 'Annc Lee')] });
      const { members } = await h.search({ q: '(c++)' });
      expect(uids(members)).toEqual(['m-1']);
    });

    it('S6-C17: teams rank in the same tiers on name, and a tie sorts name A to Z', async () => {
      const h = setup({
        teams: [
          team('t-contains', 'Expandable'),
          team('t-prefix2', 'Panda Labs'),
          team('t-word2', 'Open Pandas'),
          team('t-word1', 'Big Panda'),
          team('t-prefix', 'Pandaverse'),
          team('t-exact', 'panda'),
        ],
      });
      expect(uids((await h.search({ q: 'Panda', limit: '10' })).teams)).toEqual([
        't-exact',
        't-prefix2',
        't-prefix',
        't-word1',
        't-word2',
        't-contains',
      ]);
    });

    it('S6-C17: teams have no team tier: a team matches only on its name', async () => {
      const h = setup({ teams: [team('t-1', 'Acme', { shortDescription: 'ada' })] });
      expect((await h.search({ q: 'ada' })).teams).toEqual([]);
    });

    it('S6-C18: news rank in the tiers on title; a team name match only is tier 20; a tie sorts eventDate new to old', async () => {
      const acme = team('t-acme', 'Acme');
      const adaTeam = team('t-ada', 'Ada Corp');
      const h = setup({
        news: [
          news('n-team', 'Funding round', adaTeam, '2026-11-20'),
          news('n-contains-old', 'Canada office', acme, '2026-10-01'),
          news('n-contains-new', 'Nevada office', acme, '2026-11-01'),
          news('n-word', 'Meet Ada here', acme, '2026-09-01'),
          news('n-prefix', 'Ada raises', acme, '2026-08-01'),
          news('n-exact', 'ADA', acme, '2026-07-01'),
        ],
      });
      expect(uids((await h.search({ q: 'ada', limit: '10' })).news)).toEqual([
        'n-exact',
        'n-prefix',
        'n-word',
        'n-contains-new',
        'n-contains-old',
        'n-team',
      ]);
    });

    it('S6-C18: a news tie with the same eventDate sorts createdAt new to old', async () => {
      const acme = team('t-acme', 'Acme');
      const h = setup({
        news: [
          news('n-old', 'Ada one', acme, '2026-11-01', '2026-11-01T01:00:00.000Z'),
          news('n-new', 'Ada two', acme, '2026-11-01', '2026-11-01T05:00:00.000Z'),
        ],
      });
      expect(uids((await h.search({ q: 'ada' })).news)).toEqual(['n-new', 'n-old']);
    });
  });

  describe('default list (empty q)', () => {
    it("S6-C20: empty q gives no members, the member's current teams (main first, then A to Z) and the newest news", async () => {
      const zeta = team('t-zeta', 'Zeta');
      const alpha = team('t-alpha', 'Alpha');
      const main = team('t-main', 'Main');
      const old = team('t-old', 'Old');
      const beta = team('t-beta', 'Beta');
      const hidden = team('t-l0', 'Hidden', { accessLevel: 'L0' });
      const gone = team('t-gone', 'Gone', { status: 'INACTIVE' });
      const other = team('t-other', 'Other');
      const h = setup({
        members: [member('m-1', 'Ada'), member('m-2', 'Bob', { roles: [{ team: other }] })],
        teams: [zeta, alpha, beta, main, old, hidden, gone, other],
        news: [
          news('n-1', 'First', zeta, '2026-11-01'),
          news('n-3', 'Third', zeta, '2026-11-03'),
          news('n-2', 'Second', zeta, '2026-11-02'),
        ],
      });
      // The session member's roles. Other members' roles never show.
      const roles: Array<{ team: ReturnType<typeof team>; mainTeam?: boolean; endDate?: Date }> = [
        { team: zeta },
        { team: alpha },
        { team: main, mainTeam: true },
        { team: old, endDate: PAST },
        { team: hidden },
        { team: gone },
        { team: beta, endDate: FUTURE },
      ];
      const sessionRows = roles.map((role) => ({
        memberUid: SESSION,
        role: null,
        mainTeam: role.mainTeam ?? false,
        endDate: role.endDate ?? null,
        team: role.team,
      }));
      h.prisma.teamMemberRole.findMany.mockImplementation(async (args: any) =>
        findMany(
          sessionRows.concat([{ memberUid: 'm-2', role: null, mainTeam: true, endDate: null, team: other }]),
          args
        )
      );
      const result = await h.search({ q: '   ', limit: '10' });
      expect(result.q).toBe('');
      expect(result.members).toEqual([]);
      expect(h.prisma.member.findMany).not.toHaveBeenCalled();
      expect(uids(result.teams)).toEqual(['t-main', 't-alpha', 't-beta', 't-zeta']);
      expect(uids(result.news)).toEqual(['n-3', 'n-2', 'n-1']);
    });
  });

  describe('side effects', () => {
    it('S6-C41: C4 builds and calls no notification, push or Telegram code', async () => {
      const acme = team('t-acme', 'Ada Team');
      const h = setup({
        members: [member('m-ada', 'Ada')],
        teams: [acme],
        news: [news('n-1', 'Ada news', acme, '2026-11-01')],
      });
      await h.search({ q: 'ada' });
      await h.search({});
      expect(NotificationService).not.toHaveBeenCalled();
      expect(PushNotificationsService).not.toHaveBeenCalled();
      expect(IntroRequestTelegram).not.toHaveBeenCalled();
    });

    it('S6-C43: C4 calls no model', async () => {
      const acme = team('t-acme', 'Ada Team');
      const h = setup({
        members: [member('m-ada', 'Ada')],
        teams: [acme],
        news: [news('n-1', 'Ada', acme, '2026-11-01')],
      });
      await h.search({ q: 'ada' });
      expect(h.husky.createContextualToolsResponse).not.toHaveBeenCalled();
    });
  });
});
