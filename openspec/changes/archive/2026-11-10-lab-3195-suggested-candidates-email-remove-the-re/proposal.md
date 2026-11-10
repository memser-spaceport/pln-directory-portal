## Why

LAB-3195 (https://linear.app/protocollabs/issue/LAB-3195): the team agreed in the Prod/Eng Standup on 9 Nov 2026 that the "N of M requirements" line on each card does not add value, and that the email needs one clear action per role. Today each role ends with a small "All N matches for this role" link, and the email ends with one "Review all N candidates" button that opens only the first role.

## What Changes

- A candidate card no longer shows "N of M requirements" (HTML and plain text).
- The "Review all N candidates" button and its plain-text line are removed.
- Each role section ends with an "All N matches for this role" button, in the style of the old "Review all" button and full width on a phone. It opens that role's Suggested tab. N is the role's match count.

Out of scope: matching logic, the requirements data, subject, preheader, intro, send schedule, unsubscribe, and the frontend Suggested tab.

## Capabilities

### Modified Capabilities
- `suggested-candidates-email`: the role sections and cards of the weekly email.

## Impact

The weekly suggested-candidates email that a team lead gets after a job-match run (all kinds: first, new, reminder).
