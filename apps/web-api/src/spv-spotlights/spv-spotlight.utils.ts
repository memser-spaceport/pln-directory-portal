export type ViewerAccess = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type AccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type AccessRequestConflict = 'ALREADY_APPLIED' | 'REJECTED' | 'PRE_APPROVED';

export type EmailTemplateKey =
  | 'invitePreapproved'
  | 'followUpPreapproved'
  | 'inviteOutreach'
  | 'followUpOutreach'
  | 'approved'
  | 'opened'
  | 'dataRoomAccess';

export type EmailTemplate = { subject: string; body: string };
export type DataRoomAccessTemplate = EmailTemplate & {
  fromEmail: string;
  fromName: string;
  cc: string[];
};
export type EmailTemplates = {
  [K in Exclude<EmailTemplateKey, 'dataRoomAccess'>]: EmailTemplate;
} & { dataRoomAccess: DataRoomAccessTemplate };

export const EMAIL_TEMPLATE_KEYS: EmailTemplateKey[] = [
  'invitePreapproved',
  'followUpPreapproved',
  'inviteOutreach',
  'followUpOutreach',
  'approved',
  'opened',
  'dataRoomAccess',
];

export const LABOS_DEFAULT_SENDER_EMAIL = 'labos@plnetwork.io';

export type SpotlightSender = { email: string; name: string };

function spotlightEmailBody(message: string, buttonLabel: string): string {
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;">',
    '<tr><td align="center" style="padding:16px 24px 0;font-family:Inter,Helvetica,Arial,sans-serif;">',
    '<p style="margin:0;font-size:24px;line-height:34px;font-weight:600;letter-spacing:-0.4px;color:#000000;text-align:center;">Hi {{investorName}},</p>',
    `<p style="margin:8px auto 0;max-width:418px;font-size:15px;line-height:24px;font-weight:400;color:#667085;text-align:center;">${message}</p>`,
    '</td></tr>',
    '<tr><td align="center" style="padding:24px 24px 8px;">',
    `<a href="{{spotlightLink}}" target="_blank" style="display:inline-block;background-color:#1b4dff;color:#ffffff;font-family:Inter,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;font-weight:500;letter-spacing:-0.2px;text-decoration:none;text-align:center;padding:10px 20px;border-radius:8px;border:1px solid rgba(14,15,17,0.12);">${buttonLabel}</a>`,
    '</td></tr>',
    '<tr><td align="center" style="padding:16px 24px;font-family:Montserrat,Inter,Helvetica,Arial,sans-serif;">',
    '<p style="margin:0;font-size:15px;line-height:24px;font-weight:600;color:#1c1e23;text-align:center;">Cheers,</p>',
    '<p style="margin:0;font-size:15px;line-height:24px;font-weight:400;color:#8f98b1;text-align:center;">The LabOS Team</p>',
    '</td></tr>',
    '</table>',
  ].join('\n');
}

export function defaultEmailTemplates(title: string): EmailTemplates {
  return {
    invitePreapproved: {
      subject: `You're invited: ${title}`,
      body: spotlightEmailBody('You are invited to {{spotlightTitle}}.', 'View Spotlight'),
    },
    followUpPreapproved: {
      subject: `Reminder: ${title}`,
      body: spotlightEmailBody('A reminder that {{spotlightTitle}} is available to you.', 'View Spotlight'),
    },
    inviteOutreach: {
      subject: `Invitation: ${title}`,
      body: spotlightEmailBody("You're invited to request access to {{spotlightTitle}}.", 'View Spotlight'),
    },
    followUpOutreach: {
      subject: `Reminder: request access to ${title}`,
      body: spotlightEmailBody('You can still request access to {{spotlightTitle}}.', 'View Spotlight'),
    },
    approved: {
      subject: `Access approved: ${title}`,
      body: spotlightEmailBody('Your request to view {{spotlightTitle}} was approved.', 'View Spotlight'),
    },
    opened: {
      subject: `${title} is open`,
      body: spotlightEmailBody('{{spotlightTitle}} is now open.', 'View Spotlight'),
    },
    dataRoomAccess: {
      subject: 'Netholabs SPV: your data room link',
      body: dataRoomAccessBody(),
      fromEmail: 'netholabsspv@plcapital.xyz',
      fromName: 'PL Capital, Netholabs SPV',
      cc: [],
    },
  };
}

