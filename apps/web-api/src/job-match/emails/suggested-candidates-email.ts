import {
  JOB_SUGGESTED_CANDIDATES_EMAIL_UTM_SOURCE,
  teamSuggestedCandidateEmailUrl,
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

/** One criterion of the role as this candidate's stored match marked it, labelled from the role's current criteria. */
export interface SuggestedCandidateEmailCriterion {
  /** The full criterion sentence. */
  statement: string;
  /** The short label (LAB-2854); absent for an unlabelled criterion. */
  label?: string;
  matched: boolean;
}

/**
 * Which weekly email a lead gets for a role (LAB-2837 feedback), measured against the people already emailed to
 * that lead for that role:
 * - `first`: the lead has never had one for this role; every current top match, as cards.
 * - `new`: some current top matches were never in an earlier email; only those, as cards, plus how many people the
 *   lead has already seen are still on the list.
 * - `reminder`: nobody new; a short nudge listing who is still waiting (not contacted), sent once per change.
 */
export type SuggestedCandidatesEmailKind = 'first' | 'new' | 'reminder';

/**
 * What the weekly suggested-candidates email to a team lead needs (LAB-2850, design D6). LAB-2848 owns the
 * markup and copy and renders from exactly this input. Job-search status is deliberately absent: it is used
 * only to leave "Not looking" members out, and must never appear in the email.
 */
interface SuggestedCandidatesEmailBase {
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
    /** "City, Country" from the member's location; null when unknown (LAB-2865). */
    location: string | null;
    /** The role's criteria in their order, each marked met or not for this candidate (LAB-2865). */
    criteria: SuggestedCandidateEmailCriterion[];
  }>; // rank order: every top match (first), the new ones (new), or those still waiting (reminder)
  preferencesUrl: string; // ${WEB_UI_BASE_URL}/settings/email
  unsubscribeUrl: string; // ${WEB_UI_BASE_URL}/settings/email/unsubscribed?token=<token>
}

export type SuggestedCandidatesEmailInput = SuggestedCandidatesEmailBase &
  (
    | { kind: 'first' }
    /** `alreadySeenCount`: people on the current list this lead has seen in an earlier email. */
    | { kind: 'new'; alreadySeenCount: number }
    | { kind: 'reminder' }
  );

type Candidate = SuggestedCandidatesEmailBase['candidates'][number];

/**
 * Cards the email draws. The stored top suggestions per role are 5 (migration `20261007160000_job_match_suggestions`)
 * and the caller passes only the new ones, so every new candidate gets a card; the cap only guards the layout.
 */
export const MAX_CANDIDATE_CARDS = 5;

/** Criteria a card lists under "Why we suggested". */
export const MAX_CARD_CRITERIA = 3;

const EMAIL = 'renderSuggestedCandidatesEmail';

/**
 * The Strong match pill (Figma): the gradient where the client paints one, the flat fill where not.
 * Only Strong is marked (LAB-2837 feedback): every candidate here is a match, so a Good match pill said
 * nothing. A Good match card shows the name alone, as the page does.
 */
const STRONG_BADGE_STYLE =
  'background-color: #2b76b9; background-image: linear-gradient(-26deg, rgb(61, 51, 147) 8.3%, rgb(43, 118, 185) 35.6%, rgb(44, 172, 209) 63.2%, rgb(53, 235, 147) 91.7%);';

const isStrong = (candidate: Candidate) => candidate.label === 'Strong match';

