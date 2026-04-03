# Access Level Permissions Matrix

This document is the **source of truth** for all user permissions across the PLN Directory Portal. It maps every access level, role, and flag to the features they control — intended to support the future migration to an RBAC model.

---

## 1. Access Level Definitions

| Level | Name | Description |
|-------|------|-------------|
| **L0** | KYC Pending | Account created but KYC pending. Can only access their profile; all other features behave like a logged-out view. |
| **L1** | KYC Complete | KYC complete, awaiting admin approval. User sees verification success and is prompted to fill out their profile. No feature access yet. Admin receives an email to approve/reject. |
| **L2** | Access Approved | Approved user. Has access to all standard features. |
| **L3** | Mission Aligned | Verified + Friends of PL. Same feature access as L2 with `plnFriend` flag enabled. |
| **L4** | Portfolio / Core Contributor | Portfolio Investment or Core Contributors. Users added via Back Office "Add Member" flow. |
| **L5** | Investor Level 5 | Advanced investor access with team investor profile capabilities. **No Forum access.** |
| **L6** | Investor Level 6 | Premium investor access with team and personal investor profile capabilities. |
| **Rejected** | Rejected | User rejected by admin. Account is soft-deleted and has no access. |

---

## 2. Derived Flags by Access Level

These flags are automatically resolved when an access level is assigned.

| Level | isVerified | plnFriend | isInvestor | UI Group |
|-------|:----------:|:---------:|:----------:|:--------:|
| L0    | false      | false     | false      | base     |
| L1    | false      | false     | false      | base     |
| L2    | false      | false     | false      | advanced |
| L3    | true       | true      | false      | advanced |
| L4    | true       | false     | false      | advanced |
| L5    | true       | false     | true       | advanced |
| L6    | true       | false     | true       | advanced |

- **base** (L0, L1): limited view — essentially the same as a logged-out experience.
- **advanced** (L2–L6): full feature access (with per-feature exceptions noted below).

---

## 3. Additional User Properties (from `IUserInfo`)

These properties are independent of access level and grant additional capabilities:

| Property | Type | Source | Purpose |
|----------|------|--------|---------|
| `roles` | `string[]` | DB `MemberRole` table | Contains `'DIRECTORYADMIN'` and/or `'DEMO_DAY_ADMIN'` |
| `leadingTeams` | `string[]` | DB `TeamMemberRole` where `teamLead=true` | Array of team UIDs the user leads |
| `isTierViewer` | `boolean` | DB / auth cookie | Can see team priority/tier tags and membership source |

---

## 4. UI Permissions Matrix — General Features

Legend: ✅ Allowed | ❌ Denied | 🔑 Conditional | `--` Not applicable

| Feature | Public | L0 | L1 | L2 | L3 | L4 | L5 | L6 | Condition |
|---------|:------:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|-----------|
| Browse directory (members, teams, projects) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| View Demo Day listing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| View IRL Events | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| Sign up | ✅ | -- | -- | -- | -- | -- | -- | -- | |
| View own profile | -- | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| Edit own profile | -- | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `isOwner` |
| "Complete Your Profile" banner | -- | ✅ | ✅ | -- | -- | -- | -- | -- | `base` group only |
| Alignment Asset pages | -- | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Any authenticated user |
| View contact details (other members) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `advanced` OR `isOwner` |
| Connect with members | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `advanced` group |
| Subscribe to recommendations | -- | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `advanced` group |
| View upcoming events widget | -- | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `advanced` group |
| Add / edit projects | -- | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `advanced` group |
| IRL Events: follow, attend, edit attendance | -- | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `advanced` group |
| Attendee list interactions | -- | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | `advanced` group |
| **Forum access** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | **❌** | ✅ | `hasForumAccess()` — **L5 explicitly excluded** |
| **Deals page** | ❌ | ❌ | ❌ | 🔑 | 🔑 | 🔑 | 🔑 | 🔑 | Whitelist-based via `/v1/deals/access` |
| Investor profile features | -- | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | `isInvestor()` — L5, L6 only |
| Investor email preferences (event invites, dealflow digests) | -- | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | `accessLevel === 'L5' \|\| accessLevel === 'L6'` |

---

## 5. Team Permissions

