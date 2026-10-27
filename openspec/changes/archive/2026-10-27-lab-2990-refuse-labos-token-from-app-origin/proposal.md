## Why

LAB-2990 (https://linear.app/protocollabs/issue/LAB-2990): a deployed AI app could call Directory routes with the member's LabOS token. The middleware only logged that call.

## What Changes

- `AiAppSessionScopeMiddleware` answers 401 when an AI app origin sends a LabOS member token (Bearer or `authToken` cookie) on a route other than `/v1/ai-apps/me`, `/v1/ai-apps/track` and `/v1/ai-apps/access-check`.
- The same request is still logged as `ai_app_origin_labos_token`.
- A request from the LabOS origin is unchanged. App session tokens stay valid on the three app-facing routes.
- `docs/AI_APPS.md` and `docs/LABOS_AUTH.md` describe the app's own gate as the sign-in path. Sharing `authToken` stays an env switch. Production is not changed here.

## Capabilities

### New Capabilities

- `ai-apps`: refuse a LabOS member token that arrives from an AI app origin.

## Impact

An AI app page that still sends a LabOS token to a Directory route other than `/me`, `/track` and `/access-check` gets 401. LabOS sign-in is unchanged. `AI_APPS_SHARE_AUTH_TOKEN` is not set by this change.
