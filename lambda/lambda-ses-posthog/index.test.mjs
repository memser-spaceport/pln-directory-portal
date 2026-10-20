import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, toPosthogEvent, handler, bareAddress } from './index.mjs';

const cfg = { dryRun: true, unmatched: 'skip', excludedSources: ['dev_member-services@plnetwork.io'] };

function sesEvent(
  eventType,
  { subject = 'Weekly Digest from PL Network', source = 'member-services@plnetwork.io', tags = {}, extra = {} } = {}
) {
  return {
    eventType,
    mail: {
      timestamp: '2026-10-19T09:00:00.000Z',
      source,
      messageId: '011101a15932615f-04fe3816-9f67-4e1b-aa8d-a859b325e163-000000',
      destination: ['member@example.com'],
      tags: { 'ses:configuration-set': ['Tracking'], 'ses:caller-identity': ['prod-node-role'], ...tags },
      commonHeaders: { from: [`PL Network <${source}>`], to: ['Member One <Member@Example.com>'], subject },
    },
    ...extra,
  };
}

const SNS_ID = '9b2e3c1a-5f4d-4e6b-8a7c-1d2e3f4a5b6c';

test('subjects from the senders map to the ticket prefixes', () => {
  const cases = {
    'Daily Digest from PL Network': 'digest-email',
    'Weekly Digest from PL Network': 'digest-email',
    'Your Recommendations from PL Network': 'recommendations-email',
    'Welcome, Jane Doe to Protocol Labs!': 'welcome-email',
    '1 role match from PL network: Rust': 'job-alert-email',
    '3 new roles match from PL network: Rust': 'job-alert-email',
    'Top matches for your Senior Engineer role': 'suggested-candidates-email',
    '2 new matches for Senior Engineer': 'suggested-candidates-email',
    '1 new match for Senior Engineer': 'suggested-candidates-email',
    'Your top matches for Senior Engineer are waiting': 'suggested-candidates-email',
    'Ann from Acme would like to talk about Senior Engineer': 'candidate-intro-email',
    'Bob applied for Senior Engineer': 'job-application-email',
    'Ann referred Bob for Senior Engineer at Acme': 'job-referral-email',
    "You've been referred to Senior Engineer at Acme": 'job-referral-notice-email',
    'Ann mentioned you in Some topic': 'forum-mention-email',
    'Team Edit Request processed successfully': 'team-edit-email',
    'Feedback from Ann for your team': 'demo-day-feedback-email',
    '[Demo Day] Feedback from Ann for your team': 'demo-day-feedback-email',
    'Follow-up: Acme pitch': 'team-pitch-followup-email',
  };
  for (const [subject, prefix] of Object.entries(cases)) {
    assert.equal(classify({ commonHeaders: { subject } }).prefix, prefix, subject);
  }
});

test('SPV Spotlight emails match by the LabOS sender or the data room subject', () => {
  const bySender = classify({
    source: 'LabOS <labos@plnetwork.io>',
    commonHeaders: { subject: 'Anything the admin typed' },
  });
  assert.deepEqual(bySender, { prefix: 'spv-spotlight-email', matchedBy: 'source', tag: undefined });
  assert.equal(
    classify({ commonHeaders: { subject: 'Connecting Netholabs SPV Team to Ada Lovelace' } }).prefix,
    'spv-spotlight-email'
  );
  assert.equal(
    classify({ commonHeaders: { subject: 'Connecting you to Netholabs SPV Team' } }).prefix,
    'spv-spotlight-email'
  );
});

test('admin alerts and unknown subjects match nothing', () => {
  for (const subject of ['A new query received', 'A new support request received', 'Hello']) {
    assert.equal(classify({ commonHeaders: { subject } }).prefix, null, subject);
  }
});

test('the email-type tag wins over the subject', () => {
  const mail = {
    tags: { 'email-type': ['SPV_SPOTLIGHT_EMAIL'] },
    commonHeaders: { subject: 'Anything the admin typed' },
  };
  assert.deepEqual(classify(mail), { prefix: 'spv-spotlight-email', matchedBy: 'tag', tag: 'SPV_SPOTLIGHT_EMAIL' });
  assert.equal(classify({ tags: { 'email-type': ['digest-email'] } }).prefix, 'digest-email');
});

test('an unknown tag falls back to the subject', () => {
  const mail = { tags: { 'email-type': ['GUIDE_MENTION'] }, commonHeaders: { subject: 'Ann mentioned you in Guide' } };
  assert.equal(classify(mail).matchedBy, 'subject');
});