| Action | Who Can Do It | Condition |
|--------|---------------|-----------|
| View team details | Everyone | Public |
| Edit team details (all sections) | Team Lead, Directory Admin | `isTeamLeaderOrAdmin(userInfo, teamId)` = `isAdminUser()` OR `leadingTeams.includes(teamId)` |
| Manage team members | Team Lead, Directory Admin | Same as above |
| Delete team (soft delete) | Directory Admin only | `isAdminUser(userInfo)` |
| Review team enrichment | Team Lead only | `isMemberTeamLead(teamUid, memberUid)` (backend) |
| View team priority/tier tags | Tier Viewers, Directory Admin | `isTierUser(userInfo)` OR `isAdminUser(userInfo)` |
| View team membership source | Tier Viewers, Directory Admin | Same as above |
| Filter teams by tier | Tier Viewers, Directory Admin | Same as above |
| Update team access level | Backend only (no UI guard) | API endpoint |

---

## 6. Project Permissions

| Action | Who Can Do It | Condition |
|--------|---------------|-----------|
| View projects | Everyone | Public |
| Create project | L2–L6 | `advanced` group + API `@AccessLevels(L2, L3, L4, L5, L6)` |
| Edit project | Project creator, team member of maintaining team, Directory Admin | `hasProjectEditAccess()`: `isAdminUser()` OR `uid === createdBy` OR user's teams include `project.teamUid` |
| Delete project | Team lead of maintaining team, Directory Admin | `hasProjectDeleteAccess()`: `isAdminUser()` OR `leadingTeams.includes(project.teamUid)` |

---

## 7. Forum Permissions

| Action | Public | L0 | L1 | L2 | L3 | L4 | L5 | L6 | Directory Admin |
|--------|:------:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---------------:|
| View forum feed | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| View forum post | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Create forum post | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Edit own forum post | -- | -- | -- | ✅ | ✅ | ✅ | -- | ✅ | ✅ |
| Edit any forum post | -- | -- | -- | ❌ | ❌ | ❌ | -- | ❌ | ✅ |
| Edit own comment | -- | -- | -- | ✅ | ✅ | ✅ | -- | ✅ | ✅ |
| Edit any comment | -- | -- | -- | ❌ | ❌ | ❌ | -- | ❌ | ✅ |
| Assign post author | -- | -- | -- | ❌ | ❌ | ❌ | -- | ❌ | ✅ |
| View forum activity on member profile | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

- Forum access gate: `hasForumAccess()` allows L2, L3, L4, L6.
- L5 sees "Forum Access Restricted" message.
- L0/L1 see a logged-out prompt.
- Directory Admins can edit any post/comment and change the post author.

---

## 8. Demo Day Permissions

### 8.1 Demo Day Access Types

| Access Type | Who Gets It | Description |
|-------------|-------------|-------------|
| `none` | Non-participants, unauthenticated | No demo day access; sees landing/apply page |
| `FOUNDER` | Teams/founders accepted into demo day | Can manage pitch, view founder dashboard, analytics |
| `INVESTOR` | Approved investors | Can view teams, engage, provide feedback |
| `SUPPORT` | Support staff | Same capabilities as INVESTOR |
| `isDemoDayAdmin` | Members with DEMO_DAY_ADMIN role + matching host scope | Full admin — can edit demo day content |
| `isDemoDayReadOnlyAdmin` | Scoped read-only admins | View-only admin access |
| `isEarlyAccess` | Flagged participants | Early access to active demo day |

### 8.2 Demo Day Pages Access Matrix

| Page / Route | Anonymous | `none` (logged in) | FOUNDER | INVESTOR / SUPPORT | DD Admin | DD ReadOnly Admin | Directory Admin |
|--------------|:---------:|:-------------------:|:-------:|:------------------:|:--------:|:-----------------:|:---------------:|
| `/demoday` (list) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/demoday/[id]` (landing) | ✅ | ✅ | → redirect | → redirect | ✅ | ✅ | ✅ |
| `/demoday/[id]/founder` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/demoday/[id]/investor` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `/demoday/[id]/active` | ❌ | ❌ | ✅ | ✅ (profile complete) | ✅ | ✅ | ✅ |
| `/demoday/[id]/archive` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/demoday/[id]/completed` | ✅ (limited) | ✅ (limited) | ✅ + analytics | ✅ + feedback | ✅ | ✅ | ✅ |
| `/demoday/[id]/prep` | ❌ | ❌ | ✅ (not COMPLETED) | ❌ | ✅ (can edit) | ✅ (read-only) | ✅ (can edit) |
| `/demoday/[id]/showcase` | ❌ | ❌ | ❌ | ❌ | ✅ (can edit) | ✅ (read-only) | ✅ (can edit) |
| `/demoday/[id]/founders-dashboard` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/demoday/[id]/analytics-report/[teamUid]` | ❌ | ❌ | ✅ (if report exists) | ❌ | ❌ | ❌ | ❌ |