function dataRoomAccessBody(): string {
  const paragraph = (html: string) =>
    `<p style="margin:0 0 16px;font-family:Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:#1c1e23;">${html}</p>`;
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;">',
    '<tr><td style="padding:16px 24px 8px;">',
    paragraph('Hi {{firstName}},'),
    paragraph(
      'Thanks for your interest in PLC Neurotech SPV – Netholabs I LLC. Here\'s the data room: <a href="{{docSendLink}}" target="_blank" style="color:#1b4dff;">{{docSendLink}}</a>'
    ),
    paragraph(
      'DocSend will ask you to confirm your email the first time you open it. Please use this address so your access goes through. Inside you\'ll find the PL Capital SPV memo and the Netholabs company materials, including the deck, science primers and data collection videos.'
    ),
    paragraph(
      'If you\'d like to go ahead, reply with the amount you\'d like to commit. We\'ll send subscription documents through Carta, followed by an accredited-investor verification request from VerifyInvestor.'
    ),
    paragraph(
      'We\'re targeting a close on Friday 16 October, so timing is tight. I\'m happy to talk it through if that\'s useful.'
    ),
    paragraph('Thanks,<br>Juan<br>Protocol Labs Capital'),
    '<p style="margin:0;font-family:Inter,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#667085;">Only for accredited investors, and confidential. Not an offer to sell or a solicitation to buy any security, and not investment, legal, or tax advice.</p>',
    '</td></tr>',
    '</table>',
  ].join('\n');
}

export function parseSenders(value: unknown): SpotlightSender[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const senders: SpotlightSender[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const email = typeof record.email === 'string' ? record.email.trim() : '';
    if (!email) {
      continue;
    }
    senders.push({ email, name: typeof record.name === 'string' ? record.name.trim() : '' });
  }
  return senders;
}

export function resolveConfiguredSenders(
  senders: unknown,
  senderEmail: string | null | undefined,
  senderName: string | null | undefined
): SpotlightSender[] {
  const parsed = parseSenders(senders);
  if (parsed.length > 0) {
    return parsed;
  }
  const email = senderEmail?.trim();
  if (!email) {
    return [];
  }
  return [{ email, name: senderName?.trim() || '' }];
}

export function primarySenderColumns(senders: SpotlightSender[]): {
  senderEmail: string | null;
  senderName: string | null;
} {
  const first = senders[0];
  if (!first) {
    return { senderEmail: null, senderName: null };
  }
  return { senderEmail: first.email, senderName: first.name || null };
}

export function assignSenders<T extends { memberUid: string }>(
  recipients: T[],
  senders: SpotlightSender[]
): { recipient: T; sender: SpotlightSender }[] {
  const ordered = [...recipients].sort((a, b) => a.memberUid.localeCompare(b.memberUid));
  return ordered.map((recipient, index) => ({
    recipient,
    sender: senders[index % senders.length],
  }));
}

export function senderSendIntervalMs(emailsPerMinute?: number): number {
  if (!emailsPerMinute || emailsPerMinute < 1) {
    return 0;
  }
  return Math.floor(60_000 / emailsPerMinute);
}

export function batchSendDurationMs(recipientCount: number, senderCount: number, emailsPerMinute: number): number {
  if (recipientCount < 1 || senderCount < 1 || emailsPerMinute < 1) {
    return 0;
  }
  const busiestSender = Math.ceil(recipientCount / senderCount);
  if (busiestSender <= 1) {
    return 0;
  }
  return (busiestSender - 1) * senderSendIntervalMs(emailsPerMinute);
}

