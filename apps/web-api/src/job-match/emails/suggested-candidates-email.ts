import {
  JOB_SUGGESTED_CANDIDATES_EMAIL_UTM_SOURCE,
  teamSuggestedCandidateEmailUrl,
} from '../../job-openings/job-openings-url';
import type { RenderedEmail } from './candidate-intro-email';
import {
  avatar,
  button,
  COLORS,
  emailShell,
  escapeHtml,
  heading,
  link,
  oneLine,
  present,
  rawParagraph,
  requireText,
  row,
  strong,
} from './email-layout';

/**
 * What the weekly suggested-candidates email to a team lead needs (LAB-2850, design D6). LAB-2848 owns the
 * markup and copy and renders from exactly this input. Job-search status is deliberately absent: it is used
 * only to leave "Not looking" members out, and must never appear in the email.
 */
export interface SuggestedCandidatesEmailInput {
  leadName: string;
  teamUid: string;
  teamName: string;
  roleUid: string;
  roleTitle: string;
  candidates: Array<{
    memberUid: string;
    name: string;
    role: string | null;
    imageUrl: string | null;
    label: 'Strong match' | 'Good match';
    blurb: string | null;
  }>; // new candidates only, rank order
  totalMatchCount: number;
  preferencesUrl: string; // ${WEB_UI_BASE_URL}/settings/email
  unsubscribeUrl: string; // ${WEB_UI_BASE_URL}/settings/email/unsubscribed?token=<token>
}

/**
 * Cards the email draws. The stored top suggestions per role are 5 (migration `20261007160000_job_match_suggestions`)
 * and the caller passes only the new ones, so every new candidate gets a card; the cap only guards the layout.
 */
export const MAX_CANDIDATE_CARDS = 5;

const EMAIL = 'renderSuggestedCandidatesEmail';

/** The match band's pill: the Candidates page's gradient where the client paints one, a flat fill where not. */
const BADGE_STYLE: Record<SuggestedCandidatesEmailInput['candidates'][number]['label'], string> = {
  'Strong match':
    'background-color: #4f7fc7; background-image: linear-gradient(110deg, #8ae6a2 0%, #5b97d4 45%, #352a9a 100%);',
  'Good match':
    'background-color: #5f9c97; background-image: linear-gradient(110deg, #6a9aa3 0%, #7cbf98 50%, #64a39e 100%);',
};

/**
 * The founder email (LAB-2848): one card per new suggested candidate with View profile, then "All N matches for
 * this role" and Edit criteria, then email preferences and unsubscribe. Every Candidates-page link opens
 * `/teams/<teamUid>/applicants?role=<roleUid>&tab=suggested` (plus `&suggested=<memberUid>` on a card and
 * `&edit=criteria` on Edit criteria), UTM-tagged.
 *
 * Pure: renders, never sends. All input text is HTML-escaped. Throws, so nothing is sent with a broken link,
 * when there are no candidates or `teamUid` / `roleUid` is missing.
 */
