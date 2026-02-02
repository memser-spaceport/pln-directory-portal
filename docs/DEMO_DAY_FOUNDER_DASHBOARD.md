# Demo Day Dashboard - Analytics Endpoints

## Overview

Backend endpoints providing engagement analytics for the Founder Dashboard feature. Founders can view investor engagement with their team profile during Demo Day.

## Access Control

### Participant Types (from `DemoDayParticipantType`)

| Type | Description |
|------|-------------|
| `FOUNDER` | Team founders presenting at Demo Day |
| `INVESTOR` | Investors viewing and engaging with teams |
| `SUPPORT` | Support/admin staff |

### Dashboard Access Hierarchy

Access to the Founders Dashboard uses role-based access control with team selection:

| Role | Condition | Requires `teamFundraisingProfileUid`? | Data Access |
|------|-----------|---------------------------------------|-------------|
| `DIRECTORY_ADMIN` | Always | **YES** | Any team in any demo day |
| `DEMO_DAY_ADMIN` | HOST scope matches demo day host | **YES** | Any team in matching demo days |
| `DASHBOARD_WHITELIST` (scopeValue='*') | Always | **YES** | Any team in any demo day |
| `DASHBOARD_WHITELIST` (scopeValue=host) | Host matches demo day host | **YES** | Any team in matching demo days |
| `FOUNDER` | Enabled participant with team | **NO** (auto-derived) | Only their own team's dashboard |

**Priority:** Dashboard must be enabled (`dashboardEnabled = true`) for all roles except none (access is always denied if disabled).

### Database Fields

| Field | Table | Description |
|-------|-------|-------------|
| `dashboardEnabled` | `DemoDay` | Boolean (default: false) - Controls whether dashboard is accessible |
| `scopeType = 'HOST'` | `MemberDemoDayAdminScope` | Admin access scope for DEMO_DAY_ADMIN role |
| `scopeType = 'DASHBOARD_WHITELIST'` | `MemberDemoDayAdminScope` | Whitelist access scope |
| `scopeValue` | `MemberDemoDayAdminScope` | `'*'` for all demo days, or `DemoDay.host` value (e.g., 'plnetwork.io') |

### Whitelist Access

Members can be whitelisted to access dashboards:

```sql
-- Whitelist a user for ALL demo days (any host)
INSERT INTO "MemberDemoDayAdminScope" ("memberUid", "scopeType", "scopeValue")
VALUES ('member-uid-here', 'DASHBOARD_WHITELIST', '*');

-- Whitelist a user for demo days with host 'plnetwork.io'
INSERT INTO "MemberDemoDayAdminScope" ("memberUid", "scopeType", "scopeValue")
VALUES ('member-uid-here', 'DASHBOARD_WHITELIST', 'plnetwork.io');
```

### Current Access Model

**All 3 analytics endpoints are restricted to authorized users only.**

All endpoints are grouped under `/dashboard/founder/engagement/` to clearly indicate this is the Founder Dashboard.

| Endpoint | Accessible By | Data Shown |
|----------|---------------|------------|
| `/dashboard/founder/engagement` | Admin / Whitelisted / FOUNDER | Aggregated investor engagement |
| `/dashboard/founder/engagement/timeline` | Admin / Whitelisted / FOUNDER | Time-series breakdown of all engagement metrics (hour/day) |
| `/dashboard/founder/engagement/investors` | Admin / Whitelisted / FOUNDER | List of investors who engaged |

### Query Parameters

All endpoints accept an optional `teamFundraisingProfileUid` query parameter:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `teamFundraisingProfileUid` | string | Admin users: **YES**, Founders: NO | UID of the team's fundraising profile to view |

**Admin users** (DIRECTORY_ADMIN, DEMO_DAY_ADMIN with HOST scope, DASHBOARD_WHITELIST) **must** provide this parameter.

**Founders** do not need this parameter - the team is auto-derived from their `DemoDayParticipant.teamUid`.

