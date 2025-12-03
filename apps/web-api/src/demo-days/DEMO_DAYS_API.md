# Demo Days API Documentation

This document provides comprehensive documentation for all Demo Days API endpoints, including access restrictions, usage examples, and best practices.

## Table of Contents

- [Authentication](#authentication)
- [Access Levels](#access-levels)
- [General Endpoints](#general-endpoints)
- [Fundraising Profile Management](#fundraising-profile-management)
- [File Upload Endpoints](#file-upload-endpoints)
- [Engagement & Analytics](#engagement--analytics)
- [Error Handling](#error-handling)

---

## Authentication

All authenticated endpoints require a valid user token passed via the `Authorization` header or as specified by your authentication implementation.

```
Authorization: Bearer <your-token>
```

---

## Access Levels

### Public
Anyone can access these endpoints without authentication.

### Authenticated User
Any logged-in user with valid credentials.

### Founder
A user who is an **ENABLED FOUNDER** participant in the current demo day and member of a specific team. Founders can only modify their own team's data.

### Demo Day Admin
A user with `isDemoDayAdmin: true` flag in the demo day participants table. Admins have full access to all teams.

### Directory Admin
A user with `DIRECTORYADMIN` role. Has full admin access across all demo days.

**Access Control Rules:**
- **Directory Admins** → Can modify ANY team's data
- **Demo Day Admins** → Can modify ANY team's data in their demo day
- **Founders** → Can ONLY modify their OWN team's data (verified via `validateTeamFounderAccess`)
- **Investors** → Can view profiles and express interest, cannot modify team data

---

## General Endpoints

### Get All Demo Days

**Endpoint:** `GET /v1/demo-days`

**Access:** Public

**Description:** Retrieve a list of all demo days (excludes archived/inactive ones).

**Example:**
```bash
curl -X GET https://api.example.com/v1/demo-days
```

**Response:**
```json
[
  {
    "id": 1,
    "uid": "dd_123456",
    "slugURL": "demo-day-2025",
    "title": "Demo Day 2025",
    "description": "Annual startup showcase",
    "shortDescription": "2025 showcase",
    "status": "ACTIVE",
    "startDate": "2025-03-15T10:00:00Z",
    "endDate": "2025-03-15T18:00:00Z",
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-10T00:00:00Z",
    "isDeleted": false,
    "deletedAt": null
  }
]
```

---

### Get Current Demo Day

**Endpoint:** `GET /v1/demo-days/current`

**Access:** Authenticated User (optional - returns limited info if not authenticated)

**Description:** Get the current demo day information and user's access level.

**Example:**
```bash
curl -X GET https://api.example.com/v1/demo-days/current \
  -H "Authorization: Bearer <token>"
```

**Response (Founder):**
```json
{
  "access": "FOUNDER",
  "status": "ACTIVE",
  "uid": "dd_123456",
  "date": "2025-03-15T10:00:00Z",
  "title": "Demo Day 2025",
  "description": "Annual startup showcase",
  "isDemoDayAdmin": false,
  "isEarlyAccess": false,
  "confidentialityAccepted": true,
  "teamsCount": 25,
  "investorsCount": 150
}
```

**Response (Investor):**
```json
{
  "access": "INVESTOR",
  "status": "ACTIVE",
  "uid": "dd_123456",
  "date": "2025-03-15T10:00:00Z",
  "title": "Demo Day 2025",
  "description": "Annual startup showcase",
  "isDemoDayAdmin": false,
  "confidentialityAccepted": true,
  "teamsCount": 25,
  "investorsCount": 150
}
```

**Response (No Access):**
```json
{
  "access": "none",
  "status": "UPCOMING",
  "date": "2025-03-15T10:00:00Z",
  "title": "Demo Day 2025",
  "description": "Annual startup showcase",
  "teamsCount": 0,
  "investorsCount": 0,
  "confidentialityAccepted": false
}
```

---

### Update Confidentiality Acceptance

**Endpoint:** `PATCH /v1/demo-days/current/confidentiality-policy`

**Access:** Authenticated User (must be a participant)

**Description:** Accept or reject the confidentiality policy for the current demo day.

**Request Body:**
```json
{
  "accepted": true
}
```

**Example:**
```bash
curl -X PATCH https://api.example.com/v1/demo-days/current/confidentiality-policy \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"accepted": true}'
```

**Response:**
```json
{
  "success": true
}
```

---

## Fundraising Profile Management

### Get Own Fundraising Profile

**Endpoint:** `GET /v1/demo-days/current/fundraising-profile`

**Access:** Founder

**Description:** Get the fundraising profile for the founder's team.

**Example:**
```bash
curl -X GET https://api.example.com/v1/demo-days/current/fundraising-profile \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "uid": "profile_123",
  "teamUid": "team_456",
  "team": {
    "uid": "team_456",
    "name": "Acme Startup",
    "shortDescription": "Building the future of AI",
    "website": "https://acme.com",
    "industryTags": [
      { "uid": "tag_1", "title": "AI/ML" },
      { "uid": "tag_2", "title": "SaaS" }
    ],
    "fundingStage": {
      "uid": "stage_1",
      "title": "Seed"
    },
    "logo": {
      "uid": "upload_789",
      "url": "https://s3.amazonaws.com/logos/acme.png"
    }
  },
  "founders": [
    {
      "uid": "member_1",
      "name": "John Doe",
      "email": "john@acme.com",
      "image": { "uid": "img_1", "url": "https://..." },
      "role": "CEO",
      "skills": [{ "uid": "skill_1", "title": "Product Management" }],
      "officeHours": true
    }
  ],
  "onePagerUploadUid": "upload_101",
  "onePagerUpload": {
    "uid": "upload_101",
    "url": "https://s3.amazonaws.com/one-pagers/acme.pdf",
    "previewImageUrl": "https://s3.amazonaws.com/previews/acme-preview.jpg",
    "previewImageSmallUrl": "https://s3.amazonaws.com/previews/acme-preview-small.jpg"
  },
  "videoUploadUid": "upload_102",
  "videoUpload": {
    "uid": "upload_102",
    "url": "https://s3.amazonaws.com/videos/acme.mp4"
  },
  "description": "We are revolutionizing the AI industry..."
}
```

---

### Get All Fundraising Profiles

**Endpoint:** `GET /v1/demo-days/current/fundraising-profiles`

**Access:** Authenticated User (Investor or Founder)

**Description:** Get all published fundraising profiles for the current demo day. Admins can optionally see draft profiles.

**Query Parameters:**
- `stage` (optional): Filter by funding stage UID(s). Can be comma-separated string or array.
- `industry` (optional): Filter by industry tag UID(s). Can be comma-separated string or array.
- `search` (optional): Search by team name (case-insensitive).
- `showDraft` (optional): If `"true"` and user is admin, includes draft profiles. Default: `false`.

**Examples:**

```bash
# Get all profiles
curl -X GET https://api.example.com/v1/demo-days/current/fundraising-profiles \
  -H "Authorization: Bearer <token>"

# Filter by stage
curl -X GET "https://api.example.com/v1/demo-days/current/fundraising-profiles?stage=stage_seed" \
  -H "Authorization: Bearer <token>"

# Filter by multiple stages and industries
curl -X GET "https://api.example.com/v1/demo-days/current/fundraising-profiles?stage=stage_seed,stage_seriesA&industry=tag_ai,tag_saas" \
  -H "Authorization: Bearer <token>"

# Search by name
curl -X GET "https://api.example.com/v1/demo-days/current/fundraising-profiles?search=acme" \
  -H "Authorization: Bearer <token>"

# Admin: include draft profiles
curl -X GET "https://api.example.com/v1/demo-days/current/fundraising-profiles?showDraft=true" \
  -H "Authorization: Bearer <admin-token>"
```

**Response:**
```json
[
  {
    "uid": "profile_123",
    "teamUid": "team_456",
    "team": { /* team info */ },
    "founders": [ /* founders array */ ],
    "onePagerUpload": { /* upload info */ },
    "videoUpload": { /* upload info */ },
    "description": "...",
    "liked": true,
    "connected": false,
    "invested": false,
    "referral": false
  }
]
```

**Notes:**
- Results are personalized and randomized per user for fair distribution
- Only returns PUBLISHED profiles with both one-pager and video uploaded (unless admin with `showDraft=true`)
- Only teams with at least one ENABLED FOUNDER are included
- Engagement flags (`liked`, `connected`, `invested`, `referral`, `feedback`) show user's interaction status

---

### Update Team Information

**Endpoint:** `PATCH /v1/demo-days/current/teams/:teamUid/fundraising-profile/team`

**Access:** Founder (own team) or Admin (any team)

**Description:** Update team information for the fundraising profile.

**URL Parameters:**
- `teamUid` (required): UID of the team to update

**Request Body:**
```json
{
  "name": "Acme Startup Inc",
  "shortDescription": "Building the future of AI-powered solutions",
  "website": "https://acme.com",
  "industryTags": ["tag_ai", "tag_saas"],
  "fundingStage": "stage_seed",
  "logo": "upload_789"
}
```

**Field Descriptions:**
- `name` (optional): Team name
- `shortDescription` (optional): Brief description of the team
- `website` (optional): Team website URL (can be null)
- `industryTags` (optional): Array of industry tag UIDs
- `fundingStage` (optional): Funding stage UID
- `logo` (optional): Upload UID for team logo

**Example:**
```bash
curl -X PATCH https://api.example.com/v1/demo-days/current/teams/team_456/fundraising-profile/team \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Startup Inc",
    "shortDescription": "Building the future of AI",
    "industryTags": ["tag_ai", "tag_saas"]
  }'
```

**Response:**
Returns the updated fundraising profile (same format as `GET /current/fundraising-profile`)

**Access Control:**
- ✅ Directory Admin → Can update ANY team
- ✅ Demo Day Admin → Can update ANY team
- ✅ Founder of Team A → Can update Team A only
- ❌ Founder of Team B → CANNOT update Team A (throws `ForbiddenException`)

---

### Update Fundraising Description

**Endpoint:** `PUT /v1/demo-days/current/teams/:teamUid/fundraising-profile/description`

**Access:** Founder (own team) or Admin (any team)

**Description:** Update the fundraising description for a team.

**URL Parameters:**
- `teamUid` (required): UID of the team to update

**Request Body:**
```json
{
  "description": "We are revolutionizing the AI industry with our cutting-edge platform..."
}
```

**Example:**
```bash
curl -X PUT https://api.example.com/v1/demo-days/current/teams/team_456/fundraising-profile/description \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "We are revolutionizing the AI industry..."
  }'
```

**Response:**
Returns the updated fundraising profile.

**Access Control:**
Same as "Update Team Information" above.

---

## File Upload Endpoints

There are two methods for uploading files:

1. **Direct Upload** (Small files, simple): Upload file directly in the request
2. **Pre-signed URL Upload** (Large files, recommended): Get a pre-signed S3 URL, upload directly to S3, then confirm

### Method 1: Direct Upload

#### Upload One-Pager (Direct)

**Endpoint:** `PUT /v1/demo-days/current/teams/:teamUid/fundraising-profile/one-pager`

**Access:** Founder (own team) or Admin (any team)

**Description:** Upload a one-pager file directly.

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `onePagerFile` (required): The one-pager file (PDF, JPG, PNG, or WebP)

**File Restrictions:**
- Max size: 25MB
- Allowed types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`

**Example:**
```bash
curl -X PUT https://api.example.com/v1/demo-days/current/teams/team_456/fundraising-profile/one-pager \
  -H "Authorization: Bearer <token>" \
  -F "onePagerFile=@/path/to/one-pager.pdf"
```

**Response:**
Returns the updated fundraising profile.

---

#### Upload Video (Direct)

**Endpoint:** `PUT /v1/demo-days/current/teams/:teamUid/fundraising-profile/video`

**Access:** Founder (own team) or Admin (any team)

**Description:** Upload a video file directly.

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `videoFile` (required): The video file (MP4, WebM, or MOV)

**File Restrictions:**
- Max size: 500MB
- Allowed types: `video/mp4`, `video/webm`, `video/quicktime`

**Example:**
```bash
curl -X PUT https://api.example.com/v1/demo-days/current/teams/team_456/fundraising-profile/video \
  -H "Authorization: Bearer <token>" \
  -F "videoFile=@/path/to/pitch-video.mp4"
```

**Response:**
Returns the updated fundraising profile.

---

### Method 2: Pre-signed URL Upload (Recommended for Large Files)

This two-step process is better for large files as it uploads directly to S3 without going through your API server.

#### Step 1: Get Video Upload URL

**Endpoint:** `POST /v1/demo-days/current/teams/:teamUid/fundraising-profile/video/upload-url`

**Access:** Founder (own team) or Admin (any team)

**Description:** Generate a pre-signed S3 URL for uploading a video.

**Request Body:**
```json
{
  "filename": "pitch-video.mp4",
  "filesize": 104857600,
  "mimetype": "video/mp4"
}
```

**Example:**
```bash
curl -X POST https://api.example.com/v1/demo-days/current/teams/team_456/fundraising-profile/video/upload-url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "pitch-video.mp4",
    "filesize": 104857600,
    "mimetype": "video/mp4"
  }'
```

**Response:**
```json
{
  "uploadUid": "upload_12345",
  "presignedUrl": "https://s3.amazonaws.com/bucket/path?signature=...",
  "s3Key": "uploads/none/none/video/1234567890-abc123.mp4",
  "expiresAt": "2025-01-15T10:30:00Z"
}
```

---

#### Step 2: Upload to S3

Use the `presignedUrl` from Step 1 to upload your file directly to S3.

**Example:**
```bash
curl -X PUT "https://s3.amazonaws.com/bucket/path?signature=..." \
  -H "Content-Type: video/mp4" \
  --upload-file /path/to/pitch-video.mp4
```

---

#### Step 3: Confirm Video Upload

**Endpoint:** `POST /v1/demo-days/current/teams/:teamUid/fundraising-profile/video/confirm`

**Access:** Founder (own team) or Admin (any team)

**Description:** Confirm the video was successfully uploaded to S3.

**Request Body:**
```json
{
  "uploadUid": "upload_12345"
}
```

**Example:**
```bash
curl -X POST https://api.example.com/v1/demo-days/current/teams/team_456/fundraising-profile/video/confirm \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"uploadUid": "upload_12345"}'
```

**Response:**
Returns the updated fundraising profile.

---

#### One-Pager Pre-signed Upload

The same three-step process applies for one-pagers:

**Get Upload URL:**
```
POST /v1/demo-days/current/teams/:teamUid/fundraising-profile/one-pager/upload-url
```

**Body:**
```json
{
  "filename": "one-pager.pdf",
  "filesize": 2097152,
  "mimetype": "application/pdf"
}
```

**Confirm Upload:**
```
POST /v1/demo-days/current/teams/:teamUid/fundraising-profile/one-pager/confirm
```

**Body:**
```json
{
  "uploadUid": "upload_67890"
}
```

---

### Upload One-Pager Preview Images

**Endpoint:** `POST /v1/demo-days/current/teams/:teamUid/fundraising-profile/one-pager/preview`

**Access:** Founder (own team) or Admin (any team)

**Description:** Upload preview images for the one-pager (for thumbnail display).

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `previewImage` (required): Large preview image
- `previewImageSmall` (optional): Small preview image for thumbnails

**Example:**
```bash
curl -X POST https://api.example.com/v1/demo-days/current/teams/team_456/fundraising-profile/one-pager/preview \
  -H "Authorization: Bearer <token>" \
  -F "previewImage=@/path/to/preview-large.jpg" \
  -F "previewImageSmall=@/path/to/preview-small.jpg"
```

**Response:**
Returns the updated fundraising profile.

---

### Delete Files

#### Delete One-Pager

**Endpoint:** `DELETE /v1/demo-days/current/teams/:teamUid/fundraising-profile/one-pager`

**Access:** Founder (own team) or Admin (any team)

**Example:**
```bash
curl -X DELETE https://api.example.com/v1/demo-days/current/teams/team_456/fundraising-profile/one-pager \
  -H "Authorization: Bearer <token>"
```

#### Delete Video

**Endpoint:** `DELETE /v1/demo-days/current/teams/:teamUid/fundraising-profile/video`

**Access:** Founder (own team) or Admin (any team)

**Example:**
```bash
curl -X DELETE https://api.example.com/v1/demo-days/current/teams/team_456/fundraising-profile/video \
  -H "Authorization: Bearer <token>"
```

---

## Engagement & Analytics

### Get User Engagement

**Endpoint:** `GET /v1/demo-days/current/engagement`

**Access:** Authenticated User

**Description:** Get the current user's engagement data (calendar added status, etc.).

**Example:**
```bash
curl -X GET https://api.example.com/v1/demo-days/current/engagement \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "calendarAdded": true,
  "lastEngagement": "2025-01-15T10:00:00Z"
}
```

---

### Mark Calendar Added

**Endpoint:** `POST /v1/demo-days/current/engagement/calendar-added`

**Access:** Authenticated User

**Description:** Track when a user clicks "Add to Calendar" (.ics download).

**Example:**
```bash
curl -X POST https://api.example.com/v1/demo-days/current/engagement/calendar-added \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "success": true
}
```

---

### Express Interest

**Endpoint:** `POST /v1/demo-days/current/express-interest`

**Access:** Authenticated User (typically Investors)

**Description:** Express interest in a team's fundraising profile.

**Request Body:**
```json
{
  "teamFundraisingProfileUid": "profile_123",
  "interestType": "like",
  "isPrepDemoDay": false,
  "referralData": {
    "email": "investor@example.com",
    "notes": "Interested in discussing further"
  }
}
```

**Field Descriptions:**
- `teamFundraisingProfileUid` (required): UID of the team's fundraising profile
- `interestType` (required): One of `"like"`, `"connect"`, `"invest"`, `"referral"`, or `"feedback"`
- `isPrepDemoDay` (optional): Whether this is prep demo day engagement. Default: `false`
- `referralData` (optional): Required only for `"referral"` type. Contains email and notes.

**Interest Types:**
- `like`: Interested in learning more
- `connect`: Want to schedule a meeting
- `invest`: Interested in investing
- `referral`: Referring to another investor
- `feedback`: Providing feedback to the team

**Example:**
```bash
curl -X POST https://api.example.com/v1/demo-days/current/express-interest \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "teamFundraisingProfileUid": "profile_123",
    "interestType": "invest",
    "isPrepDemoDay": false
  }'
```

**Response:**
```json
{
  "success": true,
  "liked": false,
  "connected": false,
  "invested": true,
  "referral": false,
  "feedback": false
}
```

---

### Get Express Interest Statistics

**Endpoint:** `GET /v1/demo-days/current/express-interest/stats`

**Access:** Public

**Description:** Get aggregated statistics for express interest actions.

**Query Parameters:**
- `prep` (optional): If `"true"`, returns stats for prep demo day. Default: `false`

**Example:**
```bash
curl -X GET "https://api.example.com/v1/demo-days/current/express-interest/stats?prep=false"
```

**Response:**
```json
{
  "liked": 125,
  "connected": 45,
  "invested": 23,
  "referral": 12,
  "total": 205
}
```

**Notes:**
- Results are cached for 30 seconds for performance
- Use `prep=true` for admin/testing scenarios

---

### Get Team Analytics

**Endpoint:** `GET /v1/demo-days/current/teams/:teamUid/analytics`

**Access:** Authenticated User (requires access verification)

**Description:** Get detailed analytics for a specific team (investor engagement, timeline, etc.).

**URL Parameters:**
- `teamUid` (required): UID of the team

**Example:**
```bash
curl -X GET https://api.example.com/v1/demo-days/current/teams/team_456/analytics \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "team": {
    "uid": "team_456",
    "name": "Acme Startup"
  },
  "demoDay": {
    "uid": "dd_123456",
    "title": "Demo Day 2025"
  },
  "summary": {
    "totalEngagement": 87,
    "uniqueInvestors": 23,
    "likes": 45,
    "connections": 18,
    "investments": 12,
    "referrals": 12
  },
  "engagementOverTime": [
    {
      "timestamp": "2025-01-15T10:00:00Z",
      "likes": 5,
      "connects": 2,
      "invests": 1,
      "referrals": 0
    }
  ],
  "investorActivity": [
    {
      "investorUid": "investor_1",
      "investorName": "Jane Smith",
      "investorEmail": "jane@vc-fund.com",
      "fundOrAngel": {
        "uid": "fund_1",
        "name": "Acme Ventures",
        "isFund": true
      },
      "activity": {
        "liked": true,
        "connected": true,
        "invested": false,
        "referral": false
      },
      "date": "2025-01-15T10:30:00Z"
    }
  ]
}
```

---

### Submit Feedback

**Endpoint:** `POST /v1/demo-days/current/feedback`

**Access:** Authenticated User

**Description:** Submit feedback about the demo day experience.

**Request Body:**
```json
{
  "rating": 5,
  "qualityComments": "Great presentations and organization",
  "improvementComments": "Could use better networking tools",
  "comment": "Overall excellent experience",
  "issues": ["Technical difficulties", "Audio quality"]
}
```

**Field Descriptions:**
- `rating` (required): Number from 1-5
- `qualityComments` (optional): What did you like?
- `improvementComments` (optional): What could be improved?
- `comment` (optional): General comments
- `issues` (optional): Array of issue strings

**Example:**
```bash
curl -X POST https://api.example.com/v1/demo-days/current/feedback \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 5,
    "qualityComments": "Great presentations",
    "issues": []
  }'
