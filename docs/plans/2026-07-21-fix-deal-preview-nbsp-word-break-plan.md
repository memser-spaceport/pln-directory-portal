---
title: "fix: DealPreview breaks words mid-word on pasted content with non-breaking spaces"
type: fix
date: 2026-07-21
---

# fix: DealPreview breaks words mid-word on pasted content with non-breaking spaces

Text pasted into `RichTextEditor` from a news article displays correctly in the editor, but the same content shows mid-word breaks (e.g. "connection" → "con" / "nection", "indicate a" → "indi" / "cate a") when viewed in `DealPreview`.

## Problem Statement

`QuillContent` (`apps/back-office/components/common/QuillContent/QuillContent.tsx`) renders stored rich-text HTML read-only via `dangerouslySetInnerHTML`, with no normalization:

```tsx
export function QuillContent(props: Props) {
  const { html, className } = props;
  return (
    <div
      className={clsx('ql-editor', s.content, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

Neither `QuillContent` nor `DealPreview`'s SCSS set `word-break` anywhere — the only wrap-relevant rule reaching this content is the standard `overflow-wrap: break-word` from Quill's vendor stylesheet, which by spec only breaks a word when there's no legal place else to wrap.

Root cause: the pasted news-article content contains literal non-breaking spaces (`&nbsp;` / U+00A0) between certain word pairs — a common technique news sites use to prevent orphan words (e.g. gluing a short trailing word like "a" to its neighbor so it can't start a line alone). A non-breaking space is never a legal wrap point, so when that glued pair doesn't fit the remaining line width, the browser has nowhere else to break and splits the adjacent word instead.

The live editor doesn't show this: it renders through Quill's own internal DOM inside a `white-space: pre-wrap` box, while `QuillContent` renders the raw stored string inside a `white-space: normal` box (`QuillContent.module.scss:9`) with a slightly different effective width. The same nbsp-joined pair can fit in one context and not the other — but both trace back to the same literal nbsp characters in the stored HTML, so stripping them at the shared render path fixes it everywhere that path is used, including deals already saved with this issue.

## Proposed Fix

Normalize non-breaking spaces to regular spaces in `QuillContent` before rendering, covering the named entity, numeric entities, and the literal character:

```tsx
// apps/back-office/components/common/QuillContent/QuillContent.tsx
const NBSP_PATTERN = /&nbsp;|&#0*160;|&#x0*a0;|\u00A0/gi;

export function QuillContent(props: Props) {
  const { html, className } = props;
  const normalizedHtml = (html ?? '').replace(NBSP_PATTERN, ' ');
  return (
    <div
      className={clsx('ql-editor', s.content, className)}
      dangerouslySetInnerHTML={{ __html: normalizedHtml }}
    />
  );
}
```

This is a plain string substitution on the whole HTML string — no DOM parsing. Accepted trade-off: it doesn't distinguish text nodes from attribute values or `<pre>`/code-block content. In practice this data comes from Quill's own HTML export (links use real URLs, not nbsp; code blocks pasted here are display-only, not fed back into the editor), so the theoretical edge cases aren't worth the complexity of a DOM-aware approach for this fix.

## Acceptance Criteria

- [x] `&nbsp;`, `&#160;`, `&#xA0;` (case-insensitive) and literal U+00A0 are all converted to a regular space before rendering — verified by extracting the actual regex from the source file and running it against all forms plus a plain-text control (no regression)
- [~] The reported repro (nbsp-joined word pair from pasted news content) no longer breaks mid-word in `DealPreview` at the modal's normal width — couldn't reproduce the exact pixel-level break in a sandboxed headless-browser repro (font/width metrics differ from the real dev environment), but the fix removes the underlying nbsp characters regardless of the exact line-breaking trigger; recommend a quick manual check in the running app
- [x] Null/empty `html` still renders without throwing — `(html ?? '')` guards this, verified in the regex test script
- [x] No visible regression on existing DealPreview content that doesn't contain nbsp (headings, lists, links, bold/italic formatting) — regex only matches nbsp forms, verified with a plain-text control case
- [x] `apps/back-office/components/common/rich-text.tsx` (`RichText`, used by demo-days/team-pitches) is left untouched — same latent risk exists there but is out of scope per the brainstorm

## Files to Change

| File | Change |
|---|---|
| `apps/back-office/components/common/QuillContent/QuillContent.tsx` | Add `NBSP_PATTERN` regex; normalize `html` before `dangerouslySetInnerHTML` |

No CSS changes — this is a data-normalization fix, not a wrapping-rule fix (the earlier `word-break: break-word` removal in `rich-text-editor.module.scss` was a separate, already-shipped issue).

## Alternative Considered

**Paste-time normalization** (a Quill clipboard matcher in `RichTextEditor` stripping nbsp on paste). Rejected as the sole fix: it only prevents *new* pasted content from containing nbsp and does nothing for deals already saved with the bad data — including the one in the bug report. Could still be added later as defense-in-depth, but isn't needed to resolve the reported bug.

**DOM-based sanitization** (parse the HTML, walk text nodes only, skip `<pre>`/attributes). Rejected as over-engineered for the actual risk: this content is Quill-generated HTML, not arbitrary user HTML, so the attribute/code-block edge cases are unlikely to occur in practice.

## References

- `apps/back-office/components/common/QuillContent/QuillContent.tsx:13-22` — render path to fix
- `apps/back-office/components/common/QuillContent/QuillContent.module.scss:9` — `white-space: normal` override
- `apps/back-office/screens/deals/components/DealPreview/DealPreview.tsx:97,102` — sole current consumer of `QuillContent`
- `apps/back-office/components/common/rich-text-editor.module.scss:82-89` — unrelated, already-fixed `word-break: break-word` issue (for contrast)
- `docs/brainstorms/2026-07-21-deal-preview-nbsp-word-break-brainstorm.md` — root-cause investigation and approach decision
