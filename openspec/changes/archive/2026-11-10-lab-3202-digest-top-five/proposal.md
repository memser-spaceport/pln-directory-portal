## Why

LAB-3202 (https://linear.app/protocollabs/issue/LAB-3202): after the LabOS Digest demo, admins need the story description in found news, and the digest top stories are 5, not 3.

## What Changes

- Found news shows each story's summary as a description.
- News enrichment stores 5 editorial ranks. The daily digest, the weekly digest, and the LabOS Digest page use those 5 stories.
- The digest email shows one highlighted lead, then up to 4 of the member's own picks. Other top stories fill the email to 5 cards when the member has fewer than 4 picks.
- Post news with a team picker is already on the LabOS Digest page.

## Capabilities

### Modified Capabilities

- `team-news`: found-news description and a top-story count of 5.

## Impact

The next seed run replaces the current 3 editorial ranks with 5. An admin list can hold 1 to 5 stories. Home-feed ranks still change only when the seed runs, not when an admin saves the digest list.
