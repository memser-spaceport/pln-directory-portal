## Why

Event submit from `https://irl.os.pl.xyz` gets HTTP 401. `AiAppSessionScopeMiddleware` treats that origin as AI app `irl` and refuses the LabOS member token.

## What Changes

- `irl` is a reserved platform host, with `directoryv2` and `os`.
- A LabOS member token from `https://irl.os.pl.xyz` reaches the next handler.

## Capabilities

### Modified Capabilities

- `ai-apps`: the events submission host is a reserved platform host.

## Impact

Calls from the events UI to Directory keep the member token. An AI app can no longer take the `irl` hostname.