```

**Response:**
```json
{
  "uid": "feedback_123",
  "rating": 5,
  "qualityComments": "Great presentations",
  "improvementComments": null,
  "comment": null,
  "issues": []
}
```

---

## Error Handling

All endpoints follow standard HTTP status codes and return errors in a consistent format.

### Common Status Codes

- `200 OK` - Successful request
- `400 Bad Request` - Invalid request parameters or body
- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - User doesn't have access to the resource
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict (e.g., duplicate)
- `500 Internal Server Error` - Server error

### Error Response Format

```json
{
  "statusCode": 403,
  "message": "No demo day access",
  "error": "Forbidden"
}
```

### Common Error Messages

**`"No demo day access"`**
- User is not a participant in the demo day
- User's participant status is not ENABLED
- User is trying to access a team they don't belong to

**`"No demo day found"`**
- There is no current active demo day

**`"Invalid video upload"` / `"Invalid one-pager upload"`**
- File type is not supported
- File size exceeds limits

**`"Team fundraising profile not found"`**
- The specified team doesn't have a fundraising profile for the current demo day

### Access Control Errors

When a founder tries to modify another team's data:

```bash
# Founder of Team B tries to update Team A
curl -X PUT https://api.example.com/v1/demo-days/current/teams/team_A/fundraising-profile/description \
  -H "Authorization: Bearer <team-b-founder-token>" \
  -d '{"description": "Hacked!"}'