/**
 * The founder email (LAB-2848, Figma design LAB-2865), in three kinds (`SuggestedCandidatesEmailKind`): a
 * headline, then one card per candidate (name, Strong band, role, location, up to three "Why we suggested"
 * criteria, View profile) — or, for a reminder, one compact list of name, role and View profile — then "All top
 * matches for this role" and Edit criteria, then the sign-off with email preferences and unsubscribe. Every
 * Candidates-page link opens `/teams/<teamUid>/applicants?role=<roleUid>&tab=suggested` (plus
 * `&suggested=<memberUid>` on a card and `&edit=criteria` on Edit criteria), UTM-tagged.
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
  const roleTitle = oneLine(input.roleTitle);
  const teamName = oneLine(input.teamName);
  const leadFirstName = firstName(input.leadName);

  const utm = (content: 'profile' | 'all' | 'criteria') => ({
    source: JOB_SUGGESTED_CANDIDATES_EMAIL_UTM_SOURCE,
    content,
    jobUid: roleUid,
  });
  const profileUrl = (memberUid: string) => teamSuggestedCandidateEmailUrl(teamUid, utm('profile'), { memberUid });
  const allUrl = teamSuggestedCandidateEmailUrl(teamUid, utm('all'));
  const criteriaUrl = teamSuggestedCandidateEmailUrl(teamUid, utm('criteria'), { editCriteria: true });

  const names = candidates.map((candidate) => oneLine(candidate.name)).join(', ');
  /* No counts in the button (LAB-2837 feedback): the page lists the role's top matches. */
  const allText = 'All top matches for this role';
  const greeting = leadFirstName ? `Hi ${leadFirstName},` : 'Hi,';
  const { subject, intro, preheader } = kindCopy(input, { count, roleTitle, names, allText });
  const seenNote = input.kind === 'new' ? alreadySeenText(input.alreadySeenCount) : '';

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
            intro(escapeHtml(roleTitle), escapeHtml(teamName)),
            font({ size: 15, line: 24, color: COLORS.text }),
            'margin: 4px 0 0 0; text-align: center;'
          ),
        ].join('\n'),
        { padding: '24px', width: 418, align: 'center' }
      ),
      row(
        input.kind === 'reminder'
          ? compactList(candidates, profileUrl)
          : candidates.map((candidate) => card(candidate, profileUrl(candidate.memberUid))).join(`\n${spacer(8)}\n`),
        { padding: '0 24px', width: 424 }
      ),
      row(
        [
          seenNote
            ? rawText(
                escapeHtml(seenNote),
                font({ size: 14, line: 20, color: COLORS.muted }),
                'margin: 0 0 16px 0; text-align: center;'
              )
            : '',
          button(allUrl, allText),
          rawText(
            link(criteriaUrl, 'Edit criteria', { weight: 500, decoration: 'rule' }),
            font({ size: 14, line: 20, weight: 500, color: COLORS.link }),
            'margin: 16px 0 0 0; text-align: center;'
          ),
        ].join('\n'),
        { padding: '24px 24px 24px 24px', align: 'center' }
      ),
    ],
  });

  const text = [
    greeting,
    '',
    intro(roleTitle, teamName),
    '',
    ...(input.kind === 'reminder'
      ? candidates.flatMap((candidate) => [
          oneLine(candidate.name),
          ...(present(candidate.role) ? [oneLine(candidate.role)] : []),
          `View profile: ${profileUrl(candidate.memberUid)}`,
          '',
        ])
      : candidates.flatMap((candidate) => cardText(candidate, profileUrl(candidate.memberUid)))),
    ...(seenNote ? [seenNote, ''] : []),
    `${allText}: ${allUrl}`,
    `Edit criteria: ${criteriaUrl}`,
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

/** Subject, intro and preheader for each kind (LAB-2837 feedback). The intro takes the role and team raw or escaped. */
function kindCopy(
  input: SuggestedCandidatesEmailInput,
  args: { count: number; roleTitle: string; names: string; allText: string }
): { subject: string; intro: (role: string, team: string) => string; preheader: string } {
  const { count, roleTitle, names, allText } = args;
  switch (input.kind) {
    case 'first':
      return {
        subject: `Top matches for your ${roleTitle} role`,
        intro: (role, team) => `Top matched members for your ${role} role at ${team}.`,
        preheader: `${names}: ${allText.toLowerCase()}.`,
      };
    case 'new':
      return {
        subject: `${count} new ${count === 1 ? 'match' : 'matches'} for ${roleTitle}`,
        intro: (role, team) =>
          `${count} new ${count === 1 ? 'member' : 'members'} matched your ${role} role at ${team} since last week.`,
        preheader: `${names}: ${allText.toLowerCase()}.`,
      };
    case 'reminder':
      return {
        subject: `Your top matches for ${roleTitle} are waiting`,
        intro: (role, team) => `Your top matches for ${role} at ${team} haven't changed since last week.`,
        preheader: `Still on your list: ${names}.`,
      };
  }
}

/** "Plus 2 matches you've already seen are still on the list." — nothing when there are none. */
function alreadySeenText(count: number): string {
  if (!(count > 0)) return '';
  return count === 1
    ? "Plus 1 match you've already seen is still on the list."
    : `Plus ${count} matches you've already seen are still on the list.`;
}

/** A card's plain-text lines: name (and band), role, location, "Why we suggested", View profile. */
function cardText(candidate: Candidate, profileUrl: string): string[] {
  const { items } = cardCriteria(candidate.criteria);
  const location = oneLine(candidate.location);
  return [
    isStrong(candidate) ? `${oneLine(candidate.name)} · ${candidate.label}` : oneLine(candidate.name),
    ...(present(candidate.role) ? [oneLine(candidate.role)] : []),
    ...(location ? [location] : []),
    ...(items.length
      ? [
          'Why we suggested:',
          ...items.map(
            (item) =>
              `${item.matched ? '✓' : '–'} ${item.label ? `${item.label}: ${item.statement}` : item.statement}${
                item.matched ? '' : ' (not met)'
              }`
          ),
        ]
      : []),
    `View profile: ${profileUrl}`,
    '',
  ];
}

/**
 * The reminder's list (LAB-2837 feedback): one grey card, a row per person — name over role on the left, View
 * profile on the right — with a hairline between rows. No band, location or criteria: the lead has seen them.
 */
function compactList(candidates: readonly Candidate[], profileUrl: (memberUid: string) => string): string {
  const rows = candidates.map((candidate, index) => {
    const url = profileUrl(candidate.memberUid);
    const role = oneLine(candidate.role);
    const pad = `padding: ${index === 0 ? 0 : 12}px 0 ${index === candidates.length - 1 ? 0 : 12}px 0;`;
    const rule = index === 0 ? '' : ` border-top: 1px solid ${COLORS.divider};`;
    return `          <tr>
            <td valign="middle" style="${pad}${rule}">${rawText(
      escapeHtml(oneLine(candidate.name)),
      font({ size: 16, line: 24, weight: 500, color: COLORS.text, tracking: -0.3 })
    )}${role ? rawText(escapeHtml(role), font({ size: 14, line: 22, color: COLORS.muted })) : ''}</td>
            <td valign="middle" align="right" style="${pad}${rule} padding-left: 12px; white-space: nowrap;">${rawText(
      `${link(url, 'View profile', { weight: 500, decoration: 'rule' })}<a href="${escapeHtml(
        url
      )}" style="text-decoration: none;">${icon('icon-arrow', 'margin-left: 2px; vertical-align: middle;')}</a>`,
      font({ size: 14, line: 20, weight: 500, color: COLORS.link })
    )}</td>
          </tr>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="${COLORS.card}" style="background-color: ${COLORS.card}; border-radius: 10px; padding: 20px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows.join('\n')}
        </table>
    </td>
  </tr>
