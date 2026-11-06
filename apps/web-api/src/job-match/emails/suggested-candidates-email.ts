import {
  jobBoardDetailUrl,
  JOB_SUGGESTED_CANDIDATES_EMAIL_UTM_SOURCE,
  teamSuggestedCandidateEmailUrl,
  withEmailUtm,
} from '../../job-openings/job-openings-url';
import type { RenderedEmail } from './candidate-intro-email';
import {
  button,
  COLORS,
  emailShell,
  escapeHtml,
  firstName,
  font,
  FOOTER_REASON,
  icon,
  link,
  oneLine,
  present,
  rawText,
  requireText,
  row,
  spacer,
} from './email-layout';

/**
 * Which weekly email a lead gets for a team (LAB-3139), measured against the people already emailed to that lead
 * for each role:
 * - `first`: the lead has never had one for any of these roles.
 * - `new`: someone in a role was never in an earlier email; fresh people come first in their role.
 * - `reminder`: nobody new; who is still waiting (not contacted), sent once per change.
 */
export type SuggestedCandidatesEmailKind = 'first' | 'new' | 'reminder';

export interface SuggestedCandidatesEmailCandidate {
  memberUid: string;
  name: string;
  role: string | null;
  /** The member's current company, as their profile states it. */
  company: string | null;
  /** "City, Country" from the member's location; null when unknown. */
  location: string | null;
  imageUrl: string | null;
  label: 'Strong match' | 'Good match';
  /** The one "Why" line: the run's sentence on why this person fits. */
  blurb: string | null;
  /** How many of the role's requirements the person meets; null when the role has none. */
  requirements: { met: number; total: number } | null;
}

export interface SuggestedCandidatesEmailRole {
  roleUid: string;
  roleTitle: string;
  /** Everyone counted for the role ("N matches"). */
  matchCount: number;
  /** How many of those matches have applied to the role. */
  appliedCount: number;
  /** The cards, in order (at most `MAX_ROLE_CARDS`). */
  candidates: SuggestedCandidatesEmailCandidate[];
}

/**
 * What the weekly suggested-candidates email to a team lead needs (LAB-3139: one email per team, up to three
 * roles). Job-search status is deliberately absent: it is used only to leave "Not looking" members out, and must
 * never appear in the email.
 */
export interface SuggestedCandidatesEmailInput {
  kind: SuggestedCandidatesEmailKind;
  leadName: string;
  teamUid: string;
  teamName: string;
  /** Most recently published first. */
  roles: SuggestedCandidatesEmailRole[];
  /** Distinct members across the roles' matches ("Review all N candidates"). */
  memberCount: number;
  /** Distinct members new to this lead (the `new` intro and subject). */
  newCount: number;
  /** Roles with someone new to this lead (the `new` subject). */
  newRoleCount: number;
  preferencesUrl: string; // ${WEB_UI_BASE_URL}/settings/email
  unsubscribeUrl: string; // ${WEB_UI_BASE_URL}/settings/email/unsubscribed?token=<token>
}

type Candidate = SuggestedCandidatesEmailCandidate;
type Role = SuggestedCandidatesEmailRole;
/** A role's links: the public posting, the Candidates page, and one person on it. */
type RoleUrls = { role: string; all: string; profile: (memberUid: string) => string };

const EMAIL = 'renderSuggestedCandidatesEmail';

/** The Strong match pill (LAB-3139): a solid fill, since some clients drop gradients. Only Strong is marked. */
const isStrong = (candidate: Candidate) => candidate.label === 'Strong match';

/** Initials-avatar tints from the Figma (blue, green, peach), picked by name so a person keeps theirs. */
const AVATAR_TINTS = ['#dee8ff', '#dcf4e7', '#faeadc'] as const;

type UtmContent = 'profile' | 'all' | 'role' | 'review_all';

/**
 * The founder email (LAB-3139, Figma "Email templates | Protocol Labs" 13252:1368 / 13253:1187): a greeting and one
 * intro line, then per role its title with View role, "N matches · none have applied", up to two cards (avatar,
 * name, Strong match, role · company and location, the Why line, "N of M requirements", View profile) and "All N
 * matches for this role", then one "Review all N candidates" button and the sign-off with email preferences and
 * unsubscribe. Candidates-page links open `/teams/<teamUid>/applicants?role=<roleUid>&tab=suggested` (plus
 * `&suggested=<memberUid>` on a card), UTM-tagged; View role opens the public posting.
 *
 * Pure: renders, never sends. All input text is HTML-escaped. Throws, so nothing is sent with a broken link, when
 * there is no role, a role has no candidate, or a uid is missing.
 */
