// FEATURE-ENV ONLY — never merge (branch lab-2837-env-seed only).
/** Spec for the SES recipient guard on branch `lab-2837-env-seed`. */
import AWS from 'aws-sdk';
import { BLOCKED_MESSAGE_ID, installFeatureEnvEmailGuard, maskAddress } from './feature-env-email-guard';

/** Mirrors aws-sdk v2: operation methods on a subclass prototype, each delegating to `this.makeRequest`. */
function fakeSes() {
  const original = jest.fn((...args: [operation: string, params: any, callback?: unknown]) => ({
    promise: () => Promise.resolve({ MessageId: `real-${args[0]}`, params: args[1] }),
  }));
  class Base {
    makeRequest(operation: string, params?: any, callback?: any) {
      return original(operation, params, callback);
    }
  }
  class FakeSES extends Base {}
  class FakeSESVersioned extends FakeSES {}
  for (const op of [
    'sendRawEmail',
    'sendEmail',
    'sendTemplatedEmail',
    'sendBulkTemplatedEmail',
    'sendBounce',
    'getSendQuota',
  ]) {
    (FakeSESVersioned.prototype as any)[op] = function (this: any, params: any, cb?: any) {
      return this.makeRequest(op, params, cb);
    };
  }
  const log = jest.fn();
  const uninstall = installFeatureEnvEmailGuard([{ prototype: FakeSES.prototype, name: 'SES' }], log);
  return { ses: new FakeSESVersioned() as any, original, log, uninstall };
}

describe('feature-env email guard (FEATURE-ENV ONLY)', () => {
  const env = { ...process.env };
  let ctx: ReturnType<typeof fakeSes>;

  beforeEach(() => {
    process.env.IS_EMAIL_ENABLED = 'true';
    process.env.FEATURE_ENV_EMAIL_ALLOWLIST = 'me@allowed.test, Second@Allowed.test';
    ctx = fakeSes();
  });
  afterEach(() => {
    ctx.uninstall();
    process.env = { ...env };
  });

  const loggedLines = () => ctx.log.mock.calls.map(([line]) => line).join('\n');

  it('passes an allowed-only raw email through with its Destinations', async () => {
    const result = await ctx.ses
      .sendRawEmail({ Destinations: ['me@allowed.test'], RawMessage: { Data: 'x' } })
      .promise();
    expect(ctx.original).toHaveBeenCalledTimes(1);
    expect(ctx.original.mock.calls[0][1].Destinations).toEqual(['me@allowed.test']);
    expect(result.MessageId).toBe('real-sendRawEmail');
  });

  it('keeps only allowed recipients of a mixed raw list, without mutating the caller params', async () => {
    const params = {
      Destinations: ['stranger@real.org', 'me@allowed.test', 'boss@real.org'],
      RawMessage: { Data: 'x' },
    };
    await ctx.ses.sendRawEmail(params).promise();
    expect(ctx.original.mock.calls[0][1].Destinations).toEqual(['me@allowed.test']);
    expect(params.Destinations).toHaveLength(3);
    expect(loggedLines()).toContain('st***@real.org');
    expect(loggedLines()).not.toContain('stranger@real.org');
  });

  it('filters To/Cc/Bcc of sendEmail and sendTemplatedEmail', async () => {
    const Destination = {
      ToAddresses: ['stranger@real.org', 'Me <ME@allowed.test>'],
      CcAddresses: ['cc@real.org'],
      BccAddresses: ['second@allowed.test'],
    };
    await ctx.ses.sendEmail({ Destination, Message: {} }).promise();
    await ctx.ses.sendTemplatedEmail({ Destination, Template: 't', TemplateData: '{}' }).promise();
    for (const call of ctx.original.mock.calls) {
      expect(call[1].Destination).toEqual({
        ToAddresses: ['Me <ME@allowed.test>'],
        CcAddresses: [],
        BccAddresses: ['second@allowed.test'],
      });
    }
  });

  it('filters bulk templated destinations and drops entries left empty', async () => {
    await ctx.ses
      .sendBulkTemplatedEmail({
        Template: 't',
        Destinations: [
          { Destination: { ToAddresses: ['stranger@real.org'] } },
          { Destination: { ToAddresses: ['me@allowed.test', 'x@real.org'] }, ReplacementTemplateData: '{}' },
        ],
      })
      .promise();
    expect(ctx.original.mock.calls[0][1].Destinations).toEqual([
      {
        Destination: { ToAddresses: ['me@allowed.test'], CcAddresses: [], BccAddresses: [] },
        ReplacementTemplateData: '{}',
      },
    ]);
  });

  it('blocks without calling SES when no recipient is allowed', async () => {
    const result = await ctx.ses
      .sendRawEmail({ Destinations: ['stranger@real.org'], RawMessage: { Data: 'x' } })
      .promise();
    const viaEmail = await ctx.ses.sendEmail({ Destination: { ToAddresses: ['a@real.org'] }, Message: {} }).promise();
    expect(ctx.original).not.toHaveBeenCalled();
    expect(result).toEqual({ MessageId: BLOCKED_MESSAGE_ID });
    expect(viaEmail).toEqual({ MessageId: BLOCKED_MESSAGE_ID });
    expect(loggedLines()).toContain('BLOCKED SES.sendRawEmail');
  });

  it('blocks a raw email that has no Destinations (SES would fall back to the MIME headers)', async () => {
    const result = await ctx.ses.sendRawEmail({ RawMessage: { Data: 'To: me@allowed.test\r\n\r\nhi' } }).promise();
    await ctx.ses.sendRawEmail({ Destinations: [], RawMessage: { Data: 'x' } }).promise();
    expect(ctx.original).not.toHaveBeenCalled();
    expect(result.MessageId).toBe(BLOCKED_MESSAGE_ID);
  });

  it('blocks a callback-style call and still answers the callback', (done) => {
    ctx.ses.sendRawEmail({ Destinations: ['a@real.org'], RawMessage: { Data: 'x' } }, (err: unknown, data: any) => {
      expect(err).toBeNull();
      expect(data.MessageId).toBe(BLOCKED_MESSAGE_ID);
      expect(ctx.original).not.toHaveBeenCalled();
      done();
    });
  });

  it('fail-safe: IS_EMAIL_ENABLED=true with an empty or unset allowlist blocks every send', async () => {
    for (const value of [undefined, '', ' , ']) {
      if (value === undefined) delete process.env.FEATURE_ENV_EMAIL_ALLOWLIST;
      else process.env.FEATURE_ENV_EMAIL_ALLOWLIST = value;
      const result = await ctx.ses
        .sendRawEmail({ Destinations: ['me@allowed.test'], RawMessage: { Data: 'x' } })
        .promise();
      expect(result.MessageId).toBe(BLOCKED_MESSAGE_ID);
    }
    expect(ctx.original).not.toHaveBeenCalled();
    expect(loggedLines()).toContain('FEATURE_ENV_EMAIL_ALLOWLIST is empty');
  });

  it('matches case-insensitively but exactly', async () => {
    await ctx.ses
      .sendRawEmail({
        Destinations: ['ME@ALLOWED.TEST', 'second@allowed.test', 'me@allowed.test.evil.org', 'xme@allowed.test'],
        RawMessage: { Data: 'x' },
      })
      .promise();
    expect(ctx.original.mock.calls[0][1].Destinations).toEqual(['ME@ALLOWED.TEST', 'second@allowed.test']);
  });

  it('rejects display names that smuggle a second address', async () => {
    const result = await ctx.ses
      .sendRawEmail({ Destinations: ['evil@real.org, X <me@allowed.test>'], RawMessage: { Data: 'x' } })
      .promise();
    expect(result.MessageId).toBe(BLOCKED_MESSAGE_ID);
    expect(ctx.original).not.toHaveBeenCalled();
  });

  it('blocks sendBounce and passes non-send operations through', async () => {
    await ctx.ses.sendBounce({ BounceSender: 'me@allowed.test' }).promise();
    expect(ctx.original).not.toHaveBeenCalled();
    await ctx.ses.getSendQuota({}).promise();
    expect(ctx.original).toHaveBeenCalledWith('getSendQuota', {}, undefined);
  });

  it('masks the local part', () => {
    expect(maskAddress('stranger@real.org')).toBe('st***@real.org');
    expect(maskAddress('a@b.c')).toBe('***@b.c');
    expect(maskAddress('Name <ab@x.io>')).toBe('a***@x.io');
  });
});

