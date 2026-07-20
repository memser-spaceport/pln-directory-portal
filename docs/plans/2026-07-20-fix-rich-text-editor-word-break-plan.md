---
title: "fix: RichTextEditor breaks words mid-word instead of wrapping at whitespace"
type: fix
date: 2026-07-20
---

# fix: RichTextEditor breaks words mid-word instead of wrapping at whitespace

In `DealForm` (and every other form using the shared `RichTextEditor`), long paragraphs wrap mid-word — e.g. "Consonantia" splits into "Con" / "sonantia" across lines — instead of wrapping at the nearest space, even though there's plenty of room to wrap the whole word to the next line.

## Problem Statement

`RichTextEditor` (`apps/back-office/components/common/rich-text-editor.tsx`) wraps `react-quill` (Quill "snow" theme, contenteditable). Its stylesheet, `rich-text-editor.module.scss`, sets two competing rules on the editable body (`:global(.ql-editor)`, lines 82–90):

```scss
:global(.ql-editor) {
  ...
  overflow-wrap: break-word;   // line 87
  word-break: break-word;      // line 88 — culprit
  overflow-y: auto;
  flex: 1;
}
```

`word-break: break-word` is a legacy, non-standard value. Unlike `overflow-wrap: break-word` — which only force-breaks a word when it has nowhere else to go (e.g. an unbroken URL wider than the box) — `word-break: break-word` lets the browser insert a break inside any word, even when a normal whitespace wrap would fit on the next line. That's why ordinary prose breaks mid-word here.

Both rules were added together in commit `84a9f49c` ("fix: css styles"), alongside `.editor`'s `overflow: hidden` and fixed `max-width`, with no comment indicating `word-break` targeted a specific case — it appears to have been copy-pasted alongside `overflow-wrap` rather than added deliberately.

## Proposed Fix

Remove the `word-break: break-word;` line and keep `overflow-wrap: break-word;`, which already handles the one legitimate edge case (a long unbreakable token/URL that would otherwise overflow the box).

```scss
// rich-text-editor.module.scss — .editor :global(.ql-editor)
:global(.ql-editor) {
  min-height: 100px;
  max-height: 150px;
  height: 100%;
  font-size: 16px;
  overflow-wrap: break-word;
  overflow-y: auto;
  flex: 1;
  ...
}
```

`.ql-editor` has its own `overflow-y: auto` (not the parent's `overflow: hidden`), so removing `word-break` won't cause clipping — at most a token that's only slightly too long shifts to wrap as a whole word on the next line instead of splitting, which is the desired behavior.

This is a single shared component, so the fix applies uniformly everywhere it's used:
- `apps/back-office/screens/deals/components/DealForm/DealForm.tsx` (Full Deal Description, Redemption Instructions)
- `apps/back-office/pages/demo-days/[slugURL].tsx`
- `apps/back-office/pages/demo-days/create.tsx`
- `apps/back-office/pages/teams/team-pitches/create.tsx`
- `apps/back-office/pages/teams/team-pitches/[pitchUid].tsx`

## Acceptance Criteria

- [x] Normal paragraph text (e.g. the "Far far away, behind the word mountains..." sample) wraps only at whitespace — no mid-word splits — in the DealForm editors
- [x] A long unbreakable string (e.g. a URL with no spaces wider than the editor) still wraps instead of causing horizontal overflow/scrollbar
- [~] Visually spot-checked in all 5 consuming forms (DealForm x2 fields, demo-days edit/create, team-pitches edit/create) — the shared component/rule means all 5 get the same fix; live in-app check blocked by OTP login (no credentials available), verified instead via a structural CSS repro matching `.editor`/`.ql-container`/`.ql-editor`
- [x] No change to editor sizing (`min-height`/`max-height`/`overflow-y`) or any other `.ql-editor` styling

## Files to Change

| File | Change |
|---|---|
| `apps/back-office/components/common/rich-text-editor.module.scss` | Remove `word-break: break-word;` (line 88) inside `:global(.ql-editor)`; keep `overflow-wrap: break-word;` |

No component/TSX changes required.

## Alternative Considered

**Set `word-break: normal` explicitly instead of removing the line.** Functionally identical to removing it (browsers default to `normal`), but adds a line whose only purpose is to state the default — removing the rule is more direct and matches the "don't add code that states the obvious" convention.

## References

- `apps/back-office/components/common/rich-text-editor.module.scss:82-90` — `.ql-editor` rule block
- `apps/back-office/components/common/rich-text-editor.tsx:7` — imports `react-quill/dist/quill.snow.css`
- Commit `84a9f49c` ("fix: css styles") — original introduction of both `overflow-wrap` and `word-break` together