export function renderSuggestedCandidatesEmail(input: SuggestedCandidatesEmailInput): RenderedEmail {
  const teamUid = requireText(input.teamUid, 'teamUid', EMAIL);
  if (!Array.isArray(input.roles) || input.roles.length === 0) {
    throw new Error(`${EMAIL}: at least one role is required`);
  }
  input.roles.forEach((role, index) => {
    requireText(role.roleUid, `roles[${index}].roleUid`, EMAIL);
    if (!Array.isArray(role.candidates) || role.candidates.length === 0) {
      throw new Error(`${EMAIL}: roles[${index}] needs at least one candidate`);
    }
    role.candidates.forEach((candidate, at) =>
      requireText(candidate.memberUid, `roles[${index}].candidates[${at}].memberUid`, EMAIL)
    );
  });

  const roles = input.roles;
  const teamName = oneLine(input.teamName);
  const leadFirstName = firstName(input.leadName);
  const greeting = leadFirstName ? `Hi ${leadFirstName},` : 'Hi,';

  const utm = (content: UtmContent, roleUid: string) => ({
    source: JOB_SUGGESTED_CANDIDATES_EMAIL_UTM_SOURCE,
    content,
    jobUid: roleUid,
  });
  const urls = (role: Role): RoleUrls => ({
    role: withEmailUtm(jobBoardDetailUrl(role.roleUid), utm('role', role.roleUid)),
    all: teamSuggestedCandidateEmailUrl(teamUid, utm('all', role.roleUid)),
    profile: (memberUid: string) =>
      teamSuggestedCandidateEmailUrl(teamUid, utm('profile', role.roleUid), { memberUid }),
  });
  const reviewAllUrl = teamSuggestedCandidateEmailUrl(teamUid, utm('review_all', roles[0].roleUid));
  const memberCount = Math.max(input.memberCount, 1);
  const reviewAllText = `Review all ${memberCount} ${memberCount === 1 ? 'candidate' : 'candidates'}`;

  const { subject, intro } = kindCopy(input, teamName);
  const preheader = `${roles
    .flatMap((role) => role.candidates.map((candidate) => oneLine(candidate.name)))
    .slice(0, 4)
    .join(', ')} and more, matched to ${roles.map((role) => oneLine(role.roleTitle)).join(', ')}.`;

  const html = emailShell({
    title: subject,
    preheader,
    preferencesUrl: input.preferencesUrl,
    unsubscribeUrl: input.unsubscribeUrl,
    rawRows: [
      row(
        [
          rawText(
            escapeHtml(greeting),
            font({ size: 16, line: 24, weight: 500, color: COLORS.text, tracking: -0.3 }),
            'margin: 0; text-align: center;'
          ),
          rawText(
            escapeHtml(intro),
            font({ size: 15, line: 24, color: COLORS.text }),
            'margin: 4px 0 0 0; text-align: center;'
          ),
        ].join('\n'),
        { padding: '24px', width: 418, align: 'center' }
      ),
      row(roles.map((role) => roleSection(role, urls(role))).join(`\n${spacer(40)}\n`), {
        padding: '0 24px',
        width: 386,
      }),
      row(button(reviewAllUrl, reviewAllText, { fullOnPhone: true }), {
        padding: '24px 24px 24px 24px',
        width: 386,
        align: 'center',
      }),
    ],
  });

  const text = [
    greeting,
    '',
    intro,
    '',
    ...roles.flatMap((role) => roleText(role, urls(role))),
    `${reviewAllText}: ${reviewAllUrl}`,
    '',
    'Cheers,',
    'The LabOS Team',
    '',
    FOOTER_REASON,
    `Manage your email preferences: ${input.preferencesUrl}`,
    `Unsubscribe: ${input.unsubscribeUrl}`,
    '',
  ].join('\n');

  return { subject, html, text };
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** Subject and intro for each kind (LAB-3139). */
function kindCopy(input: SuggestedCandidatesEmailInput, teamName: string): { subject: string; intro: string } {
  const roles = input.roles;
  const onlyTitle = oneLine(roles[0].roleTitle);
  const roleCount = roles.length;
  const applied = roles.reduce((sum, role) => sum + Math.max(role.appliedCount, 0), 0);
  const noneApplied = applied === 0 ? ' None have applied yet.' : '';
  const strongest = roleCount > 1 ? 'Here are the strongest for each.' : 'Here are the strongest.';
  const openRoles = roleCount > 1 ? 'roles' : `${onlyTitle} role`;

  switch (input.kind) {
    case 'first': {
      const count = input.memberCount;
      const target = roleCount > 1 ? `${roleCount} of your` : 'your';
      return {
        subject: `${count} ${plural(count, 'member matches', 'members match')} ${
          roleCount > 1 ? `${roleCount} of your roles` : `your ${onlyTitle} role`
        }`,
        intro: `${count} ${plural(count, 'member', 'members')} of the Protocol Labs network ${plural(
          count,
          'matches',
          'match'
        )} ${target} open ${roleCount > 1 ? 'roles' : `${onlyTitle} role`} at ${teamName}. ${strongest}${noneApplied}`,
      };
    }
    case 'new': {
      const count = input.newCount;
      const newRoles = Math.max(input.newRoleCount, 1);
      return {
        subject: `${count} new ${plural(count, 'member matches', 'members match')} ${
          newRoles > 1 ? `${newRoles} of your roles` : roleCount > 1 ? 'one of your roles' : `your ${onlyTitle} role`
        }`,
        intro: `${count} new ${plural(
          count,
          'member',
          'members'
        )} of the Protocol Labs network matched your open ${openRoles} at ${teamName} since last week. ${strongest}${noneApplied}`,
      };
    }
    case 'reminder':
      return {
        subject:
          roleCount > 1
            ? `Your top matches for ${roleCount} roles are waiting`
            : `Your top matches for ${onlyTitle} are waiting`,
        intro: `No new members matched your open ${openRoles} at ${teamName} since last week. Here are your strongest matches.`,
      };
  }
}

/** "5 matches · none have applied" / "· 1 has applied" / "· 2 have applied". */
export function roleMeta(role: Pick<Role, 'matchCount' | 'appliedCount'>): string {
  const applied = Math.max(role.appliedCount, 0);
  const appliedText = applied === 0 ? 'none have applied' : applied === 1 ? '1 has applied' : `${applied} have applied`;
  return `${role.matchCount} ${plural(role.matchCount, 'match', 'matches')} · ${appliedText}`;
}

/** "Senior Engineer · Saturn, Porto, Portugal": role, then company and location; parts that are unknown drop out. */
export function personLine(candidate: Pick<Candidate, 'role' | 'company' | 'location'>): string {
  const where = [oneLine(candidate.company), oneLine(candidate.location)].filter(Boolean).join(', ');
  return [oneLine(candidate.role), where].filter(Boolean).join(' · ');
}

/** "5 of 5 requirements"; '' when the role has none. */
export function requirementsText(requirements: Candidate['requirements']): string {
  if (!requirements || !(requirements.total > 0)) return '';
  return `${requirements.met} of ${requirements.total} ${plural(requirements.total, 'requirement', 'requirements')}`;
}

/** Up to two initials from a name: "Inês Carvalho" → "IC". */
export function initials(name: string): string {
  const words = oneLine(name).split(' ').filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
}

function avatarTint(memberUid: string): string {
  let hash = 0;
  for (const char of memberUid) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

function roleText(role: Role, url: RoleUrls): string[] {
  return [
    oneLine(role.roleTitle),
    `View role: ${url.role}`,
    roleMeta(role),
    '',
    ...role.candidates.flatMap((candidate) => {
      const line = personLine(candidate);
      const why = oneLine(candidate.blurb);
      const requirements = requirementsText(candidate.requirements);
      return [
        isStrong(candidate) ? `${oneLine(candidate.name)} · ${candidate.label}` : oneLine(candidate.name),
        ...(line ? [line] : []),
        ...(why ? [why] : []),
        ...(requirements ? [requirements] : []),
        `View profile: ${url.profile(candidate.memberUid)}`,
        '',
      ];
    }),
    `All ${role.matchCount} ${plural(role.matchCount, 'match', 'matches')} for this role: ${url.all}`,
    '',
  ];
}

const arrowLink = (href: string, text: string) =>
  `${link(href, escapeHtml(text), { weight: 500, decoration: 'rule' })}<a href="${escapeHtml(
    href
  )}" style="text-decoration: none;">${icon('icon-arrow', 'margin-left: 2px; vertical-align: middle;')}</a>`;

function roleSection(role: Role, url: RoleUrls): string {
  const linkStyle = font({ size: 14, line: 20, weight: 500, color: COLORS.link, tracking: -0.2 });
  const header = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td valign="top" style="${font({
      size: 18,
      line: 24,
      weight: 600,
      color: COLORS.text,
      tracking: -0.3,
    })}">${escapeHtml(oneLine(role.roleTitle))}</td>
    <td valign="top" align="right" style="padding-left: 12px; padding-top: 2px; white-space: nowrap; ${linkStyle}">${arrowLink(
    url.role,
    'View role'
  )}</td>
  </tr>
