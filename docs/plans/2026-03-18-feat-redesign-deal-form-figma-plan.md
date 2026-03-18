---
title: "feat: Redesign DealForm to match Figma spec"
type: feat
date: 2026-03-18
figma: https://www.figma.com/design/US3xcMIkBWVuBmefw3Bh4k/Deals?node-id=75-9581&m=dev
brainstorm: docs/brainstorms/2026-03-18-deal-form-redesign-brainstorm.md
---

# feat: Redesign DealForm to match Figma spec

## Overview

Update the back-office `DealForm` modal to match the Figma design (node 75:9581). The form gains a logo upload avatar, a searchable vendor team dropdown, a new Audience field, rich text editors for long-form fields, AI generation badge placeholders, character limit hints, and a restructured two-section layout with updated footer buttons.

---

## Key Changes (Current → Figma)

| Area | Current | New |
|---|---|---|
| Vendor name | Plain `<input>` | Async team search (AsyncSelect) + circular logo avatar with upload/delete |
| Category | Native `<select>` | Styled `<Controller>` + react-select |
| Audience | ❌ Missing | New required dropdown — **needs Prisma migration + DTO** |
| Short Description | Plain `<input>` | Input + `maxLength=100` + helper text + "Gen Bio with AI" badge (UI-only) |
| Full Description | Plain `<textarea>` | `RichTextEditor` (existing component) + "Generate with AI" badge (UI-only) + max 600 |
| Redemption Instructions | Plain `<textarea>` | `RichTextEditor` + "Generate with AI" badge (UI-only) + max 600 |
| Status field | `<select>` in form | Removed from form |
| Logo | Not present | Circular avatar, upload on file select via `saveRegistrationImage`, sets `logoUid` |
| Footer | Cancel + Save/Update | Save as Draft + Preview Deal (disabled, tooltip "Coming soon") |
| Form layout | Flat | "Deal Details" section + divider + "Redemption Instructions" section |
| Form context | `useForm` only | `<FormProvider>` wrapper to enable shared field components |

---

## Critical Findings from Research

> These were discovered during research and must be addressed before or alongside implementation.

1. **`audience` is NOT in the Prisma schema** — despite the assumption in the brainstorm. Research confirmed the migration SQL (`20260316192151_add_deals_v1`) has no `audience` column. A new migration and DTO update are required. Enum values must be confirmed with the backend team before the migration is written.

2. **`RichTextEditor` already exists** at `apps/back-office/components/common/rich-text-editor.tsx`. It wraps react-quill (already installed as `^2.0.0`), includes a character counter, error display, toolbar, and placeholder. Use it directly — do not create a new rich text integration.

3. **`FormSelectField` stores `{ label, value }` objects**, not plain strings. Using it directly for Category/Audience would send the full option object to the backend. Must extract `.value` at submit time (see implementation notes in Phase 3).

4. **`fetchTeamsForAutocomplete` has no auth header** — it calls a public `/v1/teams` endpoint which may not require auth. Verify at implementation time. If the endpoint needs a token, add the `authorization` header following the pattern in `apps/back-office/utils/services/deal.ts`.

5. **Logo URL gap in edit mode** — `Deal` type has `logoUid` but no `logoUrl`. To display an existing logo when editing, either: (a) update the admin API to return a resolved `logoUrl` alongside `logoUid`, or (b) accept a `logoUrl?: string` optional prop on `DealForm`. **Option (a) is preferred.** Verify if the current `GET /v1/admin/deals` or `GET /v1/admin/deals/:uid` already returns this field via the `ImagesService`.

6. **Upload fires on file select (not on submit)** — following the existing `AddMember`/`EditMember` pattern, `saveRegistrationImage` is called immediately when the user selects a file. This can create orphaned images if the form is cancelled. Accepted trade-off (consistent with the rest of the app).

7. **`DEAL_CATEGORIES` is duplicated** — the category list differs between `DealForm.tsx` and `pages/deals/index.tsx` (`Hosting` is present in the page filter but not in the form). Consolidate into a single shared constant.