**Date filtering** (engagement and timeline endpoints):

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string | No | ISO date string (e.g., `2026-01-15`) - filters events from this date, inclusive |
| `endDate` | string | No | ISO date string (e.g., `2026-01-31`) - filters events until this date, inclusive |

**Timeline endpoint only:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `aggregation` | string | No | `day` | Time period for grouping: `hour` or `day` |

### Validation

All endpoints use `validateAndGetProfileUid()` which:
1. Checks if `DemoDay.dashboardEnabled` is true (403 if false)
2. Determines user's access level based on roles and scopes
3. **Admin path:** Requires `teamFundraisingProfileUid` param, validates profile belongs to demo day
4. **Founder path:** Auto-derives team from `DemoDayParticipant.teamUid`, looks up `TeamFundraisingProfile`
5. Returns the validated `demoDayUid` and `teamFundraisingProfileUid` for data queries

### Error Messages

| Scenario | HTTP Status | Message |
|----------|-------------|---------|
| Dashboard disabled | 403 | `Dashboard access is not enabled for this Demo Day` |
| Admin without param | 403 | `Admin users must specify teamFundraisingProfileUid query parameter` |
| Invalid profile UID | 404 | `TeamFundraisingProfile not found for this demo day` |
| Non-admin, non-founder | 403 | `Only admins or enabled founders can access engagement analytics` |
| Founder without team | 404 | `Fundraising profile not found for your team` |

### Future: Investor-Facing Dashboard (Not Implemented)

If we want to provide analytics for INVESTOR participants (to see their own activity), we would need:
- New validation method `validateInvestorParticipant()`
- New endpoints like `/dashboard/my-activity` showing the investor's engagement across all teams
- Different data model (investor's activity, not team's received engagement)

## Endpoints

### 1. GET `/v1/demo-days/:demoDayUidOrSlug/dashboard/founder/engagement`

Aggregated engagement statistics for the founder's team.

**Authentication:** Bearer token (UserTokenValidation)

**Cache:** 1 hour TTL

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `teamFundraisingProfileUid` | string | Admin: YES, Founder: NO | Team's fundraising profile UID |
| `startDate` | string | No | ISO date (e.g., `2026-01-15`) - filters events from this date |
| `endDate` | string | No | ISO date (e.g., `2026-01-31`) - filters events until this date |

**Example Request (Founder):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement' \
  -H 'Authorization: Bearer <token>'
```

**Example Request (Founder with date filter):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement?startDate=2026-01-15&endDate=2026-01-31' \
  -H 'Authorization: Bearer <token>'
```

**Example Request (Admin):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement?teamFundraisingProfileUid=clx123abc' \
  -H 'Authorization: Bearer <admin-token>'
```

**Example Request (Admin with date filter):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement?teamFundraisingProfileUid=clx123abc&startDate=2026-01-15&endDate=2026-01-31' \
  -H 'Authorization: Bearer <admin-token>'
```

**Example Response:**
```json
{
  "uniqueInvestors": 183,
  "totalCtaInteractions": {
    "total": 312,
    "uniqueInvestors": 45
  },
  "viewedSlide": {
    "total": 141,
    "uniqueInvestors": 98
  },
  "watchedVideo": {
    "total": 89,
    "uniqueInvestors": 67
  },
  "connections": {
    "total": 102,
    "uniqueInvestors": 56
  },
  "investmentInterest": {
    "total": 56,
    "uniqueInvestors": 24
  }
}
```

**UI Field Mapping:**
| UI Label | Response Field |
|----------|----------------|
| Unique Investors (Interacted with your profile) | `uniqueInvestors` |
| Total & Unique CTAs (Like, Connect, Invest, Intro, Feedback) | `totalCtaInteractions.total` / `.uniqueInvestors` |

