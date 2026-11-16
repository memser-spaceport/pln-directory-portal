## Why

LAB-3135 (https://linear.app/protocollabs/issue/LAB-3135): news images come straight from each story's og:image URL on third-party hosts. The files are full size and heavy on phones. They break when a source site changes or blocks hotlinking. Polina's spec in LAB-3070 asks for a 16:9 original with copies at about 400, 800, 1200 and 1800 wide for `srcset`.

## What Changes

- When an og:image is found, the API downloads it with the og:image host checks, crops it to 16:9 and stores JPEG copies in the image bucket under `team-news/<uid>/<width>.jpg`.
- The copies reuse the `Image` model: the original is `ORIGINAL` and the resized copies are its thumbnails. A new nullable `TeamNewsItem.imageUid` links them.
- The team news DTOs and the digest news detail return `image: { width, height, variants: [{ width, url }] } | null` next to `imageUrl`.
- The backfill script gets a `--variants` flag for stories in the last 90 days.

## Capabilities

### Modified Capabilities

- `team-news`: resized copies of each news image.

## Impact

- Migration `20261114120000_team_news_item_image_variants` adds a nullable column and a foreign key. It is additive only.
- No env change: the image bucket is the one team logos use.
- The frontend can switch `NewsImage` to `srcset` in a follow-up. Until then nothing changes on screen.