describe('feature-env email guard on the real aws-sdk v2 SES client (FEATURE-ENV ONLY)', () => {
  const env = { ...process.env };
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...env };
  });

  it('sits in front of every SES instance, whichever versioned prototype owns the method', async () => {
    process.env.FEATURE_ENV_EMAIL_ALLOWLIST = 'me@allowed.test';
    const sent = jest
      .spyOn(AWS.Service.prototype as any, 'makeRequest')
      .mockImplementation(() => ({ promise: () => Promise.resolve({ MessageId: 'would-hit-aws' }) }));
    const created = new AWS.SES({ region: 'us-east-1' }); // created BEFORE install
    const uninstall = installFeatureEnvEmailGuard(undefined, jest.fn());
    try {
      expect(Object.prototype.hasOwnProperty.call(AWS.SES.prototype, 'sendRawEmail')).toBe(false);
      const blocked = await created.sendRawEmail({ Destinations: ['x@real.org'], RawMessage: { Data: 'x' } }).promise();
      expect(blocked.MessageId).toBe(BLOCKED_MESSAGE_ID);
      const blockedTemplated = await new AWS.SES({ region: 'us-east-1' })
        .sendTemplatedEmail({
          Source: 's@x.io',
          Destination: { ToAddresses: ['x@real.org'] },
          Template: 't',
          TemplateData: '{}',
        })
        .promise();
      expect(blockedTemplated.MessageId).toBe(BLOCKED_MESSAGE_ID);
      const blockedV2 = await new AWS.SESV2({ region: 'us-east-1' })
        .sendEmail({ Destination: { ToAddresses: ['x@real.org'] }, Content: {} })
        .promise();
      expect(blockedV2.MessageId).toBe(BLOCKED_MESSAGE_ID);
      expect(sent).not.toHaveBeenCalled();

      await created
        .sendRawEmail({ Destinations: ['x@real.org', 'me@allowed.test'], RawMessage: { Data: 'x' } })
        .promise();
      expect(sent).toHaveBeenCalledTimes(1);
      expect((sent.mock.calls[0] as any[])[1].Destinations).toEqual(['me@allowed.test']);
    } finally {
      uninstall();
    }
    expect(Object.prototype.hasOwnProperty.call(AWS.SES.prototype, 'makeRequest')).toBe(false);
  });
});
