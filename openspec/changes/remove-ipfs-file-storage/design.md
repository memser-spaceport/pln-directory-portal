# Design

## Context

See proposal.md for the reasons behind this change. The current state:

- `FileUploadService` (`apps/web-api/src/utils/file-upload/file-upload.service.ts`) branches on `FILE_STORAGE === 'ipfs'` in `storeImageFiles` and `storeOneAndGetSecureUrl`. The IPFS branch encrypts with `FileEncryptionService` and uploads through web3.storage. The S3 branch uploads plaintext through `AwsService`.
- `ImagesController.uploadImage` turns a CID into a worker URL (`getDecryptedFileUrl`) when IPFS is on. `UploadsService` maps `storage === 'ipfs'` to the `IPFS` enum and stores a `cid`.
- The Cloudflare worker in `apps/web-api/cloudflare/workers/web3-file-retrieval/` decrypts IPFS files. It is bundled by hand and pasted into the Cloudflare dashboard. Nothing in CI builds or deploys it.
- Data (read-only check, 2026-10-26): prod `Image` has 0 IPFS/worker URLs among 59,058 rows, and prod `Upload` has 823 rows, all `S3`. Dev is the same.

## Goals / Non-Goals

**Goals:**
- No IPFS, web3.storage or file-encryption code left in the API or the repo.
- S3 behavior byte-for-byte unchanged.

**Non-Goals:**
- Removing the `IPFS` DB enum value or the `Image.cid` column.
- Removing the `web3.storage` / `crypto-browserify` packages from `package.json`.
- Updating the old Airtable or Forest Admin docs beyond replacing the storage provider name.

## Decisions

### D1. Delete the IPFS path instead of fixing its crypto
The path is unused and probably broken upstream. Fixing it (an earlier plan in this change: HKDF key, format marker, worker changes) adds code and a manual worker deploy for no user. Deleting it removes the weak key, the polyfill import and the public-storage surface at once.

### D2. Unwrap the S3 branches, don't rewrite them
In `FileUploadService`, the existing S3 code becomes the only path with the same statements, so S3 behavior can't drift. `storeOneAndGetSecureUrl` keeps returning `storage: 's3'` so its result shape stays the same.

### D3. Keep the DB enum and columns
`UploadStorage.IPFS` and `cid` stay in the Prisma schema. `UploadsService` always writes `S3` and a null `cid`, which is what every row already has. A destructive enum migration would add risk for no gain.

### D4. Keep the packages
`yarn remove` re-resolves about 240 unrelated `yarn.lock` lines (commitlint, typescript, semver, ts-node), so `web3.storage` and `crypto-browserify` stay in `package.json`. With no imports, neither is loaded at runtime. The `web3.storage` entry in Jest's `transformIgnorePatterns` stays for the same reason; it is inert.

## Risks / Trade-offs

- [An environment still sets `FILE_STORAGE=ipfs`] → It would now upload to S3 instead of IPFS. The data check shows no environment does, and S3 is the intended store.
- [The deployed worker keeps running with the old salt in its settings] → Delete it in Cloudflare after merge (tasks.md). It only proxies IPFS reads, so deleting it affects no live URL.
- [Hidden consumers of `FileEncryptionService` or `getDecryptedFileUrl`] → `yarn build:api` type-checks every import, and a repo-wide grep finds no other references.

## Migration Plan

- **Existing files:** none on IPFS, so no migration.
- **Deploy:** merge into `develop`. No env change is needed. Optional cleanup: drop the unused env vars from SSM.
- **After merge:** delete the `web3-file-retrieval` worker in Cloudflare.
- **Rollback:** revert the PR.