</table>
${rawText(
  escapeHtml(roleMeta(role)),
  font({ size: 14, line: 18, color: COLORS.meta, tracking: -0.2 }),
  'margin: 2px 0 0 0;'
)}`;

  const cards = role.candidates
    .map((candidate) => card(candidate, url.profile(candidate.memberUid)))
    .join(`\n${spacer(8)}\n`);
  const all = rawText(
    arrowLink(url.all, `All ${role.matchCount} ${plural(role.matchCount, 'match', 'matches')} for this role`),
    linkStyle,
    'margin: 0;'
  );
  return [header, spacer(12), cards, spacer(12), all].join('\n');
}

function avatar(candidate: Candidate): string {
  const letters = escapeHtml(initials(candidate.name));
  const letterStyle = font({ size: 14, line: 20, weight: 500, color: COLORS.meta, tracking: -0.2 });
  /* A photo where the member has one; its alt text is the initials, styled, for clients that block images. */
  const inner = present(candidate.imageUrl)
    ? `<img src="${escapeHtml(
        candidate.imageUrl
      )}" width="40" height="40" alt="${letters}" style="display: block; width: 40px; height: 40px; border: 0; border-radius: 20px; object-fit: cover; ${letterStyle} text-align: center;" />`
    : letters;
  return `<td width="40" valign="middle" style="width: 40px; padding-right: 12px;">
            <table role="presentation" width="40" cellpadding="0" cellspacing="0" border="0" style="width: 40px;">
              <tr>
                <td width="40" height="40" align="center" valign="middle" bgcolor="${avatarTint(
                  candidate.memberUid
                )}" style="width: 40px; height: 40px; border-radius: 20px; background-color: ${avatarTint(
    candidate.memberUid
  )}; text-align: center; ${letterStyle}">${inner}</td>
              </tr>
            </table>
          </td>`;
}

