# Luma Guest Sync - Business Flow Document

## Overview

The Luma Guest Sync feature automatically synchronizes event attendees from Luma (external event management platform) to the PL Network Directory. This enables the directory to display which members are attending external events, powering the IRL Gatherings feature and push notifications.

---

## Business Purpose

**Problem**: Events managed on Luma have their own guest lists, but the PL Network Directory needs visibility into which directory members are attending these events.

**Solution**: Automated sync that:
- Fetches approved guests from Luma events
- Matches them against directory members by email
- Creates guest entries in the directory
- Triggers push notifications for "Who's Going" features

---

## Prerequisites

### Event Configuration
For an event to be eligible for guest sync:

| Requirement | Description |
|-------------|-------------|
| External Provider | Event must have `externalEventProvider = LUMA` |
| External Event ID | Must have a valid Luma event API ID (`externalEventId`) |
| Location | Must be associated with a `PLEventLocation` |
| Active Event | Event end date must be in the future |
| Not Deleted | `isDeleted = false` |

### Environment Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PL_EVENT_GUEST_SYNC_ENABLED` | Master toggle for the feature | - |
| `PL_EVENT_GUEST_SYNC_CONSUMER_ENABLED` | Enable SQS consumer | - |
| `PL_EVENT_GUEST_SYNC_CRON` | CRON schedule for sync job | `0 3 * * *` (3 AM UTC) |
| `PL_EVENT_GUEST_SYNC_QUEUE_NAME` | SQS queue name | `pl-event-guest-sync` |
| `PL_EVENT_GUEST_SYNC_QUEUE_URL` | SQS queue URL | - |
| `LUMA_API_URL` | Luma API base URL | `https://public-api.luma.com` |
| `LUMA_API_KEY` | Luma API authentication key | - |

---

## Sync Flow

### Phase 1: Event Discovery & Enqueue

**Trigger**: CRON job runs at configured schedule (default: 3 AM UTC daily)

**Process**:
1. Scheduler queries database for all syncable events
2. For each eligible event, creates an SQS message containing:
   - `eventUid`: Internal event identifier
   - `externalEventId`: Luma event API ID
   - `locationUid`: Associated location identifier
   - `providerType`: `LUMA`
3. Messages are sent to SQS FIFO queue with:
   - `groupId`: Event UID (ensures ordering per event)
   - `deduplicationId`: Timestamp-based (allows re-sync)

**Outcome**: All eligible events are queued for processing

---

### Phase 2: Message Processing

**Trigger**: SQS consumer receives message from queue

**Process**:
1. Consumer extracts message body
2. Delegates to sync service for processing
3. On success: Message is acknowledged and removed from queue
4. On failure: Error is thrown, triggering SQS retry mechanism

---

### Phase 3: Guest Fetch from Luma

**Process** (per event):
1. Provider factory retrieves the Luma provider
2. Luma provider calls Luma API to fetch guests
3. Guests are fetched in paginated batches (cursor-based)
4. Each batch is processed before fetching the next page

**Luma API Details**:
- Endpoint: `GET /v1/event/get-guests`
- Filter: `approval_status = approved` (only confirmed attendees)
- Pagination: Uses cursor-based pagination
- Rate Limiting: Automatic retry on 429 with 60-second wait
- Max Retries: 3 attempts for rate-limited requests

**Guest Data Retrieved**:
- External guest ID
- Email address
- Name
- Approval status
- Registration timestamp

---

### Phase 4: Member Matching

**Process** (per batch of guests):
1. Extract and normalize email addresses from guests
2. Query directory members by email (bulk lookup)
3. For matched members, retrieve their main team association
4. Build matched guest list with:
   - Original guest data
   - Member UID
   - Team UID (if member has a main team)

**Matching Logic**:
- Match is by exact email (case-insensitive)
- Only directory members with matching emails are processed
- Guests without a directory account are skipped
- Main team is used for team association (member can belong to multiple teams)

---

### Phase 5: Guest Entry Creation

**Process** (per batch of matched guests):
1. Query existing guest entries for the event
2. Filter out guests already registered (prevent duplicates)
3. Create new `PLEventGuest` entries with:
   - Event and location association
   - Member and team association
   - External guest ID from Luma
   - Default flags: `isHost`, `isSpeaker`, `isSponsor`, `isFeatured` = false

**Duplicate Prevention**:
- Checks for existing entry by: `eventUid + locationUid + memberUid`
- Uses `skipDuplicates: true` for additional safety

---

