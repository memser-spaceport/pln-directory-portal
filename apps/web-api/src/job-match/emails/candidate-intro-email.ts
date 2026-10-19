import {
  JOB_SUGGESTED_CANDIDATE_INTRO_EMAIL_UTM_SOURCE,
  webUiBase,
  withEmailUtm,
} from '../../job-openings/job-openings-url';
import {
  COLORS,
  emailShell,
  escapeHtml,
  firstName,
  font,
  FOOTER_REASON,
  link,
  multilineText,
  oneLine,
  rawText,
  requireText,
  row,
} from './email-layout';

/** What the intro email to a suggested candidate needs (LAB-2846). LAB-2848 owns the markup and copy. */
export interface CandidateIntroEmailInput {
  /** The candidate's name, for "Hi <first name>," (LAB-2865). */
  candidateName: string;
  leadName: string;
  /** The lead's own role (`Member.role`), shown before the team name; null when unknown (LAB-2865). */
  leadRole: string | null;
  /** The caller sets it as Reply-To; '' for an admin without an email. Never printed in the body. */
  leadEmail: string;
  roleTitle: string;
  teamName: string;
  /** Trimmed plain text; the template escapes it. */
  message: string;
  /** jobBoardDetailUrl(roleUid), untagged; the template adds the UTM tags. */
  roleUrl: string;
  /** memberProfileUrl(lead.uid), untagged; the template adds the UTM tags. */
  leadProfileUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const EMAIL = 'renderCandidateIntroEmail';

/**
 * The candidate intro email (LAB-2848, Figma design LAB-2865): a team lead writes to a member the job board
 * suggested for their role. It names the lead (linked to their profile), their role and team, and the role
 * (linked to its page), carries the lead's message as plain text (newlines kept), and tells the candidate to
 * reply. Replies reach the lead through Reply-To, set by the caller. Links are UTM-tagged.
 *
 * Pure: renders, never sends. All input text is HTML-escaped. Never mentions the candidate's job-search status.
 */
export function renderCandidateIntroEmail(input: CandidateIntroEmailInput): RenderedEmail {
  const roleUrl = requireText(input.roleUrl, 'roleUrl', EMAIL);
  const leadProfileUrl = requireText(input.leadProfileUrl, 'leadProfileUrl', EMAIL);
  const leadName = oneLine(input.leadName) || 'A team lead';
  const leadFirst = firstName(input.leadName);
  const leadRole = oneLine(input.leadRole);
  const candidateFirst = firstName(input.candidateName);
  const teamName = oneLine(input.teamName);
  const roleTitle = oneLine(input.roleTitle);
  const message = (input.message ?? '').trim();
  const canReply = oneLine(input.leadEmail) !== '';
  const preferencesUrl = `${webUiBase()}/settings/email`;

  const utm = (content: 'role' | 'profile') => ({
    source: JOB_SUGGESTED_CANDIDATE_INTRO_EMAIL_UTM_SOURCE,
    content,
    jobUid: roleUidFrom(roleUrl),
  });
  const roleLink = withEmailUtm(roleUrl, utm('role'));
  const profileLink = withEmailUtm(leadProfileUrl, utm('profile'));

  const subject = `${leadName} from ${teamName} would like to talk about ${roleTitle}`;
  const greeting = candidateFirst ? `Hi ${candidateFirst},` : 'Hi,';
  const from = [leadRole, teamName].filter(Boolean).join(', ');
  const sentence = (rawLead: string, rawFrom: string, rawRole: string) =>
    `${rawLead} — ${rawFrom} thinks you will be a good fit for ${rawRole} role.`;
  const wrote = `${leadFirst || 'The team lead'} wrote:`;
  const replyLine = canReply
    ? `Reply to this email to respond to ${leadFirst || 'the team lead'} directly.`
    : `You can reach ${leadFirst || 'the team lead'} through their profile.`;

  const body = font({ size: 14, line: 22, color: COLORS.text, tracking: -0.2 });
  const inlineLink = (href: string, text: string) => link(href, escapeHtml(text), { size: 14, line: 20 });
  const caption = font({ size: 12, line: 16, weight: 500, color: COLORS.caption });

  const html = emailShell({
    title: subject,
    preheader: `${leadName} from ${teamName} wrote to you about ${roleTitle}.`,
    preferencesUrl,
    rawRows: [
      row(
        [
          rawText(escapeHtml(greeting), font({ size: 16, line: 24, weight: 500, color: COLORS.text, tracking: -0.3 })),
          rawText(
            sentence(inlineLink(profileLink, leadName), escapeHtml(from), inlineLink(roleLink, roleTitle)),
            body,
            'margin: 4px 0 0 0;'
          ),
          ...(message
            ? [
                rawText(escapeHtml(wrote), font({ size: 14, line: 22, color: COLORS.muted }), 'margin: 16px 0 0 0;'),
                `<div style="margin: 4px 0 0 0;">${multilineText(message, body)}</div>`,
              ]
            : []),
        ].join('\n'),
        { padding: '24px 24px 0 24px', width: 418 }
      ),
      row(
        rawText(
          canReply
            ? escapeHtml(replyLine)
            : `You can reach ${escapeHtml(leadFirst || 'the team lead')} through ${link(profileLink, 'their profile', {
                size: 12,
                line: 16,
                weight: 500,
              })}.`,
          caption,
          'margin: 0; text-align: center;'
        ),
        { padding: '24px 24px 32px 24px', width: 418, align: 'center' }
      ),
    ],
  });

  const text = [
    greeting,
    '',
    sentence(leadName, from, roleTitle),
    `${leadName}: ${profileLink}`,
    `${roleTitle}: ${roleLink}`,
    '',
    ...(message ? [wrote, message, ''] : []),
    canReply ? replyLine : `${replyLine} ${profileLink}`,
    '',
    'Cheers,',
    'The LabOS Team',
    '',
    FOOTER_REASON,
    `Manage your email preferences: ${preferencesUrl}`,
    '',
  ].join('\n');

  return { subject, html, text };
}

/** The role uid for `job_uid`: the last path segment of the role page (`/jobs/openings/<uid>`). */
function roleUidFrom(roleUrl: string): string {
  const path = roleUrl.split(/[?#]/)[0].replace(/\/+$/, '');
  const last = path.slice(path.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
