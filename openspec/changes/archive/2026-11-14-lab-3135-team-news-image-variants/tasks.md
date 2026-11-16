## 1. Image copies

- [x] 1.1 Download the og:image with the public-host checks, 10 MB and 10 s limits, `image/*` only
- [x] 1.2 Crop to 16:9 and make the original plus 400, 800, 1200 and 1800 wide JPEG copies, skipping widths not smaller than the source
- [x] 1.3 Upload the copies to `team-news/<uid>/<width>.jpg` and link them through `TeamNewsItem.imageUid`
- [x] 1.4 Keep `imageUrl` and log on any failure

## 2. API

- [x] 2.1 Return `image` in `TeamNewsItemSchema` and `LabosDigestNewsDetailSchema`

## 3. Backfill

- [x] 3.1 Add `--variants` to `backfill-team-news-images.ts`, limited to the last 90 days

## 4. Checks

- [x] 4.1 Image service, variant, og-image, query service and backfill tests pass
