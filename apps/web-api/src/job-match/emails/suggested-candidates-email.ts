import { escapeHtml } from '../../job-openings/job-openings-email-html';
import type { RenderedEmail } from './candidate-intro-email';

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
 * TODO(LAB-2848): placeholder until LAB-2848's `renderSuggestedCandidatesEmail` lands on `lab-2837`; replace this
 * stub with an import of that export and delete this file. Same signature, so the call site does not change.
 * Pure: renders, never sends. Every field is HTML-escaped in the html part.
 */
export function renderSuggestedCandidatesEmail(input: SuggestedCandidatesEmailInput): RenderedEmail {
  const count = input.candidates.length;
  const noun = count === 1 ? 'candidate' : 'candidates';
  const subject = `${count} new suggested ${noun} for ${input.roleTitle}`;
  const intro = `Hi ${input.leadName}, ${count} new suggested ${noun} for ${input.roleTitle} at ${input.teamName}.`;
  const total = `The Suggested tab lists ${input.totalMatchCount} in total.`;

  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    '<ul>',
    ...input.candidates.map((candidate) => {
      const image = candidate.imageUrl
        ? `<img src="${escapeHtml(candidate.imageUrl)}" alt="" width="40" height="40" /> `
        : '';
      const role = candidate.role ? `, ${escapeHtml(candidate.role)}` : '';
      const blurb = candidate.blurb ? `<br />${escapeHtml(candidate.blurb)}` : '';
      return `<li>${image}<strong>${escapeHtml(candidate.name)}</strong>${role} (${escapeHtml(
        candidate.label
      )})${blurb}</li>`;
    }),
    '</ul>',
    `<p>${escapeHtml(total)}</p>`,
    `<p><a href="${escapeHtml(input.preferencesUrl)}">Email preferences</a> · <a href="${escapeHtml(
      input.unsubscribeUrl
    )}">Unsubscribe from these emails</a></p>`,
  ].join('\n');

  const text = [
    intro,
    '',
    ...input.candidates.map((candidate) =>
      [
        `- ${candidate.name}${candidate.role ? `, ${candidate.role}` : ''} (${candidate.label})`,
        candidate.blurb ? `  ${candidate.blurb}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    ),
    '',
    total,
    '',
    `Email preferences: ${input.preferencesUrl}`,
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join('\n');

  return { subject, html, text };
}
