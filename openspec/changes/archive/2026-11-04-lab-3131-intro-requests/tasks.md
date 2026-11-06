## 1. Intro requests

- [x] 1.1 Store an intro request and accept `POST /v1/intro-requests` from a portfolio or PL Infra member
- [x] 1.2 Post one message to the asks Telegram group and retry a failed post without posting twice
- [x] 1.3 Add `TELEGRAM_ASKS_BOT_TOKEN` and `TELEGRAM_ASKS_CHAT_ID` to `.env.example`

## 2. Checks

- [x] 2.1 Tests cover eligibility, storage, a failed post with retry, and no double post