### 8.3 Demo Day Feature Details

| Feature | Who | Condition |
|---------|-----|-----------|
| Apply for Demo Day | Any logged-in user | `access === 'none'` and not `isPending` |
| View "Applied" stepper | Pending applicants | `isPending && userInfo.uid` |
| Confidentiality acceptance modal | All participants on Active page | Shown until `confidentialityAccepted === true` |
| Investor profile completion stepper | INVESTOR / SUPPORT | 3 steps: complete profile → add to calendar → access |
| Investor profile auto-complete | L2, L3, L4 | `checkInvestorProfileComplete()` returns `true` for L2–L4 |
| View founder analytics report | FOUNDER | `isFounder && fundraisingProfile?.analyticsReportUrl` |
| Submit feedback | INVESTOR / SUPPORT | On completed page |
| Early access badge | Flagged participants | `isEarlyAccess === true` |
| Edit demo day content (prep/showcase) | DD Admin, Directory Admin | `canEdit = isDirectoryAdmin \|\| isDemoDayAdmin` |
| View demo day admin pages (prep/showcase) | DD Admin, DD ReadOnly Admin, Directory Admin | `hasAdminAccess = isDirectoryAdmin \|\| isDemoDayAdmin \|\| isDemoDayReadOnlyAdmin` |
| Prep page after COMPLETED status | Directory Admin only | Other admins lose access |

---

## 9. Member Profile Permissions

| Action | Who Can Do It | Condition |
|--------|---------------|-----------|
| View any member profile | Everyone | Public |
| Edit profile details | Profile owner, Directory Admin | `isOwner \|\| isAdminUser()` |
| Edit contact details | Profile owner, Directory Admin | Same |
| Edit office hours | Profile owner, Directory Admin | Same |
| Edit teams on profile | Profile owner, Directory Admin | Same |
| Edit investor profile | Profile owner, Directory Admin | Same |
| Edit contributions | Profile owner, Directory Admin | Same |
| Edit experience | Profile owner, Directory Admin | Same |
| Edit repositories | Profile owner, Directory Admin | Same |
| View investor profile (third-party) | Logged-in users | Only if member has investor profile AND visibility settings allow |
| View office hours details | `advanced` group or profile owner | `accessLevel === 'advanced' \|\| isOwner` |
| Members search filter (admin) | Directory Admin only | `isAdminUser(userInfo)` |

---

## 10. Admin Roles & Permissions

### 10.1 Directory Admin (`DIRECTORYADMIN`)

Full system administration. Has all permissions across the platform:

| Area | Capabilities |
|------|-------------|
| **Members** | CRUD, access level changes, approve/reject, assign roles |
| **Teams** | Edit any team, delete teams (soft delete), view tier/priority |
| **Projects** | Edit/delete any project |
| **Forum** | Edit/delete any post or comment, assign post author |
| **Articles** | CRUD, manage whitelist |
| **Deals** | CRUD, manage whitelist, review submissions and issues |
| **Demo Day** | Create demo days, full access to all demo day admin pages (prep, showcase) even after COMPLETED |
| **Notifications** | Manage push notifications, target by access level |
| **Back Office** | Full access |

### 10.2 Demo Day Admin (`DEMO_DAY_ADMIN`) — Scoped by Host

Access is scoped to specific demo day hosts via `MemberDemoDayAdminScope` (scopeType = `HOST`, scopeValue = e.g. `"plnetwork.io"`).

| Area | Capabilities |
|------|-------------|
| **Demo Day** | Full admin access to demo days matching their host scope |
| **Demo Day Prep/Showcase** | Can edit (prep and showcase pages) |
| **Demo Day Participants** | Add, bulk add, edit participants |
| **Demo Day Whitelist** | Manage dashboard whitelist |
| **Demo Day Subscribers** | View subscriber list |
| **Members** | View/list members (read-only) |

### 10.3 Demo Day Read-Only Admin

| Area | Capabilities |
|------|-------------|
| **Demo Day** | View-only access to prep and showcase pages |
| **Demo Day** | Cannot edit content, participants, or whitelist |

---

## 11. Whitelist-Based Access Systems

These features use admin-managed whitelists independent of access level:

| Feature | Whitelist Mechanism | Who Manages |
|---------|-------------------|-------------|
| **Deals page** | `DealWhitelist` table, checked via `/v1/deals/access` | Directory Admin |
| **Team Tier/Priority viewer** | `isTierViewer` flag on member | Directory Admin (set in back office) |
| **Demo Day Dashboard** | `DashboardWhitelist` per demo day | Directory Admin, Demo Day Admin |

