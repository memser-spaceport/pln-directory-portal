## Why

LAB-2866: the Warm Intros v2 refresh must run on a schedule. The job needs live directory exports and a stored run result.

## What Changes

- Service GETs return the portfolio-overlap, Affinity founder, and directory LinkedIn exports.
- `WarmIntrosV2Run` records each refresh. A fresh lock skips a second start.
- `GET /v1/warm-intros-v2/runs/latest` returns the newest run to Investor DB viewers.

## Capabilities

### New Capabilities

- `warm-intros-v2`: scheduled refresh inputs and the run record.

## Impact

The enrichment CronJob reads the three exports and writes the run row. Ingest of edges and paths stays upsert-only.
