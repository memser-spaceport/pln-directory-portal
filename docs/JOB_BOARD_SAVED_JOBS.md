# Job Board saved jobs — backend

**Linear:** [LAB-2628 — Persist saved jobs for members](https://linear.app/plrs-labos/issue/LAB-2628). Frontend companion: [LAB-2629](https://linear.app/plrs-labos/issue/LAB-2629) (bookmark control, Saved tab, toast, empty state).

**Design (read-only context):** https://directoryv2.dev.os.pl.xyz/prototypes/saving

**Scope of this document:** backend only (`pln-directory-portal` web-api + `libs/contracts`).

---

## What a save is

A **private bookmark** on a job opening. Nobody but the member who made it ever sees it: no team is notified, nothing reaches an ATS, no response anywhere carries a count of how many people saved a role.

It is deliberately **not** `JobOpeningInterest`. Interest is a signal *to the hiring team* — counted in public, pushed to Protocol Labs' ATS, read by team leads on the applicants page, and one-way (there is no un-marking team interest). A save is none of those things and must be reversible. Do not fold the two together.

| | Saved job | Job interest | Job application |
|---|---|---|---|
| Visible to the team | no | yes | yes |
| Reversible | yes | no | no |
| Counted publicly | no | yes | no |
| Pushed to an ATS | no | yes | yes |
| Gate | live member | live member | `APPROVED` member + role + job search status |

## Data model

`SavedJobOpening` in `apps/web-api/prisma/schema.prisma`, migration `20260922120000_add_saved_job_opening`:

```prisma
model SavedJobOpening {
  id            Int        @id @default(autoincrement())
  uid           String     @unique @default(cuid())
  jobOpeningUid String
  jobOpening    JobOpening @relation(fields: [jobOpeningUid], references: [uid], onDelete: Cascade)
  memberUid     String
  member        Member     @relation(fields: [memberUid], references: [uid], onDelete: Cascade)
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  @@unique([jobOpeningUid, memberUid])
  @@index([jobOpeningUid])
  @@index([memberUid])
}
```

`createdAt` is the clock the Saved tab reads back as "Saved 3d ago". A repeat save must not move it — that is why the upsert's `update` is empty.

A save of a role that later closes is **kept, not deleted**. Both reads filter on the job's board visibility, so the bookmark disappears from the list and returns, with its original `savedAt`, if the role becomes visible again.

## HTTP API

All three routes sit behind `UserAuthValidateGuard` with `@NoCache()`, in `JobOpeningsController` → `JobOpeningsSavedService`.

### `POST /v1/job-openings/:uid/save`

Idempotent. `200` → `{ jobUid, viewerHasSaved: true }`.

| Status | When |
|--------|------|
| 401 | No session, or the email resolves to no member / a soft-deleted member |
| 404 | Job missing, no team, or status in `HIDDEN_JOB_OPENING_STATUSES` |

Saving again succeeds, creates no second row, and leaves `savedAt` alone.

### `DELETE /v1/job-openings/:uid/save`

Idempotent. `200` → `{ jobUid, viewerHasSaved: false }`.

Deliberately **not** gated on board visibility and it does not look the job up at all: a bookmark on a role that has since closed is exactly the one a member wants to drop. Unsaving something never saved is a `200` no-op. Only `401` is possible.

### `GET /v1/job-openings/saved`

`200` → `{ savedJobs: [{ uid, jobUid, savedAt }] }`, newest save first, **unpaged**.

The whole list is the contract: the frontend holds it as one map and reads "a `jobUid` absent from it means not saved" off it, exactly as `useJobApplications` / `useJobInterests` do. Saves whose job is hidden or teamless are filtered out. A member with none gets `{ savedJobs: [] }`, not a 404.

Declared before `getJob` in both the contract router and the controller — Nest registers routes in method-declaration order, and `/v1/job-openings/:uid` would otherwise answer `/saved`.

### `saved=true` on the board list and its facets

`GET /v1/job-openings?saved=true&…` and `GET /v1/job-openings/filters?saved=true` narrow to the caller's saved roles. The Saved tab is the board with one more predicate, so the rail, the search box, the sort, the paging and the facet counts all keep working inside it.

- The predicate is `{ savedBy: { some: { memberUid } } }`, pushed into `buildWhere`'s `AND` with every other filter, so the narrowing happens in Postgres and the totals describe the saved set.
- It is not a facet: it survives the count-overrides, exactly like `teamUid`.
- `saved=true` with no live member's session → `401`. Never the whole board, never an empty list — a signed-out Saved tab must not look like an empty one.
- `saved` absent or false is inert: the board, the team profile's scoped list, `getJobOpening`, the For You roll-ups, the Husky jobs tool and job-alert digest matching all build exactly the where they built before, and an anonymous unscoped read still performs no member lookup.

`getJobFilters` gained `UserAuthValidateGuard` for this. It is the optional-auth guard, so anonymous facet reads still return `200`.

## Analytics

`ANALYTICS_EVENTS.JOB_BOARD.SAVE_RECORDED` (`job-save-recorded`), `distinctId: save:<uid>`, properties `save_uid` / `job_uid` / `team_uid` / `origin: 'job-save'`. Fired on a **first** save only; a repeat save and an unsave record nothing. No ATS push.

## Not in this feature

- Saving anything other than a job opening. The design prototype's one store also holds feed stories and forum posts; there is no backend for those, and no polymorphic `SavedItem` table.
- `viewerHasSaved` / `savedAt` on `JobRoleSchema` — the whole-list read already answers both for every role on screen.
- Any team-facing read of who saved a role, a save count, notifications, or a saved-role digest.
- An approval gate. A pending member can save; only applying requires `APPROVED`.

## Files

| Piece | Location |
|-------|----------|
| Service | `apps/web-api/src/job-openings/job-openings-saved.service.ts` |
| Routes | `apps/web-api/src/job-openings/job-openings.controller.ts` |
| Scope | `apps/web-api/src/job-openings/job-openings-query.service.ts` (`buildWhere`, `listJobOpenings`, `getFilters`) |
| Contract | `libs/contracts/src/lib/contract-job-openings.ts`, `libs/contracts/src/schema/job-opening.ts` |
| Analytics | `apps/web-api/src/job-openings/job-openings-analytics.ts` |
| Tests | `job-openings-saved.service.spec.ts`, `job-openings-saved.routes.spec.ts`, `job-openings-saved-scope.spec.ts`, `job-openings-saved.contract.spec.ts` |