### Phase 6: Post-Sync Operations

**Process**:
1. Update event's `guestLastSyncedAt` timestamp
2. Refresh IRL Gathering push notification candidates
3. Update any already-sent push notifications with new attendee data

**Push Notification Impact**:
- "Who's Going" notifications are recalculated
- New attendees appear in notification payloads
- Already-sent notifications may be updated with latest counts

---

## Data Model

### PLEventGuest (Created Entries)

| Field | Source | Description |
|-------|--------|-------------|
| `eventUid` | Sync message | Associated PLEvent |
| `locationUid` | Sync message | Associated PLEventLocation |
| `memberUid` | Email match | Matched directory member |
| `teamUid` | Member lookup | Member's main team (nullable) |
| `externalGuestId` | Luma API | Original Luma guest ID |
| `isHost` | Default | false |
| `isSpeaker` | Default | false |
| `isSponsor` | Default | false |
| `isFeatured` | Default | false |

### PLEvent (Updated Fields)

| Field | Update | Description |
|-------|--------|-------------|
| `guestLastSyncedAt` | Post-sync | Timestamp of last successful sync |

---

## Error Handling

### API Errors

| Error | Handling | Retry |
|-------|----------|-------|
| Rate Limit (429) | Wait 60 seconds, retry | Up to 3 times |
| Authentication Error | Log and fail | No |
| Network Timeout | Throw error | SQS retry |
| Invalid Response | Log and throw | SQS retry |

### Processing Errors

| Error | Handling |
|-------|----------|
| Provider not configured | Throw error, skip event |
| Database error | Throw error, SQS retry |
| No matching members | Continue (0 guests created) |

### SQS Retry Behavior

When processing fails:
1. Message remains in queue
2. SQS visibility timeout expires
3. Message becomes visible for retry
4. Dead letter queue (if configured) after max retries

---

## Architecture Components

### Service Layer

| Service | Responsibility |
|---------|----------------|
| `PLEventGuestSyncScheduler` | CRON-based event discovery and SQS enqueue |
| `PLEventGuestSyncConsumer` | SQS message handler |
| `PLEventGuestSyncService` | Orchestrates sync flow |
| `PLEventGuestMatchingService` | Email-based member matching |
| `GuestProviderFactory` | Provider abstraction layer |
| `LumaGuestProvider` | Luma-specific implementation |
| `LumaApiService` | Luma API client with rate limiting |

### Integration Points

| System | Integration Type | Purpose |
|--------|-----------------|---------|
| Luma API | HTTP REST | Fetch guest lists |
| AWS SQS | Message Queue | Async job processing |
| PostgreSQL | Database | Store guest entries |
| Push Notifications | Internal Service | Update "Who's Going" alerts |

---

## Extensibility

The system is designed for multiple providers using the factory pattern.

### Adding a New Provider

1. Add provider type to `ExternalEventProvider` enum in `schema.prisma`
2. Create provider class implementing `IGuestProvider` interface
3. Add case to `GuestProviderFactory.getProvider()` switch statement
4. Register provider in `PLEventGuestSyncModule`

### IGuestProvider Interface

```typescript
interface IGuestProvider {
  readonly providerType: ExternalEventProvider;
  
  fetchGuestsInBatches(
    onBatchReceived: (guests: ExternalGuest[]) => Promise<void>,
    options: GuestFetchOptions
  ): Promise<number>;
  
  isConfigured(): boolean;
}
```

---

## Monitoring & Observability

### Logging

| Log Level | Events |
|-----------|--------|
| INFO | Sync start, page processed, sync complete |
| WARN | Rate limit encountered, provider not configured |
| ERROR | API failures, processing errors |

### Log Format

```
[PLEventGuestSyncService] [Sync:{eventUid}] {message}
```

### Key Metrics to Monitor

- Events enqueued per run
- Guests fetched vs. guests matched
- Sync duration per event
- Error rate by type
- SQS queue depth

---

## Limitations

1. **Email-Only Matching**: Guests are matched solely by email; members must have a registered email in the directory
2. **Approved Guests Only**: Only guests with `approval_status = approved` are synced
3. **No Deletion Sync**: Guests removed from Luma are not automatically removed from the directory
4. **Single Team Association**: Only the member's main team is associated, not all teams
5. **Rate Limited**: Luma API rate limits may delay large syncs

---

## Related Documentation

- [Luma Public API Documentation](https://docs.lu.ma/reference/getting-started)
- PLEvent Service Documentation
- IRL Gatherings Push Notifications Flow

