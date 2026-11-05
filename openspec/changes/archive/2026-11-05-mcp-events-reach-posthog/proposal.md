## Why

MCP tool events are sent through `AnalyticsService`. When `ANALYTICS_PROVIDER` is `db`, those events stay in Postgres and never reach PostHog project 30003 (LAB-3166).

## What Changes

- MCP events (`mcp-*`) are also sent to PostHog when PostHog is configured and it is not the selected provider.
- Other server events stay on the selected provider.

## Capabilities

### Modified Capabilities

- `mcp-scopes`: MCP events still reach PostHog when the analytics provider is the database.
