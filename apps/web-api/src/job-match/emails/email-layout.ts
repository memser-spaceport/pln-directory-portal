import { escapeHtml } from '../../job-openings/job-openings-email-html';
import { webUiBase } from '../../job-openings/job-openings-url';

/**
 * Email-safe building blocks shared by the job-match emails (LAB-2848, redesigned in LAB-2865 from the Figma
 * "Email templates | Protocol Labs" file): table layout, inline styles, absolute image URLs, no flex or grid.
 * The only `<head>` extras are the Google Fonts link (Inter, Montserrat; Arial/Helvetica where a client drops
 * it) and one media query that lets the 640px column go full width on a phone. Inlined in TypeScript rather
 * than loaded from `.hbs` files: webpack bundles them, so there is no asset to list in project.json and no
 * `__dirname` path to resolve at runtime or in jest.
 *
 * Every helper here takes text and escapes it; `raw*` parameters are already-built HTML from these helpers.
 */

export const COLORS = {
  page: '#f6f7fb',
  card: '#f9fafb',
  text: '#000000',
  title: '#0a0c11',
  muted: '#667085',
  meta: '#455468',
  caption: '#8897ae',
  signoff: '#1c1e23',
  team: '#8f98b1',
  divider: '#E2E8F0',
  link: '#1b4dff',
  /** Unmet criteria: the label and statement colours at 40% opacity on the card, pre-blended for Outlook. */
  fadedTitle: '#a0a7b4',
  fadedMeta: '#b4bac6',
} as const;

export const INTER = 'Inter, Arial, Helvetica, sans-serif';
export const MONTSERRAT = 'Montserrat, Arial, Helvetica, sans-serif';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&amp;family=Montserrat:wght@400;600&amp;display=swap';

/**
 * Served from the directory's own domain (frontend `public/images/email/`), as 2x PNGs drawn at 1x CSS size:
 * Gmail renders no SVG, and the old host, pfps.plnetwork.io, serves a *.os.pl.xyz certificate, so Gmail drops
 * the image (pln-directory-portal#3514, LAB-2855).
 */
export const emailImageUrl = (name: 'logo-protocol-labs' | 'icon-check' | 'icon-map-pin' | 'icon-arrow'): string =>
  `${webUiBase()}/images/email/email-${name}@2x.png`;
export const emailLogoUrl = (): string => emailImageUrl('logo-protocol-labs');

export { escapeHtml };

/** A 14px icon, drawn inline. */
export function icon(name: 'icon-check' | 'icon-map-pin' | 'icon-arrow', style = ''): string {
  return `<img src="${emailImageUrl(
    name
  )}" width="14" height="14" alt="" style="display: inline-block; width: 14px; height: 14px; border: 0; outline: none; text-decoration: none;${
    style ? ` ${style}` : ''
  }" />`;
}

/** Inline text style for the design's type scale. */
export function font(args: {
  size: number;
  line: number;
  weight?: 400 | 500 | 600;
  color: string;
  tracking?: number;
  family?: string;
}): string {
  return `font-family: ${args.family ?? INTER}; font-size: ${args.size}px; line-height: ${args.line}px; font-weight: ${
    args.weight ?? 400
  };${args.tracking ? ` letter-spacing: ${args.tracking}px;` : ''} color: ${args.color};`;
}

/**
 * The page: a 640px white column on #f6f7fb (full width on a phone) with the logo masthead, `rawRows`, and the
 * sign-off footer. `unsubscribeUrl` adds "· Unsubscribe" to the preferences line (founder email only).
 */
