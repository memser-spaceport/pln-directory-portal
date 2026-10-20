// SES event publishing (configuration set "Tracking" -> SNS topic "sns-track") -> PostHog.
// One PostHog event per SES Send / Open / Click: `<email-type>-sent|opened|clicked` (LAB-2918).
import { createHash } from 'node:crypto';

// Dev senders (SSM /dev/*/SES_SOURCE_EMAIL): dev and prod share one SES account and one topic.
const DEFAULT_EXCLUDED_SOURCES = [
  'dev_member-services@plnetwork.io',
  'dev-member-services@plnetwork.io',
  'pl-dev-support@plnetwork.io',
].join(',');

const config = () => ({
  posthogHost: (process.env.POSTHOG_HOST || '').replace(/\/+$/, ''),
  posthogApiKey: process.env.POSTHOG_API_KEY || '',
  // Anything but "false" logs what would be sent and sends nothing.
  dryRun: (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false',
  // "skip" drops emails no rule recognises; "generic" sends them as other-email-*.
  unmatched: (process.env.UNMATCHED_EMAILS || 'skip').toLowerCase(),
  excludedSources: csv(process.env.EXCLUDED_SOURCES ?? DEFAULT_EXCLUDED_SOURCES),
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
  ['spv-spotlight-email', [/\bSPV Team\b/]],
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
  const log = { sesEventType, messageId: mail.messageId, source, caller };

  const suffix = EVENT_SUFFIX[sesEventType];
  if (!suffix) return { skip: 'event-type', log };
  if (cfg.excludedSources.includes(source)) return { skip: 'excluded-source', log };

  const { prefix, matchedBy, tag } = classify(mail);
  Object.assign(log, { emailType: prefix, matchedBy, tag });
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

async function capture(cfg, batch) {
  const res = await fetch(`${cfg.posthogHost}/batch/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: cfg.posthogApiKey, batch }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`PostHog /batch/ returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export const handler = async (event) => {
  const cfg = config();
  if (!cfg.dryRun && (!cfg.posthogHost || !cfg.posthogApiKey)) {
    throw new Error('POSTHOG_HOST and POSTHOG_API_KEY are required when DRY_RUN=false');
  }

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
    console.log(JSON.stringify({ dryRun: cfg.dryRun, skip: result.skip, ...result.log }));
    if (result.event) batch.push(result.event);
  }

  // A thrown error makes SNS retry the invocation; the stable uuid keeps the retry from double counting.
  if (batch.length && !cfg.dryRun) await capture(cfg, batch);
  return { captured: cfg.dryRun ? 0 : batch.length, wouldCapture: batch.length };
};
