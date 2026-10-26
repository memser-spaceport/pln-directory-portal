# Tasks

## 1. Branch and approval

- [x] 1.1 Create the task branch from the right base per the `lab-ticket-workflow` skill (LAB-2992, parent LAB-2977 is a Spike, so the base is `develop`). Verify that `git branch --show-current` contains `2992`.
- [x] 1.2 Post the change of approach (remove the IPFS path instead of fixing its crypto) on LAB-2992 for Vova. Verify that the comment exists (reply 278fc1fe).
- [ ] 1.3 Get Vova's approval of the switch. Verify that an approval reply exists on LAB-2992.

## 2. Remove the IPFS path from the API

- [x] 2.1 Delete `apps/web-api/src/utils/file-encryption/` and its registrations (shared, images, uploads, command modules, Forest Admin agent). Verify that `git grep FileEncryption -- apps` returns nothing.
- [x] 2.2 Make `FileUploadService` S3-only (D2): remove the web3.storage client, encryption and `getDecryptedFileUrl`, unwrap the S3 branches unchanged, and type the `storage` result as `'s3'`. Verify that `git grep -n "web3.storage'\|getDecryptedFileUrl" -- apps/web-api/src` returns nothing.
- [x] 2.3 Drop the IPFS branches in `ImagesController.uploadImage` and `UploadsService` (D3), and remove the `IPFS` constant. Verify that `yarn build:api` passes.
- [x] 2.4 Rewrite `file-upload.service.spec.ts` to cover the S3 path: an image upload with `FILE_STORAGE=ipfs` goes to S3 unchanged, and a single-file upload returns `s3` with a signed URL. Drop the `FileEncryptionService` provider from `file-migration.service.spec.ts` and the stale `web3.storage` mock from `images.e2e.spec.ts`. Verify that the file-upload spec passes (`yarn nx run web-api:test --testFile=…`). The file-migration and images e2e suites fail on `develop` for unrelated reasons (`nestjs-zod` ESM parse) and still do.

## 3. Remove the worker, env vars and docs

- [x] 3.1 Delete `apps/web-api/cloudflare/`. Verify that `git grep "web3-file-retrieval\|cloudflare/workers"` returns nothing.
- [x] 3.2 Remove `FILE_STORAGE`, `FILE_ENCRYPTION_*`, `WORKER_IMAGE_URL` and `WEB3_STORAGE_API_TOKEN` from `.env.example`. Verify that `git grep -n "FILE_STORAGE\|WORKER_IMAGE_URL\|WEB3_STORAGE" -- apps .env.example` matches only the spec test that sets `FILE_STORAGE`.
- [x] 3.3 Update AGENTS.md and `docs/` (ADMIN_PANEL, AIRTABLE_DATA_MIGRATION, ARCHITECTURE_DIAGRAM, TECHNOLOGY_STACK) to S3. Verify that `git grep -n -i "web3storage\|web3.storage\|cloudflare worker" -- '*.md' ':!openspec'` returns nothing.

## 4. Verify and release

- [x] 4.1 Run `yarn build:api` and ESLint on the touched files. Verify that the build passes and that no touched file has more lint errors than on `develop`.
- [ ] 4.2 Update draft PR #3595 (title, body) to the removal approach. Verify that the PR description lists the kept items (DB enum, packages) and the Cloudflare cleanup.
- [ ] 4.3 After Vova approves, link the approval in the PR and mark it ready for review. Verify that the PR is no longer a draft.
- [ ] 4.4 After merge, have someone with Cloudflare access delete the `web3-file-retrieval` worker. Verify that the worker no longer appears in the Cloudflare dashboard.
