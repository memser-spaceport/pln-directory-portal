## Why

Admins want to see new Directory members as they arrive: one Telegram channel for each new sign-up and each member who verifies LinkedIn, and one more for each new Job Aspirant sign-up.

## What Changes

- New `member-sign-up-notifications` module. It enqueues a message in the notification service Telegram outbox for a sign-up, a LinkedIn verification (Pending → Verified) and a Job Aspirant sign-up.
- Callers: `ParticipantsRequestService` (`handleMemberRequest`, legacy `processImmediateRequest` for `MEMBER`), `JobOpeningsSignUpService.signUp`, `LinkedInVerificationService.handleLinkedInCallback`.
- A Job Aspirant sign-up posts to both channels; its sign-up message carries the `💼 Job Aspirant` tag.
- Bots and test accounts (`isExcludedMember`) are skipped. A failed post is logged and never fails the flow.
- `escapeTelegramHtml` (copied in contact-support and intro-requests), `telegramLink` and `directoryUrl` move to `src/utils`.
- `ChannelType` gets `SIGN_UP_AND_VERIFIED` and `JOB_ASPIRANT_SIGN_UP`.

## Capabilities

### New Capabilities

- `member-sign-up-notifications`: Telegram posts for sign-ups, LinkedIn verifications and Job Aspirant sign-ups.

## Impact

- Needs the notification service change that adds both values to `TelegramChannelType` (pl-notification-service, `feat/sign-up-telegram-channels`). Deploy it first: before it, the outbox answers 400 and the post is only logged.
- Each environment needs a `TelegramChatRoute` for both types (`POST /telegram-chats`) before this deploys; without a route the outbox sends to `TELEGRAM_DEFAULT_CHAT_ID`.
- The notification service bot must be an admin with Post Messages in both channels.
- No migration in this repo, no new environment variables.
