import { escapeHtml } from '../../job-openings/job-openings-email-html';
import { webUiBase } from '../../job-openings/job-openings-url';

/**
 * Email-safe building blocks shared by the job-match emails (LAB-2848): table layout, inline styles only, no
 * external CSS, absolute image URLs. The shell, palette and type scale are `shared/jobAlertDigest.hbs`'s, so the
 * hiring emails read as one family. Inlined in TypeScript rather than loaded from `.hbs` files: webpack bundles
 * them, so there is no asset to list in project.json and no `__dirname` path to resolve at runtime or in jest.
 *
 * Every helper here takes text and escapes it; `raw*` parameters are already-built HTML from these helpers.
 */

export const COLORS = {
  heading: '#0F172A',
  body: '#475569',
  meta: '#64748B',
  border: '#E2E8F0',
  link: '#156FF7',
  footer: '#94A3B8',
  avatar: '#F1F5F9',
} as const;

const FONT = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
/**
 * Served from the directory's own domain (frontend `public/images/email/`). The old host, pfps.plnetwork.io,
 * serves a *.os.pl.xyz certificate, so Gmail drops the image (pln-directory-portal#3514, LAB-2855).
 */
export const emailLogoUrl = (): string => `${webUiBase()}/images/email/protocol-labs-logo-246.png`;

export { escapeHtml };

/** The digest's page: logo masthead, a 640px column of `rawRows`, and a footer under a rule. */
export function emailShell(args: { title: string; preheader: string; rawRows: string[]; rawFooter: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(args.title)}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: ${FONT};">
    <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapeHtml(args.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 640px; margin: 0 auto;">
            <tr>
              <td align="center" style="padding: 8px 24px;">
                <img src="${emailLogoUrl()}" width="246" height="56" alt="Protocol Labs" style="display: block; width: 246px; height: 56px; border: 0;" />
              </td>
            </tr>
${args.rawRows.join('\n')}
            <tr>
              <td align="center" style="padding: 24px; border-top: 1px solid ${COLORS.border};">
${args.rawFooter}
                <p style="margin: 8px 0 0 0; font-size: 12px; line-height: 18px; color: ${
                  COLORS.footer
                };">Protocol Labs &middot; LabOS</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

/** One full-width row of the column. */
export function row(rawContent: string, padding = '0 24px 16px 24px'): string {
  return `            <tr>
              <td style="padding: ${padding};">
${rawContent}
              </td>
            </tr>`;
}

export function heading(text: string): string {
  return `<h1 style="margin: 0; font-size: 24px; line-height: 32px; font-weight: 600; color: ${
    COLORS.heading
  };">${escapeHtml(text)}</h1>`;
}

/** A body paragraph from already-escaped inline HTML (for links or bold runs inside the sentence). */
export function rawParagraph(rawInline: string, margin = '0'): string {
  return `<p style="margin: ${margin}; font-size: 16px; line-height: 26px; color: ${COLORS.body};">${rawInline}</p>`;
}

export function link(href: string, text: string, color: string = COLORS.link): string {
  return `<a href="${escapeHtml(href)}" style="color: ${color}; text-decoration: underline;">${escapeHtml(text)}</a>`;
}

export function strong(text: string): string {
  return `<strong style="font-weight: 600; color: ${COLORS.heading};">${escapeHtml(text)}</strong>`;
}

/** The digest's blue button ("Apply"), as a bulletproof link. */
export function button(href: string, text: string): string {
  return `<a href="${escapeHtml(href)}" style="display: inline-block; background-color: ${
    COLORS.link
  }; color: #ffffff; padding: 8px 16px; border-radius: 8px; font-size: 14px; line-height: 20px; font-weight: 500; text-decoration: none;">${escapeHtml(
    text
  )}</a>`;
}

/** A quieter outlined button for a second action beside `button`. */
export function secondaryButton(href: string, text: string): string {
  return `<a href="${escapeHtml(href)}" style="display: inline-block; background-color: #ffffff; color: ${
    COLORS.heading
  }; padding: 7px 15px; border: 1px solid ${
    COLORS.border
  }; border-radius: 8px; font-size: 14px; line-height: 20px; font-weight: 500; text-decoration: none;">${escapeHtml(
    text
  )}</a>`;
}

/** Plain text as paragraphs: blank lines split paragraphs, single newlines become line breaks. */
export function multilineText(text: string): string {
  return escapeHtml(text.trim())
    .split(/\n\s*\n/)
    .map(
      (paragraph) =>
        `<p style="margin: 0 0 12px 0; font-size: 16px; line-height: 26px; color: ${COLORS.heading};">${paragraph
          .split('\n')
          .join('<br />')}</p>`
    )
    .join('');
}

/** Up to two initials, for a person with no photo. Code points, so an emoji or accented letter stays whole. */
export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? '')
      .join('')
      .toUpperCase() || '?'
  );
}

/** A 40px round photo, or an initials disc of the same size when there is no photo. */
export function avatar(name: string, imageUrl: string | null): string {
  if (imageUrl) {
    return `<img src="${escapeHtml(
      imageUrl
    )}" width="40" height="40" alt="" style="display: block; width: 40px; height: 40px; border-radius: 20px; border: 0; object-fit: cover;" />`;
  }
  return `<table role="presentation" width="40" cellpadding="0" cellspacing="0" border="0"><tr><td width="40" height="40" align="center" valign="middle" style="width: 40px; height: 40px; border-radius: 20px; background-color: ${
    COLORS.avatar
  }; font-size: 14px; font-weight: 600; color: ${COLORS.meta};">${escapeHtml(initials(name))}</td></tr></table>`;
}

/** Requires a non-blank string; names the field so a caller's bug reads clearly in the logs. */
export function requireText(value: string | null | undefined, field: string, email: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${email}: ${field} is required`);
  }
  return value;
}

export function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Collapses whitespace so a stray newline in a name or title cannot break a line or a subject header. */
export function oneLine(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}