export function renderSuggestedCandidatesEmail(input: SuggestedCandidatesEmailInput): RenderedEmail {
  const teamUid = requireText(input.teamUid, 'teamUid', EMAIL);
  const roleUid = requireText(input.roleUid, 'roleUid', EMAIL);
  if (!Array.isArray(input.candidates) || input.candidates.length === 0) {
    throw new Error(`${EMAIL}: at least one candidate is required`);
  }
  input.candidates.forEach((candidate, index) =>
    requireText(candidate.memberUid, `candidates[${index}].memberUid`, EMAIL)
  );

  const candidates = input.candidates.slice(0, MAX_CANDIDATE_CARDS);
  const count = input.candidates.length;
  const one = count === 1;
  const total = Math.max(input.totalMatchCount, count);
  const roleTitle = oneLine(input.roleTitle);
  const teamName = oneLine(input.teamName);
  const leadName = oneLine(input.leadName);

  const utm = (content: 'profile' | 'all' | 'criteria') => ({
    source: JOB_SUGGESTED_CANDIDATES_EMAIL_UTM_SOURCE,
    content,
    jobUid: roleUid,
  });
  const profileUrl = (memberUid: string) => teamSuggestedCandidateEmailUrl(teamUid, utm('profile'), { memberUid });
  const allUrl = teamSuggestedCandidateEmailUrl(teamUid, utm('all'));
  const criteriaUrl = teamSuggestedCandidateEmailUrl(teamUid, utm('criteria'), { editCriteria: true });

  const subject = `${count} new suggested ${one ? 'candidate' : 'candidates'} for ${roleTitle}`;
  const allText = `All ${total} ${total === 1 ? 'match' : 'matches'} for this role`;
  const greeting = leadName ? `Hi ${leadName},` : 'Hi,';
  const who = one ? 'This member' : 'These members';
  const verbs = one ? 'matches' : 'match';
  const applied = one ? "hasn't" : "haven't";
  const footerReason =
    `You're getting this because you lead ${teamName}, which posted ${roleTitle} on the job board. ` +
    'At most one a week per role.';

  const html = emailShell({
    title: subject,
    preheader: `${candidates.map((candidate) => oneLine(candidate.name)).join(', ')}: ${allText.toLowerCase()}.`,
    rawRows: [
      row(heading(subject), '24px 24px 12px 24px'),
      row(
        rawParagraph(
          `${escapeHtml(greeting)} ${escapeHtml(who.toLowerCase())} of the Protocol Labs network ${verbs} your ${strong(
            roleTitle
          )} role at ${strong(teamName)} and ${applied} applied yet.`
        ),
        '0 24px 20px 24px'
      ),
      ...candidates.map((candidate) => row(card(candidate, profileUrl(candidate.memberUid)), '0 24px 12px 24px')),
      row(
        `<p style="margin: 0; font-size: 14px; line-height: 20px;">${link(allUrl, allText)}<span style="color: ${
          COLORS.footer
        };">&nbsp;&middot;&nbsp;</span>${link(criteriaUrl, 'Edit criteria')}</p>`,
        '8px 24px 24px 24px'
      ),
    ],
    rawFooter: [
      `<p style="margin: 0; font-size: 12px; line-height: 18px; color: ${COLORS.footer};">${escapeHtml(
        footerReason
      )}</p>`,
      `<p style="margin: 8px 0 0 0; font-size: 12px; line-height: 18px; color: ${COLORS.footer};">${link(
        input.preferencesUrl,
        'Email preferences',
        COLORS.footer
      )}&nbsp;&middot;&nbsp;${link(input.unsubscribeUrl, 'Unsubscribe', COLORS.footer)}</p>`,
    ].join('\n'),
  });

  const text = [
    greeting,
    '',
    `${count} new suggested ${
      one ? 'candidate' : 'candidates'
    } for ${roleTitle} at ${teamName}. ${who} of the Protocol Labs network ${verbs} the role and ${applied} applied yet.`,
    '',
    ...candidates.flatMap((candidate) => [
      `${oneLine(candidate.name)} · ${candidate.label}`,
      ...(present(candidate.role) ? [oneLine(candidate.role)] : []),
      ...(present(candidate.blurb) ? [oneLine(candidate.blurb)] : []),
      `View profile: ${profileUrl(candidate.memberUid)}`,
      '',
    ]),
    `${allText}: ${allUrl}`,
    `Edit criteria: ${criteriaUrl}`,
    '',
    footerReason,
    `Email preferences: ${input.preferencesUrl}`,
    `Unsubscribe: ${input.unsubscribeUrl}`,
    '',
  ].join('\n');

  return { subject, html, text };
}

function card(candidate: SuggestedCandidatesEmailInput['candidates'][number], profileUrl: string): string {
  const name = oneLine(candidate.name);
  const lines = [
    `<p style="margin: 0; font-size: 16px; line-height: 22px; font-weight: 600; color: ${COLORS.heading};">${escapeHtml(
      name
    )}&nbsp;&nbsp;<span style="display: inline-block; ${
      BADGE_STYLE[candidate.label] ?? BADGE_STYLE['Good match']
    } color: #ffffff; padding: 2px 8px; border-radius: 999px; font-size: 12px; line-height: 16px; font-weight: 500; white-space: nowrap; vertical-align: 1px;">${escapeHtml(
      candidate.label
    )}</span></p>`,
    present(candidate.role)
      ? `<p style="margin: 4px 0 0 0; font-size: 14px; line-height: 20px; color: ${COLORS.meta};">${escapeHtml(
          oneLine(candidate.role)
        )}</p>`
      : '',
    present(candidate.blurb)
      ? `<p style="margin: 8px 0 0 0; font-size: 14px; line-height: 20px; color: ${COLORS.body};">${escapeHtml(
          oneLine(candidate.blurb)
        )}</p>`
      : '',
    `<p style="margin: 12px 0 0 0;">${button(profileUrl, 'View profile')}</p>`,
  ].filter(Boolean);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid ${
    COLORS.border
  }; border-radius: 12px;">
  <tr>
    <td width="40" valign="top" style="width: 40px; padding: 16px 0 16px 16px;">${avatar(name, candidate.imageUrl)}</td>
    <td valign="top" style="padding: 16px;">
${lines.join('\n')}
    </td>
  </tr>
</table>`;
}
