jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn(), isAxiosError: () => false },
}));

import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { IntroRequestsService } from './intro-requests.service';
import { IntroRequestTelegram } from './intro-request-telegram';

type StoredRequest = {
  uid: string;
  requesterUid: string;
  type: 'MEMBER' | 'TEAM';
  targetUid: string;
  text: string;
  telegramMessageId: string | null;
  telegramClaimedAt: Date | null;
  createdAt: Date;
};

type Person = {
  uid: string;
  name: string;
  teamMemberRoles: { mainTeam: boolean; team: { name: string } }[];
  policyAssignmentsV2: { uid: string }[];
};

describe('IntroRequestsService', () => {
  const rows: StoredRequest[] = [];
  const people = new Map<string, Person>();
  const emailToUid = new Map<string, string>();
  const targets = new Map<string, { name: string }>();
  const teams = new Map<string, { name: string }>();
  const send = jest.fn();
  let service: IntroRequestsService;
  let errorLog: jest.SpyInstance;

  const prisma = {
    member: {
      findFirst: jest.fn(async ({ where }: { where: { email?: string; uid?: string } }) => {
        if (where.email) {
          const uid = emailToUid.get(where.email);
          return uid ? people.get(uid) ?? null : null;
        }
        if (where.uid) {
          return people.get(where.uid) ?? targets.get(where.uid) ?? null;
        }
        return null;
      }),
      findUnique: jest.fn(async ({ where }: { where: { uid: string } }) => people.get(where.uid) ?? null),
    },
    team: {
      findUnique: jest.fn(async ({ where }: { where: { uid: string } }) => teams.get(where.uid) ?? null),
    },
    introRequest: {
      create: jest.fn(async ({ data }) => {
        const row: StoredRequest = {
          uid: `req-${rows.length + 1}`,
          requesterUid: data.requesterUid,
          type: data.type,
          targetUid: data.targetUid,
          text: data.text,
          telegramMessageId: null,
          telegramClaimedAt: null,
          createdAt: new Date(),
        };
        rows.push(row);
        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const matched = rows.filter((row) => matchesUnsent(row, where));
        for (const row of matched) {
          Object.assign(row, data);
        }
        return { count: matched.length };
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = rows.find((item) => item.uid === where.uid);
        if (!row) {
          throw new Error(`Intro request ${where.uid} was not found`);
        }
        Object.assign(row, data);
        return { ...row };
      }),
      findUnique: jest.fn(async ({ where }: { where: { uid: string } }) => {
        const row = rows.find((item) => item.uid === where.uid);
        return row ? { ...row } : null;
      }),
      findMany: jest.fn(async ({ where, take }: { where: Record<string, unknown>; take: number }) => {
        return rows
          .filter((row) => matchesUnsent(row, where))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, take)
          .map((row) => ({ uid: row.uid }));
      }),
    },
  };

  beforeEach(() => {
    rows.length = 0;
    people.clear();
    emailToUid.clear();
    targets.clear();
    teams.clear();
    send.mockReset();
    send.mockResolvedValue('42');
    process.env.WEB_UI_BASE_URL = 'https://directory.example';
    process.env.TELEGRAM_ASKS_BOT_TOKEN = 'asks-bot-token';
    process.env.TELEGRAM_ASKS_CHAT_ID = '-1001';
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    addPerson('ada@example.com', {
      uid: 'm-ada',
      name: 'Ada Lovelace',
      teamMemberRoles: [
        { mainTeam: false, team: { name: 'Protocol Labs' } },
        { mainTeam: true, team: { name: 'Filecoin' } },
      ],
      policyAssignmentsV2: [],
    });
    targets.set('m-grace', { name: 'Grace Hopper' });
    teams.set('t-acme', { name: 'Acme' });
    service = new IntroRequestsService(prisma as unknown as PrismaService, { send } as unknown as IntroRequestTelegram);
  });

  afterEach(() => {
    errorLog.mockRestore();
  });

  it('stores a portfolio member request and posts it once', async () => {
    const result = await service.create('Ada@Example.com', {
      type: 'MEMBER',
      targetId: 'm-grace',
      text: 'Please <introduce> us',
    });

    expect(result).toEqual({ uid: 'req-1' });
    expect(rows[0]).toEqual(
      expect.objectContaining({
        requesterUid: 'm-ada',
        type: 'MEMBER',
        targetUid: 'm-grace',
        text: 'Please <introduce> us',
        telegramMessageId: '42',
        telegramClaimedAt: null,
      })
    );
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(send).toHaveBeenCalledTimes(1);
    const text = send.mock.calls[0][0] as string;
    expect(text).toContain('<a href="https://directory.example/members/m-ada">Ada Lovelace</a>');
    expect(text).toContain('Team: Filecoin, Protocol Labs');
    expect(text).toContain('Type: intro to member');
    expect(text).toContain('<a href="https://directory.example/members/m-grace">Grace Hopper</a>');
    expect(text).toContain('Text: Please &lt;introduce&gt; us');
    expect(prisma.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'ada@example.com', deletedAt: null },
        select: expect.objectContaining({
          teamMemberRoles: expect.objectContaining({
            where: expect.objectContaining({
              team: { communityAffiliations: { some: { title: 'PL Portfolio' } } },
            }),
          }),
          policyAssignmentsV2: { where: { policy: { code: 'pl_infra_team_pl_internal' } }, select: { uid: true } },
        }),
      })
    );
  });

  it('stores a request from a PL Infra member who is not on a portfolio team', async () => {
    addPerson('niki@example.com', {
      uid: 'm-niki',
      name: 'Niki',
      teamMemberRoles: [],
      policyAssignmentsV2: [{ uid: 'pa-1' }],
    });

    await service.create('niki@example.com', { type: 'TEAM', targetId: 't-acme', text: 'Intro to the team' });

    expect(rows[0]).toEqual(expect.objectContaining({ requesterUid: 'm-niki', type: 'TEAM', targetUid: 't-acme' }));
    const text = send.mock.calls[0][0] as string;
    expect(text).toContain('Team: PL Infra');
    expect(text).toContain('Type: intro to team');
    expect(text).toContain('<a href="https://directory.example/teams/t-acme">Acme</a>');
  });

  it('returns 403 for a member who is not eligible and stores nothing', async () => {
    addPerson('sam@example.com', {
      uid: 'm-sam',
      name: 'Sam',
      teamMemberRoles: [],
      policyAssignmentsV2: [],
    });

    await expect(
      service.create('sam@example.com', { type: 'MEMBER', targetId: 'm-grace', text: 'Hello' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.create('missing@example.com', { type: 'MEMBER', targetId: 'm-grace', text: 'Hello' })
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(rows).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns 404 when the target does not exist and stores nothing', async () => {
    await expect(
      service.create('ada@example.com', { type: 'MEMBER', targetId: 'missing', text: 'Hello' })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(rows).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps a failed post, retries it once, and does not post it again', async () => {
    send.mockRejectedValueOnce(new Error('network down')).mockResolvedValue('77');

    await expect(
      service.create('ada@example.com', { type: 'MEMBER', targetId: 'm-grace', text: 'Please introduce us' })
    ).resolves.toEqual({ uid: 'req-1' });

    expect(rows[0].telegramMessageId).toBeNull();
    expect(rows[0].telegramClaimedAt).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);

    await service.retryPending();

    expect(send).toHaveBeenCalledTimes(2);
    expect(rows[0].telegramMessageId).toBe('77');

    await service.retryPending();

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not post twice when two retries run together', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    send.mockImplementation(() => {
      calls += 1;
      return gate.then(() => '55');
    });
    rows.push({
      uid: 'req-seed',
      requesterUid: 'm-ada',
      type: 'MEMBER',
      targetUid: 'm-grace',
      text: 'Please introduce us',
      telegramMessageId: null,
      telegramClaimedAt: null,
      createdAt: new Date(),
    });

    const both = Promise.all([service.retryPending(), service.retryPending()]);
    await waitFor(() => calls === 1);
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(calls).toBe(1);

    release();
    await both;

    expect(calls).toBe(1);
    expect(rows[0].telegramMessageId).toBe('55');

    await service.retryPending();
    expect(calls).toBe(1);
  });

  it('does not log the bot token when the post fails', async () => {
    send.mockRejectedValue(new Error('network down asks-bot-token'));

    await service.create('ada@example.com', { type: 'MEMBER', targetId: 'm-grace', text: 'Hello' });

    expect(errorLog).toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('asks-bot-token');
    expect(JSON.stringify(errorLog.mock.calls)).toContain('[redacted]');
  });

  function addPerson(email: string, person: Person) {
    people.set(person.uid, person);
    emailToUid.set(email, person.uid);
  }
});

function matchesUnsent(
  row: StoredRequest,
  where: { uid?: string; telegramMessageId?: null; OR?: { telegramClaimedAt: null | { lt: Date } }[] }
): boolean {
  if (where.uid != null && row.uid !== where.uid) {
    return false;
  }
  if (where.telegramMessageId === null && row.telegramMessageId != null) {
    return false;
  }
  if (!where.OR) {
    return true;
  }
  return where.OR.some((clause) => {
    if (clause.telegramClaimedAt === null) {
      return row.telegramClaimedAt == null;
    }
    return row.telegramClaimedAt != null && row.telegramClaimedAt < clause.telegramClaimedAt.lt;
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('timed out');
}
