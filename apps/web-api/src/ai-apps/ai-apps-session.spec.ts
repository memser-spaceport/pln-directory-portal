jest.mock('./ai-apps.constants', () => ({
  ...jest.requireActual('./ai-apps.constants'),
  AI_APPS_SESSION_SECRET: 'test-secret-that-is-at-least-32-chars-long',
}));

import { BadRequestException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AiAppsSessionService, isAiAppSessionToken } from './ai-apps-session.service';
import {
  AI_APPS_SESSION_IDLE_MS,
  AI_APPS_SESSION_TOUCH_MS,
  AI_APPS_TESTING_SESSION_MAX_MS,
  buildAppUrl,
} from './ai-apps.constants';

const claimsOf = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

type Row = Record<string, any>;

/** Minimal in-memory stand-in for the three Prisma delegates the service uses. */
function fakePrisma() {
  const sessions: Row[] = [];
  const codes: Row[] = [];
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('gt' in v) return row[k] > v.gt;
        if ('lt' in v) return row[k] < v.lt;
      }
      return row[k] === v;
    });
  const table = (rows: Row[]) => ({
    create: jest.fn(async ({ data }) => {
      const row = {
        uid: data.uid ?? `u${rows.length}`,
        usedAt: null,
        revokedAt: null,
        lastUsedAt: new Date(),
        ...data,
      };
      rows.push(row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }) => rows.find((r) => matches(r, where)) ?? null),
    update: jest.fn(async ({ where, data }) => Object.assign(rows.find((r) => matches(r, where)) as Row, data)),
    updateMany: jest.fn(async ({ where, data }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
    deleteMany: jest.fn(async () => ({ count: 0 })),
  });
  return {
    sessions,
    codes,
    prisma: {
      aiAppSession: table(sessions),
      aiAppSessionCode: table(codes),
      member: { findUnique: jest.fn(async () => ({ email: 'ada@example.com' })) },
    },
  };
}

function build() {
  const store = fakePrisma();
  return { ...store, service: new AiAppsSessionService(store.prisma as any) };
}

describe('AiAppsSessionService', () => {
  afterEach(() => jest.useRealTimers());

  it('issues a code with the target origin and redeems it once for the same app and target', async () => {
    const { service } = build();
    const { code, callbackOrigin } = await service.issueCode('m-1', 'foo', 'preview');
    expect(callbackOrigin).toBe(buildAppUrl('foo', 'preview'));
    expect(callbackOrigin).toMatch(/^https:\/\/foo-preview\./);

    const grant = await service.redeemCode(code, 'foo', 'preview');
    expect(await service.validate('foo', grant.token)).toEqual({ memberUid: 'm-1' });

    await expect(service.redeemCode(code, 'foo', 'preview')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a code redeemed for another app or target, and burns it', async () => {
    const { service } = build();
    const a = await service.issueCode('m-1', 'foo', 'prod');
    await expect(service.redeemCode(a.code, 'bar', 'prod')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.redeemCode(a.code, 'foo', 'prod')).rejects.toBeInstanceOf(BadRequestException);

    const b = await service.issueCode('m-1', 'foo', 'prod');
    await expect(service.redeemCode(b.code, 'foo', 'preview')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired code', async () => {
    const { service } = build();
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-09-29T10:00:00Z'));
    const { code } = await service.issueCode('m-1', 'foo', 'prod');
    jest.setSystemTime(new Date('2026-09-29T10:01:01Z'));
    await expect(service.redeemCode(code, 'foo', 'prod')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('signs a token bound to the app that carries the member email, and stores only its hash', async () => {
    const { service, sessions } = build();
    const { token } = await service.exchangeToken('m-1', 'foo');

    expect(isAiAppSessionToken(token)).toBe(true);
    const claims = claimsOf(token);
    expect(claims).toEqual(
      expect.objectContaining({ iss: 'pln-ai-apps-session', aud: 'foo', uid: 'm-1', email: 'ada@example.com' })
    );
    expect(JSON.stringify(sessions)).not.toContain(token);
  });

  it('only validates for its own app', async () => {
    const { service } = build();
    const { token } = await service.exchangeToken('m-1', 'foo');
    expect(await service.validate('bar', token)).toBeNull();
  });

  it('rejects a forged or tampered token', async () => {
    const { service } = build();
    const { token } = await service.exchangeToken('m-1', 'foo');
    const forged = jwt.sign(claimsOf(token), 'another-secret-that-is-long-enough-ok');
    expect(await service.validate('foo', forged)).toBeNull();
    expect(await service.validate('foo', `${token}x`)).toBeNull();
  });

  it('expires after the idle timeout and slides it on use', async () => {
    const { service, sessions } = build();
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-09-29T10:00:00Z'));
    const { token } = await service.exchangeToken('m-1', 'foo');
    const firstIdle = sessions[0].idleExpiresAt.getTime();

    jest.setSystemTime(Date.now() + AI_APPS_SESSION_TOUCH_MS + 1);
    expect(await service.validate('foo', token)).not.toBeNull();
    expect(sessions[0].idleExpiresAt.getTime()).toBeGreaterThan(firstIdle);

    jest.setSystemTime(Date.now() + AI_APPS_SESSION_IDLE_MS + 1);
    expect(await service.validate('foo', token)).toBeNull();
  });

  it('writes the idle slide at most once per touch window', async () => {
    const { service, prisma } = build();
    const { token } = await service.exchangeToken('m-1', 'foo');
    await service.validate('foo', token);
    await service.validate('foo', token);
    expect(prisma.aiAppSession.update).not.toHaveBeenCalled();
  });

  it('revokes every session of a member on LabOS sign-out', async () => {
    const { service } = build();
    const a = await service.exchangeToken('m-1', 'foo');
    const b = await service.exchangeToken('m-1', 'bar');
    const other = await service.exchangeToken('m-2', 'foo');

    expect(await service.revokeAllForMember('m-1')).toBe(2);
    expect(await service.validate('foo', a.token)).toBeNull();
    expect(await service.validate('bar', b.token)).toBeNull();
    expect(await service.validate('foo', other.token)).toEqual({ memberUid: 'm-2' });
  });

  it('does not treat a LabOS token as an app session token', () => {
    expect(isAiAppSessionToken(jwt.sign({ iss: 'https://auth.os.pl.xyz', sub: 'x' }, 'k'))).toBe(false);
    expect(isAiAppSessionToken('not-a-jwt')).toBe(false);
  });

  it('mints a testing session that dies 24h after creation even when it is used, without reading a member', async () => {
    const { service, prisma, sessions } = build();
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-10-04T00:00:00Z'));
    const first = await service.openTestingSession('tu-1', 'foo');
    const second = await service.openTestingSession('tu-1', 'foo');

    expect(prisma.member.findUnique).not.toHaveBeenCalled();
    expect(claimsOf(first.token)).toEqual(
      expect.objectContaining({ iss: 'pln-ai-apps-session', aud: 'foo', uid: 'tu-1', email: null, testing: true })
    );
    expect(first.expiresAt.getTime() - Date.now()).toBe(AI_APPS_TESTING_SESSION_MAX_MS);
    expect(sessions[0].idleExpiresAt).toEqual(sessions[0].expiresAt);

    jest.setSystemTime(Date.now() + AI_APPS_TESTING_SESSION_MAX_MS - 1000);
    const live = await service.validate('foo', first.token, { touch: false });
    expect(live).toMatchObject({ memberUid: 'tu-1', testing: true });
    expect(await service.validate('foo', second.token, { touch: false })).toMatchObject({ memberUid: 'tu-1' });

    jest.setSystemTime(Date.now() + 1001);
    expect(await service.validate('foo', first.token)).toBeNull();
    expect(await service.isLiveTestingSessionForOtherApp(first.token, 'bar')).toBe(false);
  });

  it('treats a live testing token for another app as a hard deny, and a member token as not', async () => {
    const { service } = build();
    const { token } = await service.openTestingSession('tu-1', 'foo');
    expect(await service.isLiveTestingSessionForOtherApp(token, 'bar')).toBe(true);
    expect(await service.isLiveTestingSessionForOtherApp(token, 'foo')).toBe(false);
    expect(await service.validate('bar', token)).toBeNull();

    const member = await service.exchangeToken('m-1', 'foo');
    expect(await service.isLiveTestingSessionForOtherApp(member.token, 'bar')).toBe(false);
  });

  it('mints an agent session with the browser lifetime, an agent claim, and the MCP authorization id', async () => {
    const { service, sessions } = build();
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    const browser = await service.exchangeToken('m-1', 'foo');
    const agent = await service.openAgentSession('m-1', 'foo', 'auth-1');

    expect(agent.expiresAt.getTime()).toBe(browser.expiresAt.getTime());
    expect(sessions[1].idleExpiresAt.getTime()).toBe(sessions[0].idleExpiresAt.getTime());
    expect(sessions[0].isAgent).toBe(false);
    expect(sessions[0].mcpAuthorizationUid).toBeUndefined();
    expect(sessions[1].isAgent).toBe(true);
    expect(sessions[1].mcpAuthorizationUid).toBe('auth-1');
    expect(claimsOf(agent.token)).toEqual(
      expect.objectContaining({
        iss: 'pln-ai-apps-session',
        aud: 'foo',
        uid: 'm-1',
        email: 'ada@example.com',
        isAgent: true,
      })
    );
    expect(claimsOf(agent.token)).not.toHaveProperty('mcpAuthorizationUid');
    expect(claimsOf(browser.token).isAgent).toBeUndefined();
    expect(await service.validate('foo', agent.token)).toEqual({ memberUid: 'm-1', isAgent: true });
    expect(await service.validate('bar', agent.token)).toBeNull();
    expect(await service.validate('foo', browser.token)).toEqual({ memberUid: 'm-1' });
    expect(JSON.stringify(sessions)).not.toContain(agent.token);
  });

  it('ends agent sessions for one MCP authorization and leaves browser and other-agent sessions', async () => {
    const { service } = build();
    const browser = await service.exchangeToken('m-1', 'foo');
    const agent = await service.openAgentSession('m-1', 'foo', 'auth-1');
    const otherApp = await service.openAgentSession('m-1', 'bar', 'auth-1');
    const otherAuth = await service.openAgentSession('m-1', 'foo', 'auth-2');

    expect(await service.revokeAgentSessionsForAuthorization('auth-1')).toBe(2);
    expect(await service.validate('foo', agent.token)).toBeNull();
    expect(await service.authenticateAppRequest(agent.token, undefined)).toBeNull();
    expect(await service.validate('bar', otherApp.token)).toBeNull();
    expect(await service.validate('foo', browser.token)).toEqual({ memberUid: 'm-1' });
    expect(await service.validate('foo', otherAuth.token)).toEqual({ memberUid: 'm-1', isAgent: true });
    expect(await service.revokeAgentSessionsForAuthorization('auth-1')).toBe(0);
  });

  it('records the first use of a testing session once', async () => {
    const { service } = build();
    const { token } = await service.openTestingSession('tu-1', 'foo');
    const session = await service.validate('foo', token, { touch: false });
    expect(session?.testing && session.sessionUid && session.createdAt).toBeTruthy();
    if (!session?.sessionUid || !session.createdAt) return;
    expect(await service.claimFirstUse(session.sessionUid, session.createdAt)).toBe(true);
    expect(await service.claimFirstUse(session.sessionUid, session.createdAt)).toBe(false);
  });
});
