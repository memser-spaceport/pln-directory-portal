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
  };
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
