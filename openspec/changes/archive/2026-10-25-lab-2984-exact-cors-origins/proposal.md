## Why

LAB-2984 (https://linear.app/protocollabs/issue/LAB-2984): the API allowed a cross-origin request when the `Origin` value only contained an allowed domain. A lookalike such as `https://evil-plnetwork.io.example.com` matched.

## What Changes

- Each CORS entry matches the full origin: scheme, host and port.
- The HTTP API and the notifications WebSocket use that same list, with credentials.
- A preflight from a rejected origin gets no `Access-Control-Allow-Origin` header.
- Current production and dev frontend origins stay allowed.

## Capabilities

### New Capabilities

- `cors`: exact allowed origins for the HTTP API and the notifications WebSocket.

## Impact

Browser clients on a lookalike origin can no longer call the API or the notifications socket with credentials. Listed production, dev, staging and UAT origins keep access.
