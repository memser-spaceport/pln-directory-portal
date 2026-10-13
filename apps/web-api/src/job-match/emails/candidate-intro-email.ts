import { escapeHtml, noteToHtml } from '../../job-openings/job-openings-email-html';

/** What the intro email to a suggested candidate needs (LAB-2846). LAB-2848 owns the markup and copy. */
export interface CandidateIntroEmailInput {
  leadName: string;
  leadEmail: string;
  roleTitle: string;
  teamName: string;
  /** Trimmed plain text; the template escapes it. */
  message: string;
  /** jobBoardDetailUrl(roleUid) */
  roleUrl: string;
  /** memberProfileUrl(lead.uid) */
  leadProfileUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * TODO(LAB-2848): placeholder until LAB-2848's `renderCandidateIntroEmail` lands on `lab-2837`; replace this
 * stub with an import of that export and delete this file. Same signature, so the call site does not change.
 * Pure: renders, never sends. Every field is HTML-escaped in the html part.
 */
export function renderCandidateIntroEmail(input: CandidateIntroEmailInput): RenderedEmail {
  const subject = `${input.leadName} from ${input.teamName} would like to talk about ${input.roleTitle}`;
  // leadEmail is '' for an admin without an email; the sentence then leaves it out.
  const html = [
    `<p>${escapeHtml(input.leadName)}${input.leadEmail ? ` (${escapeHtml(input.leadEmail)})` : ''} from ${escapeHtml(
      input.teamName
    )} saw your profile and would like to talk with you about the role <a href="${escapeHtml(
      input.roleUrl
    )}">${escapeHtml(input.roleTitle)}</a>.</p>`,
    noteToHtml(input.message),
    `<p><a href="${escapeHtml(input.leadProfileUrl)}">View ${escapeHtml(input.leadName)}'s profile</a></p>`,
    '<p>Reply to this email to answer them directly.</p>',
  ].join('\n');
  const text = [
    `${input.leadName}${input.leadEmail ? ` (${input.leadEmail})` : ''} from ${
      input.teamName
    } saw your profile and would like to talk with you about the role ${input.roleTitle}.`,
    '',
    input.message,
    '',
    `Role: ${input.roleUrl}`,
    `${input.leadName}'s profile: ${input.leadProfileUrl}`,
    '',
    'Reply to this email to answer them directly.',
  ].join('\n');
  return { subject, html, text };
}