function card(candidate: Candidate, profileUrl: string): string {
  const name = oneLine(candidate.name);
  const line = personLine(candidate);
  const why = oneLine(candidate.blurb);
  const requirements = requirementsText(candidate.requirements);

  const badge = isStrong(candidate)
    ? `<td valign="top" align="right" style="padding-left: 10px; padding-top: 1px; white-space: nowrap;"><span style="display: inline-block; background-color: ${
        COLORS.link
      }; padding: 2px 6px; border-radius: 26px; ${font({
        size: 12,
        line: 16,
        weight: 500,
        color: '#ffffff',
        tracking: -0.2,
      })} white-space: nowrap;">${escapeHtml(candidate.label)}</span></td>`
    : '';

  const person = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
          ${avatar(candidate)}
          <td valign="middle">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="top" style="${font({
                  size: 16,
                  line: 24,
                  weight: 500,
                  color: COLORS.text,
                  tracking: -0.3,
                })}">${escapeHtml(name)}</td>${badge}
              </tr>
            </table>
            ${
              line
                ? rawText(
                    escapeHtml(line),
                    font({ size: 14, line: 22, color: COLORS.meta, tracking: -0.2 }),
                    'margin: 2px 0 0 0;'
                  )
                : ''
            }
          </td>
          </tr>
        </table>`;

  const footerRow = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 8px;">
          <tr>
            <td valign="middle" style="${font({
              size: 12,
              line: 18,
              color: COLORS.meta,
              tracking: -0.2,
            })}">${escapeHtml(requirements)}</td>
            <td valign="middle" align="right" style="white-space: nowrap; ${font({
              size: 14,
              line: 20,
              weight: 500,
              color: COLORS.link,
              tracking: -0.2,
            })}">${arrowLink(profileUrl, 'View profile')}</td>
          </tr>
        </table>`;

  const lines = [
    person,
    why
      ? rawText(
          escapeHtml(why),
          font({ size: 14, line: 20, color: COLORS.text, tracking: -0.2 }),
          'margin: 12px 0 0 0;'
        )
      : '',
    why ? footerRow : `${spacer(4)}${footerRow}`,
  ].filter(Boolean);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="${COLORS.card}" style="background-color: ${COLORS.card}; border-radius: 10px; padding: 24px;">
        ${lines.join('\n        ')}
    </td>
  </tr>
</table>`;
}