test('Send becomes <prefix>-sent with subject, from and to', () => {
  const { event } = toPosthogEvent(sesEvent('Send', { extra: { send: {} } }), SNS_ID, cfg);
  assert.equal(event.event, 'digest-email-sent');
  assert.equal(event.distinct_id, 'member@example.com');
  assert.equal(event.uuid, SNS_ID);
  assert.equal(event.timestamp, '2026-10-19T09:00:00.000Z');
  assert.equal(event.properties.subject, 'Weekly Digest from PL Network');
  assert.equal(event.properties.from_email, 'member-services@plnetwork.io');
  assert.equal(event.properties.to_email, 'member@example.com');
});

test('Open and Click use their own timestamp; Click carries the link', () => {
  const open = toPosthogEvent(
    sesEvent('Open', { extra: { open: { timestamp: '2026-10-19T10:00:00.000Z' } } }),
    SNS_ID,
    cfg
  );
  assert.equal(open.event.event, 'digest-email-opened');
  assert.equal(open.event.timestamp, '2026-10-19T10:00:00.000Z');

  const click = toPosthogEvent(
    sesEvent('Click', {
      extra: { click: { timestamp: '2026-10-19T10:01:00.000Z', link: 'https://directory.plnetwork.io/x' } },
    }),
    SNS_ID,
    cfg
  );
  assert.equal(click.event.event, 'digest-email-clicked');
  assert.equal(click.event.properties.link, 'https://directory.plnetwork.io/x');
});

test('Delivery, Bounce and the rest are skipped', () => {
  for (const type of ['Delivery', 'Bounce', 'Complaint', 'DeliveryDelay', 'Reject']) {
    assert.equal(toPosthogEvent(sesEvent(type), SNS_ID, cfg).skip, 'event-type');
  }
});

test('dev senders are skipped', () => {
  assert.equal(
    toPosthogEvent(sesEvent('Send', { source: 'dev_member-services@plnetwork.io' }), SNS_ID, cfg).skip,
    'excluded-source'
  );
});

test('unmatched emails are skipped, or sent as other-email-* in generic mode', () => {
  const ses = sesEvent('Send', { subject: 'Something new' });
  const skipped = toPosthogEvent(ses, SNS_ID, cfg);
  assert.equal(skipped.skip, 'unmatched');
  assert.equal(skipped.log.subject, 'Something new');
  assert.equal(toPosthogEvent(ses, SNS_ID, { ...cfg, unmatched: 'generic' }).event.event, 'other-email-sent');
});

test('a non-UUID SNS id still gives a stable uuid', () => {
  const ses = sesEvent('Send');
  const a = toPosthogEvent(ses, 'not-a-uuid', cfg).event.uuid;
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(toPosthogEvent(ses, 'not-a-uuid', cfg).event.uuid, a);
});

test('bareAddress strips display names', () => {
  assert.equal(bareAddress('"PL Network" <Member-Services@plnetwork.io>'), 'member-services@plnetwork.io');
  assert.equal(bareAddress('a@b.io'), 'a@b.io');
});

test('handler in dry run sends nothing', async () => {
  process.env.DRY_RUN = 'true';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('fetch must not be called in dry run');
  const records = [
    { Sns: { MessageId: SNS_ID, Message: JSON.stringify(sesEvent('Send')) } },
    { Sns: { MessageId: 'x', Message: '{bad' } },
  ];
  try {
    assert.deepEqual(await handler({ Records: records }), { captured: 0, wouldCapture: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('handler posts the batch to PostHog and throws on a failed response', async () => {
  Object.assign(process.env, {
    DRY_RUN: 'false',
    POSTHOG_HOST: 'https://ph.example.com/',
    POSTHOG_API_KEY: 'phc_test',
  });
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: calls.length === 1, status: calls.length === 1 ? 200 : 503, text: async () => 'down' };
  };
  const records = [{ Sns: { MessageId: SNS_ID, Message: JSON.stringify(sesEvent('Send')) } }];
  try {
    assert.deepEqual(await handler({ Records: records }), { captured: 1, wouldCapture: 1 });
    assert.equal(calls[0].url, 'https://ph.example.com/batch/');
    assert.equal(calls[0].body.api_key, 'phc_test');
    assert.equal(calls[0].body.batch[0].event, 'digest-email-sent');
    await assert.rejects(handler({ Records: records }), /503/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.DRY_RUN;
    delete process.env.POSTHOG_HOST;
    delete process.env.POSTHOG_API_KEY;
  }
});
