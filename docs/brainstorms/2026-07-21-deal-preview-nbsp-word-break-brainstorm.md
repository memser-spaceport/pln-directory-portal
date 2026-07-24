---
date: 2026-07-21
topic: deal-preview-nbsp-word-break
---

# DealPreview mid-word breaks on pasted content

## What We're Building

`QuillContent` (`apps/back-office/components/common/QuillContent/QuillContent.tsx`) normalizes non-breaking spaces (`&nbsp;` / U+00A0) to regular spaces before rendering stored rich-text HTML with `dangerouslySetInnerHTML`. This fixes words breaking mid-string in `DealPreview` — the only current consumer of `QuillContent` — for both existing and newly saved deals, without touching the live editor or stored data.

## Why This Approach

Investigation ruled out a duplicate of the earlier `word-break: break-word` bug (fixed in `rich-text-editor.module.scss`): neither `QuillContent` nor `DealPreview`'s SCSS declare any `word-break` rule, and the only wrap-relevant CSS reaching the preview is the standard `overflow-wrap: break-word` from Quill's vendor stylesheet — which by spec should only break a word that has nowhere else to break.

Root cause: the pasted content came from a news article. News sites commonly embed literal non-breaking spaces between certain word pairs (typographic orphan/widow prevention — e.g. gluing a short trailing word like "a" to its neighbor so it can't start a new line alone). Quill's clipboard preserves these characters into the stored HTML unchanged. A non-breaking space can't be a line-wrap point, so if that glued word pair doesn't fit on the current line, the browser has no legal break point there and is forced to split inside the adjacent word instead — exactly the "indi" / "cate a plea" pattern seen in the screenshot.

The live editor (`RichTextEditor`) doesn't show the bug because it renders through Quill's own internal DOM (not the raw HTML string) inside a `white-space: pre-wrap` box, while `QuillContent` renders the raw stored string via `dangerouslySetInnerHTML` in a `white-space: normal` box with slightly different effective width/padding — the same nbsp-joined pair can fit in one context and not the other. Both consequences trace back to the same literal nbsp characters, so removing them at the one shared render path (`QuillContent`) is the most direct fix, and it retroactively fixes every deal already saved with this issue (`QuillContent` is the only place that renders stored HTML read-only today).

Paste-time normalization (a Quill clipboard matcher stripping nbsp on paste) was considered and explicitly deferred — it only prevents *new* bad data and does nothing for deals already saved with embedded nbsp, so it doesn't address the reported bug on its own.

## Key Decisions

- **Fix scope**: `QuillContent.tsx` only — normalize `&nbsp;`/U+00A0 to a regular space in the `html` string before `dangerouslySetInnerHTML`.
- **No change** to `RichTextEditor`/Quill clipboard behavior, no change to stored data (`fullDescription`/`redemptionInstructions` stay as-authored in the DB) — this is a display-layer fix only.
- **No change** to `rich-text-editor.module.scss` or any other CSS — the earlier `word-break: break-word` fix (already shipped) is unrelated to this bug.

## Open Questions

- Should the normalization also strip/collapse other invisible whitespace variants (e.g. zero-width space, other Unicode space characters) commonly introduced by copy/paste from webpages, or is nbsp the only one worth handling for now? Leaning toward nbsp-only until another variant is actually observed (YAGNI).

## Next Steps

→ `/workflows:plan` for implementation details
