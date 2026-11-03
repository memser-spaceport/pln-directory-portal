# job-crawl-index Specification

## Purpose

The list of job openings the frontend puts in its sitemap: which openings it holds, and the date a search engine is given for each.

## Requirements

### Requirement: The crawl index lists visible openings with the posting's own date

The system SHALL serve `GET /v1/job-openings/crawl-index` with `{ jobs: [{ uid, updatedAt, lastModified }] }` for every opening that has a team and whose status is visible on the board. `lastModified` SHALL be the posting's own date as an ISO 8601 string: when it went live on the board (`publishedAt`), else its posted date (`postedDate`), else when it was first detected (`detectionDate`). It SHALL NOT be `updatedAt`, which the nightly sync rewrites on every row.

#### Scenario: Opening published on the board

- **GIVEN** a visible opening with `publishedAt` 2026-10-01 and `updatedAt` from last night's sync
- **WHEN** `GET /v1/job-openings/crawl-index` is called
- **THEN** its `lastModified` is 2026-10-01

#### Scenario: Opening never published, with a posted date

- **GIVEN** a visible opening with no `publishedAt` and `postedDate` 2026-08-15
- **WHEN** `GET /v1/job-openings/crawl-index` is called
- **THEN** its `lastModified` is 2026-08-15