---

## 12. Backend API Permissions Matrix

| API Operation | L0 | L1 | L2 | L3 | L4 | L5 | L6 | Additional Guard |
|---------------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|------------------|
| Participants Request (POST) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Projects: create / update / delete / asks | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Teams: update / asks | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | + team lead or admin |
| Teams: delete | — | — | — | — | — | — | — | Directory Admin only |
| Teams: enrichment review | — | — | — | — | — | — | — | Team Lead only |
| PL Events: guest CRUD | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| PL Events: send presence request | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Admin: member management | — | — | — | — | — | — | — | `AdminAuthGuard` (DIRECTORY_ADMIN) |
| Admin: member list | — | — | — | — | — | — | — | `DemoDayAdminAuthGuard` (DIRECTORY_ADMIN or DEMO_DAY_ADMIN) |
| Admin: articles CRUD | — | — | — | — | — | — | — | `AdminAuthGuard` (DIRECTORY_ADMIN) |
| Admin: deals CRUD | — | — | — | — | — | — | — | `AdminAuthGuard` (DIRECTORY_ADMIN) |
| Admin: demo day create | — | — | — | — | — | — | — | `AdminAuthGuard` (DIRECTORY_ADMIN) |
| Admin: demo day manage | — | — | — | — | — | — | — | `DemoDayAdminAuthGuard` |
| Forum: push notifications | — | — | — | — | — | — | — | `ServiceAuthGuard` (service-to-service only) |

---

## 13. Public vs Protected Routes

### Public Routes (no authentication required)

`/home`, `/members`, `/teams`, `/projects`, `/events/irl`, `/demoday`, `/sign-up`

### Protected Routes

| Route | Requirement |
|-------|-------------|
| `/alignment-asset/*` | Any authenticated user (L0–L6) |
| `/deals` | Authenticated + deals whitelist |
| `/forum` | L2, L3, L4, L6 (not L0, L1, L5) |
| `/demoday/[id]/founder` | FOUNDER access |
| `/demoday/[id]/investor` | INVESTOR or SUPPORT access |
| `/demoday/[id]/active` | Any participant (access !== 'none'), status ACTIVE |
| `/demoday/[id]/prep` | FOUNDER (when not COMPLETED) or Demo Day Admin or Directory Admin |
| `/demoday/[id]/showcase` | Demo Day Admin or Directory Admin |
| `/demoday/[id]/founders-dashboard` | FOUNDER only |
| `/demoday/[id]/analytics-report/*` | FOUNDER only |

---

## 14. Push Notification Targeting

Notifications can target specific access level groups via the `accessLevels` array field:

| Notification Type | Target Access Levels |
|-------------------|---------------------|
| Forum notifications | L2, L3, L4, L6 |
| General / custom | Any combination set by admin |

---

## 15. Special Cases & Edge Cases

1. **L5 has no Forum access** — Despite being `advanced`, L5 is explicitly excluded from `hasForumAccess()`. This is the only standard feature where L5 diverges from other advanced levels.
2. **Deals access is whitelist-based** — Independent of access level. Any authenticated user on the whitelist can access deals.
3. **Tier viewer is flag-based** — `isTierViewer` is a separate boolean flag, not tied to any access level. Controls visibility of team priority/tier tags and membership source section.
4. **L3 and L4 have identical feature access** — They differ only in `plnFriend` (L3 = true) and `isVerified` flags.
5. **Rejected = soft-deleted** — Sets `deletedAt`, removing user from all queries and access.
6. **L1 triggers admin email** — System generates approval/rejection email to admin.
7. **Teams have independent access levels** — Teams have their own `accessLevel` field (default `L1`), updated when members are promoted.
8. **Demo Day Admin is host-scoped** — `DEMO_DAY_ADMIN` role is restricted to specific hosts via `MemberDemoDayAdminScope` table (`scopeType=HOST`, `scopeValue=hostname`).
9. **Prep page access narrows after COMPLETED** — Only Directory Admin retains access; other admins and founders lose it.
10. **Investor profile auto-complete for L2–L4** — `checkInvestorProfileComplete()` returns `true` for L2, L3, L4 regardless of profile data, affecting Demo Day investor flow.
11. **Forum post view has different gate than forum feed** — Post view (`/forum/topics/...`) blocks L0 and L1 but does NOT explicitly block L5, while the forum feed page blocks L0, L1, AND L5.
12. **Project edit is team-membership-based** — Any member of the maintaining team can edit the project, not just the team lead.
13. **Project delete is team-lead-based** — Only the team lead (or admin) can delete, unlike edit which allows any team member.