8. **"Save as Draft" in edit mode** — if the edited deal is currently `ACTIVE` or `DEACTIVATED`, clicking "Save as Draft" would silently downgrade its status. Recommended: in edit mode, inject the deal's **existing status** into the payload instead of always forcing `DRAFT`. Only force `DRAFT` on create. The footer button label should remain "Save as Draft" but its behavior adapts to edit mode.

---

## Technical Approach

### Dependencies / Pre-conditions

- `react-quill@^2.0.0` — already installed ✅
- `react-select@^5.10.1` — already installed ✅ (with async support)
- `react-dropzone@^14.3.8` — already installed ✅
- Existing `RichTextEditor` component — `apps/back-office/components/common/rich-text-editor.tsx` ✅
- Existing `saveRegistrationImage(file)` utility — `apps/back-office/utils/services/member.ts:26–45` ✅
- Existing `fetchTeamsForAutocomplete(searchTerm)` — `apps/back-office/utils/services/team.ts:17–28` ✅

### Files Modified

| File | Change |
|---|---|
| `apps/web-api/prisma/schema.prisma` | Add `DealAudience` enum + `audience` field to `Deal` model |
| `apps/web-api/prisma/migrations/...` | New migration file for audience column |
| `apps/web-api/src/deals/deals.dto.ts` | Add `audience` to `UpsertDealDto` |
| `apps/web-api/src/deals/deals.service.ts` | Add `audience` to `adminCreate` and `adminUpdate` logic |
| `apps/back-office/screens/deals/types/deal.ts` | Add `audience` and `logoUrl?` to `Deal`; add `vendorTeamUid`, `logoUid`, `audience` to `TDealForm` |
| `apps/back-office/screens/deals/components/DealForm/DealForm.tsx` | Full rewrite of form component |
| `apps/back-office/screens/deals/components/DealForm/DealForm.module.scss` | Activate dead logo styles; add new section, badge, and button styles |
| `apps/back-office/screens/deals/constants.ts` | New file: shared `DEAL_CATEGORIES` and `DEAL_AUDIENCES` constants |
| `apps/back-office/pages/deals/index.tsx` | Consume new `DEAL_CATEGORIES` constant; update `handleFormSubmit` for new payload shape |
| `apps/back-office/utils/services/deal.ts` | Update `TDealForm` usage if payload transforms needed |

---

## Implementation Phases

### Phase 0 — Backend: Add `audience` field

**Confirm audience enum values with the backend team before writing this.** Proposed values: `FOUNDERS`, `DEVELOPERS`, `EVERYONE` (adjust as needed).

#### `apps/web-api/prisma/schema.prisma`

```prisma
enum DealAudience {
  FOUNDERS
  DEVELOPERS
  EVERYONE
}

model Deal {
  // ... existing fields ...
  audience   DealAudience?
}
```

#### New migration

```sql
-- CreateEnum
CREATE TYPE "DealAudience" AS ENUM ('FOUNDERS', 'DEVELOPERS', 'EVERYONE');

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "audience" "DealAudience";
```

#### `apps/web-api/src/deals/deals.dto.ts`

```typescript
import { IsEnum, IsOptional } from 'class-validator';
import { DealAudience } from '@prisma/client';

export class UpsertDealDto {
  // ... existing fields ...
  @IsEnum(DealAudience)
  @IsOptional()
  audience?: DealAudience;
}
```

#### `apps/web-api/src/deals/deals.service.ts`

Add `audience` to the conditional spreads in `adminCreate` and `adminUpdate`.

---

### Phase 1 — Shared Constants

#### `apps/back-office/screens/deals/constants.ts` (new file)

```typescript
export const DEAL_CATEGORIES = [
  'Analytics', 'CDN', 'Database', 'Design', 'Development',
  'DevOps', 'Hosting', 'Monitoring', 'Project Management', 'Security', 'Other',
] as const;

export const DEAL_AUDIENCES = [
  { value: 'FOUNDERS', label: 'Founders' },
  { value: 'DEVELOPERS', label: 'Developers' },
  { value: 'EVERYONE', label: 'Everyone' },
] as const;
```

Update `DealForm.tsx` and `pages/deals/index.tsx` to import from here instead of defining inline.

---

### Phase 2 — Update Types

#### `apps/back-office/screens/deals/types/deal.ts`

