## Why

LAB-3131 (https://linear.app/protocollabs/issue/LAB-3131): intro requests from portfolio teams and PL Infra go nowhere. Each request must be stored and posted to one Telegram intake group.

## What Changes

- `POST /v1/intro-requests` stores an intro request and posts it to the asks group.
- Only current members of portfolio teams and PL Infra can send. Other members get 403.
- A failed Telegram post stays stored and is retried. A request is not posted twice.
- `TELEGRAM_ASKS_BOT_TOKEN` and `TELEGRAM_ASKS_CHAT_ID` are added to `.env.example`. The token is not logged.

## Capabilities

### New Capabilities

- `intro-requests`: store an intro request and post it to the Telegram intake group.

## Impact

Signed-in members of portfolio teams and PL Infra can send an intro request to a member or a team. The asks Telegram group receives one message per request.