**Data Sources:**
| Field | Source |
|-------|--------|
| `uniqueInvestors` | Max of Event table and DemoDayExpressInterestStatistic unique investors |
| `totalCtaInteractions` | `DemoDayExpressInterestStatistic` (likedCount + connectedCount + investedCount + referralCount + feedbackCount) |
| `viewedSlide` | Event table (`demo-day-active-view-team-pitch-deck-viewed`) |
| `watchedVideo` | Event table (`demo-day-active-view-team-pitch-video-viewed`) |
| `connections` | `DemoDayExpressInterestStatistic.connectedCount` |
| `investmentInterest` | `DemoDayExpressInterestStatistic.investedCount` |

---

### 2. GET `/v1/demo-days/:demoDayUidOrSlug/dashboard/founder/engagement/timeline`

Time-series breakdown of all engagement metrics for the Engagement Funnel chart. Supports aggregation by hour or day.

**Authentication:** Bearer token (UserTokenValidation)

**Cache:** 1 hour TTL

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `teamFundraisingProfileUid` | string | Admin: YES, Founder: NO | - | Team's fundraising profile UID |
| `startDate` | string | No | - | ISO date (e.g., `2026-01-15`) |
| `endDate` | string | No | - | ISO date (e.g., `2026-01-31`) |
| `aggregation` | string | No | `day` | Time period for grouping: `hour` or `day` |

**Example Request (Founder, day aggregation):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/timeline?startDate=2026-01-15&endDate=2026-01-31' \
  -H 'Authorization: Bearer <token>'
```

**Example Request (Founder, hour aggregation):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/timeline?aggregation=hour&startDate=2026-01-15&endDate=2026-01-15' \
  -H 'Authorization: Bearer <token>'
```

**Example Request (Admin):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/timeline?teamFundraisingProfileUid=clx123abc&startDate=2026-01-15&endDate=2026-01-31' \
  -H 'Authorization: Bearer <admin-token>'
```

**Example Response (day aggregation):**
```json
[
  {
    "date": "2026-01-15",
    "profileViewed": 600,
    "viewedSlide": 320,
    "videoWatched": 210,
    "founderProfileClicked": 180,
    "teamPageClicked": 160,
    "teamWebsiteClicked": 95,
    "liked": 70,
    "connected": 55,
    "investmentInterest": 42,
    "introMade": 8,
    "feedbackGiven": 6
  },
  {
    "date": "2026-01-16",
    "profileViewed": 550,
    "viewedSlide": 290,
    "videoWatched": 185,
    "founderProfileClicked": 165,
    "teamPageClicked": 140,
    "teamWebsiteClicked": 82,
    "liked": 65,
    "connected": 48,
    "investmentInterest": 38,
    "introMade": 5,
    "feedbackGiven": 4
  }
]
```

**Example Response (hour aggregation):**
```json
[
  {
    "date": "2026-01-15T10:00:00.000Z",
    "profileViewed": 45,
    "viewedSlide": 28,
    "videoWatched": 15,
    "founderProfileClicked": 12,
    "teamPageClicked": 10,
    "teamWebsiteClicked": 6,
    "liked": 5,
    "connected": 3,
    "investmentInterest": 2,
    "introMade": 1,
    "feedbackGiven": 0
  },
  {
    "date": "2026-01-15T11:00:00.000Z",
    "profileViewed": 52,
    "viewedSlide": 31,
    "videoWatched": 18,
    "founderProfileClicked": 14,
    "teamPageClicked": 12,
    "teamWebsiteClicked": 8,
    "liked": 6,
    "connected": 4,
    "investmentInterest": 3,
    "introMade": 1,
    "feedbackGiven": 1
  }
]
```

**Response Fields:**

| Field | Source | Description |
|-------|--------|-------------|
| `date` | - | Date string (day: `YYYY-MM-DD`, hour: ISO timestamp) |
| `profileViewed` | Event: `demo-day-active-view-team-card-viewed` | Profile card viewed |
| `viewedSlide` | Event: `demo-day-active-view-team-pitch-deck-viewed` | Pitch deck viewed |
| `videoWatched` | Event: `demo-day-active-view-team-pitch-video-viewed` | Pitch video watched |
| `founderProfileClicked` | Event: `demo-day-active-view-team-card-clicked` | Founder profile clicked |
| `teamPageClicked` | Event: `demo-day-landing-team-card-clicked` | Team page clicked (landing) |
| `teamWebsiteClicked` | Event: `demo-day-landing-team-website-clicked` | Team website clicked (landing) |
| `liked` | `DemoDayExpressInterestStatistic.likedCount` | Total likes |
| `connected` | `DemoDayExpressInterestStatistic.connectedCount` | Total connections |
| `investmentInterest` | `DemoDayExpressInterestStatistic.investedCount` | Total investment interests |
| `introMade` | `DemoDayExpressInterestStatistic.referralCount` | Total intro/referral requests |
| `feedbackGiven` | `DemoDayExpressInterestStatistic.feedbackCount` | Total feedback given |

---

### 3. GET `/v1/demo-days/:demoDayUidOrSlug/dashboard/founder/engagement/investors`

Paginated list of investor interactions with the founder's team. Returns **one row per interaction** (not per investor). If an investor has 5 interactions, they appear 5 times.

**Authentication:** Bearer token (UserTokenValidation)

**Cache:** 1 hour TTL

**Query Parameters:**

| Parameter   | Type   | Required | Default        | Description                                     |
| ----------- | ------ | -------- | -------------- | ----------------------------------------------- |
| `teamFundraisingProfileUid` | string | Admin: YES, Founder: NO | - | Team's fundraising profile UID |
| `page`      | number | No       | `1`            | Page number                                     |
| `limit`     | number | No       | `20`           | Items per page (max 100)                        |
| `sortBy`    | string | No       | `lastActivity` | `lastActivity`, `totalInteractions`, `name`     |
| `sortOrder` | string | No       | `desc`         | `asc`, `desc`                                   |

**Example Request (Founder):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/investors?page=1&limit=10&sortBy=lastActivity&sortOrder=desc' \
  -H 'Authorization: Bearer <token>'
```

