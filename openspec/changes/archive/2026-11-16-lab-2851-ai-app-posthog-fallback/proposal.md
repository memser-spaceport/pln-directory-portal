## Why

LAB-2851 (https://linear.app/protocollabs/issue/LAB-2851): AI apps send `ai_app_*` events through `POST /v1/ai-apps/track` and `AnalyticsService`. When `ANALYTICS_PROVIDER` is `db`, those events stay in Postgres and never reach PostHog project 30003. Vova chose option 1: use the same PostHog fallback as MCP events (LAB-3166).

## What Changes

- `ai_app_*` events are also sent to PostHog when PostHog is configured and it is not the selected provider.
- `mcp-*` events keep the same fallback.
- Server `ai_apps_*` events and other server events stay on the selected provider.

## Capabilities

### Modified Capabilities

- `ai-apps`: AI App events reach PostHog with any analytics provider.

## Impact

- No env change, no migration. Production already has the PostHog keys for the MCP fallback.
- Dana checks `ai_app_opened` in PostHog after the deploy.
