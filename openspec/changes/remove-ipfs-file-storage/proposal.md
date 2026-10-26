# Proposal

## Why

LAB-2992 (wave 2 of the LAB-2977 security spike) flagged the file encryption: it used `crypto-browserify`, a browser polyfill with known-CVE dependencies, and its key was just `sha256(FILE_ENCRYPTION_SALT)`. That encryption exists only for the IPFS / web3.storage upload path from 2022. Since S3 support was added (Jan 2024), every upload goes to S3. The IPFS path is switched off everywhere, a read-only check on 2026-10-26 found 0 IPFS files in prod and dev, and the `api.web3.storage` upload API it calls is no longer available. Removing the dead path closes the finding with less risk than repairing it.

## What Changes

- **BREAKING (config only):** `FILE_STORAGE=ipfs` no longer has any effect. Uploads always go to S3, which is already the case in every environment.
- `FileEncryptionService` is deleted, along with its registrations in the shared, images, uploads and command modules and in the Forest Admin agent.
- `FileUploadService` loses the web3.storage client, the encryption step and `getDecryptedFileUrl`. Its S3 code is unchanged.
- The images controller and the uploads service drop their IPFS branches. Upload rows are always written as `S3`.
- The Cloudflare `web3-file-retrieval` worker code (decrypt proxy) is deleted.
- `FILE_STORAGE`, `FILE_ENCRYPTION_*`, `WORKER_IMAGE_URL` and `WEB3_STORAGE_API_TOKEN` are removed from `.env.example`. AGENTS.md and the docs under `docs/` no longer mention Web3Storage or the worker.
- No data migration: there are no IPFS files.

## Capabilities

### New Capabilities
- `file-storage`: where the API stores uploaded images and files.

### Modified Capabilities
<!-- none -->

## Impact

- Code: `apps/web-api/src/utils/file-upload/`, `apps/web-api/src/utils/file-encryption/` (deleted), `apps/web-api/src/images/`, `apps/web-api/src/uploads/`, `shared.module.ts`, `command.module.ts`, `utils/forest-admin/agent.ts`, `utils/constants.ts`, `apps/web-api/cloudflare/` (deleted).
- Not changed: the `IPFS` value of the `UploadStorage` DB enum (removing it needs a migration and gains nothing), the `Image.cid` column (S3 images use it too), and the `web3.storage` / `crypto-browserify` packages in `package.json` (no longer imported; removing them re-resolves unrelated `yarn.lock` entries, so that is a separate cleanup).
- Infra: after merge, someone with Cloudflare access deletes the deployed `web3-file-retrieval` worker, whose settings hold the old salt.
- Process: the approach differs from the ticket's acceptance criteria, so Vova approves the switch on LAB-2992 before merge.
