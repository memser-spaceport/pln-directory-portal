## Why

LAB-2982: MCP refresh tokens never expire. A stolen refresh token stays valid until the member disconnects it.

## What Changes

- A refresh token 30 days or older from consent is rejected.
- A refresh token unused for 7 days or longer is rejected.
- Either rejection revokes the grant. The client needs a new consent.
- A grant inside both limits refreshes as before. Access tokens stay valid for 1 hour.

## Capabilities

### New Capabilities

- `mcp-oauth`: refresh-grant absolute and idle expiry.

## Impact

Existing grants past either limit stop refreshing at deploy and need a new consent. Access-token checks do not change.