```

**Response:**
```json
{
  "statusCode": 403,
  "message": "No demo day access",
  "error": "Forbidden"
}
```

---

## Best Practices

### 1. File Upload Strategy

For files **< 10MB**: Use direct upload endpoints
```bash
PUT /v1/demo-days/current/teams/:teamUid/fundraising-profile/one-pager
```

For files **> 10MB**: Use pre-signed URL method
```bash
POST /v1/demo-days/current/teams/:teamUid/fundraising-profile/video/upload-url
# Upload to S3
POST /v1/demo-days/current/teams/:teamUid/fundraising-profile/video/confirm
```

### 2. Always Verify TeamUid

When founders call endpoints with `teamUid`, ensure they're using their own team's UID. The API will reject unauthorized access, but it's better to prevent the call client-side:

```javascript
// Good: Use the team UID from the user's profile
const myTeamUid = currentUser.teamUid;
await updateTeamInfo(myTeamUid, data);

// Bad: Hardcoding or using arbitrary team UIDs
await updateTeamInfo('random-team-uid', data);
```

### 3. Handle Admin vs Founder Logic

```javascript
// Check user's access level first
const demoDayInfo = await getCurrentDemoDay();

if (demoDayInfo.isDemoDayAdmin) {
  // Admin can select any team
  const teamUid = selectedTeamUid;
  await updateTeamInfo(teamUid, data);
} else {
  // Founder can only use their own team
  const teamUid = currentUser.teamUid;
  await updateTeamInfo(teamUid, data);
}
```

### 4. Caching Considerations

The following endpoint has caching (30 seconds):
- `GET /v1/demo-days/current/express-interest/stats`

All other endpoints have `@NoCache()` decorator and should not be cached client-side.

### 5. Filter Usage

When filtering profiles, use arrays for multiple values:

```javascript
// Single value
?stage=stage_seed