```typescript
export type TDealForm = {
  vendorName: string;
  vendorTeamUid?: string | null;
  logoUid?: string | null;
  category: string;
  audience?: string;
  shortDescription: string;
  fullDescription: string;
  redemptionInstructions: string;
  // status is no longer a form field — injected at submit time
};

export type Deal = {
  uid: string;
  vendorName: string;
  vendorTeamUid?: string | null;
  logoUid?: string | null;
  logoUrl?: string | null;   // resolved URL for display (returned by API)
  category: string;
  audience?: string | null;
  shortDescription: string;
  fullDescription: string;
  redemptionInstructions: string;
  status: DealStatus;
  createdAt: string;
  updatedAt: string;
};
```

---

### Phase 3 — DealForm Component Rewrite

#### `apps/back-office/screens/deals/components/DealForm/DealForm.tsx`

**Structure:**

```
<FormProvider {...methods}>
  <form onSubmit={...}>
    {/* Header */}
    <div className={s.header}>
      <h2>Create New Deal / Edit Deal</h2>
      <p>Fill in the details to add a new deal to the catalog.</p>
      <button onClick={onClose}>✕</button>
    </div>

    {/* Content */}
    <div className={s.content}>
      {/* Section 1: Deal Details */}
      <h3>Deal Details</h3>

      {/* Vendor row: avatar + async team search */}
      <div className={s.vendorRow}>
        <VendorAvatarUpload />   {/* inline sub-component */}
        <AsyncVendorSelect />    {/* inline sub-component */}
      </div>

      {/* Category */}
      <Controller name="category" ... />   {/* react-select, extracts .value on submit */}

      {/* Audience */}
      <Controller name="audience" ... />   {/* react-select, extracts .value on submit */}

      {/* Short Description */}
      <input maxLength={100} ... />
      <AiBadge label="Gen Bio with AI" />
      <span>Max. 100 characters.</span>

      {/* Full Description */}
      <RichTextEditor maxLength={600} ... />
      <AiBadge label="Generate with AI" />
      <span>Max 600 characters.</span>

      {/* Divider */}
      <hr />

      {/* Section 2: Redemption Instructions */}
      <h3>Redemption Instructions</h3>

      <RichTextEditor maxLength={600} ... />
      <AiBadge label="Generate with AI" />
      <span>Max 600 characters.</span>
    </div>

    {/* Footer */}
    <div className={s.footer}>
      <button type="submit" onClick={() => setSubmitMode('draft')}>Save as Draft</button>
      <button type="button" disabled title="Coming soon">Preview Deal</button>
    </div>
  </form>
</FormProvider>
```

**Key implementation notes:**

1. **`FormProvider`** — wrap `<form>` with `<FormProvider {...methods}>` so shared field components can call `useFormContext()`. The form uses `useForm<TDealForm>()`.

2. **Vendor AsyncSelect** — use `<Controller>` from react-hook-form wrapping `<AsyncSelect>` from `react-select/async`. `loadOptions` calls `fetchTeamsForAutocomplete(inputValue)`. On change: `setValue('vendorName', option?.label ?? '')` and `setValue('vendorTeamUid', option?.value ?? null)`. Store the full option object in a local `useState` for AsyncSelect's controlled value display; extract `.value`/`.label` for form fields.

3. **Logo upload** — inline avatar component:
   - `<input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelect} />` (hidden)
   - On file select: call `saveRegistrationImage(file)` → `setValue('logoUid', image.uid)`; update local `logoPreviewUrl` state via `FileReader`
   - Delete button: `setValue('logoUid', null)`, clear `logoPreviewUrl`
   - In edit mode: initialize `logoPreviewUrl` from `initialData.logoUrl` (if provided)

4. **Category & Audience selects** — use `<Controller>` wrapping `<Select>` from `react-select` (not `FormSelectField`, to avoid the `{ label, value }` object shape issue). Extract `.value` manually at submit time:
   ```typescript
   const onSubmit = (data: TDealForm) => {
     const payload = {
       ...data,
       category: (data.category as any)?.value ?? data.category,
       audience: (data.audience as any)?.value ?? data.audience,
       status: isEditing ? initialData!.status : 'DRAFT',
     };
     onSubmit(payload);
   };
   ```