export function resolveViewerAccess(input: {
  hasToken: boolean;
  requestStatus: AccessRequestStatus | null;
  isPreApproved: boolean;
  isFounder?: boolean;
}): ViewerAccess {
  if (!input.hasToken) {
    return 'NONE';
  }
  if (input.isFounder) {
    return 'APPROVED';
  }
  if (input.requestStatus === 'REJECTED') {
    return 'REJECTED';
  }
  if (input.isPreApproved || input.requestStatus === 'APPROVED') {
    return 'APPROVED';
  }
  if (input.requestStatus === 'PENDING') {
    return 'PENDING';
  }
  return 'NONE';
}

export function accessRequestConflict(input: {
  requestStatus: AccessRequestStatus | null;
  isPreApproved: boolean;
}): AccessRequestConflict | null {
  if (input.requestStatus === 'REJECTED') {
    return 'REJECTED';
  }
  if (input.isPreApproved) {
    return 'PRE_APPROVED';
  }
  if (input.requestStatus === 'PENDING' || input.requestStatus === 'APPROVED') {
    return 'ALREADY_APPLIED';
  }
  return null;
}

function applyEmailConditionals(template: string, vars: Record<string, string>): string {
  return template.replace(
    /\{\{#if\s+([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/g,
    (_match, key: string, inner: string) => {
      const elseMatch = inner.match(/\{\{\s*else\s*\}\}/);
      const whenTrue = elseMatch ? inner.slice(0, elseMatch.index) : inner;
      const whenFalse = elseMatch ? inner.slice((elseMatch.index ?? 0) + elseMatch[0].length) : '';
      return vars[key]?.trim() ? whenTrue : whenFalse;
    }
  );
}

export function mergeTemplate(template: string, vars: Record<string, string>): string {
  return applyEmailConditionals(template, vars).replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|([^}]*))?\}\}/g,
    (_match, key: string, fallback?: string) => vars[key] || fallback?.trim() || ''
  );
}

export function replaceNbsp(value: string): string {
  return value.replace(/&nbsp;| /g, ' ');
}

export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<\/?iframe\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '');
}

function emailStringList(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return null;
}

export function asEmailTemplates(value: unknown, title: string): EmailTemplates {
  const defaults = defaultEmailTemplates(title);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }
  const source = value as Record<string, unknown>;
  const result = { ...defaults };
  for (const key of EMAIL_TEMPLATE_KEYS) {
    const entry = source[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const subject = typeof record.subject === 'string' && record.subject.trim() ? record.subject : defaults[key].subject;
    const body = typeof record.body === 'string' && record.body.trim() ? record.body : defaults[key].body;
    if (key === 'dataRoomAccess') {
      const cc = emailStringList(record.cc);
      result.dataRoomAccess = {
        subject,
        body,
        fromEmail:
          typeof record.fromEmail === 'string' && record.fromEmail.trim()
            ? record.fromEmail.trim()
            : defaults.dataRoomAccess.fromEmail,
        fromName:
          typeof record.fromName === 'string' && record.fromName.trim()
            ? record.fromName.trim()
            : defaults.dataRoomAccess.fromName,
        cc: cc ?? defaults.dataRoomAccess.cc,
      };
      continue;
    }
    result[key] = { subject, body };
  }
  return result;
}

export function openNoticeCounts(recipients: { sent: boolean }[]): { willReceive: number; alreadySent: number } {
  return {
    willReceive: recipients.filter((recipient) => !recipient.sent).length,
    alreadySent: recipients.filter((recipient) => recipient.sent).length,
  };
}

export function visibleDocSendUrl(
  status: string,
  viewerAccess: ViewerAccess,
  url: string | null,
  options?: { emailOnDataRoomRequest?: boolean; dataRoomEmailSent?: boolean }
): string | null {
  if (viewerAccess !== 'APPROVED' || status !== 'OPEN' || !url) {
    return null;
  }
  if (options?.emailOnDataRoomRequest && !options.dataRoomEmailSent) {
    return null;
  }
  return url;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
