## 1. Notification service

- [x] 1.1 `TelegramChannelType`: `SIGN_UP_AND_VERIFIED`, `JOB_ASPIRANT_SIGN_UP` with migration
- [ ] 1.2 Deploy to dev and prod before this repo's release

## 2. Directory

- [x] 2.1 `member-sign-up-notifications` module: member load, exclusion, message, outbox post
- [x] 2.2 Post from both participants-request sign-up paths, the Job Board sign-up and the LinkedIn verification
- [x] 2.3 Move the Telegram HTML helpers to `src/utils`
- [x] 2.4 Tests: message, service, participants-request, Job Board sign-up, LinkedIn verification

## 3. Setup per environment

- [ ] 3.1 Create the two Telegram channels; add the notification service bot as an admin with Post Messages
- [ ] 3.2 Create the `TelegramChatRoute` for both types on dev and prod
