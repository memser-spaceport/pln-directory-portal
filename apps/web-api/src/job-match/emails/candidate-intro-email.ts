import { JOB_SUGGESTED_CANDIDATE_INTRO_EMAIL_UTM_SOURCE, withEmailUtm } from '../../job-openings/job-openings-url';
import {
  button,
  COLORS,
  emailShell,
  escapeHtml,
  heading,
  link,
  multilineText,
  oneLine,
  rawParagraph,
  requireText,
  row,
  secondaryButton,
  strong,
} from './email-layout';

/** What the intro email to a suggested candidate needs (LAB-2846). LAB-2848 owns the markup and copy. */
export interface CandidateIntroEmailInput {
  leadName: string;
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
 * The candidate intro email (LAB-2848): a team lead writes to a member the job board suggested for their role.
 * It names the lead, the team and the role, carries the lead's message as plain text (newlines kept), and links
 * to the role page and the lead's profile, UTM-tagged. Replies reach the lead through Reply-To, set by the caller.
 *
 * Pure: renders, never sends. All input text is HTML-escaped. Never mentions the candidate's job-search status.
 */
export function renderCandidateIntroEmail(input: CandidateIntroEmailInput): RenderedEmail {
  const roleUrl = requireText(input.roleUrl, 'roleUrl', EMAIL);
  const leadProfileUrl = requireText(input.leadProfileUrl, 'leadProfileUrl', EMAIL);
  const leadName = oneLine(input.leadName) || 'A team lead';
  const teamName = oneLine(input.teamName);
  const roleTitle = oneLine(input.roleTitle);
  const message = (input.message ?? '').trim();
  const canReply = oneLine(input.leadEmail) !== '';

  const utm = (content: 'role' | 'profile') => ({
    source: JOB_SUGGESTED_CANDIDATE_INTRO_EMAIL_UTM_SOURCE,
    content,
    jobUid: roleUidFrom(roleUrl),
  });
  const roleLink = withEmailUtm(roleUrl, utm('role'));
  const profileLink = withEmailUtm(leadProfileUrl, utm('profile'));

  const subject = `${leadName} from ${teamName} would like to talk about ${roleTitle}`;
  const title = `${leadName} would like to talk with you`;
  const profileLabel = `View ${leadName}'s profile`;
  const replyLine = canReply
    ? `Reply to this email to answer ${leadName} directly.`
    : `To answer, reach ${leadName} through their profile.`;
  const footerReason = `You're getting this because ${teamName} found your profile a match for one of their roles on the Protocol Labs job board.`;

  const html = emailShell({
    title: subject,
    preheader: `${leadName} from ${teamName} wrote to you about ${roleTitle}.`,
    rawRows: [
      row(heading(title), '24px 24px 12px 24px'),
      row(
        rawParagraph(
          `${strong(leadName)} from ${strong(
            teamName
          )} saw your profile on the Protocol Labs network and would like to talk with you about the ${link(
            roleLink,
            roleTitle
          )} role.`
        ),
        '0 24px 20px 24px'
      ),
      ...(message
        ? [
            row(
              `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding: 4px 0 4px 16px; border-left: 3px solid ${
                COLORS.border
              };">${multilineText(message)}</td></tr></table>`,
              '0 24px 12px 24px'
            ),
          ]
        : []),
      row(
        `<p style="margin: 0;">${button(roleLink, 'View the role')}&nbsp;&nbsp;${secondaryButton(
          profileLink,
          profileLabel
        )}</p>`,
        '8px 24px 16px 24px'
      ),
      row(rawParagraph(escapeHtml(replyLine)), '0 24px 24px 24px'),
    ],
    rawFooter: `<p style="margin: 0; font-size: 12px; line-height: 18px; color: ${COLORS.footer};">${escapeHtml(
      footerReason
    )}</p>`,
  });

  const text = [
    `${leadName} from ${teamName} saw your profile on the Protocol Labs network and would like to talk with you about the ${roleTitle} role.`,
    '',
    ...(message ? [message, ''] : []),
    `View the role: ${roleLink}`,
    `${profileLabel}: ${profileLink}`,
    '',
    replyLine,
    '',
    footerReason,
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
