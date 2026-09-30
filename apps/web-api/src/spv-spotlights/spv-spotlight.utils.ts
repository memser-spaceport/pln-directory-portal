export type ViewerAccess = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type AccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type AccessRequestConflict = 'ALREADY_APPLIED' | 'REJECTED' | 'PRE_APPROVED';

export type EmailTemplateKey =
  | 'invitePreapproved'
  | 'followUpPreapproved'
  | 'inviteOutreach'
  | 'followUpOutreach'
  | 'approved'
  | 'opened';

export type EmailTemplate = { subject: string; body: string };
export type EmailTemplates = Record<EmailTemplateKey, EmailTemplate>;

export const EMAIL_TEMPLATE_KEYS: EmailTemplateKey[] = [
  'invitePreapproved',
  'followUpPreapproved',
  'inviteOutreach',
  'followUpOutreach',
  'approved',
  'opened',
];

const defaultBody = (intro: string) =>
  `<p>${intro}</p><p><a href="{{spotlightLink}}">Open the spotlight</a></p><p>Questions? {{supportEmail}}</p>`;

export function defaultEmailTemplates(title: string): EmailTemplates {
  return {
    invitePreapproved: {
      subject: `You're invited: ${title}`,
      body: defaultBody(`Hi {{investorName}}, you have access to ${title}.`),
    },
    followUpPreapproved: {
      subject: `Reminder: ${title}`,
      body: defaultBody(`Hi {{investorName}}, a reminder that ${title} is available to you.`),
    },
    inviteOutreach: {
      subject: `Invitation: ${title}`,
      body: defaultBody(`Hi {{investorName}}, you're invited to request access to ${title}.`),
    },
    followUpOutreach: {
      subject: `Reminder: request access to ${title}`,
      body: defaultBody(`Hi {{investorName}}, you can still request access to ${title}.`),
    },
    approved: {
      subject: `Access approved: ${title}`,
      body: defaultBody(`Hi {{investorName}}, your request to view ${title} was approved.`),
    },
    opened: {
      subject: `${title} is open`,
      body: defaultBody(`Hi {{investorName}}, ${title} is now open.`),
    },
  };
}

export function resolveViewerAccess(input: {
  hasToken: boolean;
  requestStatus: AccessRequestStatus | null;
  isPreApproved: boolean;
}): ViewerAccess {
  if (!input.hasToken) {
    return 'NONE';
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

export function mergeTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(
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
    result[key] = {
      subject: typeof record.subject === 'string' && record.subject.trim() ? record.subject : defaults[key].subject,
      body: typeof record.body === 'string' && record.body.trim() ? record.body : defaults[key].body,
    };
  }
  return result;
}

export function openNoticeCounts(recipients: { sent: boolean }[]): { willReceive: number; alreadySent: number } {
  return {
    willReceive: recipients.filter((recipient) => !recipient.sent).length,
    alreadySent: recipients.filter((recipient) => recipient.sent).length,
  };
}

export function visibleDocSendUrl(status: string, viewerAccess: ViewerAccess, url: string | null): string | null {
  return viewerAccess === 'APPROVED' && status === 'OPEN' ? url : null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
