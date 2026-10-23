## Why

LAB-2983 (https://linear.app/protocollabs/issue/LAB-2983): the office-hours link check fetched any link that a member saved or sent, and followed up to 5 redirects with no address check. A signed-in member could make the server send requests to loopback, private or link-local (cloud metadata) addresses.

## What Changes

- The link check fetches only https links on the default port whose host is a name, not an IP literal and not `localhost`.
- The host name must resolve only to public addresses, and the request goes to the checked address.
- Redirects are followed by hand, at most 5, and each hop gets the same check.
- A link that fails the check is `BROKEN`, and the server sends it no request. Public links are `OK` or `BROKEN` as before.

Out of scope: the OG image fetch beyond the stricter shared address list; the other LAB-2977 security tickets.

## Capabilities

### New Capabilities

- `office-hours`: the office-hours link check.

## Impact

The member check-link endpoint, the admin batch check, the member link update and the per-member check all use the one link check, so all store or return the new result for internal links.