**Example Request (Admin):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/investors?teamFundraisingProfileUid=clx123abc&page=1&limit=10&sortBy=lastActivity&sortOrder=desc' \
  -H 'Authorization: Bearer <admin-token>'
```

**Example Response:**
```json
{
  "data": [
    {
      "member": {
        "uid": "clx1abc123def",
        "name": "Bob Smith",
        "imageUrl": "https://cdn.plnetwork.io/images/members/bob-smith.jpg",
        "organization": null
      },
      "investorProfile": {
        "type": "ANGEL",
        "investmentFocus": ["Frontier Tech", "Dev Tooling"],
        "typicalCheckSize": 50000
      },
      "interactionType": "invested",
      "interactionDate": "2025-10-23T18:45:00.000Z"
    },
    {
      "member": {
        "uid": "clx1abc123def",
        "name": "Bob Smith",
        "imageUrl": "https://cdn.plnetwork.io/images/members/bob-smith.jpg",
        "organization": null
      },
      "investorProfile": {
        "type": "ANGEL",
        "investmentFocus": ["Frontier Tech", "Dev Tooling"],
        "typicalCheckSize": 50000
      },
      "interactionType": "viewedSlide",
      "interactionDate": "2025-10-23T18:30:00.000Z"
    },
    {
      "member": {
        "uid": "clx2xyz789ghi",
        "name": "Catherine Lee",
        "imageUrl": null,
        "organization": "ARK Fintech Innovation ETF"
      },
      "investorProfile": {
        "type": "FUND",
        "investmentFocus": ["Frontier Tech", "DeFi/Fintech", "AI"],
        "typicalCheckSize": 175000
      },
      "interactionType": "introMade",
      "interactionDate": "2025-10-23T18:15:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 183,
    "totalPages": 19
  }
}
```

**Interaction Types** (same as timeline endpoint):

| Type | Source | Field |
|------|--------|-------|
| `profileViewed` | Event | `demo-day-active-view-team-card-viewed` |
| `viewedSlide` | Event | `demo-day-active-view-team-pitch-deck-viewed` |
| `videoWatched` | Event | `demo-day-active-view-team-pitch-video-viewed` |
| `founderProfileClicked` | Event | `demo-day-active-view-team-card-clicked` |
| `teamPageClicked` | Event | `demo-day-landing-team-card-clicked` |
| `teamWebsiteClicked` | Event | `demo-day-landing-team-website-clicked` |
| `liked` | DemoDayExpressInterestStatistic | `liked = true` |
| `connected` | DemoDayExpressInterestStatistic | `connected = true` |
| `invested` | DemoDayExpressInterestStatistic | `invested = true` |
| `introMade` | DemoDayExpressInterestStatistic | `referral = true` |
| `feedbackGiven` | DemoDayExpressInterestStatistic | `feedback = true` |

---

## Error Responses

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 403 Forbidden
Returned when dashboard is disabled, user is not authorized, or admin doesn't provide required param.
```json
{
  "statusCode": 403,
  "message": "Dashboard access is not enabled for this Demo Day"
}
```
or
```json
{
  "statusCode": 403,
  "message": "Admin users must specify teamFundraisingProfileUid query parameter"
}
```
or
```json
{
  "statusCode": 403,
  "message": "Only admins or enabled founders can access engagement analytics"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Demo day not found"
}
```
or
```json
{
  "statusCode": 404,
  "message": "TeamFundraisingProfile not found for this demo day"
}
```
or
```json
{
  "statusCode": 404,
  "message": "Fundraising profile not found for your team"
}
```

---

## Data Sources

| Source                                   | Data                                              |
| ---------------------------------------- | ------------------------------------------------- |
| `Event` table                            | Profile views, deck views, video views, CTA clicks |
| `DemoDayExpressInterestStatistic` table  | Connections, investment interest (deduplicated)   |
| `Member` table                           | Investor name, email, image                       |
| `InvestorProfile` table                  | Investment focus, check size, type                |
| `TeamMemberRole` table                   | Investor organization (via `mainTeam` relation)   |

## Event Types

| Event Type                                           | Constant                        | Description                    |
| ---------------------------------------------------- | ------------------------------- | ------------------------------ |
| `demo-day-active-view-team-card-viewed`              | `TEAM_CARD_VIEWED`              | Profile card viewed            |
| `demo-day-active-view-team-card-clicked`             | `TEAM_CARD_CLICKED`             | Founder profile clicked        |
| `demo-day-active-view-team-pitch-deck-viewed`        | `PITCH_DECK_VIEWED`             | Pitch deck viewed              |
| `demo-day-active-view-team-pitch-video-viewed`       | `PITCH_VIDEO_VIEWED`            | Pitch video watched            |
| `demo-day-active-view-like-company-clicked`          | `LIKE_COMPANY_CLICKED`          | Investor liked company         |
| `demo-day-active-view-connect-company-clicked`       | `CONNECT_COMPANY_CLICKED`       | Investor clicked connect       |
| `demo-day-active-view-invest-company-clicked`        | `INVEST_COMPANY_CLICKED`        | Investor clicked invest        |
| `demo-day-active-view-refer-company-clicked`         | `REFER_COMPANY_CLICKED`         | Investor clicked refer         |
| `demo-day-active-view-intro-company-clicked`         | `INTRO_COMPANY_CLICKED`         | Investor requested intro       |
| `demo-day-active-view-intro-company-confirm-clicked` | `INTRO_COMPANY_CONFIRM_CLICKED` | Investor confirmed intro       |
| `demo-day-landing-team-card-clicked`                 | `LANDING_TEAM_CARD_CLICKED`     | Team card clicked (landing)    |
| `demo-day-landing-team-website-clicked`              | `LANDING_TEAM_WEBSITE_CLICKED`  | Team website clicked (landing) |

---

## Admin Endpoints - Dashboard Whitelist Management

These endpoints allow DIRECTORY_ADMIN and DEMO_DAY_ADMIN users to manage the dashboard whitelist.

### 1. GET `/v1/admin/demo-days/:uid/dashboard-whitelist`

List all whitelisted members for a demo day's founder dashboard.

**Authentication:** Admin Bearer token

**Guard:** `DemoDayAdminAuthGuard` (DIRECTORY_ADMIN or DEMO_DAY_ADMIN with matching host)

**Example Request:**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/admin/demo-days/clx123abc/dashboard-whitelist' \
  -H 'Authorization: Bearer <admin-token>'
```

**Example Response:**
```json
[
  {
    "memberUid": "clx456def",
    "member": {
      "uid": "clx456def",
      "name": "John Doe",
      "email": "john@example.com",
      "imageUrl": "https://cdn.plnetwork.io/images/members/john.jpg"
    },
    "participantType": "INVESTOR",
    "participantStatus": "ENABLED",
    "teamName": "Acme Inc"
  },
  {
    "memberUid": "clx789ghi",
    "member": {
      "uid": "clx789ghi",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "imageUrl": null
    },
    "participantType": "NONE",
    "participantStatus": "NONE",
    "teamName": null
  }
]
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `memberUid` | string | Member's unique identifier |
| `member.uid` | string | Member's unique identifier |
| `member.name` | string \| null | Member's display name |
| `member.email` | string | Member's email address |
| `member.imageUrl` | string \| null | Member's profile image URL |
| `participantType` | enum | `INVESTOR`, `FOUNDER`, `SUPPORT`, or `NONE` if not a participant |
| `participantStatus` | enum | `PENDING`, `INVITED`, `ENABLED`, `DISABLED`, or `NONE` if not a participant |
| `teamName` | string \| null | Member's main team name (if any) |

---

### 2. POST `/v1/admin/demo-days/:uid/dashboard-whitelist`

Add a member to the dashboard whitelist.

**Authentication:** Admin Bearer token

**Guard:** `DemoDayAdminAuthGuard`

**Request Body:**
```json
{
  "memberUid": "clx456def"
}
```

**Example Request:**
```bash
curl -X POST \
  'https://api.plnetwork.io/v1/admin/demo-days/clx123abc/dashboard-whitelist' \
  -H 'Authorization: Bearer <admin-token>' \
  -H 'Content-Type: application/json' \
  -d '{"memberUid": "clx456def"}'
```

**Success Response:**
```json
{
  "success": true
}
```

**Error Responses:**

| Status | Message | Description |
|--------|---------|-------------|
| 404 | `Member with uid xxx not found` | Member doesn't exist |
| 409 | `Member is already whitelisted for this demo day` | Duplicate entry |

**Note:** The whitelist entry is stored with `scopeValue = DemoDay.host`, meaning the member gains access to dashboards for all demo days with the same host.

---

### 3. DELETE `/v1/admin/demo-days/:uid/dashboard-whitelist/:memberUid`

Remove a member from the dashboard whitelist.

**Authentication:** Admin Bearer token

**Guard:** `DemoDayAdminAuthGuard`

**Example Request:**
```bash
curl -X DELETE \
  'https://api.plnetwork.io/v1/admin/demo-days/clx123abc/dashboard-whitelist/clx456def' \
  -H 'Authorization: Bearer <admin-token>'
```

**Success Response:**
```json
{
  "success": true
}
```

**Error Response:**

| Status | Message | Description |
|--------|---------|-------------|
| 404 | `Member is not whitelisted for this demo day` | Entry not found |

---

## Back-Office UI

### Dashboard Settings (Demo Day Detail Page)

| Field | Location | Description |
|-------|----------|-------------|
| Founders Dashboard checkbox | Overview section | Toggle `dashboardEnabled` (DIRECTORY_ADMIN only) |
| Dashboard Whitelist section | Below Participants | Manage whitelisted members (DIRECTORY_ADMIN and DEMO_DAY_ADMIN) |

### Dashboard Whitelist Section Features

- **Add Member**: Search and select existing members to whitelist
- **View List**: Table showing member info, team, participant type/status
- **Remove Member**: Remove with confirmation dialog
- **Search**: Filter whitelist by name or email
