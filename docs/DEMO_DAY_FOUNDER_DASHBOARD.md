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

**All 4 analytics endpoints are restricted to authorized users only.**

All endpoints are grouped under `/dashboard/founder/engagement/` to clearly indicate this is the Founder Dashboard.

| Endpoint | Accessible By | Data Shown |
|----------|---------------|------------|
| `/dashboard/founder/engagement` | Admin / Whitelisted / FOUNDER | Aggregated investor engagement |
| `/dashboard/founder/engagement/timeline` | Admin / Whitelisted / FOUNDER | Daily breakdown of investor engagement |
| `/dashboard/founder/engagement/investors` | Admin / Whitelisted / FOUNDER | List of investors who engaged |
| `/dashboard/founder/engagement/funnel` | Admin / Whitelisted / FOUNDER | Conversion funnel of investor engagement |

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
  "viewedDeck": {
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
| Total & Unique CTAs (Like, Connect, Investment Interest) | `totalCtaInteractions.total` / `.uniqueInvestors` |

---

### 2. GET `/v1/demo-days/:demoDayUidOrSlug/dashboard/founder/engagement/timeline`

Daily breakdown of engagement metrics for chart rendering.

**Authentication:** Bearer token (UserTokenValidation)

**Cache:** 1 hour TTL

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `teamFundraisingProfileUid` | string | Admin: YES, Founder: NO | Team's fundraising profile UID |
| `startDate` | string | No | ISO date (e.g., `2026-01-15`) |
| `endDate` | string | No | ISO date (e.g., `2026-01-31`) |

**Example Request (Founder):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/timeline?startDate=2026-01-15&endDate=2026-01-31' \
  -H 'Authorization: Bearer <token>'
```

**Example Request (Admin):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/timeline?teamFundraisingProfileUid=clx123abc&startDate=2026-01-15&endDate=2026-01-31' \
  -H 'Authorization: Bearer <admin-token>'
```

**Example Response:**
```json
[
  {
    "date": "2026-01-15",
    "founderProfileClicks": 45,
    "ctaInteractions": 23,
    "uniqueInvestors": 30,
    "connections": 12,
    "investmentInterest": 5
  },
  {
    "date": "2026-01-16",
    "founderProfileClicks": 62,
    "ctaInteractions": 31,
    "uniqueInvestors": 48,
    "connections": 18,
    "investmentInterest": 8
  },
  {
    "date": "2026-01-17",
    "founderProfileClicks": 78,
    "ctaInteractions": 45,
    "uniqueInvestors": 55,
    "connections": 22,
    "investmentInterest": 11
  }
]
```

---

### 3. GET `/v1/demo-days/:demoDayUidOrSlug/dashboard/founder/engagement/investors`

Paginated list of investors who engaged with the founder's team.

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
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/investors?page=1&limit=10&sortBy=totalInteractions&sortOrder=desc' \
  -H 'Authorization: Bearer <token>'
```

**Example Request (Admin):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/investors?teamFundraisingProfileUid=clx123abc&page=1&limit=10&sortBy=totalInteractions&sortOrder=desc' \
  -H 'Authorization: Bearer <admin-token>'
```

**Example Response:**
```json
{
  "data": [
    {
      "member": {
        "uid": "clx1abc123def",
        "name": "Sarah Chen",
        "imageUrl": "https://cdn.plnetwork.io/images/members/sarah-chen.jpg"
      },
      "investorProfile": {
        "type": "ANGEL",
        "investmentFocus": ["DeFi", "Infrastructure", "Developer Tools"],
        "investInStartupStages": ["Pre-seed", "Seed"],
        "typicalCheckSize": 50000
      },
      "engagement": {
        "founderProfileClicks": 5,
        "deckViews": 3,
        "videoViews": 2,
        "ctaClicks": 4
      },
      "interest": {
        "connected": true,
        "invested": false,
        "liked": true
      },
      "totalInteractions": 14,
      "lastActivity": "2026-01-28T14:32:00.000Z"
    },
    {
      "member": {
        "uid": "clx2xyz789ghi",
        "name": "Marcus Johnson",
        "imageUrl": "https://cdn.plnetwork.io/images/members/marcus-johnson.jpg"
      },
      "investorProfile": {
        "type": "FUND",
        "investmentFocus": ["Web3", "AI", "Climate Tech"],
        "investInStartupStages": ["Seed", "Series A"],
        "typicalCheckSize": 250000
      },
      "engagement": {
        "founderProfileClicks": 3,
        "deckViews": 2,
        "videoViews": 1,
        "ctaClicks": 2
      },
      "interest": {
        "connected": true,
        "invested": true,
        "liked": false
      },
      "totalInteractions": 10,
      "lastActivity": "2026-01-28T11:15:00.000Z"
    },
    {
      "member": {
        "uid": "clx3def456jkl",
        "name": "Emily Rodriguez",
        "imageUrl": null
      },
      "investorProfile": null,
      "engagement": {
        "founderProfileClicks": 2,
        "deckViews": 1,
        "videoViews": 0,
        "ctaClicks": 1
      },
      "interest": {
        "connected": false,
        "invested": false,
        "liked": true
      },
      "totalInteractions": 5,
      "lastActivity": "2026-01-27T09:45:00.000Z"
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

---

### 4. GET `/v1/demo-days/:demoDayUidOrSlug/dashboard/founder/engagement/funnel`

Conversion funnel showing investor progression through engagement stages.

**Authentication:** Bearer token (UserTokenValidation)

**Cache:** 1 hour TTL

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `teamFundraisingProfileUid` | string | Admin: YES, Founder: NO | Team's fundraising profile UID |

**Example Request (Founder):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/funnel' \
  -H 'Authorization: Bearer <token>'
```

**Example Request (Admin):**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/funnel?teamFundraisingProfileUid=clx123abc' \
  -H 'Authorization: Bearer <admin-token>'
```

**Example Response:**
```json
{
  "funnel": [
    {
      "stage": "profileOpened",
      "label": "Profile Opened",
      "uniqueInvestors": 183,
      "conversionRate": 100
    },
    {
      "stage": "deckOpened",
      "label": "Deck Opened",
      "uniqueInvestors": 98,
      "conversionRate": 53.6
    },
    {
      "stage": "videoStarted",
      "label": "Video Started",
      "uniqueInvestors": 67,
      "conversionRate": 36.6
    },
    {
      "stage": "ctaClicked",
      "label": "CTA Clicked",
      "uniqueInvestors": 45,
      "conversionRate": 24.6
    },
    {
      "stage": "connected",
      "label": "Connected",
      "uniqueInvestors": 56,
      "conversionRate": 30.6
    },
    {
      "stage": "invested",
      "label": "Investment Interest",
      "uniqueInvestors": 24,
      "conversionRate": 13.1
    }
  ]
}
```

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
| `InvestorProfile` table                  | Investment focus, check size, stages, type        |

## Event Types

| Event Type                                           | Description                    |
| ---------------------------------------------------- | ------------------------------ |
| `demo-day-active-view-team-card-clicked`             | Investor opened team profile   |
| `demo-day-active-view-team-pitch-deck-viewed`        | Investor viewed pitch deck     |
| `demo-day-active-view-team-pitch-video-viewed`       | Investor watched pitch video   |
| `demo-day-active-view-like-company-clicked`          | Investor liked company         |
| `demo-day-active-view-connect-company-clicked`       | Investor clicked connect       |
| `demo-day-active-view-invest-company-clicked`        | Investor clicked invest        |
| `demo-day-active-view-refer-company-clicked`         | Investor clicked refer         |
| `demo-day-active-view-intro-company-clicked`         | Investor requested intro       |
| `demo-day-active-view-intro-company-confirm-clicked` | Investor confirmed intro       |

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