// Multiple values (both formats work)
?stage=stage_seed,stage_seriesA
?stage[]=stage_seed&stage[]=stage_seriesA
```

---

## Security Notes

### Access Control Implementation

The API implements a three-tier access control system:

1. **Directory Admins** (`DIRECTORYADMIN` role)
   - Full access to all teams across all demo days
   - Checked via `membersService.checkIfAdminUser()`

2. **Demo Day Admins** (`isDemoDayAdmin: true`)
   - Full access to all teams within their demo day
   - Checked via `isDemoDayAdmin()` method

3. **Founders** (Regular participants with `type: 'FOUNDER'`)
   - Access restricted to their own team only
   - Verified via `validateTeamFounderAccess()` method

### Security Verification

Every endpoint that modifies team data follows this pattern:

```typescript
// 1. Get demo day
const demoDay = await getCurrentDemoDay();

// 2. Check if user is admin (directory or demo day admin)
const { isAdmin } = await checkDemoDayAccess(memberEmail, demoDay.uid);

// 3. If not admin, verify founder access to specific team
if (!isAdmin) {
  await validateTeamFounderAccess(memberEmail, teamUid, demoDay.uid);
}
```

This ensures:
- Admins can modify any team's data
- Founders can only modify their own team's data
- Unauthorized access throws `ForbiddenException`

---

## Support

For issues or questions:
- Check error messages for specific guidance
- Verify your user's participant status and team membership
- Ensure file sizes and types meet requirements
- Contact the platform administrator for access-related issues