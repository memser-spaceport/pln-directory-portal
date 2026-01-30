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

### Current Access Model

**All 4 endpoints are restricted to FOUNDER participants only.**

All endpoints are grouped under `/dashboard/founder/engagement/` to clearly indicate this is the Founder Dashboard.

| Endpoint | Accessible By | Data Shown |
|----------|---------------|------------|
| `/dashboard/founder/engagement` | FOUNDER only | Aggregated investor engagement with founder's team |
| `/dashboard/founder/engagement/timeline` | FOUNDER only | Daily breakdown of investor engagement |
| `/dashboard/founder/engagement/investors` | FOUNDER only | List of investors who engaged with founder's team |
| `/dashboard/founder/engagement/funnel` | FOUNDER only | Conversion funnel of investor engagement |

### Validation

All endpoints use `validateFounderAndGetProfileUid()` which:
1. Verifies the user is a FOUNDER participant (`type: 'FOUNDER'`)
2. Checks participant is ENABLED (`status: 'ENABLED'`)
3. Gets the founder's team's `TeamFundraisingProfile.uid` for data filtering

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

**Example Request:**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement' \
  -H 'Authorization: Bearer <token>'
```

**Example Response:**
```json
{
  "engagementOverview": {
    "uniqueInvestors": 183,
    "profileViews": {
      "total": 278,
      "unique": 183,
      "repeat": 95
    },
    "totalCtaInteractions": 312
  },
  "ctaPerformance": {
    "profileViews": {
      "total": 278,
      "unique": 183,
      "repeat": 95
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
}
```

---

### 2. GET `/v1/demo-days/:demoDayUidOrSlug/dashboard/founder/engagement/timeline`

Daily breakdown of engagement metrics for chart rendering.

**Authentication:** Bearer token (UserTokenValidation)

**Cache:** 1 hour TTL

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string | No | ISO date (e.g., `2026-01-15`) |
| `endDate` | string | No | ISO date (e.g., `2026-01-31`) |

**Example Request:**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/timeline?startDate=2026-01-15&endDate=2026-01-31' \
  -H 'Authorization: Bearer <token>'
```

**Example Response:**
```json
{
  "engagementOverview": [
    {
      "date": "2026-01-15",
      "profileViews": 45,
      "ctaInteractions": 23,
      "uniqueInvestors": 30
    },
    {
      "date": "2026-01-16",
      "profileViews": 62,
      "ctaInteractions": 31,
      "uniqueInvestors": 48
    },
    {
      "date": "2026-01-17",
      "profileViews": 78,
      "ctaInteractions": 45,
      "uniqueInvestors": 55
    }
  ],
  "ctaPerformance": [
    {
      "date": "2026-01-15",
      "profileViews": 45,
      "connections": 12,
      "investmentInterest": 5
    },
    {
      "date": "2026-01-16",
      "profileViews": 62,
      "connections": 18,
      "investmentInterest": 8
    },
    {
      "date": "2026-01-17",
      "profileViews": 78,
      "connections": 22,
      "investmentInterest": 11
    }
  ]
}
```

---

### 3. GET `/v1/demo-days/:demoDayUidOrSlug/dashboard/founder/engagement/investors`

Paginated list of investors who engaged with the founder's team.

**Authentication:** Bearer token (UserTokenValidation)

**Cache:** 1 hour TTL

**Query Parameters:**

| Parameter   | Type   | Required | Default        | Description                                     |
| ----------- | ------ | -------- | -------------- | ----------------------------------------------- |
| `page`      | number | No       | `1`            | Page number                                     |
| `limit`     | number | No       | `20`           | Items per page (max 100)                        |
| `sortBy`    | string | No       | `lastActivity` | `lastActivity`, `totalInteractions`, `name`     |
| `sortOrder` | string | No       | `desc`         | `asc`, `desc`                                   |

**Example Request:**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/investors?page=1&limit=10&sortBy=totalInteractions&sortOrder=desc' \
  -H 'Authorization: Bearer <token>'
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
        "profileViews": 5,
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
        "profileViews": 3,
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
        "profileViews": 2,
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

**Example Request:**
```bash
curl -X GET \
  'https://api.plnetwork.io/v1/demo-days/demo-day-2026-q1/dashboard/founder/engagement/funnel' \
  -H 'Authorization: Bearer <token>'
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
Returned when user is not a founder for the specified demo day.
```json
{
  "statusCode": 403,
  "message": "Only enabled founders can access engagement analytics"
}
```

### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Demo day not found"
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