5. **Rich text fields** — use the existing `<RichTextEditor>` with `<Controller>`:
   ```tsx
   <Controller
     name="fullDescription"
     control={methods.control}
     rules={{ required: 'Required' }}
     render={({ field, fieldState }) => (
       <RichTextEditor
         value={field.value}
         onChange={field.onChange}
         maxLength={600}
         placeholder="Explain the full details of the deal..."
         errorMessage={fieldState.error?.message}
       />
     )}
   />
   ```

6. **"Save as Draft" — edit mode status preservation**:
   - On create: inject `status: 'DRAFT'` into the payload
   - On edit: inject `status: initialData.status` to preserve the existing status

7. **`useEffect` for edit pre-population** — when `initialData` changes, call `reset()` with mapped values. For the vendor team, also set local AsyncSelect state to `{ value: initialData.vendorTeamUid, label: initialData.vendorName }`.

8. **Validation** — use `react-hook-form`'s inline rules (existing pattern; no Yup schema needed for this form unless it already uses one). Required fields: `vendorName`, `category`, `audience`, `shortDescription`, `fullDescription`, `redemptionInstructions`.

---

### Phase 4 — SCSS Updates

#### `apps/back-office/screens/deals/components/DealForm/DealForm.module.scss`

Changes needed:
- **Activate** existing dead logo classes: `.logoRow`, `.logoPreview`, `.logoPlaceholder`, `.uploadBtn`
- **Add** `.vendorRow` — flex row with gap between avatar and async select
- **Add** `.sectionHeading` — for "Deal Details" and "Redemption Instructions" titles (Inter Medium, 16px)
- **Add** `.divider` — 1px horizontal rule between form sections
- **Add** `.aiBadge` — small blue pill badge ("Gen Bio with AI", "Generate with AI")
- **Add** `.helperText` — 12px secondary color helper text below inputs
- **Update** `.footer` — justify-between layout for the two buttons
- **Update** `.primaryBtn` to match Figma blue (#1b4dff) with box-shadow
- **Add** `.previewBtn` — disabled state styles (opacity: 0.4, cursor: not-allowed)

---

### Phase 5 — Parent Page Updates

#### `apps/back-office/pages/deals/index.tsx`

- Replace inline `CATEGORIES` array with import from `screens/deals/constants.ts`
- Update `handleFormSubmit` to pass new payload shape to `createDeal.mutateAsync` / `updateDeal.mutateAsync`
- Ensure `editingDeal` passed as `initialData` includes `logoUrl` once the API returns it

---

## Acceptance Criteria

### Functional

- [ ] **Vendor field**: Typing in the vendor input searches PL Network teams with debounce; selecting a team sets `vendorName` and `vendorTeamUid` on the form
- [ ] **Vendor field — free text**: If no team is found or user clears the selection, `vendorName` can still be submitted as free text with `vendorTeamUid: null`
- [ ] **Logo upload**: Clicking the avatar upload button opens a file picker; selecting an image calls `saveRegistrationImage`, shows a preview, and sets `logoUid`
- [ ] **Logo delete**: Clicking the delete button clears `logoUid` and reverts the avatar to the placeholder
- [ ] **Logo in edit mode**: When editing a deal with an existing logo, the avatar shows the existing image (requires `logoUrl` from API response)
- [ ] **Category**: Styled react-select dropdown; submits a plain string (not an option object) to the API
- [ ] **Audience**: Styled react-select dropdown with valid enum options; required field; submits a plain string
- [ ] **Short Description**: Input with `maxLength=100`; helper text "Max. 100 characters." shown below; "Gen Bio with AI" badge rendered (click does nothing)
- [ ] **Full Description**: Rich text editor with toolbar; "Generate with AI" badge (click does nothing); max 600 chars; helper text "Max 600 characters." shown below
- [ ] **Redemption Instructions**: Rich text editor with toolbar; "Generate with AI" badge (click does nothing); max 600 chars; helper text shown below
- [ ] **Status field**: Removed from form UI
- [ ] **Save as Draft** (create mode): Submits form with `status: 'DRAFT'`
- [ ] **Save as Draft** (edit mode): Submits form preserving the deal's existing status
- [ ] **Preview Deal**: Button is visible but disabled (opacity reduced); has tooltip or title "Coming soon"
- [ ] **Create mode**: Form opens with empty fields; on success shows toast and closes
- [ ] **Edit mode**: Form opens pre-populated with `initialData`; on success shows toast and closes
- [ ] **Validation**: All required fields show inline error messages on failed submit
- [ ] **Form sections**: "Deal Details" heading, horizontal divider, "Redemption Instructions" heading visible

### Backend (Phase 0)

- [x] `audience` column added to `Deal` table via new migration
- [x] `DealAudience` enum added to Prisma schema
- [x] `UpsertDealDto` accepts `audience` field
- [x] `adminCreate` and `adminUpdate` persist `audience` value
- [x] `GET /v1/admin/deals` and `GET /v1/admin/deals/:uid` return resolved `logoUrl` alongside `logoUid`

### Non-functional

- [x] No TypeScript errors in modified files
- [ ] No regression in existing deal create/edit flows
- [x] Shared `DEAL_CATEGORIES` constant used in both `DealForm` and `DealsPage` filter (no duplication)

---

## Edge Cases & Gotchas

| Scenario | Handling |
|---|---|
| Logo upload while form is loading | Disable avatar upload button while `isSubmitting` |
| File too large or wrong type | Let `saveRegistrationImage` fail; show `toast.error`; clear `logoUid` |
| User uploads logo then cancels | Orphaned image in DB — accepted trade-off (consistent with app pattern) |
| Logo deletion must send `null`, not `undefined` | Explicitly set `logoUid: null` (not omit) to trigger backend clear |
| `fetchTeamsForAutocomplete` returns `undefined` on error | Show "No options" in AsyncSelect; allow free-text `vendorName` |
| Edit mode: deal has `logoUid` but no `logoUrl` | Check if API already returns `logoUrl`; add backend join if not |
| Rich text 600-char limit | Quill counts plain text characters (strips HTML tags) — consistent with `RichTextEditor`'s existing counter |
| `react-quill` SSR issue (Next.js) | `RichTextEditor` component already handles this — no extra work needed |
| Category / Audience react-select value shape | Extract `.value` from option object at submit time (see Phase 3, note 4) |

---

## Open Questions

| # | Question | Impact |
|---|---|---|
| 1 | What are the exact `DealAudience` enum values? | Blocks Phase 0 |
| 2 | Does `GET /v1/admin/deals` already return `logoUrl`? | Determines if backend work needed for edit mode logo display |
| 3 | Is `vendorTeamUid` required, or can admins create deals for non-PL-Network vendors? | Affects validation rules |
| 4 | What does "Preview Deal" do long-term? | Placeholder for now; disable button with tooltip |

---

## References

### Internal

- Current DealForm: `apps/back-office/screens/deals/components/DealForm/DealForm.tsx`
- DealForm styles: `apps/back-office/screens/deals/components/DealForm/DealForm.module.scss`
- Deal types: `apps/back-office/screens/deals/types/deal.ts`
- Existing RichTextEditor: `apps/back-office/components/common/rich-text-editor.tsx`
- Image upload utility: `apps/back-office/utils/services/member.ts:26–45` (`saveRegistrationImage`)
- ProfileImageInput pattern: `apps/back-office/screens/members/components/MemberForm/ProfileImageInput/ProfileImageInput.tsx`
- Team autocomplete: `apps/back-office/utils/services/team.ts:17–28` (`fetchTeamsForAutocomplete`)
- Prisma Deal model: `apps/web-api/prisma/schema.prisma:1415–1436`
- Backend DTO: `apps/web-api/src/deals/deals.dto.ts:11–20`
- Backend service: `apps/web-api/src/deals/deals.service.ts`
- FormProvider usage example: `apps/back-office/screens/members/components/MemberForm/MemberForm.tsx:24–55`
- DealsPage (parent): `apps/back-office/pages/deals/index.tsx:307–316`

### Design

- Figma: https://www.figma.com/design/US3xcMIkBWVuBmefw3Bh4k/Deals?node-id=75-9581&m=dev
- Brainstorm: `docs/brainstorms/2026-03-18-deal-form-redesign-brainstorm.md`
