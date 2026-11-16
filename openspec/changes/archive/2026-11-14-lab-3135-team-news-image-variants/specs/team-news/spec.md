## ADDED Requirements

### Requirement: Resized copies of each news image

When the system finds an og:image for a team news item, it SHALL download the image and keep its own 16:9 JPEG copies in the image bucket (`AWS_S3_IMAGE_BUCKET_NAME`) under `team-news/<uid>/<width>.jpg`. The download SHALL use the same public-host checks as the og:image fetch, for the URL and each redirect. The download SHALL accept only an `image/*` answer of 10 MB or less within 10 seconds. The system SHALL crop the image to 16:9 at the centre and SHALL store the cropped original. It SHALL also store a copy at each of the widths 400, 800, 1200 and 1800 that is smaller than the cropped original. The copies SHALL be JPEG at quality 80, because Outlook desktop cannot show WebP. The original SHALL be an `Image` row with version `ORIGINAL`, and the copies SHALL be its thumbnails. The news item SHALL link the original through `imageUid`.

The team news DTOs (`TeamNewsItemSchema`) and the digest news detail (`LabosDigestNewsDetailSchema`) SHALL return `image: { width, height, variants: [{ width, url }] }` next to `imageUrl`. `width` and `height` SHALL be the stored original size. `variants` SHALL list every stored copy, the original included, narrowest first. `image` SHALL be null when no copy exists. `imageUrl` SHALL not change.

A failed download, resize, upload or link SHALL keep `imageUrl` as it is and `image` null. The failure SHALL be logged and SHALL never fail the publish path. With no image bucket set, the system SHALL make no copies.

The backfill script `yarn api:backfill-team-news-images -- --variants` SHALL make the copies for items that have an `imageUrl` and no copy. It SHALL process only items with an `eventDate` in the last 90 days. A `--days` value above 90 SHALL be refused. `--dry-run` SHALL list the items and write nothing.

#### Scenario: A 1200 × 630 og:image

- **WHEN** a news item gets a 1200 × 630 og:image
- **THEN** the system stores a 1120 × 630 original and 400 and 800 wide copies
- **AND** the DTO `image.variants` lists the 400, 800 and 1120 wide copies in that order

#### Scenario: The image cannot be downloaded

- **WHEN** the og:image download fails or the answer is not an image
- **THEN** the item keeps its `imageUrl`
- **AND** the DTO `image` is null

#### Scenario: Backfill window

- **WHEN** an admin runs the backfill with `--variants`
- **THEN** only items with an `eventDate` in the last 90 days, an `imageUrl` and no copy get copies
- **AND** a second run does nothing for the items that got copies
