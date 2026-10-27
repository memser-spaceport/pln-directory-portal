# LabOS auth for an app outside AI Apps

How to identify the signed-in LabOS member from an app that is **not** deployed
through AI Apps. No starter kit, deploy token, iframe, or auth sidecar is
involved.

A deployed AI app does not use this cookie. The app signs the member in through
its own gate and calls the API with an app session. See `docs/AI_APPS.md`.

This page is for an app outside AI Apps, such as the PL ATS. That app receives
`authToken` only while LabOS still shares it. The switch is
`AI_APPS_SHARE_AUTH_TOKEN` on the LabOS frontend. Unset means the switch stays
on. Production stays on until the ATS has its own sign-in
([LAB-2900](https://linear.app/protocollabs/issue/LAB-2900)). A person turns it
off in dev after the soak counts in `docs/AI_APPS.md` are checked, then in
production. This repository does not set the value. When the switch is
`false`, `authToken` is host-only on the LabOS origin. It is not set on
`COOKIE_DOMAIN`. This app then does not see it in `document.cookie` or on its
request `Cookie` header. Sign-in, refresh and sign-out on LabOS still work.

The API refuses a LabOS member token (Bearer or `authToken` cookie) when the
request `Origin` is a deployed AI app, on every route except
`GET /v1/ai-apps/me`, `POST /v1/ai-apps/track` and
`GET /v1/ai-apps/access-check`. A request from the LabOS origin is unchanged.
This app calls only `/me`.

While the switch is on, this works only when the app is served on the **same
parent domain as LabOS** (`os.pl.xyz`). LabOS writes `authToken` with
`Domain=.os.pl.xyz` in production and `Domain=.dev.os.pl.xyz` on dev, so a host
such as `ats.dev.os.pl.xyz` receives it. A host outside that parent never sees
the cookie. An AI app host is not a reader of this cookie.

## What you integrate

One call:

```
GET https://api-directory.os.pl.xyz/v1/ai-apps/me
Authorization: Bearer <authToken>
```

Dev is `https://dev-directory.os.pl.xyz/v1/ai-apps/me`. The path is always
`/v1/ai-apps/me`.

The API introspects the token and returns the member's public directory
profile. A `200` means: valid LabOS session **and** the member has
`ai_apps.read` or `ai_apps.write`.

| Status | Meaning | What to do |
|---|---|---|
| 200 | Signed-in member with AI Apps access | Use the `member` object |
| 401 | No cookie, expired, or revoked session | Send the visitor to LabOS login (below) |
| 403 | Signed in, but no AI Apps access | Show an access-denied state. Do not send them through login again |

There is no auth sidecar in front of this app. Unsigned traffic reaches you.
Check `/me` yourself before treating a visitor as signed in.

## Reading the cookie

These steps apply only while the switch is on, and only to an app outside AI
Apps. A deployed AI app does not read this cookie.

`authToken` is not `HttpOnly`. Browser code on the app's own origin can read
it. The value is URL-encoded and JSON-quoted (`%22eyJhbGci...%22`).

Do **not** call the API with `credentials: 'include'` and no `Authorization`
header. On dev the cookie domain is `.dev.os.pl.xyz` and the API is
`dev-directory.os.pl.xyz`, which is outside that domain, so the browser omits
the cookie and the call returns 401. Reading the cookie on the app origin and
sending it as `Bearer` works in both environments.

```js
const MEMBER_CONTEXT_URL = 'https://api-directory.os.pl.xyz/v1/ai-apps/me';

function readAuthToken() {
  const match = document.cookie.match(/(?:^|;\s*)authToken=([^;]*)/);
  if (!match) return null;
  const raw = decodeURIComponent(match[1]).replace(/^"|"$/g, '');
  return raw || null;
}

async function getMember() {
  const token = readAuthToken();
  if (!token) return null;
  try {
    const res = await fetch(MEMBER_CONTEXT_URL, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const { member } = await res.json();
    return member;
  } catch {
    return null;
  }
}
```

CORS already allows `https://os.pl.xyz` and `*.os.pl.xyz` (dev and
production), with credentials enabled. A browser `fetch` from a host under
`os.pl.xyz` does not need a CORS change. Call `/me` from the server if you
would rather not depend on that.

### From the app server

The same cookie arrives on every request to the app. Read it from the
`Cookie` header, URL-decode, strip the surrounding double quotes, and forward
it as `Authorization: Bearer`. Keep the token in memory for that request.
Do not write it to logs, localStorage, a database, or any other service.

While the switch is on, `authToken` is the only LabOS session cookie on the
shared domain. `refreshToken` and `userInfo` are host-only on LabOS and never
reach the app. With the switch off, `authToken` is host-only too. Identity
comes from `/me`, not from the raw cookie.

## Response

```json
{
  "member": {
    "uid": "…",
    "name": "Ada Lovelace",
    "image": "https://…/profile.png",
    "location": { "city": "London", "country": "United Kingdom", "continent": "Europe" },
    "skills": ["Engineering", "Research"],
    "teams": [
      { "uid": "…", "name": "Protocol Labs", "role": "Engineer", "mainTeam": true, "teamLead": false }
    ]
  }
}
```

Fields may be `null` or empty. Ignore fields you do not recognize. There is
**no email** and no other contact field. Do not ask the member to type contact
details in to fill that gap, and do not send this payload to a third party.

## Sending a signed-out visitor to LabOS

LabOS login accepts a return URL on the cookie domain. Build:

```
https://os.pl.xyz/members?backlink=<encodeURIComponent(https://<your-host>/<path>)>#login
```

Dev portal is `https://directoryv2.dev.os.pl.xyz`. `backlink` must be an
`https` URL on the cookie domain (`.os.pl.xyz` in production, `.dev.os.pl.xyz`
on dev). Any other host is dropped, and the member will not come back to the
app.

After they sign in, LabOS redirects to `backlink`. While the switch is on,
LabOS also sets `authToken` on the shared domain, and this app can read it.
With the switch off, the cookie stays on the LabOS host and this app does not
receive it. Reload `/me`. Do not build a login form, session store, or
token-refresh client in the app. An expired access token is a 401 — send them
through this link again. LabOS refreshes its own cookie as part of its login.

Localhost has no LabOS cookie. Treat that the same as 401.

## Do not

- Call any other directory or auth endpoint. `/v1/ai-apps/me` is the only
  member API for this integration.
- Gate on the raw cookie. A present cookie is not proof; `/me` returning 200
  is.
- Store, log, or forward the token or the member payload outside the app.
- Assume every LabOS member can pass. Members without `ai_apps.read` or
  `ai_apps.write` get 403.
