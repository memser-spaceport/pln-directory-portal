import { Prisma } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';

/**
 * Member rich-text fields that the frontend renders as HTML (LAB-2987).
 * Every write to them goes through `sanitizeMemberHtml` (PrismaService
 * middleware), whatever the source: the profile editor, the admin panel,
 * CV import, enrichment or an AI-generated bio.
 */
export const MEMBER_HTML_FIELDS: Partial<Record<Prisma.ModelName, readonly string[]>> = {
  Member: ['bio'],
  MemberExperience: ['description'],
};

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s,.%]+\)$/i, /^[a-z]+$/i];

// The formatting the profile editor (Quill) writes: headers, inline marks,
// colors, lists, alignment and indent classes, code blocks, links, mentions
// and hosted images. Everything else is removed; script and style content
// is dropped with its tag.
const MEMBER_HTML_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'div',
    'span',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'sub',
    'sup',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'pre',
    'code',
    'ol',
    'ul',
    'li',
    'a',
    'img',
    'hr',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel', 'data-uid', 'data-external-id', 'data-name', 'contenteditable'],
    img: ['src', 'alt', 'width', 'height'],
    li: ['data-list'],
    div: ['data-language'],
    '*': ['class', 'style'],
  },
  allowedClasses: { '*': [/^ql-[a-z0-9-]+$/] },
  allowedStyles: {
    '*': {
      color: COLOR,
      'background-color': COLOR,
      'text-align': [/^(left|right|center|justify)$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target ? { ...attribs, rel: 'noopener noreferrer' } : attribs,
    }),
  },
};

// Same parser, nothing removed: the reference to tell an unsafe value from a
// value that only differs in entity or attribute encoding.
const PASS_THROUGH_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: false,
  allowedAttributes: false,
  allowVulnerableTags: true,
  allowedSchemesAppliedToAttributes: [],
};

// Removes only what can run code: script-like elements, event handlers,
// unsafe inline styles and non-allowed URL schemes. Unknown but harmless
// tags, classes and styles stay, so the clean-up script does not count or
// rewrite a value only because it has formatting the editor does not write.
const SCRIPTABLE_TAGS = [
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'base',
  'link',
  'meta',
  'form',
  'svg',
  'math',
  'template',
  'noscript',
];
const UNSAFE_STYLE = /javascript:|expression\s*\(|url\s*\(/i;

const SCRIPTABLE_ONLY_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: false,
  allowedAttributes: false,
  allowVulnerableTags: true,
  exclusiveFilter: (frame) => SCRIPTABLE_TAGS.includes(frame.tag),
  transformTags: {
    '*': (tagName, attribs) => ({
      tagName,
      attribs: Object.fromEntries(
        Object.entries(attribs).filter(
          ([name, value]) => !/^on/i.test(name) && !(name.toLowerCase() === 'style' && UNSAFE_STYLE.test(String(value)))
        )
      ),
    }),
  },
  allowedSchemes: ['http', 'https', 'mailto', 'data'],
  allowedSchemesAppliedToAttributes: ['href', 'src', 'cite', 'action', 'formaction', 'xlink:href'],
};

export function sanitizeMemberHtml<T extends string | null | undefined>(value: T): T {
  if (typeof value !== 'string') return value;
  return sanitizeHtml(value, MEMBER_HTML_SANITIZE_OPTIONS) as T;
}

/**
 * True when the value has content that can run code (script-like elements,
 * event handlers, javascript: URLs). Harmless formatting the sanitizer would
 * drop, or a different entity encoding, does not count.
 */
export function hasUnsafeMemberHtml(value: string | null | undefined): boolean {
  if (!value) return false;
  return sanitizeHtml(value, SCRIPTABLE_ONLY_OPTIONS) !== sanitizeHtml(value, PASS_THROUGH_OPTIONS);
}

function sanitizeData(data: unknown, fields: readonly string[]): void {
  if (Array.isArray(data)) {
    data.forEach((row) => sanitizeData(row, fields));
    return;
  }
  if (!data || typeof data !== 'object') return;
  const row = data as Record<string, unknown>;
  for (const field of fields) {
    const value = row[field];
    if (typeof value === 'string') {
      row[field] = sanitizeMemberHtml(value);
    } else if (value && typeof value === 'object' && typeof (value as { set?: unknown }).set === 'string') {
      row[field] = { ...(value as object), set: sanitizeMemberHtml((value as { set: string }).set) };
    }
  }
}

/** Prisma middleware step: sanitizes the member HTML fields of a write in place. */
export function sanitizeMemberHtmlWriteArgs(params: Prisma.MiddlewareParams): void {
  const fields = params.model ? MEMBER_HTML_FIELDS[params.model] : undefined;
  if (!fields || !params.args) return;
  switch (params.action) {
    case 'create':
    case 'update':
    case 'createMany':
    case 'updateMany':
      sanitizeData(params.args.data, fields);
      break;
    case 'upsert':
      sanitizeData(params.args.create, fields);
      sanitizeData(params.args.update, fields);
      break;
  }
}