</table>`;
}

/**
 * The criteria a card lists: met ones first, then unmet, each group in the role's order, at most
 * `MAX_CARD_CRITERIA`. Blank statements are dropped. No "N of M requirements" count (LAB-2837 feedback):
 * the card is name, role and location, and the list shows what was met.
 */
export function cardCriteria(criteria: readonly SuggestedCandidateEmailCriterion[] | null | undefined): {
  items: { statement: string; label: string; matched: boolean }[];
} {
  const all = (Array.isArray(criteria) ? criteria : [])
    .map((item) => ({
      statement: oneLine(item?.statement),
      label: oneLine(item?.label),
      matched: item?.matched === true,
    }))
    .filter((item) => item.statement !== '');
  return {
    items: [...all.filter((item) => item.matched), ...all.filter((item) => !item.matched)].slice(0, MAX_CARD_CRITERIA),
  };
}

function card(candidate: Candidate, profileUrl: string): string {
  const name = oneLine(candidate.name);
  const role = oneLine(candidate.role);
  const location = oneLine(candidate.location);
  const { items } = cardCriteria(candidate.criteria);

  const facts: string[] = [];
  if (location) {
    facts.push(
      `<td valign="middle" style="width: 14px; font-size: 0; line-height: 0;">${icon(
        'icon-map-pin',
        'vertical-align: middle;'
      )}</td>`,
      `<td valign="middle" style="padding-left: 4px; ${font({
        size: 14,
        line: 20,
        color: COLORS.meta,
      })}">${escapeHtml(location)}</td>`
    );
  }

  const badge = isStrong(candidate)
    ? `
            <td valign="top" align="right" style="padding-left: 8px; padding-top: 2px; white-space: nowrap;"><span style="display: inline-block; ${STRONG_BADGE_STYLE} padding: 2px 6px; border-radius: 26px; ${font(
        { size: 12, line: 16, weight: 500, color: '#ffffff', tracking: -0.2 }
      )} white-space: nowrap;">${escapeHtml(candidate.label)}</span></td>`
    : '';

  const lines = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="top" style="${font({
              size: 16,
              line: 24,
              weight: 500,
              color: COLORS.text,
              tracking: -0.3,
            })}">${escapeHtml(name)}</td>${badge}
          </tr>
        </table>`,
    role ? rawText(escapeHtml(role), font({ size: 14, line: 22, color: COLORS.muted })) : '',
    facts.length
      ? `${spacer(4)}<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${facts.join(
          ''
        )}</tr></table>`
      : '',
    items.length
      ? [
          rawText('Why we suggested', font({ size: 12, line: 16, color: COLORS.caption }), 'margin: 16px 0 0 0;'),
          `${spacer(8)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${items.map((item, index) => criterionRow(item, index > 0)).join('\n')}
        </table>`,
        ].join('\n')
      : '',
    rawText(
      `${link(profileUrl, 'View profile', { weight: 500, decoration: 'rule' })}<a href="${escapeHtml(
        profileUrl
      )}" style="text-decoration: none;">${icon('icon-arrow', 'margin-left: 2px; vertical-align: middle;')}</a>`,
      font({ size: 14, line: 20, weight: 500, color: COLORS.link }),
      'margin: 8px 0 0 0;'
    ),
  ].filter(Boolean);

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="${COLORS.card}" style="background-color: ${COLORS.card}; border-radius: 10px; padding: 24px;">
        ${lines.join('\n        ')}
    </td>
  </tr>
</table>`;
}

/** One "Why we suggested" item: check icon, then the label and the statement (or the statement alone). */
function criterionRow(item: { statement: string; label: string; matched: boolean }, spaced: boolean): string {
  const titleColor = item.matched ? COLORS.title : COLORS.fadedTitle;
  const metaColor = item.matched ? COLORS.meta : COLORS.fadedMeta;
  const title = item.label || item.statement;
  const lines = [
    rawText(escapeHtml(title), font({ size: 14, line: 22, color: titleColor, tracking: -0.2 })),
    item.label ? rawText(escapeHtml(item.statement), font({ size: 12, line: 18, color: metaColor })) : '',
  ].filter(Boolean);
  const top = spaced ? 6 : 0;
  return `          <tr>
            <td width="14" valign="top" style="width: 14px; padding-top: ${
              top + 4
            }px; font-size: 0; line-height: 0;">${icon('icon-check', item.matched ? '' : 'opacity: 0.4;')}</td>
            <td valign="top" style="padding-left: 8px; padding-top: ${top}px;">${lines.join('')}</td>
          </tr>`;
}