export function emailShell(args: {
  title: string;
  preheader: string;
  rawRows: string[];
  preferencesUrl: string;
  unsubscribeUrl?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(args.title)}</title>
    <link href="${FONTS_HREF}" rel="stylesheet" />
    <style>
      @media only screen and (max-width: 640px) {
        .email-outer { padding: 0 !important; }
        .email-container { width: 100% !important; max-width: 100% !important; }
        .email-fluid { width: 100% !important; max-width: 100% !important; }
        .email-pad { padding-left: 16px !important; padding-right: 16px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${COLORS.page}; font-family: ${INTER};">
    <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapeHtml(args.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${
      COLORS.page
    }" style="background-color: ${COLORS.page};">
      <tr>
        <td class="email-outer" align="center" style="padding: 32px 0;">
          <table class="email-container" role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width: 640px; max-width: 640px; margin: 0 auto; background-color: #ffffff;">
            <tr>
              <td align="center" style="padding: 32px 24px 16px 24px;">
                <img src="${emailLogoUrl()}" width="193" height="44" alt="Protocol Labs" style="display: block; width: 193px; height: 44px; border: 0; outline: none; text-decoration: none; ${font(
    { size: 16, line: 24, weight: 600, color: COLORS.text }
  )}" />
              </td>
            </tr>
${args.rawRows.join('\n')}
${footer(args.preferencesUrl, args.unsubscribeUrl)}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

export const FOOTER_REASON = 'You received this email because you are a member of the Protocol Labs network.';

function footer(preferencesUrl: string, unsubscribeUrl: string | undefined): string {
  const caption = font({ size: 12, line: 16, color: COLORS.caption });
  const footerLink = (href: string, text: string) =>
    `<a href="${escapeHtml(href)}" style="${font({
      size: 12,
      line: 16,
      weight: 500,
      color: COLORS.caption,
    })} text-decoration: underline;">${escapeHtml(text)}</a>`;
  const preferences = `${footerLink(preferencesUrl, 'Manage')} your email preferences${
    unsubscribeUrl ? ` &middot; ${footerLink(unsubscribeUrl, 'Unsubscribe')}` : '.'
  }`;
  return `            <tr>
              <td class="email-pad" align="center" style="padding: 16px 24px;">
                <p style="margin: 0; text-align: center; ${font({
                  size: 15,
                  line: 24,
                  weight: 600,
                  color: COLORS.signoff,
                  family: MONTSERRAT,
                })}">Cheers,</p>
                <p style="margin: 0; text-align: center; ${font({
                  size: 15,
                  line: 24,
                  color: COLORS.team,
                  family: MONTSERRAT,
                })}">The LabOS Team</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td height="10" style="height: 10px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
                  <tr>
                    <td align="center" style="border-top: 1px solid ${
                      COLORS.divider
                    }; padding-top: 10px; text-align: center; ${caption}">
                      <p style="margin: 0; text-align: center; ${caption}">${escapeHtml(FOOTER_REASON)}</p>
                      <p style="margin: 0; text-align: center; ${caption}">${preferences}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;
}

/** One full-width row of the column; `rawContent` sits in a centered `width`px block (fluid on a phone). */
export function row(rawContent: string, args: { padding: string; width?: number; align?: 'left' | 'center' }): string {
  const align = args.align ?? 'left';
  const inner = args.width
    ? `<table class="email-fluid" role="presentation" width="${args.width}" align="center" cellpadding="0" cellspacing="0" border="0" style="width: ${args.width}px; max-width: ${args.width}px; margin: 0 auto;">
                  <tr>
                    <td align="${align}" style="text-align: ${align};">
${rawContent}
                    </td>
                  </tr>
                </table>`
    : rawContent;
  return `            <tr>
              <td class="email-pad" align="${align}" style="padding: ${args.padding};">
                ${inner}
              </td>
            </tr>`;
}

/** Vertical space that Outlook keeps (it ignores margins on tables). */
export function spacer(height: number): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="${height}" style="height: ${height}px; font-size: 0; line-height: 0;">&nbsp;</td></tr></table>`;
}

/** A paragraph from already-escaped inline HTML, in the given `font(...)` style. */
export function rawText(rawInline: string, style: string, extra = 'margin: 0;'): string {
  return `<p style="${extra} ${style}">${rawInline}</p>`;
}

/** An inline link in the design's blue: underlined (`underline`) or with a 1px bottom rule (`rule`). */
export function link(
  href: string,
  rawInner: string,
  args: { size?: number; line?: number; weight?: 400 | 500; decoration?: 'underline' | 'rule' } = {}
): string {
  const decoration =
    args.decoration === 'rule'
      ? `text-decoration: none; border-bottom: 1px solid ${COLORS.link};`
      : 'text-decoration: underline;';
  return `<a href="${escapeHtml(href)}" style="${font({
    size: args.size ?? 14,
    line: args.line ?? 20,
    weight: args.weight ?? 400,
    color: COLORS.link,
  })} ${decoration}">${rawInner}</a>`;
}

/** The design's primary button, bulletproof: the cell paints the colour where a client drops the link's padding. */
export function button(href: string, text: string): string {
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
  <tr>
    <td align="center" bgcolor="${COLORS.link}" style="background-color: ${
    COLORS.link
  }; border: 1px solid rgba(14, 15, 17, 0.12); border-radius: 8px;">
      <a href="${escapeHtml(href)}" style="display: inline-block; padding: 10px 20px; ${font({
    size: 14,
    line: 20,
    weight: 500,
    color: '#ffffff',
  })} text-decoration: none; border-radius: 8px;">${escapeHtml(text)}</a>
    </td>
  </tr>
</table>`;
}

/** Plain text as paragraphs: blank lines split paragraphs, single newlines become line breaks. */
export function multilineText(text: string, style: string): string {
  return escapeHtml(text.trim())
    .split(/\n\s*\n/)
    .map((paragraph, index) =>
      rawText(paragraph.split('\n').join('<br />'), style, `margin: ${index ? '12px' : '0'} 0 0 0;`)
    )
    .join('');
}

/** The first word of a name, for "Hi Ada,"; '' for a blank name. */
export function firstName(name: string | null | undefined): string {
  return oneLine(name).split(' ')[0] ?? '';
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
