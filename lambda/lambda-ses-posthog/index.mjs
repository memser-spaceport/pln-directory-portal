// SES event publishing (configuration set "Tracking" -> SNS topic "sns-track") -> PostHog.
// One PostHog event per SES Send / Open / Click: `<email-type>-sent|opened|clicked` (LAB-2918).
import { createHash } from 'node:crypto';

// Dev and prod share one SES account and one topic. The SES tag `ses:caller-identity` names the IAM role
// that sent the email: `<service>-dev-irsa` / `-uat-irsa` in dev and UAT, `preprod_dev_noderole` in feature envs,
// `<service>-prod-irsa` / `prod_noderole` in production.
export const NON_PROD_CALLER = /(^|[-_])(dev|uat|preprod|stage|sandbox)([-_]|$)/i;

// Dev senders (SSM /dev/*/SES_SOURCE_EMAIL), the fallback when the caller says nothing.
const DEFAULT_DEV_SOURCES = [
  'dev_member-services@plnetwork.io',
  'dev-member-services@plnetwork.io',
  'pl-dev-support@plnetwork.io',
].join(',');

const config = () => ({
  // Which emails this function takes: "prod" or "dev" (dev, UAT and feature envs).
  targetEnv: (process.env.TARGET_ENV || 'prod').toLowerCase() === 'dev' ? 'dev' : 'prod',
  // POSTHOG_HOST and POSTHOG_API_KEY are read from SSM `<prefix>/POSTHOG_HOST` and `<prefix>/POSTHOG_API_KEY`,
  // e.g. /prod/directory-service. Env values, when set, win over SSM.
  ssmPrefix: (process.env.POSTHOG_SSM_PREFIX || '').replace(/\/+$/, ''),
  posthogHost: process.env.POSTHOG_HOST || '',
  posthogApiKey: process.env.POSTHOG_API_KEY || '',
  // Anything but "false" logs what would be sent and sends nothing.
  dryRun: (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false',
  // "skip" drops emails no rule recognises; "generic" sends them as other-email-*.
  unmatched: (process.env.UNMATCHED_EMAILS || 'skip').toLowerCase(),
  devSources: csv(process.env.DEV_SOURCES ?? DEFAULT_DEV_SOURCES),
});

const EVENT_SUFFIX = { Send: 'sent', Open: 'opened', Click: 'clicked' };

export const GENERIC_PREFIX = 'other-email';

// pl-notification-service template name -> event prefix. Matched when the sender sets the SES
// message tag `email-type` to the template name.
export const TEMPLATE_PREFIXES = {
  FORUM_DIGEST_DAILY: 'digest-email',
  FORUM_DIGEST_WEEKLY: 'digest-email',
  FORUM_MENTION: 'forum-mention-email',
  FORUM_POST_CREATED: 'forum-post-email',
  FORUM_POST_REPLIED: 'forum-post-email',
  JOB_BOARD_APPLICATION_EMAIL: 'job-application-email',
  JOB_BOARD_REFERRAL_EMAIL: 'job-referral-email',
  JOB_BOARD_REFERRAL_NOTICE_EMAIL: 'job-referral-notice-email',
  DEMO_DAY_FEEDBACK_COMPANY_EMAIL: 'demo-day-feedback-email',
  DEMO_DAY_LIKE_COMPANY_EMAIL: 'demo-day-engagement-email',
  DEMO_DAY_CONNECT_COMPANY_EMAIL: 'demo-day-engagement-email',
  DEMO_DAY_INVEST_COMPANY_EMAIL: 'demo-day-engagement-email',
  DEMO_DAY_REFERRAL_COMPANY_EMAIL: 'demo-day-engagement-email',
  TEAM_PITCH_CONNECT_EMAIL: 'team-pitch-engagement-email',
  TEAM_PITCH_INVEST_EMAIL: 'team-pitch-engagement-email',
  TEAM_PITCH_REFERRAL_EMAIL: 'team-pitch-engagement-email',
  TEAM_PITCH_FEEDBACK_EMAIL: 'team-pitch-engagement-email',
  TEAM_PITCH_INVESTOR_INVITE_EMAIL: 'team-pitch-invite-email',
  TEAM_PITCH_INVESTOR_FOLLOWUP_EMAIL: 'team-pitch-followup-email',
  SPV_SPOTLIGHT_EMAIL: 'spv-spotlight-email',
};

// Subject rules for emails sent without a tag. First match wins, so the order matters
// (the referral notice before the referral, the job alert before the suggested candidates).
export const SUBJECT_RULES = [
  ['digest-email', [/Digest from PL Network/i]],
  ['recommendations-email', [/Your Recommendations from PL Network/i]],
  ['welcome-email', [/to Protocol Labs!/]],
  ['job-alert-email', [/match from PL network/i]],
  ['suggested-candidates-email', [/Top matches for your /, /\bnew match(es)? for /, /Your top matches for /]],
  ['candidate-intro-email', [/would like to talk about/]],
  ['job-application-email', [/\bapplied for\b/]],
  ['job-referral-notice-email', [/You['’]ve been referred to/]],
  ['job-referral-email', [/\breferred\b.*\bfor\b/]],
  ['forum-mention-email', [/mentioned you in/]],
  ['team-edit-email', [/Team Edit Request processed successfully/i]],
  ['demo-day-feedback-email', [/Feedback from .+ for your team/]],
  ['team-pitch-followup-email', [/Follow-up:/]],
  ['spv-spotlight-email', [/\bSPV Team\b/, /\bon PL Spotlight\b/]],
];

// Senders used by one email type only. SPV Spotlight subjects are typed by admins, so the sender is
// the surer sign until the email-type tag reaches production.
export const SOURCE_PREFIXES = {
  'labos@plnetwork.io': 'spv-spotlight-email',
};

const KNOWN_PREFIXES = new Set([...Object.values(TEMPLATE_PREFIXES), ...SUBJECT_RULES.map(([prefix]) => prefix)]);

function csv(value) {
  return value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** `"Name" <a@b.io>` or `a@b.io` -> `a@b.io`. */
export function bareAddress(value) {
  if (typeof value !== 'string') return '';
  const angled = value.match(/<([^>]+)>/);
  return (angled ? angled[1] : value).trim().toLowerCase();
}

/** Email type of a SES `mail` object: the `email-type` tag first, then the sender, then the subject. */
export function classify(mail) {
  const tag = mail?.tags?.['email-type']?.[0];
  if (tag) {
    if (TEMPLATE_PREFIXES[tag]) return { prefix: TEMPLATE_PREFIXES[tag], matchedBy: 'tag', tag };
    if (KNOWN_PREFIXES.has(tag)) return { prefix: tag, matchedBy: 'tag', tag };
  }
  const sourcePrefix = SOURCE_PREFIXES[bareAddress(mail?.source)];
  if (sourcePrefix) return { prefix: sourcePrefix, matchedBy: 'source', tag };
  const subject = mail?.commonHeaders?.subject || '';
  for (const [prefix, patterns] of SUBJECT_RULES) {
    if (patterns.some((re) => re.test(subject))) return { prefix, matchedBy: 'subject', tag };
  }
  return { prefix: null, matchedBy: 'none', tag };
}

/** "dev" when the sending role or the sender address belongs to dev, UAT or a feature env, otherwise "prod". */
export function senderEnv(mail, devSources) {
  const caller = mail?.tags?.['ses:caller-identity']?.[0] || '';
  if (NON_PROD_CALLER.test(caller)) return 'dev';
  return devSources.includes(bareAddress(mail?.source)) ? 'dev' : 'prod';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SNS MessageId is already a UUID and stays the same on redelivery, so PostHog can drop duplicates. */
function eventUuid(snsMessageId, ses) {
  if (UUID_RE.test(snsMessageId || '')) return snsMessageId.toLowerCase();
  const hex = createHash('sha1')
    .update(`${ses?.mail?.messageId}|${ses?.eventType}|${JSON.stringify(ses?.open ?? ses?.click ?? {})}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Decides what one SES event becomes. Returns `{ event }` for PostHog or `{ skip }` with the reason,
 * plus a `log` object (no recipient address) for CloudWatch.
 */
export function toPosthogEvent(ses, snsMessageId, cfg = config()) {
  const mail = ses?.mail || {};
  const sesEventType = ses?.eventType;
  const source = bareAddress(mail.source);
  const caller = mail.tags?.['ses:caller-identity']?.[0] || '';
  const env = senderEnv(mail, cfg.devSources);
  const log = { sesEventType, messageId: mail.messageId, source, caller, env };

  const suffix = EVENT_SUFFIX[sesEventType];
  if (!suffix) return { skip: 'event-type', log };

  // Classified before the env check so the logs show the type of the other env's emails too.
  const { prefix, matchedBy, tag } = classify(mail);
  Object.assign(log, { emailType: prefix, matchedBy, tag });
  if (env !== cfg.targetEnv) return { skip: 'other-env', log };
  if (!prefix && cfg.unmatched !== 'generic') {
    // The subject shows which rule is missing; it is logged only for unmatched emails.
    return { skip: 'unmatched', log: { ...log, subject: mail.commonHeaders?.subject } };
  }

  const toAddresses = (mail.commonHeaders?.to?.length ? mail.commonHeaders.to : mail.destination || []).map(
    bareAddress
  );
  const toEmail = toAddresses[0] || '';
  if (!toEmail) return { skip: 'no-recipient', log };

  const timestamp = ses.open?.timestamp || ses.click?.timestamp || mail.timestamp;
  const emailType = prefix || GENERIC_PREFIX;
  const properties = {
    subject: mail.commonHeaders?.subject || '',
    from_email: bareAddress(mail.commonHeaders?.from?.[0]) || source,
    to_email: toEmail,
    email_type: emailType,
    email_type_matched_by: matchedBy,
    ses_message_id: mail.messageId,
    source: 'ses-events',
  };
  if (sesEventType === 'Click') properties.link = ses.click?.link;

  return {
    event: {
      event: `${emailType}-${suffix}`,
      distinct_id: toEmail,
      uuid: eventUuid(snsMessageId, ses),
      timestamp,
      properties,
    },
    log: { ...log, emailType, event: `${emailType}-${suffix}` },
  };
}

const SSM_TTL_MS = 5 * 60 * 1000;
let ssmCache = { prefix: '', at: 0, values: {} };

// Replaceable in tests. The Lambda Node.js runtime ships AWS SDK v3, so the zip carries no dependencies.
let readSsm = async (names) => {
  const { SSMClient, GetParametersCommand } = await import('@aws-sdk/client-ssm');
  const out = await new SSMClient({}).send(new GetParametersCommand({ Names: names, WithDecryption: true }));
  if (out.InvalidParameters?.length) throw new Error(`SSM parameters not found: ${out.InvalidParameters.join(', ')}`);
  return Object.fromEntries(out.Parameters.map((p) => [p.Name, p.Value]));
};
export const setSsmReader = (fn) => {
  readSsm = fn;
  ssmCache = { prefix: '', at: 0, values: {} };
};

/** PostHog host and key: env first, then SSM under POSTHOG_SSM_PREFIX (cached for five minutes). */
export async function posthogTarget(cfg) {
  let { posthogHost: host, posthogApiKey: apiKey } = cfg;
  if ((!host || !apiKey) && cfg.ssmPrefix) {
    if (ssmCache.prefix !== cfg.ssmPrefix || Date.now() - ssmCache.at > SSM_TTL_MS) {
      const values = await readSsm([`${cfg.ssmPrefix}/POSTHOG_HOST`, `${cfg.ssmPrefix}/POSTHOG_API_KEY`]);
      ssmCache = { prefix: cfg.ssmPrefix, at: Date.now(), values };
    }
    host ||= ssmCache.values[`${cfg.ssmPrefix}/POSTHOG_HOST`];
    apiKey ||= ssmCache.values[`${cfg.ssmPrefix}/POSTHOG_API_KEY`];
  }
  if (!host || !apiKey)
    throw new Error('No PostHog host/key: set POSTHOG_SSM_PREFIX or POSTHOG_HOST + POSTHOG_API_KEY');
  return { host: host.replace(/\/+$/, ''), apiKey };
}

async function capture(cfg, batch) {
  const { host, apiKey } = await posthogTarget(cfg);
  const res = await fetch(`${host}/batch/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, batch }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`PostHog /batch/ returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export const handler = async (event) => {
  const cfg = config();

  const batch = [];
  for (const record of event?.Records || []) {
    let ses;
    try {
      ses = JSON.parse(record?.Sns?.Message || '');
    } catch {
      console.warn(JSON.stringify({ skip: 'invalid-json', snsMessageId: record?.Sns?.MessageId }));
      continue;
    }
    const result = toPosthogEvent(ses, record?.Sns?.MessageId, cfg);
    console.log(JSON.stringify({ dryRun: cfg.dryRun, targetEnv: cfg.targetEnv, skip: result.skip, ...result.log }));
    if (result.event) batch.push(result.event);
  }

  // A thrown error makes SNS retry the invocation; the stable uuid keeps the retry from double counting.
  if (batch.length && !cfg.dryRun) await capture(cfg, batch);
  return { captured: cfg.dryRun ? 0 : batch.length, wouldCapture: batch.length };
};
