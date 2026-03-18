# DealForm Redesign — Brainstorm

**Date:** 2026-03-18
**Feature:** Update DealForm to match Figma design (node 75:9581)
**Figma:** https://www.figma.com/design/US3xcMIkBWVuBmefw3Bh4k/Deals?node-id=75-9581&m=dev

---

## What We're Building

A redesigned `DealForm` component that matches the new Figma spec. The modal becomes a more structured, polished form split into two sections — **Deal Details** and **Redemption Instructions** — with richer input controls, a logo upload area, a searchable vendor dropdown, and a rich text editor for long-form fields.

---

## Key Changes (Current → Figma)

| Field / Area | Current | New |
|---|---|---|
| **Vendor name** | Plain `<input>` text | Searchable team dropdown (PL Network) + avatar/logo upload |
| **Category** | Native `<select>` | Styled dropdown |
| **Audience** | ❌ Not present | New required dropdown (backend already supports it) |
| **Short Description** | Plain `<input>` | Input + "Gen Bio with AI" badge (UI only) + max 100 chars hint |
| **Full Description** | Plain `<textarea>` | `react-quill` rich text editor + "Generate with AI" badge (UI only) + max 600 |
| **Redemption Instructions** | Plain `<textarea>` | `react-quill` rich text editor + "Generate with AI" badge (UI only) + max 600 |
| **Status** | `<select>` in form | Removed from form; mapped to footer "Save as Draft" action |
| **Logo** | Not present | Circular avatar with upload + delete buttons; wires up `logoUid` |
| **Footer** | Cancel + Save/Update | Save as Draft (status=DRAFT) + Preview Deal |
| **Form sections** | Flat | "Deal Details" heading + divider + "Redemption Instructions" heading |

---

## Why This Approach

- **react-quill** for the rich text editor — mature, battle-tested, chosen by the team. The existing form already uses `react-hook-form` so integration via `Controller` is straightforward.
- **AI badges are UI-only** for now — render the badge as shown in Figma but wire to `() => {}`. Avoids backend dependency; easy to hook up later.
- **Audience field** — user confirmed backend already supports it. We add it to `TDealForm`, the service layer, and the form UI. Need to verify the exact field name and enum values in the API/Prisma schema.
- **Vendor search** — search PL Network teams to set both `vendorName` and `vendorTeamUid`. Will require a debounced team search API call (likely the existing teams endpoint). Selected team also drives the default avatar.
- **Logo upload** — functional upload via existing file upload mechanism. Sets `logoUid` on the deal. Avatar shows edit (upload) and delete buttons on hover, matching the Figma overlay pattern.
- **"Save as Draft"** submits the form with `status: 'DRAFT'`. **"Preview Deal"** — behavior TBD (open question below).

---

## Architecture Notes

- **File:** `apps/back-office/screens/deals/components/DealForm/DealForm.tsx`
- **Styles:** `DealForm.module.scss` — already has dead `.logoRow`, `.logoPreview`, `.logoPlaceholder`, `.uploadBtn` classes ready for the logo area.
- **Types:** `apps/back-office/screens/deals/types/deal.ts` — add `audience` to `TDealForm` and `Deal`.
- **Backend DTO:** `apps/web-api/src/deals/deals.dto.ts` — add `audience` to `UpsertDealDto` if not already present.
- **`react-quill`** — add as a new dependency. Integrate via `<Controller>` in react-hook-form for `fullDescription` and `redemptionInstructions`.
- **Team search** — likely reuse an existing `/teams` or `/members/search` endpoint. Need to identify the correct endpoint and response shape.
- **Logo upload** — follow the same file upload pattern used elsewhere in the back-office (need to identify the existing upload utility/hook).

---

## Open Questions

1. **"Preview Deal" button** — What does it do? Opens a preview modal? Navigates to a public deal page? This is not yet defined and will need clarification before implementation.
2. **Audience field values** — What are the valid enum values for `audience` in the backend (e.g. `FOUNDER`, `DEVELOPER`, `ALL`)? Need to check Prisma schema or ask backend.
3. **Team search endpoint** — Which endpoint should the vendor dropdown call to search PL Network teams? What shape is the response?
4. **Existing file upload pattern** — Is there an existing `useUpload` hook or upload service in the back-office to reuse for logo upload, or do we need to create one?
5. **`react-quill` React 18 compatibility** — react-quill has known SSR/React 18 quirks. May need a dynamic import (`next/dynamic` with `ssr: false`) or use `react-quill-new` (community fork). Confirm during implementation.

---

## Decisions Made

| Decision | Choice | Reason |
|---|---|---|
| Rich text editor | `react-quill` | Chosen by team; mature and widely used |
| AI badges | UI-only placeholder | Avoids backend dependency; easy to hook up later |
| Audience field | Include (backend supports it) | User confirmed |
| Vendor field | Searchable team dropdown | Sets both `vendorName` and `vendorTeamUid` |
| Logo upload | Functional | Wire up `logoUid`; SCSS stubs already exist |
| Status field | Removed from form UI | "Save as Draft" footer button handles DRAFT status |
