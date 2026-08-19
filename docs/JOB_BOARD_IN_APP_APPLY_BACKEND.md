# Job Board in-app apply — backend implementation

**Linear:** [LAB-2309 — Persist in-app applications and a private job search status](https://linear.app/plrs-labos/issue/LAB-2309/job-board-persist-in-app-applications-and-a-private-job-search-status)

**Design (read-only context):** https://directoryv2.dev.plnetwork.io/prototypes/job-board

**Scope of this document:** backend only (`pln-directory-portal` web-api + email template in `pl-notification-service`). Do **not** implement frontend (`pln-directory-portal-v2`). FE is [LAB-2310](https://linear.app/plrs-labos/issue/LAB-2310/job-board-sign-up-complete-profile-and-apply-in-app) and is blocked on this work.

---

## Goal

Members can apply to a Job Board role **in Directory**: persist the application (profile snapshot + required cover letter) and email the hiring team's **leads** with a template. Apply is allowed only when:

1. The member is **approved** (`MemberApproval.state === APPROVED`). Existing Directory approval — do not invent a new approval flow.
2. The member has a **current role** (`Member.role` non-empty after trim).
3. The member has set a **job search status**.

Browsing jobs stays public. External `sourceLink` on the job is unchanged (FE still links out). There is **no** in-product applications inbox this iteration.

---

## Product rules (do not weaken)

| Rule | Detail |
|------|--------|
| Approval | Reuse `MemberApproval`. `PENDING`, `VERIFIED`, and `REJECTED` cannot submit. Only `APPROVED`. Pending members **can** still update their own profile (already true today). |
| Profile gate | Required: `role` + `jobSearchStatus`. Optional: experience, contributions, skills, bio, location, GitHub, current company. `"Not looking"` is a valid status and **still allows** applying. |
| Existing members | Same gate. Approved members with empty role or empty status cannot apply. |
| Privacy | `jobSearchStatus` is visible only to the member themselves and Directory admins (PL Team). Never on public member list/detail for other viewers. Never in the application snapshot. Never in the email to team leads. **Do not** reuse `Member.openToWork` — that field is public and means “open to collaborate”. |
| Duplicate apply | One application per member per job. Second submit → `409`. |
| After approval | Existing approval email is enough. Do **not** auto-submit or auto-resume a role they started during sign-up. |
| Sign-up company | Optional current company stored on the profile as a string. Do **not** auto-create `TeamMemberRole` / team affiliation from this field. |
| Notification | Templated email to team leads only. No hiring-team inbox API. |

Status labels (API wire values, hyphenated):

- `actively-looking` — Actively looking
- `open-to-right-role` — Open to the right role
- `not-looking` — Not looking

---

## Closest existing pattern

**Copy `JobOpeningsReferralService`**, do not invent a second notification style.

| Piece | Location |
|-------|----------|
| Refer endpoint | `POST /v1/job-openings/:uid/referrals` |
| Service | `apps/web-api/src/job-openings/job-openings-referral.service.ts` |
| Contract | `libs/contracts/src/lib/contract-job-openings.ts` + `libs/contracts/src/schema/job-referral.ts` |
| Hidden jobs | `HIDDEN_JOB_OPENING_STATUSES` in `job-openings-query.service.ts` |
| Auth | `UserAuthValidateGuard` → `request.userEmail` |
| Email | `NotificationServiceClient.sendNotification` with template `JOB_BOARD_REFERRAL_EMAIL` |
| Template JSON | `pl-notification-service/libs/data-access-templates/templates/jobBoardReferral.json` |
| RecipientsInfo | supports `to`, `cc`, `replyTo` (`pl-notification-service/libs/data-types/src/lib/notification.ts`) |

Sign-up already exists: unauthenticated `POST /v1/participants-request/member` → `ParticipantsRequestService.handleMemberRequest` → `MembersService.createMemberAndAttach` (creates member + `MemberApproval` PENDING, optional `Member.role`, optional team attach). Extend this; do not add a parallel sign-up endpoint.

Member self-update already exists: `PUT /v1/members/:uid` (`updateMember` / `updateMemberFromParticipantsRequest`) and `PATCH /v1/members/:uid/self-role`. Pending users can call these. Add `jobSearchStatus` (and optional `currentCompany`) to the update path so FE does not need a new profile-save API.

---

## Data model

Prisma: `apps/web-api/prisma/schema.prisma`. Add a migration (do not edit old ones).

### `JobSearchStatus` enum

```prisma
enum JobSearchStatus {
  ACTIVELY_LOOKING
  OPEN_TO_RIGHT_ROLE
  NOT_LOOKING

  @@map("job_search_status")
}
```

Expose **hyphenated** strings on the HTTP API (`actively-looking`, etc.). Map at the contract/service boundary. Do not leak Prisma enum names (`ACTIVELY_LOOKING`) to FE.

### `Member` additions

```prisma
model Member {
  // existing fields…
  jobSearchStatus  JobSearchStatus?
  currentCompany   String?
  jobApplications  JobApplication[]
}
```

- `jobSearchStatus` null = unanswered (incomplete for apply).
- `currentCompany` optional free-text from sign-up “company” (or resolved team name if the client sent a team uid **as the company label only** — still no `TeamMemberRole`).

### `JobApplication`

Mirror `JobReferral` (`schema.prisma` around the `JobOpening` / `JobReferral` models):

```prisma
model JobApplication {
  id            Int        @id @default(autoincrement())
  uid           String     @unique @default(cuid())
  jobOpeningUid String
  jobOpening    JobOpening @relation(fields: [jobOpeningUid], references: [uid], onDelete: Cascade)
  memberUid     String
  member        Member     @relation(fields: [memberUid], references: [uid], onDelete: Cascade)
  coverLetter   String
  profileSnapshot Json
  toEmail       String
  ccEmails      String[]   @default([])
  createdAt     DateTime   @default(now())

  @@unique([jobOpeningUid, memberUid])
  @@index([memberUid])
  @@index([jobOpeningUid])
}
```

Add `applications JobApplication[]` on `JobOpening`.

`profileSnapshot` is a frozen copy of what was sent, captured at submit time so later profile edits do not rewrite history. Suggested shape:

```ts
{
  memberUid: string;
  name: string;
  email: string;
  role: string;
  currentCompany: string | null;
  location: { city?: string; country?: string; region?: string } | null;
  skills: string[];           // skill titles
  bio: string | null;
  githubHandler: string | null;
  linkedinHandler: string | null;
  experiences: Array<{
    title: string;
    company: string;
    location: string | null;
    startDate: string;        // ISO
    endDate: string | null;
    isCurrent: boolean;
    description: string | null;
  }>;
  contributions: Array<{
    projectName: string | null;
    role: string | null;
    startDate: string | null;
    endDate: string | null;
    currentProject: boolean | null;
    description: string | null;
  }>;
  profileUrl: string;         // `${WEB_UI_BASE_URL}/members/${uid}`
}
```

**Never** put `jobSearchStatus` in this JSON.

---

## HTTP API

Add to `libs/contracts/src/lib/contract-job-openings.ts` and a new `libs/contracts/src/schema/job-application.ts`. Follow the referral contract style (zod + ts-rest). Parse with the same Zod → `BadRequestException` helper already on `JobOpeningsController`.

Base path: `/v1` (`getAPIVersionAsPath('1')`).

### `POST /v1/job-openings/:uid/applications`

Submit an application.

- Guard: `UserAuthValidateGuard` (same as referrals). Resolve applicant via `request.userEmail`.
- Body:

```ts
{
  coverLetter: string; // trim; min 1; max 2000
}
```

- Success `201`:

```ts
{
  uid: string;
  jobUid: string;
  appliedAt: string; // ISO
}
```

Errors:

| Status | When |
|--------|------|
| 401 | No/invalid auth |
| 404 | Job missing, no team, or status in `HIDDEN_JOB_OPENING_STATUSES` (same as referrals) |
| 403 | Member not `APPROVED` (include a clear message: account must be approved before applying) |
| 400 | Missing/blank `coverLetter`; missing `role`; missing `jobSearchStatus`; no team-lead emails |
| 409 | Already applied to this job (`@@unique`) |

Flow (in `JobOpeningsApplicationService`, new file next to the referral service):

1. Resolve applicant by email (not deleted, has email) — same idea as `resolveReferrer`.
2. Resolve job + team — reuse / extract `resolveJobOpening` if that keeps both services honest. Hidden statuses → 404.
3. Load `memberApproval.state`, `role`, `jobSearchStatus`. Gate as above.
4. Load team leads: `TeamMemberRole` where `teamUid = job.teamUid` and `teamLead = true`, member not deleted, email present. If **none**, `400` (do not email the whole team; this iteration is leads only).
5. Build `profileSnapshot` from the live member record (include experiences + project contributions + skills).
6. Build email HTML for the cover letter (escape, same `noteToHtml` approach as referrals).
7. Recipients: first lead → `to`; remaining leads → `cc`. Set `replyTo` to the applicant email so leads can reply directly. Do **not** CC the applicant unless you have a strong reason; referral CCs referrer+referred because those people are part of the intro — here the applicant is the sender.
8. `NotificationServiceClient.sendNotification` (see template section). If send throws, **do not** persist (same order as referrals: notify then create).
9. `prisma.jobApplication.create`. Unique violation → `409`.

### `GET /v1/job-openings/applications`

List the current member's applications (so FE can mark rows **Applied**).

- Guard: `UserAuthValidateGuard`
- `200`:

```ts
{
  applications: Array<{
    uid: string;
    jobUid: string;
    appliedAt: string; // ISO
  }>;
}
```

Register this **static** path in the contract **before** `/:uid/...` routes if Nest/ts-rest matching could collide (same as `/job-openings/filters` vs `/:uid`).

Do **not** return cover letters or snapshots on this list. FE only needs job uids.

Optional extra (nice, not required): `GET /v1/job-openings/:uid/applications/me` → that one application or 404. The list endpoint is enough.

---

## Member: job search status + current company

### Persist on create/update

Add both fields to `directFields` in:

- `MembersService.prepareMemberFromParticipantRequest`
- `admin/member.service.ts` `prepareMemberFromParticipantRequest` (same list)

Validate `jobSearchStatus` against the three wire values (or null/omit). Reject unknown values with 400.

Sign-up `POST /v1/participants-request/member`:

- Already accepts `newData` (name, email, linkedinHandler, role via `body.role` / `newData.role`, signUpSource).
- Accept optional `newData.currentCompany` (string) or `body.company` (string). Persist on `Member.currentCompany`.
- If the client sends `body.team` **only** as “I work at this PortCo” for this flow, **do not** attach a `TeamMemberRole`. Safest: document that job-board sign-up must send `currentCompany` as a string and **omit** `body.team` / `isTeamNew`. If you need to accept a team uid as the company picker value, resolve `Team.name` into `currentCompany` and skip `attachTeamAndRoleTx`.
- Set `newData.signUpSource` to `"job-board"` when the client sends it (FE will). No new sign-up endpoint.

`PATCH /v1/members/:uid/self-role` already sets `Member.role`. Keep it. Job search status can go through the existing PUT member update; a tiny dedicated `PATCH /v1/members/:uid/job-search-status` is optional if it is cleaner — not required if PUT already round-trips the field via `directFields`.

### Read + privacy

`GET /v1/members/:uid` (and any other public/member-facing get):

- Always may return `role` and `currentCompany` (not secret).
- Return `jobSearchStatus` **only** when the requestor is the member themselves **or** `isDirectoryAdmin(requestor)`.
- Otherwise omit the field (or null it) so a hiring team opening `/members/:uid` cannot see it.

`GET /v1/members` list: never include `jobSearchStatus`.

Admin APIs (`apps/web-api/src/admin/member.service.ts` list/detail/update, `libs/contracts/src/schema/admin-member.ts`): **include** `jobSearchStatus` and `currentCompany` so PL Team can see them. No new admin UI required in this ticket.

`MemberApprovalsService.list` already selects `role`. Add `jobSearchStatus` and `currentCompany` there so reviewers see them during the existing approval.

Contracts: add optional `jobSearchStatus` / `currentCompany` to member response schemas used by get-by-uid. Do not add `jobSearchStatus` to list schemas.

---

## Email template

Repo: `pl-notification-service`.

1. Add `libs/data-access-templates/templates/jobBoardApplication.json` modelled on `jobBoardReferral.json`.
2. Template name: `JOB_BOARD_APPLICATION_EMAIL`.
3. Suggested subject: `{{applicantName}} applied for {{roleTitle}} at {{teamName}}`
4. Variables: `applicantName,applicantRole,applicantCompany,roleTitle,teamName,coverLetterHtml,profileUrl,applyUrl`
5. Body: applicant name + current role (and company if present), cover letter card (unescaped HTML via Handlebars triple-stash like `{{{noteHtml}}}` in the referral template), CTA “View profile” → `profileUrl`, optional “View the role” → `applyUrl` (`JobOpening.sourceLink`, may be null).
6. **Do not** mention job search status.

web-api send payload (same shape as referral):

```ts
await this.notificationServiceClient.sendNotification({
  isPriority: true,
  deliveryChannel: 'EMAIL',
  templateName: 'JOB_BOARD_APPLICATION_EMAIL',
  recipientsInfo: {
    to: [to],
    cc,
    replyTo: applicant.email,
  },
  deliveryPayload: {
    body: {
      applicantName: applicant.name,
      applicantRole: applicant.role,
      applicantCompany: applicant.currentCompany ?? '',
      roleTitle: jobOpening.roleTitle,
      teamName: jobOpening.team.name,
      coverLetterHtml,
      profileUrl: `${process.env.WEB_UI_BASE_URL}/members/${applicant.uid}`,
      applyUrl: jobOpening.sourceLink || null,
    },
  },
  entityType: 'JOB_OPENING',
  actionType: 'APPLICATION',
  sourceMeta: {
    activityId: jobOpening.uid,
    activityType: 'JOB_OPENING',
    activityUserId: applicant.uid,
    activityUserName: applicant.name,
  },
  targetMeta: {
    emailId: to,
    userId: /* first lead uid */,
    userName: /* first lead name */,
  },
});
```

Templates in notification-service may need to be seeded/upserted in the environment (same operational step as `JOB_BOARD_REFERRAL_EMAIL`). If this repo auto-loads JSON from `templates/`, adding the file is enough; if templates are created via API/DB, document that in the PR.

---

## Module wiring

`apps/web-api/src/job-openings/job-openings.module.ts`:

- Add `JobOpeningsApplicationService`.
- Export it if tests/other modules need it.
- Controller methods on existing `JobOpeningsController` (keep one controller).

Do not change list/filter job endpoints.

---

## Tests

Follow `apps/web-api/docs/GUIDELINES_TESTING.md`. Prefer a focused service spec (referral has no spec today — add one for applications).

Cover:

- Happy path: approved + role + status + cover letter → 201, row created, notification called with lead emails and `replyTo` = applicant.
- `PENDING` / `VERIFIED` / `REJECTED` → 403, no row, no email.
- Missing role or missing status → 400.
- `not-looking` + role set → allowed.
- Duplicate → 409, single email (first apply only).
- Hidden/stale job → 404.
- No team leads with email → 400.
- Unauthenticated → 401.
- Cover letter empty / over 2000 → 400.
- Snapshot omits `jobSearchStatus`.
- `GET` applications returns only the current member's jobs.
- Member GET: admin/self sees `jobSearchStatus`; other authenticated viewer does not.
- Sign-up / member update persists `jobSearchStatus` and `currentCompany` without creating a team membership.

Mock `NotificationServiceClient` and Prisma (or use the existing e2e harness + fixtures if that is faster in this package).

---

## Out of scope

- Frontend (banners, drawer, apply modal, team profile Apply button) — LAB-2310.
- Founder-facing surfacing of job-seekers.
- Application status beyond “exists / Applied” (no reviewed/closed).
- Hiring-team or PL-team applications inbox.
- Auto-apply or resume-the-role after approval.
- Changing `openToWork` meaning or public “Open to Collaborate”.
- Matching / “best match for me” (explicitly dropped in the prototype).

---

## Suggested file list

| File | Change |
|------|--------|
| `apps/web-api/prisma/schema.prisma` | Enum, Member fields, `JobApplication` |
| `apps/web-api/prisma/migrations/<timestamp>_add_job_applications_and_job_search_status/migration.sql` | Migration |
| `libs/contracts/src/schema/job-application.ts` | New |
| `libs/contracts/src/lib/contract-job-openings.ts` | Two routes |
| `libs/contracts/src/schema/member.ts` | Optional fields on get-by-uid |
| `libs/contracts/src/schema/admin-member.ts` | Admin see/update |
| `apps/web-api/src/job-openings/job-openings-application.service.ts` | New |
| `apps/web-api/src/job-openings/job-openings.controller.ts` | Wire routes |
| `apps/web-api/src/job-openings/job-openings.module.ts` | Provider |
| `apps/web-api/src/job-openings/job-openings-application.service.spec.ts` | Tests |
| `apps/web-api/src/members/members.service.ts` | `directFields`, strip status on public read |
| `apps/web-api/src/members/members.controller.ts` | Pass viewer into sanitizer if needed |
| `apps/web-api/src/admin/member.service.ts` | Select + `directFields` |
| `apps/web-api/src/member-approvals/member-approvals.service.ts` | Include fields on list |
| `pl-notification-service/libs/data-access-templates/templates/jobBoardApplication.json` | Email template |

Keep PRs requirement-faithful: no extra matching, no inbox, no FE.
